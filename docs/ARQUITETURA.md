# Arquitetura — NIT

**Decisão: B — Django só-API + React SPA desacoplados.**

O backend Django expõe exclusivamente API REST (`/api/...`, provavelmente via DRF —
a confirmar no estudo do card `[BACK]`). O frontend é um SPA React + Vite,
servido como arquivos estáticos, que consome essa API. O Django **não** renderiza
templates HTML do produto.

## Diagrama

```
browser ──> SPA estático (React + Vite, CDN)
                │  fetch /api/*
                ▼
           Django API (/api/*) ──> Postgres (Supabase no MVP)
```

Temas transversais a resolver nas specs: CORS, autenticação por token
(analisar convivência com o auth do Django e o RLS do Postgres), versionamento
da API.

## Por que B (e não templates Django)

1. **O produto é uma aplicação geoespacial, não um conjunto de páginas.**
   Mapa interativo com camadas, opacidade, legendas, filtros e HUD é estado
   client-side complexo — arroz-com-feijão de SPA, gambiarra em template.
2. **Releases independentes.** Ajuste visual publica estático em segundos sem
   tocar no back; regra de negócio muda sem rebuildar o front.
3. **Ecossistema npm.** MapLibre/Leaflet, libs de componentes, i18n —
   versionados, com tree-shaking e HMR, fora do ciclo do Django.
4. **Contrato explícito.** API documentada permite testar o back sem
   renderizar nada, desenvolver o front com a API mockada e manter os
   **gates separados por camada** que o loop exige.
5. **Escala e custo.** SPA estático em CDN custa quase zero; o Django escala
   só para o que é dinâmico, em vez de servir cada pageview do mapa em Python.

## Descartado: A — Django "fullstack" com templates

Um deploy só e um servidor só parecem simples, mas acoplam os releases,
prendem o front ao pipeline do Django e fundem os gates das duas camadas num
teste só. Válido para CRUD simples ou conteúdo com SEO — não é o caso do NIT,
cujo valor está no mapa interativo (inclusive área autenticada do gestor).

## Consequências

- CI em 2 jobs independentes (`.github/workflows/django-ci.yml` e
  `frontend-ci.yml`).
- Fases back → front do loop andam separadas, cada uma com seus 3 gates.
- Referências de UX: vocabulário GIS da PEDEA-CE + disciplina de
  catálogo/design tokens do PI Digital (ver card `[FRONT]`).
