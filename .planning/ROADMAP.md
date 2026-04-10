# Roadmap: DM Stack — CTO OS Pessoal

## Overview

O DM Stack passa de uma página de briefing básica para um painel de comando completo que elimina a auditoria manual dos 4 SaaS. Hoje Duam clica em cada sistema, anota no bloco de notas, traz pro Claude organizar, manda pro Gemini formatar, volta pro Claude executar — 4 etapas manuais que o DM Stack vai eliminar. O roadmap entrega isso em 6 fases: base conectada → visibilidade de saúde → gestão de bugs e features → diagnóstico automático por IA → alertas unificados → painel de agentes.

## Phases

- [ ] **Phase 1: Base Conectada** - Fundação técnica: conexão com os 3 Supabase, autenticação, design system e estrutura das 5 telas
- [ ] **Phase 2: Saúde dos SaaS** - Status verde/amarelo/vermelho em tempo real para cada sistema monitorado
- [ ] **Phase 3: Bugs e Features** - Lista centralizada de bugs e rastreamento de features por projeto (substitui o bloco de notas)
- [ ] **Phase 4: Diagnóstico IA** - Edge function existente integrada à tela Melhorias com sugestões automáticas por projeto
- [ ] **Phase 5: Alertas Unificados** - Feed em tempo real de tudo que quebrou ou está em risco em qualquer sistema
- [ ] **Phase 6: Painel de Agentes** - Controle e visibilidade da hierarquia de agentes IA (Context Manager, Risk Assessment, Engineering Leads, etc.)

## Phase Details

### Phase 1: Base Conectada
**Goal**: O DM Stack carrega, autentica Duam, exibe o layout das 5 telas e está conectado aos 3 Supabase (EDR, RPM Pro, DMS)
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05
**Success Criteria** (what must be TRUE):
  1. Duam abre o DM Stack e vê a tela de login com identidade visual preto/branco/Outfit
  2. Após login, o painel exibe as 5 abas de navegação (Saúde, Bugs, Features, Melhorias, Alertas) funcionais
  3. O painel lê dados do Supabase DMS (dmstack) sem erro de CORS ou auth
  4. O PWA pode ser instalado no celular (manifest.json + sw.js funcionando)
  5. A conexão com os 3 Supabase (mepzoxoahpwcvvlymlfh, roeeyypssutzfzzkypsq, bkfkzauhnlulrtttgcii) é confirmada no console sem erro
**Plans:** 2 plans
Plans:
- [ ] 01-01-PLAN.md — Reestruturar sidebar (5 abas finais) + conectar 3 Supabase
- [ ] 01-02-PLAN.md — PWA: icones PNG, manifest, apple-touch-icon, cache busting
**UI hint**: yes

### Phase 2: Saúde dos SaaS
**Goal**: Duam vê de relance o status de cada SaaS — verde se tudo ok, amarelo se há algo degradado, vermelho se algo quebrou — sem precisar abrir cada sistema
**Depends on**: Phase 1
**Requirements**: SAUDE-01, SAUDE-02, SAUDE-03, SAUDE-04
**Success Criteria** (what must be TRUE):
  1. A tela Saúde exibe um card por SaaS (EDR, RPM Pro, NaRegua, LoadPro) com indicador de status colorido
  2. O status é derivado de métricas reais: contagem de erros recentes, integridade das tabelas críticas, última atividade registrada
  3. Clicar em um card expande os detalhes do SaaS (últimas métricas, timestamp da última checagem)
  4. O status atualiza automaticamente a cada visita à tela (sem precisar recarregar a página)
**Plans**: TBD
**UI hint**: yes

### Phase 3: Bugs e Features
**Goal**: Duam registra bugs e features diretamente no DM Stack, vê a lista organizada por projeto e prioridade, e elimina o bloco de notas manual
**Depends on**: Phase 1
**Requirements**: BUGS-01, BUGS-02, BUGS-03, FEAT-01, FEAT-02, FEAT-03
**Success Criteria** (what must be TRUE):
  1. Duam abre a tela Bugs, clica em "Novo Bug", preenche projeto/título/prioridade e o bug aparece na lista imediatamente
  2. A lista de bugs pode ser filtrada por projeto (EDR, RPM Pro, NaRegua, LoadPro) e por prioridade (crítico, médio, baixo)
  3. Duam pode marcar um bug como resolvido e ele some da lista ativa (vai para histórico)
  4. A tela Features mostra o que está em desenvolvimento por projeto, com status (em dev, pausado, concluído) e onde parou (campo de observação livre)
  5. Duam pode atualizar o status de uma feature sem precisar abrir o projeto
**Plans**: TBD
**UI hint**: yes

### Phase 4: Diagnóstico IA
**Goal**: A edge function `diagnostico-diario` já existente é integrada à tela Melhorias, que exibe sugestões automáticas geradas pelo Claude Haiku por projeto
**Depends on**: Phase 2, Phase 3
**Requirements**: DIAG-01, DIAG-02, DIAG-03
**Success Criteria** (what must be TRUE):
  1. A tela Melhorias exibe as sugestões geradas pelo diagnóstico mais recente, agrupadas por projeto
  2. Duam pode acionar um novo diagnóstico manualmente via botão "Rodar diagnóstico agora"
  3. Cada sugestão pode ser convertida em um bug ou feature com um clique (pré-popula o formulário da tela correspondente)
  4. O diagnóstico automático diário continua funcionando via pg_cron sem alteração
**Plans**: TBD
**UI hint**: yes

### Phase 5: Alertas Unificados
**Goal**: Duam tem um feed cronológico único de tudo que quebrou, degradou ou está em risco em qualquer dos 4 sistemas, sem precisar abrir cada um
**Depends on**: Phase 2, Phase 4
**Requirements**: ALERT-01, ALERT-02, ALERT-03
**Success Criteria** (what must be TRUE):
  1. A tela Alertas exibe um feed com todos os eventos críticos dos 4 SaaS em ordem cronológica (mais recente primeiro)
  2. Cada alerta mostra: sistema de origem, descrição do evento, timestamp e nível de severidade
  3. Duam pode marcar um alerta como "visto" e ele vai para o final da lista (sem deletar — preserva histórico)
  4. Alertas críticos (vermelho) são contabilizados no badge da aba de navegação para visibilidade imediata
**Plans**: TBD
**UI hint**: yes

### Phase 6: Painel de Agentes
**Goal**: Duam visualiza e controla a hierarquia de agentes IA — transversais, Engineering Lead, Product Lead, Analytics Lead, Infrastructure Lead — diretamente do DM Stack
**Depends on**: Phase 5
**Requirements**: AGENT-01, AGENT-02, AGENT-03
**Success Criteria** (what must be TRUE):
  1. O painel exibe a hierarquia completa de agentes organizada por camada (transversais → leads → agentes por projeto)
  2. Cada agente mostra seu status (ativo, inativo, em execução) e a última ação registrada
  3. Duam pode iniciar um agente ou consultar seu log de atividades sem sair do DM Stack
  4. A hierarquia reflete os 193 agentes catalogados sem travar a UI (lista virtualizada ou paginada)
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Base Conectada | 0/2 | Planning | - |
| 2. Saúde dos SaaS | 0/? | Not started | - |
| 3. Bugs e Features | 0/? | Not started | - |
| 4. Diagnóstico IA | 0/? | Not started | - |
| 5. Alertas Unificados | 0/? | Not started | - |
| 6. Painel de Agentes | 0/? | Not started | - |
