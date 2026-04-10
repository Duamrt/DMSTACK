# Handoff — DM Stack
**Data:** 2026-04-10
**Sessão:** Fase 4 (Diagnóstico IA) concluída + Kanban implementado em Bugs/Demandas com design monochrome precisando de cores

## O que foi feito
- **Fase 4 IA:** `callEdge('agente-diario')` corrigido para `callEdge('diagnostico-diario')` — função já existia deployada
- **`diagnostico-diario` fixes:** secret `DMS_SERVICE_KEY` trocado por `SUPABASE_SERVICE_ROLE_KEY` (o antigo não funcionava); adicionado log de erro no save; check constraint `produto` expandida para incluir `dmstack`
- **Filtro DM Stack:** botão `DM Stack` adicionado nos filtros de Bugs e Demandas
- **Função analisa DMSTACK:** `sistemas = ["EDR", "RPM", "NAREGUA", "LOADPRO", "DMSTACK"]` na edge function
- **Fases no banco:** 6 fases do roadmap inseridas como demandas `sistema=DMSTACK` (1-4 concluídas, 5-6 backlog)
- **Toggle Lista/Kanban:** implementado em Bugs e Demandas — `setBugView()` / `setFeatView()`, estado `_bugKanban` / `_featKanban`
- **Kanban render:** `renderKanban()` com colunas configuráveis, cards com borda esquerda por status (classes `st-{status}`)
- **"→ Demanda" em Insights:** `virarDemanda(idx)` + array global `_insightRecs` pré-preenchido
- **Fix `app-briefing` null:** guard adicionado em `carregarBriefing()`

## O que funcionou
- Stitch gerou design de referência do Kanban (projeto `4458879260444914113`)
- Deploy `diagnostico-diario` via `npx supabase functions deploy` (sem Docker)
- Inserção das fases via SQL no Supabase DMS

## O que não funcionou / bloqueios
- `verify_jwt` reseta pra `true` a cada redeploy — Duam precisa desabilitar manualmente após cada deploy
- Service worker causou cache stale várias vezes
- Design monochrome atual do Kanban dificulta leitura rápida — **PRINCIPAL PENDÊNCIA**

## Próximos passos
1. **URGENTE — Cores no Kanban:** classes `st-{status}` e `col-{status}` já existem no CSS, só mudar as cores:
   - Aberto: azul `rgba(59,130,246,0.6)` borda esquerda
   - Em andamento: branco `rgba(255,255,255,0.7)`
   - Bloqueado: âmbar `rgba(251,191,36,0.7)`
   - Resolvido/Concluído: verde `rgba(34,197,94,0.4)` + card opacidade 0.45
   - Considerar fundo sutil na coluna bloqueado
2. **Fase 5:** Alertas Unificados — feed cronológico de eventos críticos dos 4 SaaS
3. **pg_cron:** agendar `diagnostico-diario` às 7h todo dia no Supabase DMS

## Arquivos modificados
- `~/dmstack/index.html` — toggle kanban, renderKanban(), virarDemanda(), CSS kanban, fix app-briefing, filtro DMSTACK
- `~/dmstack/supabase/functions/diagnostico-diario/index.ts` — SUPABASE_SERVICE_ROLE_KEY, log erro save, DMSTACK em sistemas[]

## Contexto importante
- **Deploy:** sempre `./deploy.sh "mensagem"` — nunca push manual
- **Após deploy de edge function:** SEMPRE desabilitar JWT no dashboard (reseta a cada deploy)
- **Supabase DMS project ref:** `bkfkzauhnlulrtttgcii`
- **Kanban CSS classes:** `st-{status}` nos cards, `col-{status}` nos headers — só mudar CSS pra mudar cores
- **_insightRecs:** array global populado em `carregarMelhorias()` — índice usado em `virarDemanda(i)`
- **Demandas DM Stack no banco:** 6 registros inseridos com `sistema='DMSTACK'`, fases 1-4 `status='concluido'`, 5-6 `status='backlog'`
- **Deploy atual:** `dmstack-04101012`
