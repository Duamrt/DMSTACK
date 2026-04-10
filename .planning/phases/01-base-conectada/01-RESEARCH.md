# Phase 1: Base Conectada — Research

**Pesquisado:** 2026-04-10
**Domínio:** SPA vanilla + Supabase Auth multi-projeto + PWA
**Confiança:** HIGH — baseado em leitura direta do código existente + conhecimento verificado do stack

---

## Resumo

O `index.html` atual já implementa a Phase 1 quase completamente. O código tem: login via Supabase Auth (DMS), token refresh automático, auto-login via localStorage, 5 views navegáveis (Home, Bugs, Demandas, Deploys, Saúde/Insights IA), sidebar colapsável, design system preto/branco Outfit, modais funcionais, CRUD completo para bugs/demandas/deploys, e Service Worker registrado.

O que **falta** para fechar os critérios de sucesso da Phase 1:
1. Conexão com os outros 2 Supabase (EDR e RPM) não existe — só DMS está conectado
2. Confirmação no console de que as 3 conexões funcionam sem erro
3. O `manifest.json` usa apenas SVG no campo `icons` — dispositivos iOS/Android esperam PNG (bloqueio de instalação PWA)
4. O `deploy.sh` atual não faz cache busting (`CACHE_NAME` no sw.js é estático `dmstack-v1`)
5. O sw.js usa `Network-first com fallback` — correto para dashboard, mas o CACHE_NAME precisa ser versionado

**Diretriz principal:** Não reescrever o index.html. Adicionar as 3 conexões Supabase, corrigir o manifest/sw, e fazer console.log de verificação das conexões no init.

---

<phase_requirements>
## Phase Requirements

| ID | Descrição | Suporte da pesquisa |
|----|-----------|---------------------|
| CORE-01 | Login email/senha via Supabase Auth (DMS) | Já implementado — `fazerLogin()`, `refreshToken()`, auto-login no init |
| CORE-02 | 5 abas de navegação funcionais | Já implementado — views: home, bugs, features, deploys, saude, melhorias |
| CORE-03 | Conexão simultânea com 3 Supabase (EDR, RPM, DMS) | Parcialmente — só DMS está conectado. EDR e RPM precisam ser adicionados |
| CORE-04 | Design system preto/branco Outfit | Já implementado — CSS vars completo, Outfit via Google Fonts |
| CORE-05 | PWA instalável (manifest + sw) | Parcialmente — sw.js existe mas sem cache busting; manifest tem apenas SVG |

</phase_requirements>

---

## O que já existe (não tocar)

O código atual é funcional e bem estruturado. Antes de qualquer edição, entender o que NÃO pode ser quebrado:

| Elemento | Local | Estado |
|----------|-------|--------|
| Auth Supabase DMS | `fazerLogin()`, `refreshToken()` | Funcionando — preservar |
| Auto-login | IIFE no final do script | Funcionando — preservar |
| Navegação SPA | `irPara(view)` | Funcionando — preservar |
| CRUD bugs/demandas | `carregarBugs()`, `dmsGet/Post/Patch/Delete` | Funcionando — preservar |
| Design system CSS | `:root` vars, todas as classes | Funcionando — não alterar |
| Modal pattern | `.modal-bg.open` | Padrão deste projeto — `.classList.add('open')` |
| Detail panel | `.detail-bg.open` | Side drawer via right offset |
| Sidebar collapse | `toggleSidebar()` + localStorage | Funcionando |

---

## Stack Padrão

### Core
| Recurso | Versão/Config | Propósito | Motivo |
|---------|--------------|-----------|--------|
| Supabase REST API | v1 | Banco de dados | Chamadas diretas via fetch, sem SDK |
| Supabase Auth API | v1 | Autenticação | `token?grant_type=password` direto |
| HTML/CSS/JS vanilla | ES2020 | SPA completa | Padrão de todos os projetos do Duam |
| Outfit (Google Fonts) | 300-900 | Tipografia | Já importado no head |
| Service Worker | nativo | PWA/cache | Já registrado |

### Não usar
- Nenhum framework JS (React, Vue, Svelte, etc.)
- Nenhuma biblioteca de roteamento
- Fetch polyfill — Node 24 + browsers modernos suportam nativamente
- Supabase JS SDK — o projeto usa REST direto propositalmente

---

## Padrões de Arquitetura

### Padrão de múltiplos Supabase (CORE-03)

O padrão correto para conectar 3 Supabase numa mesma página vanilla:

```javascript
// Cada projeto tem seu próprio par URL+KEY
const EDR_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const EDR_KEY = 'eyJ...'; // anon key EDR
const RPM_URL = 'https://roeeyypssutzfzzkypsq.supabase.co';
const RPM_KEY = 'eyJ...'; // anon key RPM
const DMS_URL = 'https://bkfkzauhnlulrtttgcii.supabase.co';
const DMS_KEY = 'eyJ...'; // anon key DMS (já existe)
```

**Ponto crítico:** Não há conflito de auth entre os 3 porque cada chamada `fetch` usa o apikey do projeto correspondente como Bearer token. O `_token` do DMS (Supabase Auth) é só para o DMS. Para EDR e RPM, usar o `anon_key` diretamente no `Authorization: Bearer` (acesso anônimo, sem auth de usuário).

```javascript
// Helper para EDR (anon, sem auth de usuário)
function edrGet(table, query = '') {
  return fetch(`${EDR_URL}/rest/v1/${table}${query}`, {
    headers: { 'apikey': EDR_KEY, 'Authorization': 'Bearer ' + EDR_KEY }
  }).then(r => r.json()).catch(() => null);
}

// Helper para RPM (anon, sem auth de usuário)
function rpmGet(table, query = '') {
  return fetch(`${RPM_URL}/rest/v1/${table}${query}`, {
    headers: { 'apikey': RPM_KEY, 'Authorization': 'Bearer ' + RPM_KEY }
  }).then(r => r.json()).catch(() => null);
}
```

**CORS:** Supabase libera CORS para qualquer origin por padrão nas chamadas com `apikey`. Não há configuração extra necessária.

**RLS:** O acesso via anon key está sujeito às policies RLS de cada projeto. Se uma tabela tem RLS com policy restritiva, o select retorna `[]` sem erro (comportamento Supabase padrão). Para Phase 1, só precisamos confirmar que a conexão funciona — uma query em qualquer tabela pública serve.

### Verificação de conexão no console (critério 5)

```javascript
async function verificarConexoes() {
  const checks = await Promise.allSettled([
    fetch(`${DMS_URL}/rest/v1/bugs?limit=1`, { headers: { 'apikey': DMS_KEY, 'Authorization': 'Bearer ' + DMS_KEY } }),
    fetch(`${EDR_URL}/rest/v1/companies?limit=1`, { headers: { 'apikey': EDR_KEY, 'Authorization': 'Bearer ' + EDR_KEY } }),
    fetch(`${RPM_URL}/rest/v1/oficinas?limit=1`, { headers: { 'apikey': RPM_KEY, 'Authorization': 'Bearer ' + RPM_KEY } })
  ]);
  const nomes = ['DMS', 'EDR', 'RPM'];
  checks.forEach((r, i) => {
    console.log(`[DM Stack] ${nomes[i]}:`, r.status === 'fulfilled' && r.value.ok ? 'OK ✓' : 'FALHA ✗');
  });
}
```

Chamar `verificarConexoes()` dentro de `iniciarApp()` após o login.

### Padrão SPA vanilla com views (já implementado, documentar para referência)

O padrão já adotado no projeto é o correto:

```javascript
// Navegação: esconde todas, mostra a ativa
function irPara(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
}
```

```css
.view { display: none; }
.view.active { display: block; }
```

Não usar `display:none` inline via JS — usar classes. Esse padrão já é seguido.

### Modal pattern (já implementado — preservar)

```javascript
// Abrir: classList.add('open')
// Fechar: classList.remove('open')
// CSS: .modal-bg { display: none; } .modal-bg.open { display: flex; }
```

---

## PWA — Correções necessárias

### Problema 1: Cache busting manual no sw.js

O sw.js atual tem `const CACHE='dmstack-v1'` hardcoded. O deploy.sh atual não atualiza esse valor.

**Solução:** O deploy.sh deve substituir a versão antes de commitar. Mas no Windows, `sed` tem problemas com emojis (gotcha documentado). Usar Python para a substituição:

```bash
# No deploy.sh, antes do git add:
VER="dmstack-$(date +%m%d%H%M)"
python3 -c "
import re, sys
with open('sw.js','r') as f: c=f.read()
c=re.sub(r\"const CACHE='[^']+'\", f\"const CACHE='{sys.argv[1]}'\", c)
with open('sw.js','w') as f: f.write(c)
" "$VER"
```

### Problema 2: Manifest sem PNG — bloqueio iOS

O `manifest.json` atual tem apenas `icon-192.svg`. iOS não suporta SVG como ícone PWA e não mostra o prompt de instalação. Android suporta, mas de forma inconsistente.

**Solução mínima:** Adicionar `<link rel="apple-touch-icon">` no head do HTML. Para instalação plena, criar um PNG 192x192 e 512x512.

```html
<!-- No <head>, adicionar: -->
<link rel="apple-touch-icon" href="icon-192.png">
```

```json
// manifest.json atualizado:
{
  "icons": [
    { "src": "icon-192.svg", "sizes": "any", "type": "image/svg+xml" },
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Criação dos PNGs:** Gerar via script Node.js a partir do SVG existente (usando `sharp` ou canvas), ou usar o SVG existente e criar PNG simples (fundo preto, texto DM).

### Service Worker — estratégia atual é correta

```javascript
// Estratégia atual: Network-first com fallback para cache
// Supabase sempre vai para rede (nunca cacheado)
// Assets locais: tenta rede, fallback cache
```

Essa estratégia é ideal para um dashboard: dados sempre frescos, assets com fallback offline.

---

## O que NÃO fazer (don't hand-roll)

| Problema | Não construir | Usar em vez disso |
|----------|--------------|-------------------|
| Roteamento SPA | Router customizado | O padrão `irPara(view)` já funciona — não substituir |
| Auth de sessão | Sistema próprio de tokens | O Supabase Auth já retorna access_token + refresh_token — o código já usa |
| State management | Redux/Zustand/qualquer store | Variáveis globais `_bugs`, `_features`, `_deploys` — padrão do projeto |
| Fetch wrapper | Axios/got/qualquer lib | `fetch` nativo — padrão do projeto |
| Ícones PNG | Biblioteca de geração | Script Node.js simples com canvas API |

---

## Armadilhas Comuns

### Armadilha 1: Quebrar o auto-login ao refatorar o init

**O que quebra:** O IIFE no final do script que verifica `dms_token` no localStorage. Se qualquer refatoração mover o código de auth, o auto-login para de funcionar.

**Como evitar:** Preservar a ordem: declaração de variáveis → funções → Service Worker → IIFE de auto-login. A IIFE DEVE ser o último bloco do script.

### Armadilha 2: Usar Bearer token do DMS para queries em EDR/RPM

**O que quebra:** O JWT do Supabase Auth é específico do projeto que o emitiu. Usar o `_token` do DMS em queries do EDR vai retornar 401.

**Como evitar:** Para EDR e RPM, sempre usar o anon_key do respectivo projeto como Bearer token. O DMS `_token` só serve para o DMS.

### Armadilha 3: appendChild/reparent de elementos DOM existentes

**O que quebra:** Duplica elementos ou faz o elemento sumir (gotcha documentado no CLAUDE.md).

**Como evitar:** Sempre usar `innerHTML` para re-render completo ou criar novos elementos. NUNCA mover elementos existentes.

### Armadilha 4: CACHE_NAME não atualizado = usuário vê versão antiga

**O que quebra:** Service Worker cached version antiga após deploy, usuário não vê mudanças.

**Como evitar:** O deploy.sh deve atualizar `CACHE_NAME` automaticamente. Usar Python para substituição (não `sed` — problemas no Windows com emojis/encoding).

### Armadilha 5: manifest.json sem PNG bloqueia instalação iOS

**O que quebra:** iPhone não mostra prompt "Adicionar à tela de início" quando manifest tem apenas SVG.

**Como evitar:** Sempre incluir PNG 192x192 no manifest e `<link rel="apple-touch-icon">` no HTML.

### Armadilha 6: RLS bloqueia silenciosamente

**O que quebra:** Query em tabela com RLS restritiva retorna `[]` sem erro — difícil distinguir de "tabela vazia".

**Como evitar:** No check de conexão, verificar o status HTTP da response (200 = conectado, mesmo que resultado seja `[]`). Verificar com `r.ok` não com `array.length`.

---

## Exemplos de Código

### Verificação das 3 conexões (CORE-03)

```javascript
// Colocar após iniciarApp() ser chamado, dentro do try/catch do init
async function verificarConexoes() {
  const [dms, edr, rpm] = await Promise.allSettled([
    fetch(`${DMS_URL}/rest/v1/bugs?limit=1`, {
      headers: { 'apikey': DMS_KEY, 'Authorization': 'Bearer ' + DMS_KEY }
    }),
    fetch(`${EDR_URL}/rest/v1/companies?limit=1`, {
      headers: { 'apikey': EDR_KEY, 'Authorization': 'Bearer ' + EDR_KEY }
    }),
    fetch(`${RPM_URL}/rest/v1/oficinas?limit=1`, {
      headers: { 'apikey': RPM_KEY, 'Authorization': 'Bearer ' + RPM_KEY }
    })
  ]);
  console.log('[DM Stack] DMS:', dms.status === 'fulfilled' && dms.value.ok ? 'OK ✓' : 'FALHA ✗');
  console.log('[DM Stack] EDR:', edr.status === 'fulfilled' && edr.value.ok ? 'OK ✓' : 'FALHA ✗');
  console.log('[DM Stack] RPM:', rpm.status === 'fulfilled' && rpm.value.ok ? 'OK ✓' : 'FALHA ✗');
}
```

### Deploy.sh com cache busting

```bash
#!/bin/bash
MSG="${1:-deploy}"
cd "$(dirname "$0")"

# Cache busting: atualiza CACHE_NAME no sw.js
VER="dmstack-$(date +%m%d%H%M)"
python3 -c "
import re, sys
with open('sw.js','r',encoding='utf-8') as f: c=f.read()
c=re.sub(r\"const CACHE='[^']+'\", \"const CACHE='\" + sys.argv[1] + \"'\", c)
with open('sw.js','w',encoding='utf-8') as f: f.write(c)
" "$VER"

git add -A
git commit -m "$MSG"
git push origin main
echo "no ar — $VER"
```

### Onde adicionar as constantes EDR/RPM

```javascript
// No topo do script, junto com DMS_URL/DMS_KEY:
const DMS_URL = 'https://bkfkzauhnlulrtttgcii.supabase.co';
const DMS_KEY = '...'; // já existe

const EDR_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const EDR_KEY = '...'; // anon key do projeto EDR

const RPM_URL = 'https://roeeyypssutzfzzkypsq.supabase.co';
const RPM_KEY = '...'; // anon key do projeto RPM
```

---

## Inventário de Estado em Runtime

> Fase de base conectada — não é rename/refactor, mas é relevante documentar o estado atual do Service Worker e localStorage.

| Categoria | Itens encontrados | Ação necessária |
|-----------|-------------------|-----------------|
| Service Worker | Cache `dmstack-v1` registrado — nome fixo nunca muda | Atualizar deploy.sh para versionar automaticamente |
| localStorage | `dms_token`, `dms_refresh`, `dms-sb-collapsed` | Nenhuma — esses keys estão corretos |
| Dados armazenados | Tabelas DMS: bugs, demandas, deploys, dmstack_diagnosticos | Nenhuma — preservar |
| Secrets/keys | DMS_KEY exposto no HTML (anon key — esperado, é público) | Nenhuma — anon key é projetado para ser público |
| Build artifacts | Nenhum — GitHub Pages serve arquivos estáticos | Nenhuma |

---

## Disponibilidade do Ambiente

| Dependência | Requerida por | Disponível | Versão | Fallback |
|-------------|--------------|-----------|--------|----------|
| Node.js | Scripts locais / cache busting | ✓ | v24.14.0 | — |
| Git | deploy.sh | ✓ | 2.53.0 | — |
| Python3 | deploy.sh (cache busting) | Verificar | — | sed (limitado no Windows) |
| GitHub Pages | Hosting | ✓ | — | — |
| Supabase DMS | Auth + dados | ✓ | REST v1 | — |
| Supabase EDR | Leitura métricas | Pendente de key | — | Desabilitar seção saúde |
| Supabase RPM | Leitura métricas | Pendente de key | — | Desabilitar seção saúde |

**Pendências sem fallback:**
- As anon keys de EDR e RPM precisam ser recuperadas dos respectivos projetos antes da implementação do CORE-03

**Como obter as keys:**
- EDR: arquivo `~/edr-system/index.html` ou qualquer JS do projeto — buscar por `supabase.co`
- RPM: arquivo `~/rpmpro/v2/infra.js` ou `kanban-v2.html` — buscar por `supabase.co`

---

## Arquitetura de Validação

> Projeto vanilla, sem framework de testes. Validação manual por checklist.

### Mapa de requisitos → verificação

| ID | Comportamento | Tipo | Como verificar |
|----|--------------|------|----------------|
| CORE-01 | Login funciona com credenciais corretas | manual | Abrir dmstack.com.br, fazer login, confirmar que app aparece |
| CORE-01 | Auto-login persiste após fechar aba | manual | Fechar e reabrir — deve entrar direto |
| CORE-02 | 5 abas clicáveis e ativas | manual | Clicar em cada aba, confirmar que view muda sem erro |
| CORE-03 | 3 conexões OK no console | console | F12 → Console após login — ver "[DM Stack] DMS/EDR/RPM: OK ✓" |
| CORE-04 | Visual preto/branco/Outfit | visual | Inspecionar fonte (Outfit), cores só #000/#fff/rgba(255,255,255,X) |
| CORE-05 | PWA instalável no Android | manual | Chrome → menu → "Adicionar à tela de início" disponível |
| CORE-05 | SW registrado | console | F12 → Application → Service Workers — ver dmstack registrado |

### Gaps para Wave 0

- Nenhum arquivo de teste a criar — validação é manual por checklist
- Não há infraestrutura de testes automatizados no projeto (não é necessária para este stack)

---

## Estado da Arte

| Abordagem antiga | Abordagem atual | Quando mudou | Impacto |
|-----------------|-----------------|--------------|---------|
| Supabase JS SDK | Fetch REST direto | Padrão do Duam desde o início | Menos bundle, mais controle, sem versioning de SDK |
| CSS frameworks | CSS vanilla com vars | Padrão do Duam | Zero dependências externas |
| Múltiplos arquivos JS | Tudo em um index.html | Padrão DM Stack | Simplicidade, sem bundler |

---

## Perguntas Abertas

1. **Anon keys de EDR e RPM**
   - O que sabemos: os projetos existem e têm Supabase
   - O que falta: as anon keys para montar as constantes no DM Stack
   - Recomendação: durante a implementação, ler de `~/edr-system/index.html` e `~/rpmpro/v2/infra.js`

2. **Python3 no Windows do Duam**
   - O que sabemos: Windows 11, Node v24 disponível
   - O que falta: confirmar se `python3` está no PATH (alternativa: usar Node.js para o cache busting)
   - Recomendação: implementar cache busting em Node.js para evitar dependência de Python

3. **Tabelas de EDR e RPM acessíveis via anon key**
   - O que sabemos: RLS existe nos dois projetos
   - O que falta: saber quais tabelas têm policy anon SELECT habilitada
   - Recomendação: para Phase 1, apenas verificar que a conexão HTTP retorna 200 (não importa se dados vêm vazios por RLS)

---

## Fontes

### Primárias (HIGH)
- `C:/Users/Duam Rodrigues/dmstack/index.html` — código completo da app atual
- `C:/Users/Duam Rodrigues/dmstack/sw.js` — Service Worker atual
- `C:/Users/Duam Rodrigues/dmstack/manifest.json` — manifest atual
- `C:/Users/Duam Rodrigues/dmstack/.planning/REQUIREMENTS.md` — requisitos oficiais
- Documentação Supabase REST API (conhecimento verificado) — `{url}/rest/v1/{table}`, `{url}/auth/v1/token`

### Secundárias (MEDIUM)
- Conhecimento de PWA manifest (MDN) — requisito de PNG para iOS verificado por experiência recorrente
- Gotcha `sed` no Windows documentado em MEMORY.md — usar Python ou Node para substituições

---

## Metadados

**Breakdown de confiança:**
- Stack padrão: HIGH — lido diretamente do código existente
- Padrões de arquitetura: HIGH — o código já implementa os padrões, pesquisa valida continuidade
- Armadilhas: HIGH — baseado em gotchas documentados no MEMORY.md e CLAUDE.md
- Keys EDR/RPM: LOW — não verificadas, precisam ser lidas dos projetos na hora da implementação

**Data da pesquisa:** 2026-04-10
**Válido até:** 2026-05-10 (stack estável, Supabase REST v1 sem mudanças previstas)
