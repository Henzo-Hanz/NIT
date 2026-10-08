# NIT

Dashboard informativo em mapa sobre espécies litorâneas do, com área de
pesquisadores credenciados para submissão de resultados (`.xlsx`, `.csv` e
outros formatos). Projeto do Governo do Estado do Piauí, em parceria com a
FAPEPI e universidades, reunindo áreas diversas — biologia, engenharia de
pesca, pesquisadores e cursos de TIC.

## Visão geral

- **O que é:** plataforma pública de visualização geoespacial de dados sobre
  espécies litorâneas + portal onde pesquisadores se credenciam e submetem
  resultados de pesquisa.
- **Quem faz:** parceria FAPEPI + universidades (biológicas, eng. pesca, TIC).
- **De quem é:** Governo do Estado do Piauí.

## Arquitetura

Django só-API + React SPA desacoplados (decisão B). Detalhes e justificativa:
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Desenvolvimento (loop engineering)

O desenvolvimento é guiado por specs e 3 gates por implementação
(funcional, desempenho, coerência). Ver [`GUIA_LOOP.md`](GUIA_LOOP.md) e
[`AGENTS.md`](AGENTS.md).

Acompanhamento: [Kanban do NIT — Status do Projeto](https://trello.com/b/Y46Sxmy3/kanban-do-nit-status-do-projeto).

## Layout (alvo, monorepo)

- `backend/` — Django API (a criar)
- `frontend/` — React + Vite SPA (a criar)
- `loop/` — specs, scripts e gates do loop
- `docs/` — decisões de arquitetura e referências
