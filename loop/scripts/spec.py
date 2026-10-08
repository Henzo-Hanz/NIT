#!/usr/bin/env python3
"""Gerencia specs do loop: next-id, validate, approve, check. Só biblioteca padrão."""
import argparse
import getpass
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    FUSO_APROVACAO = ZoneInfo("America/Sao_Paulo")
except Exception:
    FUSO_APROVACAO = timezone(timedelta(hours=-3))

SPECS_DIR = Path(__file__).resolve().parent.parent / "specs"
ID_RE = re.compile(r"^SPEC-\d{4}$")
CA_RE = re.compile(r"^CA-\d+$")
PI_RE = re.compile(r"^PI-\d+$")
STATUS = {"aguardando_aprovacao", "aprovada"}
CAMADAS = {"back", "front"}
METODOS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
VOLATEIS = {"status", "aprovada_em", "hash_aprovacao"}
OBRIGATORIOS = [
    "id", "prompt_original", "objetivo", "escopo", "fora_de_escopo",
    "criterios_aceitacao", "contrato_api_rascunho", "ja_existe_na_codebase",
    "laya_consultado", "premissas", "perguntas_abertas", "dependencias", "status",
]


def resolve(arg):
    if ID_RE.match(arg):
        return SPECS_DIR / f"{arg}.json"
    return Path(arg)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def content_hash(spec):
    data = {k: v for k, v in spec.items() if k not in VOLATEIS}
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def aprovador_padrao():
    """Usuário do SO como aprovador/revisor (blame). Só biblioteca padrão."""
    try:
        nome = getpass.getuser().strip()
        if nome:
            return nome
    except Exception:
        pass
    return "desconhecido"


def is_str_list(v):
    return isinstance(v, list) and all(isinstance(x, str) and x.strip() for x in v)


def validate(spec, path=None):
    e = []
    for campo in OBRIGATORIOS:
        if campo not in spec:
            e.append(f"campo obrigatório ausente: {campo}")
    if e:
        return e

    if not ID_RE.match(str(spec["id"])):
        e.append("id deve seguir o formato SPEC-0001")
    elif path is not None and Path(path).stem != spec["id"]:
        e.append(f"nome do arquivo ({Path(path).stem}) difere do id ({spec['id']})")
    for campo in ("prompt_original", "objetivo"):
        if not isinstance(spec[campo], str) or not spec[campo].strip():
            e.append(f"{campo} deve ser texto não vazio")

    esc = spec["escopo"]
    if not (isinstance(esc, dict) and is_str_list(esc.get("back")) and is_str_list(esc.get("front"))):
        e.append("escopo deve ter listas de texto em 'back' e 'front'")
        esc = {"back": [], "front": []}
    elif not esc["back"] and not esc["front"]:
        e.append("escopo vazio: back e front sem itens")

    for campo in ("fora_de_escopo", "ja_existe_na_codebase", "premissas", "perguntas_abertas"):
        if not is_str_list(spec[campo]):
            e.append(f"{campo} deve ser lista de textos não vazios")
    if not isinstance(spec["laya_consultado"], bool):
        e.append("laya_consultado deve ser true ou false")
    if not spec["ja_existe_na_codebase"]:
        e.append("ja_existe_na_codebase vazio: registre o achado, 'nada relacionado encontrado' ou 'não verificado'")

    cas = spec["criterios_aceitacao"]
    ids = set()
    camadas_cobertas = set()
    if not isinstance(cas, list) or not cas:
        e.append("criterios_aceitacao deve ter ao menos um item")
    else:
        for i, ca in enumerate(cas):
            if not isinstance(ca, dict):
                e.append(f"criterios_aceitacao[{i}] deve ser objeto")
                continue
            cid = ca.get("id")
            if not isinstance(cid, str) or not CA_RE.match(cid):
                e.append(f"criterios_aceitacao[{i}].id deve seguir CA-1, CA-2...")
            elif cid in ids:
                e.append(f"id de critério duplicado: {cid}")
            else:
                ids.add(cid)
            if ca.get("camada") not in CAMADAS:
                e.append(f"{cid or i}: camada deve ser 'back' ou 'front'")
            else:
                camadas_cobertas.add(ca["camada"])
            if not isinstance(ca.get("descricao"), str) or not ca["descricao"].strip():
                e.append(f"{cid or i}: descricao vazia")
    for camada in CAMADAS:
        if esc[camada] and camada not in camadas_cobertas:
            e.append(f"escopo tem itens em '{camada}' mas nenhum critério de aceitação nessa camada")

    pis = spec.get("perguntas_iteracao", [])
    if not isinstance(pis, list):
        e.append("perguntas_iteracao deve ser lista (pode ser vazia)")
    else:
        pids = set()
        for i, pi in enumerate(pis):
            if not isinstance(pi, dict):
                e.append(f"perguntas_iteracao[{i}] deve ser objeto")
                continue
            pid = pi.get("id")
            if not isinstance(pid, str) or not PI_RE.match(pid):
                e.append(f"perguntas_iteracao[{i}].id deve seguir PI-1, PI-2...")
            elif pid in pids:
                e.append(f"id de pergunta de iteração duplicado: {pid}")
            else:
                pids.add(pid)
            if pi.get("camada") not in CAMADAS:
                e.append(f"{pid or i}: camada deve ser 'back' ou 'front'")
            if not isinstance(pi.get("pergunta"), str) or not pi["pergunta"].strip():
                e.append(f"{pid or i}: pergunta vazia")
            for campo in ("esperado", "bloqueante"):
                if campo in pi and not isinstance(pi[campo], bool):
                    e.append(f"{pid or i}: {campo} deve ser true ou false")

    contrato = spec["contrato_api_rascunho"]
    if not isinstance(contrato, list):
        e.append("contrato_api_rascunho deve ser lista")
    else:
        if esc["back"] and esc["front"] and not contrato:
            e.append("back e front no escopo: contrato_api_rascunho não pode ser vazio")
        for i, ep in enumerate(contrato):
            if not isinstance(ep, dict) or ep.get("metodo") not in METODOS \
                    or not str(ep.get("rota", "")).startswith("/"):
                e.append(f"contrato_api_rascunho[{i}] precisa de metodo válido e rota iniciando com '/'")

    dep = spec["dependencias"]
    if not (isinstance(dep, dict) and isinstance(dep.get("front_depende_de_back"), bool)):
        e.append("dependencias.front_depende_de_back deve ser true ou false")

    if spec["status"] not in STATUS:
        e.append(f"status deve ser um de {sorted(STATUS)}")
    elif spec["status"] == "aprovada":
        if not isinstance(spec.get("aprovada_por"), str) or not spec["aprovada_por"].strip():
            e.append('spec aprovada sem "aprovada_por": reaprove com `spec.py approve SPEC-XXXX [--por NOME]`')
        if spec.get("hash_aprovacao") != content_hash(spec):
            e.append("spec aprovada foi alterada depois da aprovação (hash não confere)")
    return e


def cmd_next_id(_):
    nums = [int(p.stem.split("-")[1]) for p in SPECS_DIR.glob("SPEC-*.json") if ID_RE.match(p.stem)]
    print(f"SPEC-{(max(nums) + 1 if nums else 1):04d}")
    return 0


def cmd_validate(args):
    path = resolve(args.spec)
    if not path.exists():
        print(f"arquivo não encontrado: {path}")
        return 2
    try:
        spec = load(path)
    except json.JSONDecodeError as ex:
        print(f"JSON inválido: {ex}")
        return 1
    erros = validate(spec, path)
    if erros:
        print("SPEC INVÁLIDA:")
        for er in erros:
            print(f"  - {er}")
        return 1
    print(f"OK: {spec['id']} válida (status: {spec['status']})")
    return 0


def cmd_approve(args):
    path = resolve(args.spec)
    if not path.exists():
        print(f"arquivo não encontrado: {path}")
        return 2
    spec = load(path)
    if spec.get("status") == "aprovada":
        print("já aprovada; para reaprovar, volte o status para aguardando_aprovacao")
        return 1
    erros = validate(spec, path)
    if spec.get("perguntas_abertas"):
        erros.append("há perguntas_abertas pendentes: resolva antes de aprovar")
    if erros:
        print("NÃO APROVADA:")
        for er in erros:
            print(f"  - {er}")
        return 1
    if spec["laya_consultado"] is False:
        print("aviso: o Laya não foi consultado nesta spec")
    aprovador = (getattr(args, "por", "") or "").strip() or aprovador_padrao()
    spec["status"] = "aprovada"
    spec["aprovada_por"] = aprovador
    spec["aprovada_em"] = datetime.now(FUSO_APROVACAO).strftime("%Y-%m-%d %Hh%M (São Paulo)")
    spec["hash_aprovacao"] = content_hash(spec)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{spec['id']} aprovada em {spec['aprovada_em']} por {aprovador}, hash {spec['hash_aprovacao']}")
    return 0


def cmd_check(args):
    path = resolve(args.spec)
    if not path.exists():
        print(f"arquivo não encontrado: {path}")
        return 2
    spec = load(path)
    erros = validate(spec, path)
    if erros or spec.get("status") != "aprovada":
        print(f"{spec.get('id', args.spec)} NÃO está pronta para o loop")
        for er in erros:
            print(f"  - {er}")
        return 1
    print(f"{spec['id']} aprovada em {spec['aprovada_em']} por {spec['aprovada_por']}, hash {spec['hash_aprovacao']}")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("next-id").set_defaults(fn=cmd_next_id)
    for nome, fn in (("validate", cmd_validate), ("approve", cmd_approve), ("check", cmd_check)):
        sp = sub.add_parser(nome)
        sp.add_argument("spec", help="ID (SPEC-0001) ou caminho do arquivo")
        if nome == "approve":
            sp.add_argument("--por", default="",
                            help="aprovador/revisor (padrão: usuário do SO)")
        sp.set_defaults(fn=fn)
    args = p.parse_args()
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
