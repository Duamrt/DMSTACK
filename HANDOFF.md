# Handoff — DM Stack
**Data:** 2026-04-10
**Sessão:** Fundação da hierarquia de agentes — SQL das tabelas + deploy.sh + CLAUDE.md dos 4 projetos

## O que foi feito
- SQL criado: `~/Downloads/dmstack-criar-tabelas.sql` — tabelas `bugs`, `demandas`, `deploys` com RLS (policy `auth_only` para authenticated) — **AINDA NÃO RODADO**
- `deploy.sh` criado e commitado no repo dmstack (commit `416638c`)
- `~/edr-system/CLAUDE.md` reescrito com contexto V2 completo (modal gotcha, sbPost, multitenancy, permissões granulares)
- `~/rpmpro/CLAUDE.md` criado do zero — gotchas críticos, estrutura V2, master admin, sed+emoji Windows
- `~/nalinha/CLAUDE.md` criado do zero — RPCs atômicas, planos, links curtos, gotchas
- `~/naregua/CLAUDE.md` mantido (estava preciso)
- Decisão: pular refinamento no Stitch e codar direto (design já definido na memória)
- Confirmado: app DM Stack (`index.html`) já estava 100% implementado desde sessão anterior

## O que funcionou
- Leitura do index.html confirmou estrutura completa: login, Home, Bugs, Demandas, Deploys, Saúde, Insights IA
- CLAUDE.md por projeto como "Engineering Lead agents" — contexto pronto para qualquer subagente trabalhar em cada projeto

## O que não funcionou / bloqueios
- **SQL das tabelas ainda não rodado** — app está no ar mas todas as telas mostram "Carregando..." sem as tabelas
- Stitch descartado como blocker (decisão consciente)

## Próximos passos (em ordem da hierarquia)
1. **URGENTE:** Rodar `~/Downloads/dmstack-criar-tabelas.sql` no Supabase (`bkfkzauhnlulrtttgcii`) — sem isso o app não funciona
2. **Passo 2:** Slash commands no DM Stack — `/ultraplan`, `/debug`, `/review`, `/deploy`, `/status` como interface dentro do app
3. **Passo 3:** KPI Monitor — dados reais dos 3 Supabase (EDR `mepzoxoahpwcvvlymlfh` + RPM `roeeyypssutzfzzkypsq` + DMS `bkfkzauhnlulrtttgcii`) na tela Saúde
4. **Passo 4:** Filtro "Aguardando: Claude" na Home

## Arquivos modificados
- `~/dmstack/deploy.sh` — criado (git push feito)
- `~/dmstack/HANDOFF.md` — este arquivo
- `~/edr-system/CLAUDE.md` — reescrito com contexto V2
- `~/rpmpro/CLAUDE.md` — criado
- `~/nalinha/CLAUDE.md` — criado
- `~/Downloads/dmstack-criar-tabelas.sql` — SQL das 3 tabelas (ainda não rodado no Supabase)

## Contexto importante
- **SQL PENDENTE:** rodar `dmstack-criar-tabelas.sql` é o primeiro passo da próxima sessão
- **App já funciona:** código completo em `~/dmstack/index.html` (~1350 linhas). Só faltam as tabelas
- **Hierarquia planejada:** Duam (CEO) → Engineering Lead (EDR/RPM/NaRegua/LoadPro) → Product Lead → Analytics Lead → Infrastructure Lead
- **Decisão arquitetural:** bugs/demandas pertencem ao PRODUTO (EDR System, RPM Pro...), nunca ao cliente/tenant
- **Deploy DM Stack:** `deploy.sh` atual só faz `git push` — sem cache busting (diferente dos outros projetos)
- **Supabase DMS:** `bkfkzauhnlulrtttgcii` | tabelas existentes: `dmstack_acoes`, `dmstack_diagnosticos` | Edge Function `diagnostico-diario` funcionando
- **Padrão modal:** `classList.add('open')` / `.remove('open')` — NÃO usar `.active` ou `.hidden`
