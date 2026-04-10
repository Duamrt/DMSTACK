---
phase: 01-base-conectada
plan: 01
subsystem: ui
tags: [supabase, vanilla-js, sidebar, navigation, multi-tenant]

# Dependency graph
requires: []
provides:
  - Sidebar reestruturada com 5 abas finais (Saude, Bugs, Features, Melhorias, Alertas)
  - Constantes EDR_URL/EDR_KEY e RPM_URL/RPM_KEY conectadas
  - Helpers edrGet() e rpmGet() para acesso anonimo aos Supabase externos
  - verificarConexoes() logando status dos 3 Supabase no console apos login
affects: [02-metricas-vivas, 03-diagnostico-ia, 05-alertas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "edrGet/rpmGet usam anon key como Bearer — nunca o _token do DMS"
    - "verificarConexoes usa Promise.allSettled + response.ok (nao array.length)"

key-files:
  created: []
  modified:
    - index.html

key-decisions:
  - "Sidebar com 5 abas fixas — Home e Deploys removidos da nav (funcoes JS mantidas para futuro)"
  - "Saude como view padrao apos login (era Home)"
  - "EDR e RPM acessados via anon key publica — sem service_role necessario para leitura basica"

patterns-established:
  - "edrGet(tabela, query): fetch anonimo no Supabase EDR"
  - "rpmGet(tabela, query): fetch anonimo no Supabase RPM"
  - "verificarConexoes(): diagnostico de conectividade chamado em iniciarApp()"

requirements-completed: [CORE-01, CORE-02, CORE-03, CORE-04]

# Metrics
duration: 15min
completed: 2026-04-10
---

# Phase 01 Plan 01: Base Conectada Summary

**Sidebar reestruturada para 5 abas (Saude como default) e 3 Supabase conectados com verificacao automatica no console apos login**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-10T12:00:00Z
- **Completed:** 2026-04-10T12:15:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Sidebar agora tem exatamente Saude, Bugs, Features, Melhorias, Alertas — nessa ordem
- View Saude e a padrao apos login (view-home e view-deploys removidas)
- 3 Supabase (DMS, EDR, RPM) conectados com helpers de leitura e verificacao no console
- verificarConexoes() chamada automaticamente apos cada login bem-sucedido

## Task Commits

1. **Task 1: Reestruturar sidebar e views (CORE-02)** - `ce5b0a2` (feat)
2. **Task 2: Conectar 3 Supabase com verificacao no console (CORE-03)** - `a9123ec` (feat)

## Files Created/Modified

- `index.html` - Sidebar reestruturada, views Home/Deploys removidas, Alertas placeholder adicionado, constantes EDR/RPM, helpers edrGet/rpmGet, verificarConexoes()

## Decisions Made

- Funcoes carregarDeploys() e carregarDadosDash() mantidas no JS (removidas apenas das chamadas ativas) — podem ser uteis em fases futuras
- EDR e RPM usam anon key como Bearer token — acesso anonimo suficiente para leitura de dados publicos por RLS

## Deviations from Plan

None - plano executado exatamente como especificado.

## Issues Encountered

None.

## User Setup Required

None - sem configuracao externa necessaria.

## Next Phase Readiness

- Sidebar e navegacao prontas para receber dados reais nas proximas fases
- edrGet() e rpmGet() disponiveis para buscar metricas no plan 01-02
- Blocker pendente de verificacao: checar se EDR/RPM expoe metricas de saude via anon key (pode exigir service_role para tabelas especificas)

---
*Phase: 01-base-conectada*
*Completed: 2026-04-10*
