---
name: spec-writing
description: Use ao escrever ou revisar uma spec SPEC-XXXX.json a partir de um prompt humano, incluindo o schema, o formato dos critérios de aceitação e quando dividir um pedido grande.
---

# Escrevendo specs

## Schema (todos os campos são obrigatórios)

```json
{
  "id": "SPEC-0001",
  "prompt_original": "texto exato do pedido humano",
  "objetivo": "uma frase",
  "escopo": { "back": ["..."], "front": ["..."] },
  "fora_de_escopo": ["..."],
  "criterios_aceitacao": [
    { "id": "CA-1", "camada": "back", "descricao": "Dado X, quando Y, então Z" }
  ],
  "contrato_api_rascunho": [
    { "metodo": "POST", "rota": "/api/...", "request": {}, "response": {}, "erros": [] }
  ],
  "ja_existe_na_codebase": ["..."],
  "laya_consultado": true,
  "premissas": ["..."],
  "perguntas_abertas": [],
  "dependencias": { "front_depende_de_back": true },
  "perguntas_iteracao": [
    { "id": "PI-1", "camada": "back", "pergunta": "The menu only exposes what the API offers?", "esperado": true }
  ],
  "status": "aguardando_aprovacao"
}
```

Os campos `aprovada_em`, `aprovada_por` e `hash_aprovacao` são preenchidos só na aprovação (`/approve` ou `spec.py approve`). Nunca escreva neles. `aprovada_por` usa o usuário do SO, salvo `--por NOME` para outro revisor; ela entra no hash, então adulterar o aprovador invalida a spec.

## Perguntas de iteração (opcional)

- `perguntas_iteracao`: checklist definido na iteração (usabilidade, cobertura de UI, redundância, responsividade — ex.: "esse botão é redundante?", "algum endpoint exposto que o menu não mostra?"). Formato: `{ "id": "PI-1", "camada": "back", "pergunta": "...", "esperado": true }` (`bloqueante` e `severidade` opcionais).
- É escrito no refino, aprovado junto com a spec e julgado pelo gate 3 (Laya) ao lado das perguntas globais. Entra no hash como o resto.
- IDs sequenciais por spec: `PI-1`, `PI-2`...

## Critérios de aceitação

- Formato: **Dado** (estado inicial), **quando** (ação), **então** (resultado observável).
- Cada critério deve ser testável por um teste automatizado. Se não dá para testar, reescreva até dar.
- `camada` é `back` ou `front`. Toda camada presente no `escopo` precisa de pelo menos um critério.
- Inclua pelo menos um caso de erro ou borda (entrada inválida, permissão negada, registro inexistente).
- IDs sequenciais por spec: `CA-1`, `CA-2`... Eles viram o nome dos testes (`test_CA_1_...`).

## Contrato da API (rascunho)

- Só quando houver back e front no escopo. Liste método, rota (começa com `/`), corpo de request, corpo de response e erros esperados.
- É um rascunho: depois da fase back será substituído pelo `openapi.json` real.

## Premissas x perguntas abertas

- **Premissa**: algo que você assumiu e que o humano pode derrubar na aprovação. Escreva de forma que dê para discordar ("assumi que o usuário precisa estar autenticado").
- **Pergunta aberta**: algo que você não consegue decidir. Deve ser resolvida antes da aprovação.

## Quando dividir

Divida em várias specs quando o pedido tiver funcionalidades que podem ser entregues e testadas de forma independente, ou quando houver mais de ~8 critérios de aceitação. Proponha a divisão ao humano antes de escrever.
