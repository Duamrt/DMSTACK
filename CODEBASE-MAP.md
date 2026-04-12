# DM Stack — Mapa do Codebase

**Data da análise:** 2026-04-12
**Versão atual:** `dmstack-04120525`
**URL produção:** `dmstack.com.br`

---

## Visão Geral

DM Stack é o "CTO OS pessoal" do Duam — um painel de comando que monitora e gerencia o portfólio de SaaS (EDR System + RPM Pro + NaRegua + LoadPro) em uma única interface. É uma SPA (Single Page Application) sem framework, com toda a lógica em `index.html`.

---

## Stack Técnico

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML + CSS + JavaScript vanilla (sem framework) |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Edge Functions | Deno / TypeScript |
| IA | Anthropic API (claude-haiku-4-5 para diagnóstico e chat, claude-sonnet-4-6 para triagem) |
| Notificações | Telegram Bot API |
| Deploy | GitHub Pages (branch `main`) via `./deploy.sh` |
| PWA | Service Worker (`sw.js`) com cache busting automático |
| Font | Google Fonts — Outfit |

---

## Estrutura de Arquivos

```
dmstack/
├── index.html          # App completo — CSS + HTML + JS (~2000 linhas)
├── sw.js               # Service Worker — cache busting por versão
├── manifest.json       # PWA manifest
├── deploy.sh           # Script de deploy + cache busting + registro automático
├── CNAME               # dmstack.com.br
├── icon-192.svg/png    # Ícones PWA
├── icon-512.png
├── supabase/
│   └── functions/
│       ├── get-dashboard-data/index.ts   # Proxy seguro EDR + RPM
│       ├── diagnostico-diario/index.ts   # Análise IA diária com histórico
│       ├── agente-chat/index.ts          # Chat com dados reais dos negócios
│       ├── triagem-ia/index.ts           # Classifica texto em bugs/demandas
│       └── notificar-telegram/index.ts   # Envia alertas via Telegram
└── .planning/
    ├── REQUIREMENTS.md
    ├── ROADMAP.md
    ├── STATE.md
    └── phases/01-base-conectada/
```

---

## Arquitetura do Frontend (`index.html`)

### Padrão
SPA monolítica. Todo o CSS, HTML e JS está em um único arquivo. Sem bundler, sem imports — tudo global.

### Views (seções da sidebar)
Cada view é um `<div id="view-X" class="view">`. A navegação troca a classe `active`:

| View ID | Função |
|---------|--------|
| `view-saude` | Dashboard de saúde — métricas EDR + RPM |
| `view-bugs` | Lista/Kanban de bugs com filtros e SLA |
| `view-features` | Lista de demandas/features |
| `view-sprint` | Itens em andamento |
| `view-roadmap` | Visão de roadmap |
| `view-diario` | Diário de sessões de trabalho |
| `view-melhorias` | Insights IA — diagnóstico diário |
| `view-alertas` | Feed de alertas críticos |
| `view-agentes` | Catálogo de agentes IA com histórico de uso |
| `view-deploys` | Registro de deploys por sistema |

### Estado Global (variáveis JS)
```js
let _token = null;           // JWT Supabase do usuário logado
let _bugs = [];              // Cache de bugs carregados
let _features = [];          // Cache de demandas
let _deploys = [];           // Cache de deploys
let _saudeData = {};         // Dados de saúde dos sistemas
let _editId = null;          // ID do item sendo editado
let _editTipo = null;        // 'bug' | 'demanda'
let _fBugSistema = '';       // Filtro ativo de sistema (bugs)
let _fBugStatus = '';        // Filtro ativo de status (bugs)
const _vistos = new Set();   // Alertas já vistos (localStorage)
```

### Helpers de acesso ao Supabase
```js
dmsGet(tabela, query)        // GET no banco DMS
dmsPost(tabela, body)        // POST com return=representation
dmsPatch(tabela, query, body) // PATCH, retorna row[0]
dmsDelete(tabela, query)     // DELETE
callEdge(fn, body)           // POST em Edge Function + log automático em edge_logs
edrGet(tabela, query)        // GET direto no Supabase do EDR (anon key)
rpmGet(tabela, query)        // GET direto no Supabase do RPM (anon key)
```

---

## Banco de Dados (Supabase DMS — `bkfkzauhnlulrtttgcii`)

### Tabelas principais

| Tabela | Conteúdo |
|--------|----------|
| `bugs` | Bugs dos sistemas. Campos: `titulo`, `sistema`, `severidade`, `status`, `aguardando`, `descricao`, `created_at` |
| `demandas` | Features/melhorias. Campos: `titulo`, `sistema`, `prioridade`, `status`, `aguardando`, `descricao` |
| `deploys` | Registro de deploys. Campos: `sistema`, `versao`, `mensagem`, `status`, `created_at` |
| `agentes` | Catálogo de agentes IA. Campos: `nome`, `camada`, `descricao`, `status` |
| `dmstack_diagnosticos` | Diagnósticos diários salvos pela Edge Function. Campos: `data`, `produto`, `resumo`, `problemas`, `acertos`, `recomendacoes`, `briefing`, `score_execucao`, `raw_analysis` |
| `edge_logs` | Log automático de chamadas a Edge Functions. Campos: `funcao`, `status`, `duracao_ms` |
| `diario_sessoes` | Sessões de trabalho registradas pelo Duam. Campos: `nota`, `tag`, `created_at` |

### Valores de enums usados no código

**sistemas:** `EDR`, `RPM`, `NAREGUA`, `LOADPRO`, `DMSTACK`

**severidade (bugs):** `critico`, `alto`, `medio`, `baixo`

**status (bugs):** `aberto`, `em_andamento`, `bloqueado`, `resolvido`, `descartado`

**status (demandas):** `backlog`, `em_andamento`, `concluido`, `descartado`

**status (deploys):** `ok`, `bug`, `revertido`

---

## Edge Functions

### `get-dashboard-data`
- **Gatilho:** Chamada manual do frontend (view Saúde)
- **O que faz:** Coleta dados em paralelo do EDR e RPM usando service keys (nunca expostas no frontend). Valida JWT do usuário no DMS antes de responder.
- **Retorna:** JSON com `{ edr: {...}, rpm: {...}, ts }` — métricas financeiras EDR, kanban RPM, fluxos travados
- **Env vars:** `EDR_SERVICE_KEY`, `RPM_SERVICE_KEY`, `DMS_SERVICE_KEY`

### `diagnostico-diario`
- **Gatilho:** pg_cron diário às 6h (produção) ou chamada manual
- **O que faz:** Coleta bugs/demandas/deploys do DMS + tenants do EDR e RPM, busca últimos 7 diagnósticos, calcula score de execução (0–100), chama Claude Haiku para gerar briefing/análise, salva em `dmstack_diagnosticos`
- **Score:** `bugs_criticos × (-8) + deploys_7d × 10 + demandas_concluidas_7d × 15`, máx 100
- **Modelo:** `claude-haiku-4-5-20251001`
- **Env vars:** `ANTHROPIC_API_KEY`, `EDR_SERVICE_KEY`, `RPM_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### `agente-chat`
- **Gatilho:** Mensagem do usuário na view Agentes ou chat flutuante
- **O que faz:** Valida JWT, coleta contexto completo do EDR (obras, lançamentos, diárias, contas, estoque, NFs, projeções, cronograma) e RPM (OS, clientes, peças, mecânicos) dinamicamente, monta system prompt com dados reais, chama Claude Haiku
- **Modelo:** `claude-haiku-4-5-20251001`, `max_tokens: 512`
- **Env vars:** `ANTHROPIC_API_KEY`, `EDR_SERVICE_KEY`, `RPM_SERVICE_KEY`, `DMS_SERVICE_KEY`

### `triagem-ia`
- **Gatilho:** Botão "Importar análise" na view Bugs
- **O que faz:** Recebe texto livre + sistema opcional, chama Claude Sonnet para classificar em array de `{ tipo, sistema, titulo, prioridade, descricao }`, retorna para revisão do usuário antes de importar
- **Modelo:** `claude-sonnet-4-6`, `max_tokens: 4096`
- **Env vars:** `ANTHROPIC_API_KEY`

### `notificar-telegram`
- **Gatilho:** Eventos automáticos (bugs críticos, deploys) ou chamada manual
- **O que faz:** Proxy seguro para Telegram Bot API. Token e chat_id ficam nas env vars do servidor, não no frontend
- **Env vars:** `TG_TOKEN`, `TG_CHAT`

---

## Fluxos de Dados Principais

### 1. Login
```
fazerLogin()
  → Supabase Auth (DMS) POST /auth/v1/token
  → JWT salvo em _token
  → carregarTudo() paralelo (bugs, features, deploys, agentes)
  → renderizarBannerSessao()
  → irPara('saude')
```

### 2. View Saúde
```
carregarSaude()
  → callEdge('get-dashboard-data')
      → valida JWT no DMS
      → coleta EDR + RPM em paralelo (service key server-side)
      → retorna métricas consolidadas
  → renderSaude(data)
  → renderProximas3Acoes()
  → atualizarBadgeAlertas()
```

### 3. Diagnóstico Diário (Insights IA)
```
callEdge('diagnostico-diario') [pg_cron 6h ou manual]
  → coletarDadosProdutos() — DMS bugs/demandas/deploys + tenants
  → buscarHistoricoEScore() — últimos 7 diagnósticos + calcular score
  → analisarComClaude(dados, historico, score) — Claude Haiku
  → salvarDiagnostico() → tabela dmstack_diagnosticos
```

### 4. Triagem IA
```
processarTriagem()
  → callEdge('triagem-ia', { texto, sistema })
      → Claude Sonnet classifica em bugs/demandas
  → renderTriagemResultado(itens)
  → usuario seleciona
  → confirmarTriagem()
      → dmsPost('bugs') ou dmsPost('demandas') para cada selecionado
```

### 5. Alertas
```
gerarAlertas()  [derivado de _bugs + _deploys + _saudeData]
  → bugs críticos ativos
  → bugs bloqueados
  → deploys com status 'bug'
  → sistemas offline (_saudeData.status === 'off')
  → SLA violado (critico=24h, alto/médio=72h, baixo=168h)
  → filtro _vistos (localStorage 'dms-alertas-vistos')
  → atualizarBadgeAlertas() — badge na sidebar
```

### 6. Deploy
```
./deploy.sh "mensagem"
  → cache busting: atualiza CACHE_NAME no sw.js e _DMS_VER no index.html
  → git add -A && git commit && git push origin main
  → dms-resolve.sh (fecha demanda no DM Stack por keyword)
  → POST /rest/v1/deploys (registra no banco)
```

---

## Credenciais e Segurança

### Frontend (anon keys — expostas, somente leitura pública)
- `DMS_KEY` — Supabase DMS anon key (hardcoded em `index.html` linha ~1285)
- `EDR_KEY` — Supabase EDR anon key (hardcoded em `index.html`)
- `RPM_KEY` — Supabase RPM anon key (hardcoded em `index.html`)

### Edge Functions (service keys — nunca no frontend)
- `EDR_SERVICE_KEY` — acesso admin ao EDR
- `RPM_SERVICE_KEY` — acesso admin ao RPM
- `DMS_SERVICE_KEY` — acesso admin ao DMS
- `ANTHROPIC_API_KEY` — Anthropic
- `TG_TOKEN` / `TG_CHAT` — Telegram

### Autenticação de usuário
Supabase Auth no projeto DMS. As Edge Functions `get-dashboard-data` e `agente-chat` validam o JWT via `GET /auth/v1/user` antes de responder.

---

## Command Palette (Ctrl+K)

3 modos:
1. **Criação rápida** — prefixo `/bug` ou `/demanda` → parser `_cmdParseCreate` detecta sistema e severidade por tokens no texto
2. **Filtro de comandos** — prefixo `/` → lista ações disponíveis
3. **Busca global** — texto livre ≥2 chars → busca inline em bugs/demandas/deploys via índice `_cmdSearchResults`

**Gotcha:** resultados usam índice numérico em atributo `onmousedown`, nunca `JSON.stringify` (quebra atributos HTML).

---

## PWA

- `manifest.json` — display standalone, ícones SVG/PNG
- `sw.js` — cache network-first, bypass para requests `supabase.co`
- Cache name atualizado a cada deploy via `deploy.sh` → invalida cache automático

---

## Sistemas Monitorados

| Sistema | Supabase URL | Tenant/Filtro |
|---------|-------------|---------------|
| EDR System | `mepzoxoahpwcvvlymlfh.supabase.co` | `company_id = 3d040713-...` (EDR Engenharia) |
| RPM Pro | `roeeyypssutzfzzkypsq.supabase.co` | `oficina_id = 183424eb-...` (Carbon Auto Center) |
| DM Stack | `bkfkzauhnlulrtttgcii.supabase.co` | — (próprio) |

---

## Padrões de Código

- **Nenhum framework** — vanilla JS com funções globais chamadas via `onclick`
- **Modals:** `classList.add('open')` / `classList.remove('open')` na `.modal-bg`
- **Detail panel:** slide-in direita, `right: -480px` → `right: 0` via `.open`
- **Renderização:** innerHTML direto. Helper `esc(s)` para sanitizar texto do usuário
- **Async:** Promise + await em todo acesso ao Supabase
- **Erros:** `.catch(() => [])` nos fetches — falha silenciosa, array vazio como fallback
- **Formatação monetária:** `fmtK(v)` → `R$ 1.5k` ou `R$ 850`

---

*Mapa gerado em 2026-04-12*
