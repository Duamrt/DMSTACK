// Edge Function: get-dashboard-data
// Proxy seguro — coleta dados do EDR e RPM, calcula tudo no servidor
// Frontend recebe JSON pronto, zero chave exposta

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Chaves ficam nas env vars do Supabase (secrets), NUNCA no código
const EDR_URL = "https://mepzoxoahpwcvvlymlfh.supabase.co"
const EDR_KEY = Deno.env.get("EDR_SERVICE_KEY") || ""
const RPM_URL = "https://roeeyypssutzfzzkypsq.supabase.co"
const RPM_KEY = Deno.env.get("RPM_SERVICE_KEY") || ""
const DMS_URL = "https://bkfkzauhnlulrtttgcii.supabase.co"
const DMS_KEY = Deno.env.get("DMS_SERVICE_KEY") || ""

const EDR_CO = "3d040713-320f-4639-8a0e-35f62ef10ba7"
const CARBON_ID = "183424eb-f8f2-4502-875c-881182449143"

const hoje = () => new Date().toISOString().split("T")[0]
const mesAtual = () => hoje().substring(0, 7)
const dt = (v: string) => v ? (v.length > 10 ? v.substring(0, 10) : v) : ""

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

async function sbGet(url: string, key: string, table: string, query = "") {
  try {
    const r = await fetch(`${url}/rest/v1/${table}${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    })
    const data = await r.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

// ══════════════════════════════════════
// VALIDAR TOKEN DO USUARIO
// ══════════════════════════════════════
async function validarUsuario(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return false
  try {
    const r = await fetch(`${DMS_URL}/auth/v1/user`, {
      headers: { apikey: DMS_KEY, Authorization: authHeader },
    })
    return r.ok
  } catch { return false }
}

// ══════════════════════════════════════
// COLETA EDR (SERVIDOR)
// ══════════════════════════════════════
async function coletarEDR() {
  const ma = mesAtual()

  const [obras, lanc, rep, apg, oadd] = await Promise.all([
    sbGet(EDR_URL, EDR_KEY, "obras", `?company_id=eq.${EDR_CO}&arquivada=eq.false&order=nome`),
    sbGet(EDR_URL, EDR_KEY, "lancamentos", `?company_id=eq.${EDR_CO}&select=id,obra_id,total,data,etapa,descricao&order=data.desc&limit=3000`),
    sbGet(EDR_URL, EDR_KEY, "repasses_cef", `?company_id=eq.${EDR_CO}&order=data_credito.desc`),
    sbGet(EDR_URL, EDR_KEY, "adicional_pagamentos", "?order=data.desc"),
    sbGet(EDR_URL, EDR_KEY, "obra_adicionais", `?company_id=eq.${EDR_CO}`),
  ])

  const idsAtivas = new Set(obras.map((o: any) => o.id))
  const lancAtivas = lanc.filter((l: any) => !l.obra_id || idsAtivas.has(l.obra_id))
  const lm = lancAtivas.filter((l: any) => (l.data || "").startsWith(ma))
  const tSai = lm.reduce((s: number, l: any) => s + Number(l.total || 0), 0)
  const tMao = lm.filter((l: any) => (l.etapa || "") === "28_mao").reduce((s: number, l: any) => s + Number(l.total || 0), 0)
  const rm = rep.filter((r: any) => (r.data_credito || "").startsWith(ma))
  const tRep = rm.reduce((s: number, r: any) => s + Number(r.valor || 0), 0)
  const pm = apg.filter((p: any) => (p.data || "").startsWith(ma))
  const tPg = pm.reduce((s: number, p: any) => s + Number(p.valor || 0), 0)
  const tEnt = tRep + tPg

  const obrasResumo = obras.map((o: any) => {
    const lo = lancAtivas.filter((l: any) => l.obra_id === o.id)
    const gt = lo.reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    const gm = lo.filter((l: any) => (l.data || "").startsWith(ma)).reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    const maoMes = lo.filter((l: any) => (l.data || "").startsWith(ma) && (l.etapa || "") === "28_mao").reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    const ta = oadd.filter((a: any) => a.obra_id === o.id).reduce((s: number, a: any) => s + Number(a.valor || 0), 0)
    const rc = Number(o.valor_venda || 0) + ta
    const pct = rc > 0 ? Math.round(gt / rc * 100) : 0
    const repsObra = rep.filter((r: any) => r.obra_id === o.id)
    const entradasObra = repsObra.reduce((s: number, r: any) => s + Number(r.valor || 0), 0)
    const addIds = new Set(oadd.filter((a: any) => a.obra_id === o.id).map((a: any) => a.id))
    const addReceb = apg.filter((p: any) => addIds.has(p.adicional_id)).reduce((s: number, p: any) => s + Number(p.valor || 0), 0)
    const totalEntradas = entradasObra + addReceb
    const nomeUp = (o.nome || "").toUpperCase()
    const isInterno = nomeUp.includes("ESCRITORIO") || nomeUp.includes("EDR -")
    return { nome: o.nome, gasto_total: gt, gasto_mes: gm, mao_mes: maoMes, receita: rc, pct, entradas: totalEntradas, saldo: totalEntradas - gt, isInterno }
  })

  const custosInternos = obrasResumo.filter((o: any) => o.isInterno)
  const obrasIniciadas = obrasResumo.filter((o: any) => !o.isInterno && (o.gasto_total > 5000 || o.entradas > 0))
  const obrasNaoIniciadas = obrasResumo.filter((o: any) => !o.isInterno && o.gasto_total <= 5000 && o.entradas === 0)

  const semCod = lm.filter((l: any) => l.descricao && !/^00/.test(l.descricao)).length
  const ultLanc = lancAtivas.length ? lancAtivas[0].data : null
  const diasSemLanc = ultLanc ? Math.floor((Date.now() - new Date(ultLanc).getTime()) / 864e5) : 999

  return {
    obras_ativas: obras.length, total_entrada: tEnt, total_saida: tSai, saldo: tEnt - tSai,
    mao_obra: tMao, pct_mao: tSai > 0 ? Math.round(tMao / tSai * 100) : 0,
    lanc_sem_codigo: semCod, dias_sem_lanc: diasSemLanc,
    obras: obrasIniciadas, nao_iniciadas: obrasNaoIniciadas, internos: custosInternos,
  }
}

// ══════════════════════════════════════
// COLETA RPM PRO (SERVIDOR)
// ══════════════════════════════════════
async function coletarRPM() {
  const hj = hoje(), ma = mesAtual()

  const [os, cli, vei, prof, ofi, pecas] = await Promise.all([
    sbGet(RPM_URL, RPM_KEY, "ordens_servico", `?oficina_id=eq.${CARBON_ID}&select=id,numero,status,valor_total,data_entrada,data_entrega,mecanico_id,cliente_id,forma_pagamento,created_at&order=created_at.desc&limit=500`),
    sbGet(RPM_URL, RPM_KEY, "clientes", `?oficina_id=eq.${CARBON_ID}&select=id,nome,whatsapp,created_at`),
    sbGet(RPM_URL, RPM_KEY, "veiculos", `?oficina_id=eq.${CARBON_ID}&select=id,cliente_id`),
    sbGet(RPM_URL, RPM_KEY, "profiles", `?oficina_id=eq.${CARBON_ID}&select=id,nome,role`),
    sbGet(RPM_URL, RPM_KEY, "oficinas", `?id=eq.${CARBON_ID}&select=nome,trial_ate`),
    sbGet(RPM_URL, RPM_KEY, "pecas", `?oficina_id=eq.${CARBON_ID}&select=id,nome,quantidade,custo,preco_venda,created_at`),
  ])

  const FINAL = ["entregue"]
  const CANCELADO = ["cancelada", "cancelado"]
  const ABERTAS = os.filter((o: any) => !FINAL.includes(o.status) && !CANCELADO.includes(o.status))

  const osHoje = os.filter((o: any) => dt(o.data_entrada) === hj)
  const osMes = os.filter((o: any) => dt(o.data_entrada).startsWith(ma))
  const entregues = os.filter((o: any) => FINAL.includes(o.status))
  const entresMes = osMes.filter((o: any) => FINAL.includes(o.status))
  const canceladas = os.filter((o: any) => CANCELADO.includes(o.status))
  const fatMes = entresMes.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0)
  const ticketMed = entresMes.length ? fatMes / entresMes.length : 0

  // Frequência: dias com OS na última semana
  const sem7 = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0]
  const diasComOS = new Set(os.filter((o: any) => dt(o.data_entrada) >= sem7).map((o: any) => dt(o.data_entrada))).size

  // Kanban
  const kanban: Record<string, number> = {}
  const statusLabels: Record<string, string> = {
    entrada: "Entrada", diagnostico: "Diagnostico", orcamento: "Orcamento",
    aprovada: "Aprovada", aguardando_peca: "Ag. Peca", execucao: "Execucao",
    pronto: "Pronto", entregue: "Entregue", cancelada: "Cancelada", cancelado: "Cancelado",
  }
  os.forEach((o: any) => { kanban[o.status] = (kanban[o.status] || 0) + 1 })

  // Fluxos travados
  const semMecanico = ABERTAS.filter((o: any) => !o.mecanico_id)
  const entregSemPgto = entregues.filter((o: any) => !o.forma_pagamento)
  const pecaSemCusto = pecas.filter((p: any) => !p.custo || Number(p.custo) === 0)

  // Dinheiro perdido
  const valorCanceladas = canceladas.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0)
  const valorSemPgto = entregSemPgto.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0)
  const pecasVendidaSemCusto = pecas.filter((p: any) => Number(p.preco_venda || 0) > 0 && (!p.custo || Number(p.custo) === 0))

  // Módulos
  const modulos = [
    { nome: "Ordens de Servico", qtd: os.length, usado: os.length > 0 },
    { nome: "Clientes", qtd: cli.length, usado: cli.length > 0 },
    { nome: "Veiculos", qtd: vei.length, usado: vei.length > 0 },
    { nome: "Pecas/Estoque", qtd: pecas.length, usado: pecas.length > 0 },
    { nome: "Financeiro (Caixa)", qtd: 0, usado: false },
  ]

  // OS recentes
  const osRecentes = os.slice(0, 15).map((o: any) => ({
    numero: o.numero, status: o.status, valor: Number(o.valor_total || 0), data: dt(o.data_entrada),
  }))

  // Mecânicos
  const porMec: Record<string, number> = {}
  entregues.forEach((o: any) => { if (o.mecanico_id) porMec[o.mecanico_id] = (porMec[o.mecanico_id] || 0) + 1 })
  const mecanicos = Object.entries(porMec)
    .map(([id, q]) => ({ nome: prof.find((p: any) => p.id === id)?.nome || "—", qtd: q }))
    .sort((a: any, b: any) => b.qtd - a.qtd)

  return {
    nome: ofi[0]?.nome || "Carbon Auto Center",
    trial_ate: ofi[0]?.trial_ate || null,
    total_os: os.length, os_hoje: osHoje.length, os_mes: osMes.length,
    os_abertas: ABERTAS.length, valor_abertas: ABERTAS.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0),
    entregues_mes: entresMes.length, faturamento_mes: fatMes, ticket_medio: ticketMed,
    total_clientes: cli.length, total_veiculos: vei.length, total_pecas: pecas.length,
    dias_com_os: diasComOS, kanban, statusLabels,
    sem_mecanico: semMecanico.length,
    entregue_sem_pgto: entregSemPgto.length, valor_sem_pgto: valorSemPgto,
    peca_sem_custo: pecaSemCusto.length,
    canceladas: canceladas.length, valor_canceladas: valorCanceladas,
    peca_vendida_sem_custo: pecasVendidaSemCusto.length,
    modulos, osRecentes, mecanicos,
  }
}

// ══════════════════════════════════════
// HANDLER
// ══════════════════════════════════════
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  // Validar que o usuário está logado no DMS
  const autorizado = await validarUsuario(req)
  if (!autorizado) {
    return new Response(JSON.stringify({ error: "Nao autorizado" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  try {
    // Coleta paralela — EDR e RPM ao mesmo tempo
    const [edr, rpm] = await Promise.all([coletarEDR(), coletarRPM()])

    return new Response(JSON.stringify({ ok: true, edr, rpm, ts: new Date().toISOString() }), {
      headers: { ...cors, "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    })
  }
})
