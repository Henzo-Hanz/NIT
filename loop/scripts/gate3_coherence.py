#!/usr/bin/env python3
"""Gate 3 (coerência): consulta o Laya por script, sem MCP.

Fluxo: lê a spec aprovada -> monta evidência (diff da implementação + código existente
relacionado) -> faz perguntas booleanas (noul) ao Laya em CPU -> aplica limiares de
loop/laya_params.json -> registra violações em loop/reported_errors.json.

Códigos de saída: 0 ok (pode haver avisos) | 1 violação bloqueante | 2 erro de uso/ambiente.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("USE_TF", "0")                 # evita travamento do laya.load() com TensorFlow
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "-1")  # força CPU (sobrescreva a variável para usar GPU)

HERE = Path(__file__).resolve().parent
LOOP = HERE.parent
ROOT = LOOP.parent
sys.path.insert(0, str(HERE))
import bootstrap  # noqa: E402
import spec as specmod  # noqa: E402

CAMADA_DIR = {"back": "backend", "front": "frontend"}
IDENT_RE = re.compile(r"(?:class|def|function)\s+([A-Za-z_]\w+)|(?:const|let)\s+([A-Z][A-Za-z0-9_]+)\s*=")


def git(*args):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.returncode, r.stdout


def carregar_json(path, padrao):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return padrao


def arquivos_alterados(base, pasta, excluir):
    rc, out = git("diff", "--name-only", base, "--", pasta)
    if rc != 0:
        print(f"aviso: não consegui comparar com '{base}'; usando só arquivos novos")
        out = ""
    _, out2 = git("ls-files", "--others", "--exclude-standard", "--", pasta)
    novos = {l for l in out2.splitlines() if l}
    todos = []
    for f in [l for l in out.splitlines() if l] + sorted(novos):
        if any(x.lower() in f.lower() for x in excluir) or f in todos:
            continue
        todos.append(f)
    return todos, novos


def trecho_arquivo(f, novos, base, limite):
    if f in novos:
        try:
            corpo = (ROOT / f).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
    else:
        _, corpo = git("diff", "-U1", base, "--", f)
    return f"### {f}\n{corpo}"[:limite]


def identificadores(texto):
    ids = []
    for m in IDENT_RE.finditer(texto):
        nome = m.group(1) or m.group(2)
        if nome and nome not in ids and not nome.startswith(("test", "__")):
            ids.append(nome)
    return ids[:5]


def codigo_relacionado(idents, pasta, alterados, limite):
    achados = []
    for ident in idents:
        _, out = git("grep", "-n", "-w", "-I", ident, "--", pasta)
        hits = [l for l in out.splitlines() if l.split(":", 1)[0] not in alterados]
        achados += hits[:3]
    return "\n".join(achados)[:limite]


def montar_estado(spec, camada, base, cfg):
    pasta = CAMADA_DIR[camada]
    total = int(cfg.get("max_chars_estado", 2000))
    alterados, novos = arquivos_alterados(base, pasta, cfg.get("excluir_caminhos", []))
    cas = [f"{c['id']}: {c['descricao']}" for c in spec["criterios_aceitacao"] if c["camada"] == camada]
    requisito = (spec["objetivo"] + "\n" + "\n".join(cas))[: total // 4]

    impl = ""
    maxf = int(cfg.get("max_arquivos_diff", 6))
    por_arquivo = max(200, (total // 2) // max(1, min(len(alterados), maxf)))
    for f in alterados[:maxf]:
        impl += trecho_arquivo(f, novos, base, por_arquivo) + "\n"
    impl = impl[: total // 2]

    rel = codigo_relacionado(identificadores(impl), pasta, set(alterados), total // 4)
    return {"requirement": requisito, "implementation": impl, "related_existing_code": rel}, alterados


def montar_pergunta(nome, q):
    if "nativo" in q:
        return q["nativo"]
    if q.get("tipo", "noul") != "noul":
        raise ValueError(f"pergunta '{nome}': só 'noul' é suportado na v1 (ou use o campo 'nativo')")
    return {"type": "noul", "instructions": q["instrucao"]}


def como_prob(valor):
    v = valor.get("noul") if isinstance(valor, dict) and "noul" in valor else valor
    if isinstance(v, dict):
        v = next((x for x in v.values() if isinstance(x, (int, float))), None)
    return float(v)


def perguntar(estado, perguntas, cfg, stub):
    if stub:
        probs = carregar_json(stub, {})
        return {n: float(probs[n]) for n in perguntas if n in probs}
    import laya  # importa só aqui para o --dry-run não carregar torch
    agent = laya.Router() if cfg.get("usar_router") else laya.load(cfg.get("modelo", "convaiinnovations/laya"))
    qs = {n: montar_pergunta(n, q) for n, q in perguntas.items()}
    res = agent.predict(estado, qs)
    return {n: como_prob(res["answers"][n]) for n in perguntas}


def avaliar(p, esperado, limiar):
    if esperado:
        return "ok" if p >= limiar else ("violacao" if p <= 1 - limiar else "incerto")
    return "ok" if p <= 1 - limiar else ("violacao" if p >= limiar else "incerto")


def registrar_erros(novos_erros):
    caminho = LOOP / "reported_errors.json"
    lista = carregar_json(caminho, [])
    n = max([int(e["id"].split("-")[1]) for e in lista if str(e.get("id", "")).startswith("ERR-")] or [0])
    for e in novos_erros:
        n += 1
        e["id"] = f"ERR-{n:04d}"
        lista.append(e)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(lista, f, ensure_ascii=False, indent=2)
        f.write("\n")


def reexecutar_no_venv():
    """Garante o ambiente do Laya (baixa/instala se faltar) e reexecuta este script dentro do venv.
    Devolve o código de saída do filho, ou None se já estamos no venv."""
    if os.environ.get("LOOP_IN_VENV") == "1" or Path(sys.prefix).resolve() == bootstrap.VENV.resolve():
        return None
    try:
        py = bootstrap.ensure_laya()
    except bootstrap.BootstrapErro as ex:
        print(f"ambiente do Laya indisponível: {ex}")
        return 2
    env = dict(os.environ, LOOP_IN_VENV="1")
    return subprocess.call([str(py), str(Path(__file__).resolve()), *sys.argv[1:]], env=env)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", nargs="?", help="ID da spec (SPEC-0001)")
    ap.add_argument("--camada", choices=sorted(CAMADA_DIR), help="back ou front")
    ap.add_argument("--base", default="HEAD", help="referência git para o diff (padrão: HEAD)")
    ap.add_argument("--dry-run", action="store_true", help="só mostra o estado que iria ao Laya")
    ap.add_argument("--stub", help="JSON {pergunta: P(true)} para testar sem o modelo")
    ap.add_argument("--show-native", action="store_true", help="imprime o formato nativo de perguntas do laya")
    a = ap.parse_args()

    if a.show_native:
        rc = reexecutar_no_venv()
        if rc is not None:
            return rc
        import laya
        print(json.dumps(laya.triage_questions(), indent=2, ensure_ascii=False, default=str))
        return 0
    if not a.spec or not a.camada:
        ap.error("informe a spec e --camada")

    caminho = specmod.resolve(a.spec)
    if not caminho.exists():
        print(f"spec não encontrada: {caminho}")
        return 2
    spec = specmod.load(caminho)
    erros = specmod.validate(spec, caminho)
    if erros or spec.get("status") != "aprovada":
        print(f"{a.spec} não está aprovada/íntegra; o gate 3 só roda em spec aprovada")
        return 2

    if not (a.dry_run or a.stub):
        rc = reexecutar_no_venv()
        if rc is not None:
            return rc

    cfg = carregar_json(LOOP / "laya_params.json", {})
    perguntas = dict(cfg.get("perguntas", {}))
    for pi in spec.get("perguntas_iteracao", []) or []:
        if not isinstance(pi, dict) or pi.get("camada") != a.camada:
            continue
        perguntas[f"iteracao_{pi.get('id')}"] = {
            "tipo": "noul",
            "instrucao": pi.get("pergunta", ""),
            "esperado": bool(pi.get("esperado", True)),
            "bloqueante": bool(pi.get("bloqueante", False)),
            "severidade": pi.get("severidade", "medium"),
        }
    limiar_padrao = float(cfg.get("limiar_padrao", 0.7))
    estado, alterados = montar_estado(spec, a.camada, a.base, cfg)

    if a.dry_run:
        print(json.dumps({"arquivos": alterados, "estado": estado}, indent=2, ensure_ascii=False))
        return 0
    if not alterados:
        print("nenhum arquivo alterado na camada: nada a conferir")
        return 2

    ativas = {}
    resultados = {}
    for nome, q in perguntas.items():
        if q.get("requer_relacionado") and not estado["related_existing_code"].strip():
            resultados[nome] = {"status": "sem_evidencia", "p_true": None}
        else:
            ativas[nome] = q
    if ativas:
        try:
            probs = perguntar(estado, ativas, cfg, a.stub)
        except Exception as ex:  # modelo indisponível, API diferente, etc.
            print(f"falha ao consultar o Laya: {type(ex).__name__}: {ex}")
            return 2
        for nome, q in ativas.items():
            if nome not in probs:
                resultados[nome] = {"status": "sem_resposta", "p_true": None}
                continue
            p = probs[nome]
            st = avaliar(p, bool(q.get("esperado", True)), float(q.get("limiar", limiar_padrao)))
            resultados[nome] = {"status": st, "p_true": round(p, 4)}

    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    estado_loop = carregar_json(LOOP / "state.json", {})
    tentativa = estado_loop.get("tentativa", 1) if estado_loop.get("spec_id") == spec["id"] else 1
    novos, bloqueou = [], False
    for nome, r in resultados.items():
        q = perguntas[nome]
        marca = {"ok": "OK ", "incerto": "?  ", "violacao": "ERR", "sem_evidencia": "-- ", "sem_resposta": "-- "}[r["status"]]
        print(f"[{marca}] {nome}: {r['status']}" + (f" (P(true)={r['p_true']})" if r["p_true"] is not None else ""))
        if r["status"] == "violacao":
            bloqueante = bool(q.get("bloqueante", False))
            bloqueou = bloqueou or bloqueante
            novos.append({
                "timestamp": agora, "documento": spec["id"], "camada": "backend" if a.camada == "back" else "frontend",
                "gate": "coherence", "comando": f"gate3_coherence.py {spec['id']} --camada {a.camada}",
                "severidade": q.get("severidade", "medium"), "bloqueante": bloqueante,
                "resumo": f"{nome}: P(true)={r['p_true']} (esperado {bool(q.get('esperado', True))})",
                "arquivos": alterados, "tentativa": tentativa, "status": "open",
            })
    if novos:
        registrar_erros(novos)
    with open(LOOP / "gate3_result.json", "w", encoding="utf-8") as f:
        json.dump({"spec": spec["id"], "camada": a.camada, "quando": agora, "arquivos": alterados,
                   "chars_estado": sum(len(v) for v in estado.values()), "resultados": resultados},
                  f, ensure_ascii=False, indent=2)
        f.write("\n")
    pendentes = [n for n, r in resultados.items() if r["status"] in ("incerto", "sem_evidencia", "sem_resposta")]
    if bloqueou:
        print("GATE 3: REPROVADO (violação bloqueante)")
    else:
        extras = (["avisos registrados"] if novos else []) + (["pendências para revisão humana: " + ", ".join(pendentes)] if pendentes else [])
        print("GATE 3: aprovado" + (" (" + "; ".join(extras) + ")" if extras else ""))
    return 1 if bloqueou else 0


if __name__ == "__main__":
    sys.exit(main())
