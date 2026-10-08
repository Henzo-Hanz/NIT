#!/usr/bin/env python3
"""Auxiliar do run-loop (v1): status e doctor. Só biblioteca padrão.

  status SPEC-XXXX  mostra a spec (aprovada/íntegra?) + loop/state.json
  doctor            confere permissões dos agentes do loop e o runbook do runner:
                    CA-2 (implementer-back), CA-3 (implementer-front),
                    CA-4/CA-5/CA-6 (ordem, fail-closed e deliver no runner)

Códigos de saída: 0 ok | 1 problema encontrado | 2 erro de uso.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOOP = HERE.parent
ROOT = LOOP.parent
sys.path.insert(0, str(HERE))
import spec as specmod  # noqa: E402

AGENT_FILES = {
    "implementer-back": ROOT / ".opencode" / "agent" / "implementer-back.md",
    "implementer-front": ROOT / ".opencode" / "agent" / "implementer-front.md",
    "runner": ROOT / ".opencode" / "agent" / "runner.md",
}

PERM_RE = re.compile(r'^(\s*)"([^"]+)":\s*(allow|deny)\s*$')
SECAO_RE = re.compile(r'^(\s*)(\w[\w-]*):\s*$')


def carregar_json(path, padrao):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return padrao


def frontmatter(texto):
    linhas = texto.splitlines()
    if not linhas or linhas[0].strip() != "---":
        return []
    try:
        fim = linhas.index("---", 1)
    except ValueError:
        return []
    return linhas[1:fim]


def parse_permissions(texto):
    """Devolve {(sub, pattern): verdict} do bloco permission do frontmatter."""
    achados = {}
    sub = None
    dentro = False
    for linha in frontmatter(texto):
        m = SECAO_RE.match(linha)
        if m:
            indent, nome = len(m.group(1)), m.group(2)
            if indent == 0 and nome == "permission":
                dentro = True
                sub = None
            elif dentro and indent == 2:
                sub = nome
            elif indent == 0:
                dentro = False
                sub = None
            continue
        m = PERM_RE.match(linha)
        if m and dentro and sub:
            achados[(sub, m.group(2))] = m.group(3)
    return achados


def allows(perms, sub):
    return [p for (u, p), v in perms.items() if u == sub and v == "allow"]


def tem_deny_all(perms, sub):
    return perms.get((sub, "*")) == "deny"


def checar_implementer(nome, pasta):
    erros = []
    caminho = AGENT_FILES[nome]
    if not caminho.exists():
        return [f"{nome}: arquivo não encontrado ({caminho})"]
    perms = parse_permissions(caminho.read_text(encoding="utf-8"))
    ed = allows(perms, "edit")
    if not ed:
        erros.append(f"{nome}: sem edit allow")
    for p in ed:
        if p == "*" or not p.startswith(pasta + "/"):
            erros.append(f"{nome}: edit allow fora do escopo: {p!r}")
    for p in allows(perms, "bash"):
        pl = p.lower()
        if "merge" in pl or "approve" in pl:
            erros.append(f"{nome}: bash permite proibido: {p!r}")
    if not tem_deny_all(perms, "edit"):
        erros.append(f"{nome}: falta deny geral em edit")
    if not tem_deny_all(perms, "bash"):
        erros.append(f"{nome}: falta deny geral em bash")
    return erros


def cmd_status(args):
    caminho = specmod.resolve(args.spec)
    if not caminho.exists():
        print(f"spec não encontrada: {caminho}")
        return 2
    spec = specmod.load(caminho)
    erros = specmod.validate(spec, caminho)
    integra = not erros and spec.get("status") == "aprovada"
    estado = carregar_json(LOOP / "state.json", {})
    print(f"spec: {spec.get('id', args.spec)} (status: {spec.get('status')})")
    print(f"íntegra: {'sim' if integra else 'NÃO'}")
    for e in erros:
        print(f"  - {e}")
    print(f"state: spec_id={estado.get('spec_id')} fase={estado.get('fase')} "
          f"gate={estado.get('gate')} tentativa={estado.get('tentativa')}")
    if estado.get("spec_id") not in (None, spec.get("id")):
        print(f"aviso: state.json aponta para {estado.get('spec_id')}, não para {spec.get('id')}")
    if spec.get("status") == "aprovada":
        print(f"{spec['id']} aprovada em {spec.get('aprovada_em')} "
              f"por {spec.get('aprovada_por')}, hash {spec.get('hash_aprovacao')}")
    return 0 if integra else 1


def cmd_doctor(_):
    erros = []
    erros += checar_implementer("implementer-back", "backend")
    erros += checar_implementer("implementer-front", "frontend")
    for script in ("gate1_functional.py", "gate2_perf.py", "gate3_coherence.py"):
        if not (HERE / script).exists():
            erros.append(f"script ausente: loop/scripts/{script}")

    caminho = AGENT_FILES["runner"]
    if not caminho.exists():
        erros.append(f"runner: arquivo não encontrado ({caminho})")
    else:
        perms = parse_permissions(caminho.read_text(encoding="utf-8"))
        ed = allows(perms, "edit")
        if set(ed) != {"loop/state.json"}:
            erros.append(f"runner: edit deve ser só loop/state.json, achado: {ed}")
        bash = allows(perms, "bash")
        for esperado in ("spec.py check", "run_loop.py", "gate1_functional.py",
                         "gate2_perf.py", "gate3_coherence.py"):
            if not any(esperado in b for b in bash):
                erros.append(f"runner: bash sem {esperado}")
        for p in bash:
            pl = p.lower()
            if "merge" in pl or "approve" in pl:
                erros.append(f"runner: bash permite proibido: {p!r}")
        corpo = caminho.read_text(encoding="utf-8").lower()
        for trecho in ("3 tentativas", "fail-closed", "state.json", "nunca faça merge",
                        "nunca rode `approve`", "front só", "reported_errors.json",
                        "gh pr create", "trello_create_card", "\"trello_*\": deny"):
            if trecho not in corpo:
                erros.append(f"runner: runbook sem trecho obrigatório: {trecho!r}")

    mcp = carregar_json(ROOT / "opencode.json", {}).get("mcp", {})
    trello = mcp.get("trello", {})
    if not trello.get("enabled"):
        erros.append("opencode.json: servidor MCP 'trello' ausente ou desabilitado")
    else:
        env = trello.get("environment", {})
        for var in ("TRELLO_API_KEY", "TRELLO_TOKEN", "TRELLO_ALLOWED_BOARD_IDS"):
            if var not in env:
                erros.append(f"opencode.json: trello sem {var} no environment")

    if erros:
        print("DOCTOR: problemas encontrados")
        for e in erros:
            print(f"  - {e}")
        return 1
    print("DOCTOR: ok (implementer-back, implementer-front e runner conformes)")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("status", help="mostra spec + state.json")
    sp.add_argument("spec", help="ID (SPEC-0001) ou caminho do arquivo")
    sp.set_defaults(fn=cmd_status)
    sub.add_parser("doctor", help="confere agentes e runbook").set_defaults(fn=cmd_doctor)
    args = p.parse_args()
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
