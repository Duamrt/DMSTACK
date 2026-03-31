// Edge Function: diagnostico-diario
// Cérebro do DM.Stack — analisa dados de todos os SaaS via Claude API
// Roda via pg_cron todo dia às 6h OU manualmente via fetch

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || ""

// Supabase connections
const EDR_URL = "https://mepzoxoahpwcvvlymlfh.supabase.co"
const EDR_KEY = Deno.env.get("EDR_SERVICE_KEY") || ""
const RPM_URL = "https://roeeyypssutzfzzkypsq.supabase.co"
const RPM_KEY = Deno.env.get("RPM_SERVICE_KEY") || ""
const DMS_URL = "https://bkfkzauhnlulrtttgcii.supabase.co"
const DMS_KEY = Deno.env.get("DMS_SERVICE_KEY") || ""

const EDR_CO = "3d040713-320f-4639-8a0e-35f62ef10ba7"
const CARBON_ID = "183424eb-f8f2-4502-875c-881182449143"
const RPM_DEMO = "0164e46c-fa2b-4bfb-99e3-ff17a19e015f"

const hoje = () => new Date().toISOString().split("T")[0]
const mesAtual = () => hoje().substring(0, 7)

async function sbGet(url: string, key: string, table: string, query = "") {
  try {
    const r = await fetch(`${url}/rest/v1/${table}${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    })
    const data = await r.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

async function sbUpsert(url: string, key: string, table: string, data: any) {
  return fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(data),
  })
}

// ═══ COLETAR DADOS RPM PRO (CARBON) ═══
async function coletarRPM() {
  const hj = hoje()
  const ma = mesAtual()

  const [os, cli, vei, prof, ofi] = await Promise.all([
    sbGet(RPM_URL, RPM_KEY, "ordens_servico",
      `?oficina_id=eq.${CARBON_ID}&select=id,numero,status,valor_total,data_entrada,data_entrega,mecanico_id,cliente_id,forma_pagamento,created_at,updated_at&order=data_entrada.desc&limit=500`),
    sbGet(RPM_URL, RPM_KEY, "clientes",
      `?oficina_id=eq.${CARBON_ID}&select=id,nome,whatsapp,created_at&order=created_at.desc`),
    sbGet(RPM_URL, RPM_KEY, "veiculos",
      `?oficina_id=eq.${CARBON_ID}&select=id,cliente_id,created_at`),
    sbGet(RPM_URL, RPM_KEY, "profiles",
      `?oficina_id=eq.${CARBON_ID}&select=id,nome,role,updated_at`),
    sbGet(RPM_URL, RPM_KEY, "oficinas",
      `?id=eq.${CARBON_ID}&select=nome,trial_ate,created_at`),
  ])
  // Pecas pode falhar (tabela pode ter estrutura diferente)
  let pecas: any[] = []
  try { const p = await sbGet(RPM_URL, RPM_KEY, "pecas", `?oficina_id=eq.${CARBON_ID}&select=id,nome,quantidade,updated_at&order=updated_at.desc&limit=50`); if(Array.isArray(p)) pecas = p; } catch {}

  // Calcular métricas
  const osHoje = (os || []).filter((o: any) => o.data_entrada === hj)
  const osMes = (os || []).filter((o: any) => (o.data_entrada || "").startsWith(ma))
  const entregues = (os || []).filter((o: any) => o.status === "entregue")
  const entresMes = osMes.filter((o: any) => o.status === "entregue")
  const abertas = (os || []).filter((o: any) => o.status !== "entregue" && o.status !== "cancelado")
  const semPgto = entregues.filter((o: any) => !o.forma_pagamento)
  const cliComOS = new Set((os || []).map((o: any) => o.cliente_id).filter(Boolean))
  const cliSemOS = (cli || []).filter((c: any) => !cliComOS.has(c.id))
  const cliSemVeiculo = (cli || []).filter((c: any) => !(vei || []).some((v: any) => v.cliente_id === c.id))
  const fatMes = entresMes.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0)
  const ticketMed = entresMes.length ? fatMes / entresMes.length : 0

  // Kanban
  const kanban = {
    aguardando: (os || []).filter((o: any) => o.status === "aguardando").length,
    em_andamento: (os || []).filter((o: any) => o.status === "em_andamento").length,
    entregue: entregues.length,
    cancelado: (os || []).filter((o: any) => o.status === "cancelado").length,
  }

  // Frequência: dias com OS na última semana
  const semanaAtras = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0]
  const osSemana = (os || []).filter((o: any) => (o.data_entrada || "") >= semanaAtras)
  const diasComOS = new Set(osSemana.map((o: any) => o.data_entrada)).size

  // Último acesso (proxy: última OS criada)
  const ultOS = (os || []).length ? os[0] : null
  const diasSemOS = ultOS ? Math.floor((Date.now() - new Date(ultOS.data_entrada).getTime()) / 864e5) : 999

  // Peças com estoque baixo
  const estoqueBaixo = (pecas || []).filter((p: any) => Number(p.quantidade || 0) <= 2 && Number(p.quantidade || 0) >= 0)

  return {
    produto: "rpm",
    cliente: "Carbon Auto Center",
    dados: {
      total_os: (os || []).length,
      os_hoje: osHoje.length,
      os_mes: osMes.length,
      os_abertas: abertas.length,
      valor_abertas: abertas.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0),
      entregues_mes: entresMes.length,
      faturamento_mes: fatMes,
      ticket_medio: ticketMed,
      sem_pagamento: semPgto.length,
      total_clientes: (cli || []).length,
      clientes_sem_os: cliSemOS.length,
      clientes_sem_veiculo: cliSemVeiculo.length,
      clientes_com_whatsapp: (cli || []).filter((c: any) => c.whatsapp).length,
      total_veiculos: (vei || []).length,
      total_mecanicos: (prof || []).filter((p: any) => p.role === "mecanico").length,
      kanban,
      dias_com_os_semana: diasComOS,
      dias_sem_os: diasSemOS,
      estoque_baixo: estoqueBaixo.length,
      itens_estoque_baixo: estoqueBaixo.slice(0, 10).map((p: any) => p.nome),
      trial_ate: (ofi || [])[0]?.trial_ate || null,
      // Fluxos
      os_sem_mecanico: (os || []).filter((o: any) => !o.mecanico_id && o.status !== "cancelado").length,
      os_sem_cliente: (os || []).filter((o: any) => !o.cliente_id).length,
    },
  }
}

// ═══ COLETAR DADOS EDR ═══
async function coletarEDR() {
  const hj = hoje()
  const ma = mesAtual()

  const [obras, lanc, rep, apg, oadd] = await Promise.all([
    sbGet(EDR_URL, EDR_KEY, "obras", `?company_id=eq.${EDR_CO}&arquivada=eq.false&order=nome`),
    sbGet(EDR_URL, EDR_KEY, "lancamentos",
      `?company_id=eq.${EDR_CO}&select=id,obra_id,total,data,etapa,descricao&order=data.desc&limit=3000`),
    sbGet(EDR_URL, EDR_KEY, "repasses_cef",
      `?company_id=eq.${EDR_CO}&order=data_credito.desc`),
    sbGet(EDR_URL, EDR_KEY, "adicional_pagamentos", `?order=data.desc`),
    sbGet(EDR_URL, EDR_KEY, "obra_adicionais", `?company_id=eq.${EDR_CO}`),
  ])

  const lm = (lanc || []).filter((l: any) => (l.data || "").startsWith(ma))
  const tSai = lm.reduce((s: number, l: any) => s + Number(l.total || 0), 0)
  const tMao = lm.filter((l: any) => (l.etapa || "") === "28_mao").reduce((s: number, l: any) => s + Number(l.total || 0), 0)
  const rm = (rep || []).filter((r: any) => (r.data_credito || "").startsWith(ma))
  const tRep = rm.reduce((s: number, r: any) => s + Number(r.valor || 0), 0)
  const pm = (apg || []).filter((p: any) => (p.data || "").startsWith(ma))
  const tPg = pm.reduce((s: number, p: any) => s + Number(p.valor || 0), 0)
  const tEnt = tRep + tPg

  // Por obra
  const obrasResumo = (obras || []).map((o: any) => {
    const lo = (lanc || []).filter((l: any) => l.obra_id === o.id)
    const gt = lo.reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    const gm = lo.filter((l: any) => (l.data || "").startsWith(ma)).reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    const maoObra = lo.filter((l: any) => (l.etapa || "") === "28_mao").reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    const ta = (oadd || []).filter((a: any) => a.obra_id === o.id).reduce((s: number, a: any) => s + Number(a.valor || 0), 0)
    const rc = Number(o.valor_venda || 0) + ta
    const pct = rc > 0 ? (gt / rc * 100) : 0
    return { nome: o.nome, gasto_total: gt, gasto_mes: gm, mao_obra: maoObra, receita: rc, pct_consumido: Math.round(pct) }
  })

  // Lançamentos sem código catálogo
  const semCod = lm.filter((l: any) => l.descricao && !/^00/.test(l.descricao)).length

  // Último lançamento
  const ultLanc = (lanc || []).length ? lanc[0].data : null
  const diasSemLanc = ultLanc ? Math.floor((Date.now() - new Date(ultLanc).getTime()) / 864e5) : 999

  // Inventário (dia do mês)
  const diaHoje = new Date().getDate()
  const ultimoDiaMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const faltamDias = ultimoDiaMes - diaHoje

  return {
    produto: "edr",
    cliente: null,
    dados: {
      obras_ativas: (obras || []).length,
      total_entrada_mes: tEnt,
      total_saida_mes: tSai,
      saldo_mes: tEnt - tSai,
      mao_obra_mes: tMao,
      pct_mao_obra: tSai > 0 ? Math.round(tMao / tSai * 100) : 0,
      repasses_mes: tRep,
      pagamentos_mes: tPg,
      lanc_sem_codigo: semCod,
      dias_sem_lancamento: diasSemLanc,
      faltam_dias_inventario: faltamDias,
      obras: obrasResumo,
    },
  }
}

// ═══ CHAMAR CLAUDE API ═══
async function analisarComClaude(dados: any) {
  const prompt = `Voce e o cerebro do DM.Stack, o command center do Duam. Analise os dados operacionais de hoje e gere um diagnostico estruturado.

DADOS COLETADOS HOJE (${hoje()}):

${JSON.stringify(dados, null, 2)}

GERE UM JSON com esta estrutura exata (sem markdown, so JSON puro):
{
  "resumo": "1-2 frases resumindo o dia — direto, sem enrolacao",
  "problemas": ["lista de problemas encontrados — fluxos quebrados, dados faltando, alertas"],
  "acertos": ["o que ta funcionando bem — padroes positivos"],
  "fluxos_quebrados": ["fluxos incompletos detectados — ex: cliente sem veiculo, OS sem mecanico, pagamento faltando"],
  "modulos_uso": {"modulo": "status — ativo/parado/nunca_usado com contexto"},
  "recomendacoes": ["acoes concretas pro Duam tomar — curtas, diretas, acionaveis"]
}

REGRAS:
- Linguagem direta, sem formalidade, como se fosse um socio falando
- Foque em DINHEIRO: quanto ta parado, quanto ta perdendo, quanto pode ganhar
- Se RPM: analise frequencia de uso (dias_com_os_semana), se o cliente ta usando de verdade ou abandonou
- Se EDR: analise saude financeira das obras, alerte se mao de obra ta alta, se orcamento ta estourando
- Se final do mes (faltam_dias_inventario <= 3): PRIORIZE alerta de inventario
- Nao invente dados que nao estao no JSON
- Maximo 5 itens por lista`

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  const resp = await r.json()
  const text = resp?.content?.[0]?.text || "{}"

  try {
    // Limpar possível markdown wrapper
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    return JSON.parse(clean)
  } catch {
    return { resumo: text, problemas: [], acertos: [], fluxos_quebrados: [], modulos_uso: {}, recomendacoes: [] }
  }
}

// ═══ SALVAR DIAGNOSTICO ═══
async function salvarDiagnostico(produto: string, cliente: string | null, analise: any) {
  await sbUpsert(DMS_URL, DMS_KEY, "dmstack_diagnosticos", {
    data: hoje(),
    produto,
    cliente: cliente || "",
    resumo: analise.resumo || "",
    problemas: analise.problemas || [],
    acertos: analise.acertos || [],
    fluxos_quebrados: analise.fluxos_quebrados || [],
    modulos_uso: analise.modulos_uso || {},
    recomendacoes: analise.recomendacoes || [],
    raw_analysis: JSON.stringify(analise),
  })
}

// ═══ HANDLER ═══
serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    // Parametro opcional: ?produto=rpm ou ?produto=edr (default: todos)
    const url = new URL(req.url)
    const filtro = url.searchParams.get("produto")

    const resultados: string[] = []

    // RPM Pro — Carbon
    if (!filtro || filtro === "rpm") {
      const rpmData = await coletarRPM()
      const analiseRPM = await analisarComClaude(rpmData)
      await salvarDiagnostico("rpm", "Carbon Auto Center", analiseRPM)
      resultados.push("RPM Pro (Carbon): OK")
    }

    // EDR System
    if (!filtro || filtro === "edr") {
      const edrData = await coletarEDR()
      const analiseEDR = await analisarComClaude(edrData)
      await salvarDiagnostico("edr", null, analiseEDR)
      resultados.push("EDR System: OK")
    }

    return new Response(JSON.stringify({ ok: true, resultados, data: hoje() }), {
      headers: { ...cors, "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, erro: e.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
})
