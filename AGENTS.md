# Regras globais do loop

Projeto fullstack: Django (`backend/`) + React com Vite (`frontend/`).
O desenvolvimento é guiado por **specs** em `loop/specs/`, geradas a partir de prompts humanos.

Repo remoto: `https://github.com/Henzo-Hanz/NIT` (`origin`, branch principal `main`).

## Regras que valem para todos os agentes

1. **Nada é implementado sem uma spec com `status: "aprovada"`.** A aprovação é sempre iniciada pelo humano:
   via `/approve SPEC-XXXX` no chat ou direto com
   `python loop/scripts/spec.py approve SPEC-XXXX [--por NOME]` no terminal. O aprovador fica registrado
   em `aprovada_por` (padrão: usuário do SO) e coberto pelo hash. Nenhum agente aprova por conta própria
   a partir de afirmação conversacional ("isso está bom").
2. **Ordem do loop:** refino -> aprovação humana -> fase back -> fase front. O front só começa depois que o back foi entregue.
3. **Três gates por implementação:** funcional, não funcional/desempenho e coerência (Laya).
   Erro no gate funcional interrompe tudo e é registrado em `loop/reported_errors.json`.
4. **No máximo 3 tentativas por gate.** Passou disso, pare e peça ajuda humana.
5. **Nunca fazer merge.** PR sim, merge é humano.
6. **Rastreabilidade:** o ID da spec (`SPEC-XXXX`) aparece na branch, no commit, no PR, no card do Trello e nos erros registrados.
7. **Nunca invente.** Se não souber, pergunte ou registre como premissa na spec.
8. **O Laya é juiz, não busca.** Ele responde perguntas tipadas sobre o texto que recebe. Quem levanta a evidência (grep/leitura) é o agente ou um script.
9. **Escopo de pastas:** agentes de back só alteram `backend/`; agentes de front só `frontend/`; testers só escrevem em `loop/`;
   exceção: o `runner` só edita `loop/state.json`.

## Layout

- `loop/specs/` specs geradas (SPEC-XXXX.json)
- `loop/scripts/` scripts determinísticos (Python, só biblioteca padrão). `bootstrap.py` prepara o ambiente (Laya + projeto) sozinho e é idempotente; os gates o chamam quando precisam
- `loop/state.json` estado do loop entre sessões
- `loop/reported_errors.json` erros encontrados nos gates
- `loop/budgets.json` limites de desempenho
- `loop/laya_params.json` parâmetros de coerência (definidos depois)

