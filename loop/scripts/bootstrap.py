#!/usr/bin/env python3
"""Prepara o ambiente do loop de forma idempotente (só biblioteca padrão).

Etapas:
  laya    : venv em .loop-env, torch (CPU), pacotes do Laya, download do modelo e teste de fumaça
  projeto : backend/.venv + requirements.txt e frontend/node_modules (se as pastas existirem)

Uso:
  python loop/scripts/bootstrap.py            # prepara o que faltar (laya + projeto)
  python loop/scripts/bootstrap.py --check    # só informa o estado, não altera nada
  python loop/scripts/bootstrap.py --laya     # só o Laya
  python loop/scripts/bootstrap.py --forcar   # refaz mesmo se o marcador diz que está pronto

Configuração: bloco "ambiente" e "modelo" em loop/laya_params.json.
"""
import argparse
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOOP = HERE.parent
ROOT = LOOP.parent
VENV = ROOT / ".loop-env"
MARCADOR = LOOP / ".env_ok.json"
PARAMS = LOOP / "laya_params.json"
MIN_GB_LIVRES = 4

FUMACA = """
import json, laya
agent = laya.load({modelo!r})
r = agent.predict({{"text": "I was charged twice for my order"}},
                  {{"billing": {{"type": "noul", "instructions": "The user reports a billing problem."}}}})
print(json.dumps(r["answers"], default=str))
"""


class BootstrapErro(Exception):
    pass


def log(msg):
    print(f"[bootstrap] {msg}", flush=True)


def carregar(path, padrao):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return padrao


def config(params_path=None):
    cfg = carregar(params_path or PARAMS, {})
    amb = cfg.get("ambiente", {})
    return {
        "modelo": cfg.get("modelo", "convaiinnovations/laya"),
        "python_venv": amb.get("python_venv", ""),
        "torch_index": amb.get("torch_index", "https://download.pytorch.org/whl/cpu"),
        "pacotes": amb.get("pacotes", ["laya"]),
        "hf_home": amb.get("hf_home", ""),
    }


def venv_python(venv):
    return Path(venv) / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def ambiente(cfg, extra=None):
    env = dict(os.environ)
    env.setdefault("USE_TF", "0")
    env.setdefault("CUDA_VISIBLE_DEVICES", "-1")
    if cfg.get("hf_home"):
        env["HF_HOME"] = cfg["hf_home"]
    env.update(extra or {})
    return env


def rodar(cmd, cwd=ROOT, env=None, capturar=False):
    return subprocess.run([str(c) for c in cmd], cwd=cwd, env=env, text=True,
                          capture_output=capturar, encoding="utf-8", errors="replace")


def assinatura(cfg):
    return {k: cfg[k] for k in ("modelo", "python_venv", "torch_index", "pacotes", "hf_home")}


def ler_marcador():
    return carregar(MARCADOR, {})


def gravar_marcador(chave, valor):
    m = ler_marcador()
    m[chave] = valor
    with open(MARCADOR, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
        f.write("\n")


def laya_pronto(cfg):
    m = ler_marcador().get("laya")
    return venv_python(VENV).exists() and bool(m) and m.get("assinatura") == assinatura(cfg)


def checar_espaco(cfg):
    alvo = Path(cfg["hf_home"]) if cfg.get("hf_home") else Path.home() / ".cache" / "huggingface"
    while not alvo.exists() and alvo != alvo.parent:
        alvo = alvo.parent
    livre = shutil.disk_usage(alvo).free / 1e9
    if livre < MIN_GB_LIVRES:
        raise BootstrapErro(
            f"pouco espaço livre em {alvo} ({livre:.1f} GB; preciso de ~{MIN_GB_LIVRES} GB). "
            "Defina 'ambiente.hf_home' em loop/laya_params.json para uma pasta em outro disco.")


def criar_venv(cfg):
    py = venv_python(VENV)
    if py.exists():
        return py
    base = shlex.split(cfg["python_venv"]) if cfg["python_venv"] else [sys.executable]
    log(f"criando venv em {VENV} com {' '.join(base)} (Python {sys.version.split()[0]} se for o padrão)")
    r = rodar([*base, "-m", "venv", VENV])
    if r.returncode != 0 or not py.exists():
        raise BootstrapErro("não consegui criar o venv. Instale o módulo venv do Python "
                            "ou defina 'ambiente.python_venv' (ex.: \"python3.12\").")
    return py


def instalar_pacotes(py, cfg):
    log("atualizando pip")
    rodar([py, "-m", "pip", "install", "-q", "--upgrade", "pip"])
    if cfg["torch_index"] and rodar([py, "-c", "import torch"], capturar=True).returncode != 0:
        log("instalando torch (CPU), pode demorar")
        r = rodar([py, "-m", "pip", "install", "torch", "--index-url", cfg["torch_index"]])
        if r.returncode != 0:
            raise BootstrapErro(
                "falha ao instalar o torch. Causas comuns: sem internet ou Python novo demais para "
                "ter wheel do torch. Defina 'ambiente.python_venv' com um Python mais antigo (ex.: 3.12).")
    if cfg["pacotes"]:
        log(f"instalando pacotes: {', '.join(cfg['pacotes'])}")
        r = rodar([py, "-m", "pip", "install", *cfg["pacotes"]])
        if r.returncode != 0:
            raise BootstrapErro(f"falha ao instalar os pacotes {cfg['pacotes']}.")


def teste_fumaca(py, cfg):
    """Carrega o modelo e faz uma pergunta. Primeiro offline; se falhar, baixa e repete."""
    codigo = FUMACA.format(modelo=cfg["modelo"])
    r = rodar([py, "-c", codigo], env=ambiente(cfg, {"HF_HUB_OFFLINE": "1"}), capturar=True)
    if r.returncode == 0:
        log("modelo já está no cache e responde")
        return
    log("modelo não está no cache: baixando (primeira vez, pode demorar)")
    checar_espaco(cfg)
    env = ambiente(cfg, {"LAYA_ALLOW_DOWNLOAD": "true"})
    env.pop("HF_HUB_OFFLINE", None)
    r = rodar([py, "-c", codigo], env=env, capturar=True)
    if r.returncode != 0:
        fim = "\n".join((r.stderr or r.stdout or "").strip().splitlines()[-8:])
        raise BootstrapErro(f"o modelo não carregou mesmo após o download:\n{fim}")
    log("modelo baixado e respondeu ao teste de fumaça")


def preparar_laya(cfg, forcar=False):
    py = criar_venv(cfg)
    instalar_pacotes(py, cfg)
    if cfg["modelo"]:
        teste_fumaca(py, cfg)
    gravar_marcador("laya", {"assinatura": assinatura(cfg),
                             "quando": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    log("ambiente do Laya pronto")
    return py


def ensure_laya(cfg=None, forcar=False):
    """Devolve o python do venv do Laya, preparando tudo se faltar algo."""
    cfg = cfg or config()
    if not forcar and laya_pronto(cfg):
        return venv_python(VENV)
    return preparar_laya(cfg, forcar)


def hash_arquivos(*arquivos):
    h = hashlib.sha256()
    for a in arquivos:
        if a.exists():
            h.update(a.read_bytes())
    return h.hexdigest()


def preparar_projeto(forcar=False, so_checar=False):
    estado = {}
    back = ROOT / "backend"
    reqs = [p for p in (back / "requirements.txt", back / "requirements-dev.txt") if p.exists()]
    if reqs:
        h = hash_arquivos(*reqs)
        vpy = venv_python(back / ".venv")
        pronto = vpy.exists() and ler_marcador().get("backend", {}).get("hash") == h
        estado["backend"] = pronto
        if not pronto and not so_checar:
            log("preparando backend (venv + requirements)")
            if not vpy.exists() and rodar([sys.executable, "-m", "venv", back / ".venv"]).returncode != 0:
                raise BootstrapErro("não consegui criar backend/.venv")
            for r in reqs:
                if rodar([vpy, "-m", "pip", "install", "-r", r]).returncode != 0:
                    raise BootstrapErro(f"falha ao instalar {r.name}")
            gravar_marcador("backend", {"hash": h})
            estado["backend"] = True
    else:
        log("backend/requirements.txt não existe ainda: pulando backend")

    front = ROOT / "frontend"
    if (front / "package.json").exists():
        lock = front / "package-lock.json"
        h = hash_arquivos(front / "package.json", lock)
        pkg = carregar(front / "package.json", {})
        tem_deps = bool(pkg.get("dependencies") or pkg.get("devDependencies"))
        pronto = ((front / "node_modules").exists() or not tem_deps) \
            and ler_marcador().get("frontend", {}).get("hash") == h
        estado["frontend"] = pronto
        if not pronto and not so_checar:
            npm = shutil.which("npm")
            if not npm:
                raise BootstrapErro("npm não encontrado: instale o Node.js 20+")
            log("preparando frontend (npm)")
            if rodar([npm, "ci" if lock.exists() else "install"], cwd=front).returncode != 0:
                raise BootstrapErro("falha no npm install do frontend")
            # o npm install pode criar o package-lock.json: grava o hash do estado final
            gravar_marcador("frontend", {"hash": hash_arquivos(front / "package.json", lock)})
            estado["frontend"] = True
    else:
        log("frontend/package.json não existe ainda: pulando frontend")
    return estado


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="só informa o estado")
    ap.add_argument("--laya", action="store_true", help="só a etapa do Laya")
    ap.add_argument("--projeto", action="store_true", help="só a etapa do projeto")
    ap.add_argument("--forcar", action="store_true", help="refaz mesmo se estiver marcado como pronto")
    ap.add_argument("--params", help="arquivo de parâmetros alternativo")
    a = ap.parse_args()
    cfg = config(a.params)
    fazer_laya = a.laya or not a.projeto
    fazer_projeto = a.projeto or not a.laya
    try:
        if a.check:
            ok = True
            if fazer_laya:
                p = laya_pronto(cfg)
                print(f"laya: {'pronto' if p else 'NÃO preparado'} (modelo: {cfg['modelo'] or '-'})")
                ok = ok and p
            if fazer_projeto:
                est = preparar_projeto(so_checar=True)
                for k, v in est.items():
                    print(f"{k}: {'pronto' if v else 'NÃO preparado'}")
                    ok = ok and v
            return 0 if ok else 1
        if fazer_laya:
            ensure_laya(cfg, forcar=a.forcar)
        if fazer_projeto:
            preparar_projeto(forcar=a.forcar)
        log("tudo pronto")
        return 0
    except BootstrapErro as ex:
        print(f"[bootstrap] ERRO: {ex}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
