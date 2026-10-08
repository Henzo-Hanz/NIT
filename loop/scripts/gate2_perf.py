#!/usr/bin/env python3
"""Gate 2 (desempenho + queries): testes de desempenho passam dentro dos budgets.

Convenção:
  back:  arquivos backend/**/test_perf_*.py e backend/**/test_query_*.py, rodados
         com pytest; asserts internos (assertNumQueries, tempos de resposta)
         cobrem os tetos por endpoint, o gate cobra o tempo total da suíte
  front: arquivos frontend/**/perf_*.*, rodados com `npx vitest run`

Budgets em loop/budgets.json (resposta_max_s padrão 60). Sem arquivo de
desempenho na camada = falha (fail-closed). Falhas vão para
loop/reported_errors.json como bloqueantes.

Códigos de saída: 0 passou | 1 violação de budget/falha | 2 erro de uso/ambiente.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
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


def arquivos_perf_back():
    pasta = ROOT / "backend"
    return sorted([*pasta.glob("**/test_perf_*.py"), *pasta.glob("**/test_query_*.py")])


def rodar_back(cas_existe):
    if not (ROOT / "backend").exists():
        print("backend/ não existe: nada a medir")
        return 2, []
    if shutil.which("pytest") is None and not (ROOT / "backend" / ".venv").exists():
        print("pytest não encontrado e backend/.venv ausente; rode bootstrap --projeto")
        return 2, []
    arqs = arquivos_perf_back()
    if not arqs:
        print("[ERR] sem testes de desempenho (esperado backend/**/test_perf_*.py ou test_query_*.py)")
        return 1, [("sem testes de desempenho", [])]
    rel = [str(a.relative_to(ROOT)) for a in arqs]
    ini = time.perf_counter()
    r = subprocess.run([python_back(), "-m", "pytest", *[str(a) for a in arqs], "-q", "--tb=short"],
                       cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    dur = time.perf_counter() - ini
    print(f"suíte de desempenho: {dur:.1f}s em {len(rel)} arquivo(s)")
    if r.returncode != 0:
        print("[ERR] teste de desempenho/query falhou (inclui asserts de N+1 e tempos)")
        print((r.stdout or "")[-2000:])
        return 1, [(f"falha em {dur:.1f}s", rel)]
    return 0, [(dur, rel)]


def rodar_front(cas_existe):
    pasta = ROOT / "frontend"
    if not pasta.exists():
        print("frontend/ não existe: nada a medir")
        return 2, []
    if shutil.which("npx") is None:
        print("npx não encontrado: instale o Node.js 20+")
        return 2, []
    arqs = sorted([p for p in pasta.glob("**/perf_*") if p.is_file()])
    if not arqs:
        print("[ERR] sem testes de desempenho (esperado frontend/**/perf_*)")
        return 1, [("sem testes de desempenho", [])]
    rel = [str(a.relative_to(ROOT)) for a in arqs]
    ini = time.perf_counter()
    r = subprocess.run(["npx", "vitest", "run", *[str(a) for a in arqs]],
                       cwd=pasta, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    dur = time.perf_counter() - ini
    print(f"suíte de desempenho: {dur:.1f}s em {len(rel)} arquivo(s)")
    if r.returncode != 0:
        print("[ERR] teste de desempenho do front falhou")
        print((r.stdout or "")[-2000:])
        return 1, [(f"falha em {dur:.1f}s", rel)]
    return 0, [(dur, rel)]


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
        print(f"{a.spec} não está aprovada/íntegra; o gate 2 só roda em spec aprovada")
        return 2

    tem_ca = any(c["camada"] == a.camada for c in spec["criterios_aceitacao"])
    if not tem_ca:
        print(f"sem critérios '{a.camada}' na spec: nada a medir")
        return 2

    budgets = carregar_json(LOOP / "budgets.json", {})
    suite_max = float(budgets.get("suite_max_s", 600))
    print(f"budgets: resposta_max_s={budgets.get('resposta_max_s', 60)} "
          f"suite_max_s={suite_max} queries_max_por_endpoint={budgets.get('queries_max_por_endpoint', 25)}")

    if a.camada == "back":
        codigo, info = rodar_back(tem_ca)
    else:
        codigo, info = rodar_front(tem_ca)
    if codigo == 2:
        return 2

    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if codigo == 1:
        novos = [{
            "timestamp": agora, "documento": spec["id"],
            "camada": "backend" if a.camada == "back" else "frontend",
            "gate": "desempenho", "comando": f"gate2_perf.py {spec['id']} --camada {a.camada}",
            "severidade": "medium", "bloqueante": True,
            "resumo": f"desempenho: {motivo}",
            "arquivos": rel, "tentativa": tentativa_atual(spec["id"]), "status": "open",
        } for motivo, rel in info]
        registrar_erros(novos)
        print("GATE 2: REPROVADO")
        return 1

    dur = info[0][0] if info else 0.0
    if dur > suite_max:
        registrar_erros([{
            "timestamp": agora, "documento": spec["id"],
            "camada": "backend" if a.camada == "back" else "frontend",
            "gate": "desempenho", "comando": f"gate2_perf.py {spec['id']} --camada {a.camada}",
            "severidade": "medium", "bloqueante": True,
            "resumo": f"suíte levou {dur:.1f}s, teto {suite_max:.0f}s",
            "arquivos": info[0][1] if info else [],
            "tentativa": tentativa_atual(spec["id"]), "status": "open",
        }])
        print(f"GATE 2: REPROVADO (suíte {dur:.1f}s > teto {suite_max:.0f}s)")
        return 1
    print(f"GATE 2: aprovado ({dur:.1f}s dentro do teto {suite_max:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
