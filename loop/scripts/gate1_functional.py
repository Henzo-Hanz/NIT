#!/usr/bin/env python3
"""Gate 1 (funcional): cada CA da camada precisa de teste que passe.

Convenção (sem plugins, sem parsing frágil):
  back:  arquivos backend/**/test_CA_<N>_*.py, rodados com pytest, um grupo por CA
  front: arquivos frontend/**/CA_<N>_*.*, rodados com `npx vitest run`

CA sem arquivo de teste = falha (fail-closed, como o gate 3 sem evidência).
Falhas vão para loop/reported_errors.json como bloqueantes.

Códigos de saída: 0 passou | 1 falha funcional | 2 erro de uso/ambiente.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOOP = HERE.parent
ROOT = LOOP.parent
sys.path.insert(0, str(HERE))
import spec as specmod  # noqa: E402

CAMADA_DIR = {"back": "backend", "front": "frontend"}


def carregar_json(path, padrao):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return padrao


def tentativa_atual(spec_id):
    estado = carregar_json(LOOP / "state.json", {})
    if estado.get("spec_id") == spec_id:
        return estado.get("tentativa", 1)
    return 1


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


def python_back():
    vpy = ROOT / "backend" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if vpy.exists():
        return str(vpy)
    return sys.executable


def arquivos_ca_back(numero):
    return sorted((ROOT / "backend").glob(f"**/test_CA_{numero}_*.py"))


def rodar_back(spec, cas):
    if not (ROOT / "backend").exists():
        print("backend/ não existe: nada a testar")
        return 2, []
    if shutil.which("pytest") is None and not (ROOT / "backend" / ".venv").exists():
        print("pytest não encontrado e backend/.venv ausente; rode bootstrap --projeto")
        return 2, []
    falhas = []
    for ca in cas:
        numero = ca["id"].split("-")[1]
        arqs = arquivos_ca_back(numero)
        rel = [str(a.relative_to(ROOT)) for a in arqs]
        if not arqs:
            print(f"[ERR] {ca['id']}: sem arquivo de teste (esperado backend/**/test_CA_{numero}_*.py)")
            falhas.append((ca, rel, "sem arquivo de teste"))
            continue
        r = subprocess.run([python_back(), "-m", "pytest", *[str(a) for a in arqs], "-q", "--tb=short"],
                           cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if r.returncode != 0:
            print(f"[ERR] {ca['id']}: pytest falhou")
            print((r.stdout or "")[-2000:])
            falhas.append((ca, rel, "pytest falhou"))
        else:
            print(f"[OK ] {ca['id']}: {len(rel)} arquivo(s) passando")
    return (1 if falhas else 0), falhas


def arquivos_ca_front(numero):
    pasta = ROOT / "frontend"
    return sorted([p for p in pasta.glob(f"**/CA_{numero}_*") if p.is_file()])


def rodar_front(spec, cas):
    pasta = ROOT / "frontend"
    if not pasta.exists():
        print("frontend/ não existe: nada a testar")
        return 2, []
    pkg = carregar_json(pasta / "package.json", {})
    scripts = (pkg.get("scripts") or {})
    if "test" not in scripts:
        print("frontend/package.json sem script 'test': nada a rodar")
        return 2, []
    if shutil.which("npx") is None:
        print("npx não encontrado: instale o Node.js 20+")
        return 2, []
    falhas = []
    for ca in cas:
        numero = ca["id"].split("-")[1]
        arqs = arquivos_ca_front(numero)
        rel = [str(a.relative_to(ROOT)) for a in arqs]
        if not arqs:
            print(f"[ERR] {ca['id']}: sem arquivo de teste (esperado frontend/**/CA_{numero}_*)")
            falhas.append((ca, rel, "sem arquivo de teste"))
            continue
        r = subprocess.run(["npx", "vitest", "run", *[str(a) for a in arqs]],
                           cwd=pasta, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if r.returncode != 0:
            print(f"[ERR] {ca['id']}: vitest falhou")
            print((r.stdout or "")[-2000:])
            falhas.append((ca, rel, "vitest falhou"))
        else:
            print(f"[OK ] {ca['id']}: {len(rel)} arquivo(s) passando")
    return (1 if falhas else 0), falhas


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", help="ID da spec (SPEC-0001)")
    ap.add_argument("--camada", choices=sorted(CAMADA_DIR), required=True, help="back ou front")
    a = ap.parse_args()

    caminho = specmod.resolve(a.spec)
    if not caminho.exists():
        print(f"spec não encontrada: {caminho}")
        return 2
    spec = specmod.load(caminho)
    erros = specmod.validate(spec, caminho)
    if erros or spec.get("status") != "aprovada":
        print(f"{a.spec} não está aprovada/íntegra; o gate 1 só roda em spec aprovada")
        return 2

    cas = [c for c in spec["criterios_aceitacao"] if c["camada"] == a.camada]
    if not cas:
        print(f"sem critérios '{a.camada}' na spec: nada a testar")
        return 2

    if a.camada == "back":
        codigo, falhas = rodar_back(spec, cas)
    else:
        codigo, falhas = rodar_front(spec, cas)
    if codigo == 2:
        return 2

    if falhas:
        agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
        novos = [{
            "timestamp": agora, "documento": spec["id"],
            "camada": "backend" if a.camada == "back" else "frontend",
            "gate": "funcional", "comando": f"gate1_functional.py {spec['id']} --camada {a.camada}",
            "severidade": "high", "bloqueante": True,
            "resumo": f"{ca['id']}: {motivo}",
            "arquivos": rel, "tentativa": tentativa_atual(spec["id"]), "status": "open",
        } for ca, rel, motivo in falhas]
        registrar_erros(novos)
        print(f"GATE 1: REPROVADO ({len(falhas)} CA(s) com falha)")
        return 1
    print("GATE 1: aprovado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
