// Edge Function: diagnostico-diario
// Analisa saude dos PRODUTOS (EDR System, RPM Pro, etc) — nao de clientes especificos
// Roda via pg_cron todo dia às 6h OU manualmente via fetch

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || ""

// DM Stack Supabase (bugs, demandas, deploys)
const DMS_URL = "https://bkfkzauhnlulrtttgcii.supabase.co"
const DMS_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("DMS_SERVICE_KEY") || ""

// EDR System Supabase (contagem de tenants)
const EDR_URL = "https://mepzoxoahpwcvvlymlfh.supabase.co"
const EDR_KEY = Deno.env.get("EDR_SERVICE_KEY") || ""

// RPM Pro Supabase (contagem de oficinas)
const RPM_URL = "https://roeeyypssutzfzzkypsq.supabase.co"
const RPM_KEY = Deno.env.get("RPM_SERVICE_KEY") || ""

const hoje = () => new Date().toISOString().split("T")[0]

async function sbGet(url: string, key: string, table: string, query = "") {
  try {
    const r = await fetch(`${url}/rest/v1/${table}${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    })
    const data = await r.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

// ═══ COLETAR DADOS DOS PRODUTOS ═══
async function coletarDadosProdutos() {
  const [bugs, demandas, deploys, companies, oficinas] = await Promise.all([
    sbGet(DMS_URL, DMS_KEY, "bugs", "?order=created_at.desc&select=*"),
    sbGet(DMS_URL, DMS_KEY, "demandas", "?order=created_at.desc&select=*"),
    sbGet(DMS_URL, DMS_KEY, "deploys", "?order=created_at.desc&limit=20&select=*"),
    sbGet(EDR_URL, EDR_KEY, "companies", "?select=id,name,plan,created_at"),
    sbGet(RPM_URL, RPM_KEY, "oficinas", "?select=id,nome,trial_ate,created_at"),
  ])

  const sistemas = ["EDR", "RPM", "NAREGUA", "LOADPRO", "DMSTACK"]
  const statusAtivoBug = (b: any) => b.status !== "resolvido" && b.status !== "descartado"
  const statusAtivaFeat = (f: any) => f.status !== "concluido" && f.status !== "descartado"

  // Bugs por sistema e severidade
  const bugsAbertos = (bugs || []).filter(statusAtivoBug)
  const criticos = bugsAbertos.filter((b: any) => b.severidade === "critico")
  const aguardandoDuam = bugsAbertos.filter((b: any) => b.aguardando === "duam")

  const bugsPorSistema: any = {}
  sistemas.forEach(s => {
    const bs = bugsAbertos.filter((b: any) => b.sistema === s)
    bugsPorSistema[s] = {
      total: bs.length,
      criticos: bs.filter((b: any) => b.severidade === "critico").length,
      aguardando_duam: bs.filter((b: any) => b.aguardando === "duam").length,
      mais_antigo_dias: bs.length
        ? Math.floor((Date.now() - new Date(bs[bs.length - 1].created_at).getTime()) / 864e5)
        : 0,
    }
  })

  // Demandas por sistema
  const demandasAtivas = (demandas || []).filter(statusAtivaFeat)
  const demPorSistema: any = {}
  sistemas.forEach(s => {
    const ds = demandasAtivas.filter((f: any) => f.sistema === s)
    demPorSistema[s] = {
      total: ds.length,
      em_andamento: ds.filter((f: any) => f.status === "em_andamento").length,
      aguardando_duam: ds.filter((f: any) => f.aguardando === "duam").length,
    }
  })

  // Deploys recentes (ultimos 7 dias)
  const set7 = new Date(Date.now() - 7 * 864e5).toISOString()
  const deploysRecentes = (deploys || [])
    .filter((d: any) => d.created_at >= set7)
    .map((d: any) => ({ sistema: d.sistema, versao: d.versao, data: d.created_at?.split("T")[0] }))

  // Tenants
  const tenantsEDR = (companies || []).length
  const oficinasRPM = (oficinas || []).length
  const rpmTrial = (oficinas || []).filter((o: any) => {
    if (!o.trial_ate) return false
    return new Date(o.trial_ate) >= new Date()
  }).length

  return {
    data: hoje(),
    bugs: {
      total_abertos: bugsAbertos.length,
      criticos: criticos.length,
      aguardando_duam: aguardandoDuam.length,
      por_sistema: bugsPorSistema,
      criticos_lista: criticos.slice(0, 5).map((b: any) => ({
        titulo: b.titulo, sistema: b.sistema, dias: Math.floor((Date.now() - new Date(b.created_at).getTime()) / 864e5)
      })),
    },
    demandas: {
      total_ativas: demandasAtivas.length,
      em_andamento: demandasAtivas.filter((f: any) => f.status === "em_andamento").length,
      backlog: demandasAtivas.filter((f: any) => f.status === "backlog").length,
      por_sistema: demPorSistema,
    },
    deploys: {
      ultimos_7_dias: deploysRecentes.length,
      lista: deploysRecentes.slice(0, 5),
    },
    tenants: {
      edr_system: tenantsEDR,
      rpm_pro: oficinasRPM,
      rpm_trial: rpmTrial,
    },
  }
}

// ═══ BUSCAR HISTÓRICO + CALCULAR SCORE ═══
async function buscarHistoricoEScore(dadosHoje: any) {
  // Últimos 7 diagnósticos (excluindo hoje)
  const historico = await sbGet(
    DMS_URL, DMS_KEY, "dmstack_diagnosticos",
    `?produto=eq.dmstack&data=neq.${hoje()}&order=data.desc&limit=7&select=data,resumo,problemas,acertos,recomendacoes`
  )

  // Score de execução semanal (0–100)
  // Componentes:
  // 1. Saúde de bugs (40pts): menos críticos abertos = melhor
  // 2. Cadência de deploy (30pts): cada deploy nos últimos 7 dias vale 10pts
  // 3. Entregas de demanda (30pts): cada demanda concluída na semana vale 15pts
  const criticos = dadosHoje.bugs.criticos
  const deploys7d = dadosHoje.deploys.ultimos_7_dias

  // Buscar demandas concluídas nos últimos 7 dias
  const set7 = new Date(Date.now() - 7 * 864e5).toISOString()
  const demConcluidas = await sbGet(
    DMS_URL, DMS_KEY, "demandas",
    `?status=eq.concluido&updated_at=gte.${set7}&select=id`
  )
  const demConcluidasN = (demConcluidas || []).length

  const ptsBugs   = Math.max(0, 40 - criticos * 8)
  const ptsDeploy = Math.min(30, deploys7d * 10)
  const ptsDem    = Math.min(30, demConcluidasN * 15)
  const score     = Math.round(ptsBugs + ptsDeploy + ptsDem)

  // Resumo compacto do histórico para o prompt
  const historicoResumido = (historico || []).map((d: any) => ({
    data: d.data,
    resumo: d.resumo || "",
    problemas: (d.problemas || []).slice(0, 3),
    acertos: (d.acertos || []).slice(0, 2),
    recomendacoes: (d.recomendacoes || []).slice(0, 3),
  }))

  return { historico: historicoResumido, score, componentes: { ptsBugs, ptsDeploy, ptsDem } }
}

// ═══ CHAMAR CLAUDE API ═══
async function analisarComClaude(dados: any, historico: any[], score: number) {
  const historicoTxt = historico.length
    ? `\nHISTÓRICO DOS ÚLTIMOS ${historico.length} DIAGNÓSTICOS:\n${JSON.stringify(historico, null, 2)}\n\nSCORE DE EXECUÇÃO SEMANAL ATUAL: ${score}/100\n`
    : ""

  const prompt = `Voce e o agente de produto do Duam — ele tem 2 SaaS no ar: EDR System (gestao de obras) e RPM Pro (gestao de oficinas mecanicas).

O DM.Stack e o painel de gestao dos PRODUTOS, nao dos clientes. Quando um cliente reporta bug, o bug pertence ao produto, nao ao cliente.
${historicoTxt}
DADOS DO PRODUTO HOJE (${dados.data}):
${JSON.stringify(dados, null, 2)}

GERE UM JSON com esta estrutura exata (sem markdown, so JSON puro):
{
  "briefing": "2-4 frases como socio falando com o Duam de manha. Se tiver historico, mencione tendencia: melhorou, piorou ou estagnado vs dias anteriores. Ex: 'Duam, score de execucao caiu de 60 para 45 — 3 bugs criticos parados ha mais de 5 dias sem deploy. Ontem o RPM estava ok mas hoje apareceu mais um bug bloqueado.' Use numeros reais.",
  "resumo": "1 frase do estado geral",
  "problemas": ["max 5 — priorize o que nao mudou entre os diagnosticos (bugs parados, demandas sem progresso)"],
  "acertos": ["max 3 — mencione se algo que estava como problema anterior foi resolvido"],
  "recomendacoes": ["max 5 acoes concretas para hoje baseadas no historico — evite repetir recomendacoes identicas de dias anteriores se nao foram seguidas"],
  "score_execucao": ${score},
  "score_label": "${score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Regular" : "Critico"}"
}

REGRAS:
- Fale do PRODUTO, nao do cliente. Nao mencione EDR Engenharia ou Carbon — eles sao clientes.
- Bug critico parado ha mais de 2 dias e urgente.
- Se nao tem deploy ha mais de 7 dias num sistema que tem bugs abertos, e sinal de atraso.
- Demanda aguardando_duam = precisa de decisao do Duam.
- Se o mesmo problema aparece em multiplos diagnosticos historicos sem resolucao, ele e critico.
- Portugues brasileiro sem acento (pra evitar encoding)`

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  const resp = await r.json()
  const text = resp?.content?.[0]?.text || "{}"

  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    return JSON.parse(clean)
  } catch {
    return { resumo: text, problemas: [], acertos: [], recomendacoes: [], score_execucao: score, score_label: "Regular" }
  }
}

// ═══ SALVAR DIAGNOSTICO ═══
async function salvarDiagnostico(analise: any, dadosBrutos: any) {
  await fetch(`${DMS_URL}/rest/v1/dmstack_diagnosticos?data=eq.${hoje()}&produto=eq.dmstack`, {
    method: "DELETE",
    headers: { apikey: DMS_KEY, Authorization: `Bearer ${DMS_KEY}` },
  })
  const saveResp = await fetch(`${DMS_URL}/rest/v1/dmstack_diagnosticos`, {
    method: "POST",
    headers: {
      apikey: DMS_KEY,
      Authorization: `Bearer ${DMS_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      data: hoje(),
      produto: "dmstack",
      cliente: "",
      resumo: analise.resumo || "",
      problemas: analise.problemas || [],
      acertos: analise.acertos || [],
      fluxos_quebrados: [],
      modulos_uso: { score_execucao: analise.score_execucao ?? null, score_label: analise.score_label ?? null },
      recomendacoes: analise.recomendacoes || [],
      briefing: analise.briefing || "",
      raw_analysis: JSON.stringify({ analise, dados: dadosBrutos }),
    }),
  })
  if (!saveResp.ok) {
    const errBody = await saveResp.text()
    throw new Error(`Falha ao salvar: ${saveResp.status} ${errBody}`)
  }
}

// ═══ HANDLER ═══
serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const dados = await coletarDadosProdutos()
    const { historico, score } = await buscarHistoricoEScore(dados)
    const analise = await analisarComClaude(dados, historico, score)
    await salvarDiagnostico(analise, dados)

    return new Response(JSON.stringify({ ok: true, data: hoje() }), {
      headers: { ...cors, "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, erro: e.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
})
