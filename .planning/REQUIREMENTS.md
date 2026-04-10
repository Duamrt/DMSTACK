# Requirements: DM Stack — CTO OS Pessoal

## v1 Requirements

### CORE — Fundação Técnica

| ID | Requisito |
|----|-----------|
| CORE-01 | Duam faz login com email/senha via Supabase Auth (projeto DMS) |
| CORE-02 | O painel exibe navegação entre 5 telas: Saúde, Bugs, Features, Melhorias, Alertas |
| CORE-03 | O front-end conecta-se a 3 Supabase simultaneamente: EDR, RPM Pro e DMS |
| CORE-04 | Design system preto/branco puro com tipografia Outfit, sem cores |
| CORE-05 | PWA instalável (manifest.json + sw.js com cache busting via deploy.sh) |

### SAUDE — Status dos SaaS

| ID | Requisito |
|----|-----------|
| SAUDE-01 | Card por SaaS (EDR, RPM Pro, NaRegua, LoadPro) com indicador verde/amarelo/vermelho |
| SAUDE-02 | Status derivado de métricas reais consultadas nos Supabase correspondentes |
| SAUDE-03 | Expansão do card com detalhes: últimas métricas e timestamp da última checagem |
| SAUDE-04 | Status atualiza automaticamente a cada visita à tela |

### BUGS — Gestão de Bugs

| ID | Requisito |
|----|-----------|
| BUGS-01 | Formulário para registrar novo bug: projeto, título, categoria, prioridade |
| BUGS-02 | Lista de bugs filtrável por projeto e prioridade |
| BUGS-03 | Ação de marcar bug como resolvido (move para histórico) |

### FEAT — Rastreamento de Features

| ID | Requisito |
|----|-----------|
| FEAT-01 | Registro de feature com: projeto, título, status (em dev / pausado / concluído) e observação livre |
| FEAT-02 | Lista de features por projeto com status visível |
| FEAT-03 | Atualização de status e observação diretamente na lista |

### DIAG — Diagnóstico IA

| ID | Requisito |
|----|-----------|
| DIAG-01 | Tela Melhorias exibe sugestões do diagnóstico mais recente agrupadas por projeto |
| DIAG-02 | Botão para acionar diagnóstico manual (chama edge function `diagnostico-diario`) |
| DIAG-03 | Sugestão pode ser convertida em bug ou feature com um clique |

### ALERT — Alertas Unificados

| ID | Requisito |
|----|-----------|
| ALERT-01 | Feed cronológico de eventos críticos dos 4 SaaS (mais recente primeiro) |
| ALERT-02 | Cada alerta mostra: sistema, descrição, timestamp e nível de severidade |
| ALERT-03 | Ação "marcar como visto" que rebaixa o alerta na lista sem deletar |

### AGENT — Painel de Agentes

| ID | Requisito |
|----|-----------|
| AGENT-01 | Visualização hierárquica dos agentes IA por camada (transversais, leads, por projeto) |
| AGENT-02 | Status e última ação de cada agente |
| AGENT-03 | Ação para iniciar agente ou consultar log de atividades |

## Traceability

| Requisito | Fase | Status |
|-----------|------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| CORE-05 | Phase 1 | Pending |
| SAUDE-01 | Phase 2 | Pending |
| SAUDE-02 | Phase 2 | Pending |
| SAUDE-03 | Phase 2 | Pending |
| SAUDE-04 | Phase 2 | Pending |
| BUGS-01 | Phase 3 | Pending |
| BUGS-02 | Phase 3 | Pending |
| BUGS-03 | Phase 3 | Pending |
| FEAT-01 | Phase 3 | Pending |
| FEAT-02 | Phase 3 | Pending |
| FEAT-03 | Phase 3 | Pending |
| DIAG-01 | Phase 4 | Pending |
| DIAG-02 | Phase 4 | Pending |
| DIAG-03 | Phase 4 | Pending |
| ALERT-01 | Phase 5 | Pending |
| ALERT-02 | Phase 5 | Pending |
| ALERT-03 | Phase 5 | Pending |
| AGENT-01 | Phase 6 | Pending |
| AGENT-02 | Phase 6 | Pending |
| AGENT-03 | Phase 6 | Pending |
