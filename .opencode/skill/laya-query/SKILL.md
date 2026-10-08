---
name: laya-query
description: Use ao consultar o MCP do Laya como juiz de decisões (implementado ou não, duplicação, segue o padrão) sobre evidência da codebase que você mesmo levantou antes.
---

# Usando o Laya

## O que o Laya é (e não é)

O Laya é um modelo de decisão rápido: responde perguntas tipadas (`choice`, `score`, `noul`) sobre um texto que **você entrega**, com confiança calibrada. Ele **não conhece a codebase e não busca nada**. Sem evidência no texto enviado, a resposta não vale nada.

Por isso o fluxo é sempre: **levantar evidência -> perguntar ao Laya -> registrar com a confiança**.

## Passo a passo

1. **Levante evidência** com `grep`, `glob` e `read` na codebase: termos da entidade/funcionalidade do pedido (models, services, rotas, componentes). Separe no máximo 5 trechos curtos, cada um com o caminho do arquivo.
2. **Se não achar nada relevante, não consulte o Laya.** Registre `"nada relacionado encontrado (busca: termo1, termo2)"` em `ja_existe_na_codebase`.
3. **Monte o `state`** com o pedido e a evidência, curto e objetivo, por exemplo `{"requisito": "...", "evidencia": "backend/apps/x/models.py: class Pedido... "}`. Mantenha o texto enxuto: o modelo tem limite de entrada.
4. **Pergunte** usando a ferramenta de decisão do MCP `laya` (veja o schema e a descrição da ferramenta antes de chamar). As perguntas padrão e as opções ficam em `loop/laya_params.json`.
5. **Registre** cada resposta como uma linha: `"implementado=parcial (confiança 0.82): backend/apps/x/models.py"`.
6. **Confiança baixa:** se ficar abaixo de `limiar_confianca` em `loop/laya_params.json`, marque a linha como `incerto` e mostre isso ao humano no resumo. Não trate como fato.

## Se o Laya estiver indisponível

- `laya_consultado: false` e `"não verificado"` em `ja_existe_na_codebase`.
- Avise o humano no resumo. Nunca preencha com suposição.
