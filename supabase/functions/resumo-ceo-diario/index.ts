// Edge Function: resumo-ceo-diario
// Mensagem executiva CEO pro Duam todo dia 19h Recife (22h UTC)
// Foco: MRR, clientes ativos, alertas críticos — zero detalhe operacional
// Separado do resumo-uso-diario (7h) que é granular

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TG_TOKEN = Deno.env.get("TG_TOKEN") || ""
const TG_CHAT  = Deno.env.get("TG_CHAT")  || ""

const EDR_URL = "https://mepzoxoahpwcvvlymlfh.supabase.co"
const EDR_KEY = Deno.env.get("EDR_SERVICE_KEY") || ""

const RPM_URL = "https://roeeyypssutzfzzkypsq.supabase.co"
const RPM_KEY = Deno.env.get("RPM_SERVICE_KEY") || ""

const DMTECH_URL = "https://lpgpyiwvailshltlkitm.supabase.co"
const DMTECH_KEY = Deno.env.get("DMTECH_SERVICE_KEY") || ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

async function sbGet(url: string, key: string, path: string) {
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    })
    const data = await r.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function fmtBR(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

async function mrrRPM(): Promise<{ mrr: number; clientes: number }> {
  if (!RPM_KEY) return { mrr: 0, clientes: 0 }
  const ass = await sbGet(RPM_URL, RPM_KEY, `assinaturas?status=eq.ativa&select=valor`)
  const mrr = ass.reduce((s: number, a: any) => s + (Number(a.valor) || 0), 0)
  return { mrr, clientes: ass.length }
}

async function mrrEDR(): Promise<{ mrr: number; clientes: number }> {
  if (!EDR_KEY) return { mrr: 0, clientes: 0 }
  const ass = await sbGet(EDR_URL, EDR_KEY, `assinaturas?status=eq.ativa&select=valor`)
  const mrr = ass.reduce((s: number, a: any) => s + (Number(a.valor) || 0), 0)
  return { mrr, clientes: ass.length }
}

async function mrrDMTech(): Promise<{ mrr: number; clientes: number }> {
  if (!DMTECH_KEY) return { mrr: 0, clientes: 0 }
  const ass = await sbGet(DMTECH_URL, DMTECH_KEY, `assinaturas?status=eq.ativa&select=valor`)
  const mrr = ass.reduce((s: number, a: any) => s + (Number(a.valor) || 0), 0)
  return { mrr, clientes: ass.length }
}

// Alertas — último uso por cliente importante
// RPM Carbon (Marcondes) descartado 2026-05-02 — trial expirado, nunca pagou. Removido dos alertas.
async function alertasCriticos(): Promise<string[]> {
  const alertas: string[] = []

  // DMTech: Eletroseg (cliente pagante Josimar)
  if (DMTECH_KEY) {
    const ult = await sbGet(DMTECH_URL, DMTECH_KEY,
      `ordens_servico?is_demo=eq.false&order=created_at.desc&limit=1&select=created_at,company_id`)
    const companies = await sbGet(DMTECH_URL, DMTECH_KEY, `companies?name=ilike.*eletroseg*&select=id`)
    if (companies.length && ult.length && ult[0].company_id === companies[0].id) {
      const d = diasDesde(ult[0].created_at)
      if (d >= 3) alertas.push(`Eletroseg (DMTech) ${d}d sem OS`)
    }
  }

  // EDR: EDR Engenharia (cortesia vitalícia, dependência interna)
  if (EDR_KEY) {
    const EDR_ENG = "3d040713-320f-4639-8a0e-35f62ef10ba7"
    const ult = await sbGet(EDR_URL, EDR_KEY,
      `lancamentos?company_id=eq.${EDR_ENG}&order=criado_em.desc&limit=1&select=criado_em`)
    if (ult.length) {
      const d = diasDesde(ult[0].criado_em)
      if (d >= 3) alertas.push(`EDR Engenharia ${d}d sem lançamento`)
    }
  }

  return alertas
}

// Trials expirando em <=7 dias
async function trialsExpirando(): Promise<string[]> {
  const alertas: string[] = []
  const agora = Date.now()
  const limite = agora + 7 * 86400000

  if (EDR_KEY) {
    const cos = await sbGet(EDR_URL, EDR_KEY,
      `companies?plan_expires_at=not.is.null&select=name,plan_expires_at`)
    cos.forEach((c: any) => {
      const exp = new Date(c.plan_expires_at).getTime()
      if (exp > agora && exp <= limite) {
        const d = Math.ceil((exp - agora) / 86400000)
        alertas.push(`EDR · ${c.name}: trial vence em ${d}d`)
      }
    })
  }

  return alertas
}

async function gerarResumoCEO() {
  const [rpm, edr, dmtech, alertas, trials] = await Promise.all([
    mrrRPM(), mrrEDR(), mrrDMTech(),
    alertasCriticos(), trialsExpirando(),
  ])

  const mrrTotal = rpm.mrr + edr.mrr + dmtech.mrr
  const clientesTotal = rpm.clientes + edr.clientes + dmtech.clientes

  const hoje = new Date(Date.now() - 3 * 3600 * 1000)
  const dataFmt = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })

  let veredito = "🟢 Tudo no ar, dorme tranquilo."
  if (alertas.length > 0) veredito = "🟡 Tem 1-2 pontos de atenção — nada urgente."
  if (alertas.length >= 3) veredito = "🔴 Tem coisa pra olhar amanhã."

  const linhas: string[] = [
    `📊 <b>Fechamento CEO — ${dataFmt}</b>`,
    ``,
    `💰 <b>MRR: R$ ${fmtBR(mrrTotal)}</b> · ${clientesTotal} assinatura${clientesTotal === 1 ? "" : "s"} ativa${clientesTotal === 1 ? "" : "s"}`,
    `   🔧 RPM: R$ ${fmtBR(rpm.mrr)} (${rpm.clientes})`,
    `   🏗️ EDR: R$ ${fmtBR(edr.mrr)} (${edr.clientes})`,
    `   ⚡ DMTech: R$ ${fmtBR(dmtech.mrr)} (${dmtech.clientes})`,
  ]

  if (alertas.length > 0) {
    linhas.push(``, `⚠️ <b>Atenção:</b>`)
    alertas.forEach(a => linhas.push(`   • ${a}`))
  }

  if (trials.length > 0) {
    linhas.push(``, `⏰ <b>Trials expirando:</b>`)
    trials.forEach(t => linhas.push(`   • ${t}`))
  }

  linhas.push(``, veredito)

  return linhas.join("\n")
}

async function enviarTelegram(text: string) {
  if (!TG_TOKEN || !TG_CHAT) return { ok: false, error: "Telegram nao configurado" }
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML" }),
  })
  const d = await r.json()
  return { ok: !!d.ok, result: d }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {}
    const dryRun = !!body.dry_run

    const texto = await gerarResumoCEO()

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dry_run: true, texto }),
        { headers: { ...CORS, "Content-Type": "application/json" } })
    }

    const tg = await enviarTelegram(texto)
    return new Response(JSON.stringify({ ok: tg.ok, texto, telegram: tg.result }),
      { headers: { ...CORS, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 })
  }
})
