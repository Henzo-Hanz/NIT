# Guia do Loop — back + front com specs, gates e deliver rastreável

Documento de bordo para quem entra no projeto: como o loop funciona, como rodar,
onde ficam as autenticações e onde vive cada decisão.

> Regras rígidas valem para todos e estão em `AGENTS.md`. Este guia explica o
> **como**; o `AGENTS.md` (e as specs) mandam no **o que pode e o que não pode**.
> Valores específicos deste projeto (repo, board, stack, budgets) vivem no
> `AGENTS.md`, nas specs e nos JSONs de `loop/` — nunca aqui.

## 1. O loop em 30 segundos

```
refino (/refine) → aprovação HUMANA (/approve) → fase back → fase front → deliver
                          │                          │              │
                    sem spec aprovada          3 gates em      3 gates em
                    nada é implementado         ordem           ordem
```

- **Ordem das fases:** refino → approve → back → front. O front só começa com o back entregue.
- **3 gates por fase, sempre nesta ordem:** 1 funcional → 2 desempenho → 3 coerência (Laya).
  Erro no gate funcional interrompe tudo e vai para `loop/reported_errors.json`.
- **Máximo 3 tentativas por gate.** Na 3ª falha, pare e peça ajuda humana.
- **Nunca faça merge.** PR sim, merge é humano.
- **Rastreabilidade:** o ID da spec (`SPEC-XXXX`) aparece na branch, nos commits,
  no PR, no card do Trello e nos erros registrados.
- **Só o comando explícito `/run-loop SPEC-XXXX` executa.** "Isso está bom" em
  conversa não inicia fase nem dispensa gate.

## 2. Estrutura do repo

```
backend/            API (só agentes de back mexem aqui)
frontend/           UI (só agentes de front mexem aqui)
loop/
  specs/            SPEC-XXXX.json (contrato, CAs, hash de aprovação)
  scripts/          scripts determinísticos, só biblioteca padrão:
                    spec.py, bootstrap.py, run_loop.py,
                    gate1_functional.py, gate2_perf.py, gate3_coherence.py
  state.json        estado do loop entre sessões (só o runner edita)
  reported_errors.json  erros dos gates
  budgets.json      tetos de desempenho do projeto
  laya_params.json  parâmetros do gate 3 / Laya
.opencode/
  agent/            refiner, approver, implementer-back/front, runner, tester-*
  command/          refine, approve, run-loop
  skill/            spec-writing, laya-query
opencode.json       MCPs habilitados do projeto
```

**Escopo de pastas:** back só `backend/` · front só `frontend/` · testers só `loop/` ·
runner só `loop/state.json`. Exceção registrada: se os subagents estiverem
indisponíveis, o runner pode executar as fases diretamente mantendo o escopo
por pasta e rodando os 3 gates sem dispensa (ver regra "Fallback sem subagents"
em `.opencode/agent/runner.md`).

## 3. Specs: o contrato de tudo

- Toda implementação nasce de uma spec em `loop/specs/SPEC-XXXX.json` com
  `status: "aprovada"`, `aprovada_por`, `aprovada_em` e `hash_aprovacao`.
- Criar/refinar: `/refine <seu pedido>` (gera ou atualiza a spec).
- Aprovar (sempre iniciativa humana, nunca de agente):
  `/approve SPEC-XXXX` no chat, ou
  `python loop/scripts/spec.py approve SPEC-XXXX [--por NOME]` no terminal.
- Consultar: `python loop/scripts/spec.py check SPEC-XXXX` e
  `python loop/scripts/run_loop.py status SPEC-XXXX`.
- Cada critério de aceitação tem `id` (`CA-N`) e `camada` (`back`/`front`).
  O gate 1 cobra **um arquivo de teste por CA** (fail-closed: sem arquivo = reprova).

## 4. Gates e convenções de teste

| Gate | Script | Back | Front |
|------|--------|------|-------|
| 1 funcional | `gate1_functional.py SPEC --camada back\|front` | `backend/**/test_CA_<N>_*.py` via pytest | `frontend/**/CA_<N>_*` via `npx vitest run` |
| 2 desempenho | `gate2_perf.py SPEC --camada back\|front` | `backend/**/test_perf_*.py`, `test_query_*.py` (asserts de tempo/queries no teste; suíte ≤ `suite_max_s` de `budgets.json`) | `frontend/**/perf_*` via vitest |
| 3 coerência (Laya) | `gate3_coherence.py SPEC --camada back\|front` | diff da camada vs base + código relacionado → perguntas `noul` ao Laya | idem |

Gate 3 (detalhes em `loop/laya_params.json`):
- A pergunta `implementa_requisito` é **BLOQUEANTE** — se o Laya julgar que o
  código não cumpre o requisito, a fase reprova de verdade. As demais perguntas
  configuradas são avisos (não bloqueiam).
- `excluir_caminhos` lista o que fica fora da evidência enviada ao Laya
  (gerados, lockfiles, migrations etc.) — arquivo gigante distorce o julgamento.
- `--dry-run` mostra o estado sem carregar o modelo; `--stub '{...}'` testa sem modelo.

## 5. Como rodar

```bash
# 1. ambiente (idempotente; Laya + projeto)
python3 loop/scripts/bootstrap.py            # tudo (pode demorar: torch + modelo)
python3 loop/scripts/bootstrap.py --projeto  # só backend/.venv + frontend/node_modules

# 2. sanidade do loop
python loop/scripts/run_loop.py doctor       # agentes, runbook e MCP trello
python loop/scripts/run_loop.py status SPEC-XXXX

# 3. executar uma spec (ordem explícita de execução)
#    no chat do opencode:
/run-loop SPEC-XXXX

# 4. back local
backend/.venv/bin/python -m pytest backend -q

# 5. front local (dentro de frontend/)
npm install
npm test        # script "test" do projeto (vitest)
npm run build   # build de produção
```

Versões de Python/Node e dependências do projeto: ver `AGENTS.md`,
`backend/requirements*.txt` e `frontend/package.json`. O `bootstrap.py --projeto`
resolve `backend/.venv` + `frontend/node_modules` a partir desses manifests.

## 6. Autenticações

### 6.1 Trello (MCP de quadros)

O `opencode.json` injeta no MCP:

| Variável no MCP | Vem de |
|---|---|
| `TRELLO_API_KEY` | `{env:TRELLO_API_KEY}` |
| `TRELLO_TOKEN` | `{env:TRELLO_TOKEN}` |
| `TRELLO_ALLOWED_BOARD_IDS` | `{env:TRELLO_BOARD_ID}` |

Sem essas 3 no ambiente, o MCP aborta na subida (`credentials are required`) e o
opencode mostra o servidor como `failed`. Como obter (valores do projeto com
quem já tem acesso — nunca commite tokens):

1. **API key:** página de Power-Ups do Trello → chave do Power-Up.
2. **Token:** link "Token" na mesma página (autorize o acesso aos boards).
3. **Board ID:** ID do board permitido (ver `AGENTS.md`); dá para descobrir via
   API: `GET /1/members/me/boards?key=...&token=...`.

Persistência (faça as duas):
```bash
mkdir -p ~/.config/trello-mcp && chmod 600 ~/.config/trello-mcp/.env
# conteúdo (TRELLO_BOARD_ID = board permitido do projeto):
TRELLO_API_KEY=<sua key>
TRELLO_TOKEN=<seu token>
TRELLO_BOARD_ID=<board permitido>
TRELLO_ALLOWED_BOARD_IDS=<board permitido>
```
mais `export TRELLO_API_KEY=... TRELLO_TOKEN=... TRELLO_BOARD_ID=...` no shell
**antes** de abrir o opencode. Depois de configurar, **reinicie o opencode** e
confira com `opencode mcp list` → servidor do Trello `connected`.

> Arquivos `.env` estão no `.gitignore`. Se a conexão cair, o primeiro suspeito
> é sempre variável de ambiente ausente — rode o MCP na mão para ver o erro.

No deliver, o runner usa só as tools allowlistadas no seu runbook
(ver `.opencode/agent/runner.md`): busca o card `SPEC-XXXX` no board; se existe,
`update` + `comment`; se não, `create` na lista-alvo.
**Reexecução atualiza, nunca duplica.**

### 6.2 GitHub (`gh`)

- Autentique uma vez: `gh auth login`. Repo do projeto: `https://github.com/Henzo-Hanz/NIT` (ver `AGENTS.md`).
- O runner dá `push` da branch `SPEC-XXXX` e abre o PR com
  `gh pr create --fill --head SPEC-XXXX`. **Nunca merge via CLI,
  nunca `git merge`/`git pull`.**
- Commits citam a spec: `feat(SPEC-XXXX): ...`. Sem `--force` em nada.

### 6.3 Laya (gate 3 — sem MCP)

O Laya **não** usa MCP. O gate 3 roda via script dentro do venv `.loop-env`
(torch CPU + checkpoint configurado em `laya_params.json`, marcador de ambiente
em `loop/.env_ok.json`). Nada a autenticar; só garanta espaço em disco
suficiente na primeira vez (o `bootstrap.py` avisa o mínimo).

## 7. Onde vive cada decisão (não redecidir sem motivo)

| Assunto | Onde está |
|---|---|
| Regras do loop, ordem, limites, rastreabilidade | `AGENTS.md` |
| Stack, banco, repo, board, comandos de ambiente | `AGENTS.md` + manifests (`requirements*.txt`, `package.json`) |
| Contrato e critérios de cada entrega | `loop/specs/SPEC-XXXX.json` (premissas explícitas) |
| Tetos de desempenho | `loop/budgets.json` (recalibrar com números reais dos gates) |
| Julgamento do Laya (perguntas, limiar, bloqueios, exclusões) | `loop/laya_params.json` |
| Runbooks dos agentes (incl. fallback e deliver) | `.opencode/agent/*.md` |

Convenção: divergência necessária durante a implementação vira **premissa
reportada** ao runner, nunca decisão silenciosa.

## 8. Checklist de entrada no projeto

- [ ] `gh auth` ok contra o repo do projeto
- [ ] `TRELLO_API_KEY`/`TRELLO_TOKEN`/`TRELLO_BOARD_ID` exportados + arquivo do MCP
- [ ] `opencode mcp list` → servidor do Trello `connected`
- [ ] `python loop/scripts/bootstrap.py --projeto` ok
- [ ] `python loop/scripts/run_loop.py doctor` → ok
- [ ] leu `AGENTS.md` (regras) e a spec que vai executar
