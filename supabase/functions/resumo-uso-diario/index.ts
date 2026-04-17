// Edge Function: resumo-uso-diario
// Gera resumo de uso dos clientes (ontem) e envia pro Telegram do Duam
// Roda via pg_cron todo dia as 7h (America/Recife)

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

// IDs dos tenants ativos reais
const CARBON_ID = "183424eb-f8f2-4502-875c-881182449143"
const EDR_ENG_ID = "3d040713-320f-4639-8a0e-35f62ef10ba7"
const JACKSON_ID = "5f079ad3-5470-4fae-b4b7-f8673dced878"
const RODRIGUES_ID = "8055af67-4581-49f6-a69c-6e71d5e9542c"

async function sbGet(url: string, key: string, path: string) {
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    })
    const data = await r.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

// Janela: ontem 00:00 ate ontem 23:59 no fuso America/Recife (UTC-3)
function janelaOntem() {
  const agora = new Date()
  const offMs = 3 * 3600 * 1000 // UTC-3
  const localNow = new Date(agora.getTime() - offMs)
  const ano = localNow.getUTCFullYear()
  const mes = localNow.getUTCMonth()
  const dia = localNow.getUTCDate()
  // ontem em Recife (00:00 local = 03:00 UTC)
  const inicio = new Date(Date.UTC(ano, mes, dia - 1, 3, 0, 0))
  const fim = new Date(Date.UTC(ano, mes, dia, 3, 0, 0))
  const dataOntem = new Date(Date.UTC(ano, mes, dia - 1))
    .toISOString().split("T")[0]
  return { inicio: inicio.toISOString(), fim: fim.toISOString(), dataOntem }
}

function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// ═══ RPM PRO ═══
async function resumoRPM(j: any) {
  if (!RPM_KEY) return { linha: "RPM Pro: (service key nao configurada)", inativo: false }

  const os = await sbGet(
    RPM_URL, RPM_KEY,
    `ordens_servico?oficina_id=eq.${CARBON_ID}&created_at=gte.${j.inicio}&created_at=lt.${j.fim}&select=id,mecanico_id,created_by,valor_total,status`
  )

  if (os.length === 0) {
    // checar ultima atividade
    const ultima = await sbGet(
      RPM_URL, RPM_KEY,
      `ordens_servico?oficina_id=eq.${CARBON_ID}&order=created_at.desc&limit=1&select=created_at`
    )
    const dias = ultima.length ? diasDesde(ultima[0].created_at) : 999
    const flag = dias >= 3 ? ` ⚠️ ${dias}d sem uso` : ""
    return { linha: `🔧 <b>RPM Pro — Carbon</b>\n• 0 OS ontem${flag}`, inativo: dias >= 3 }
  }

  // Buscar nomes dos mecanicos e quem criou
  const userIds = new Set<string>()
  os.forEach((o: any) => {
    if (o.mecanico_id) userIds.add(o.mecanico_id)
    if (o.created_by) userIds.add(o.created_by)
  })

  const profiles = userIds.size
    ? await sbGet(RPM_URL, RPM_KEY, `profiles?id=in.(${[...userIds].join(",")})&select=id,nome,email`)
    : []
  const nome = (id: string) => {
    const p = profiles.find((x: any) => x.id === id)
    return p?.nome || p?.email?.split("@")[0] || "desconhecido"
  }

  // Agrupar por quem criou
  const porCriador: Record<string, number> = {}
  const porMecanico: Record<string, number> = {}
  let valorTotal = 0
  os.forEach((o: any) => {
    if (o.created_by) porCriador[o.created_by] = (porCriador[o.created_by] || 0) + 1
    if (o.mecanico_id) porMecanico[o.mecanico_id] = (porMecanico[o.mecanico_id] || 0) + 1
    valorTotal += Number(o.valor_total) || 0
  })

  const criadores = Object.entries(porCriador)
    .map(([id, qtd]) => `  • ${nome(id)}: ${qtd} OS`)
    .join("\n")

  const mecanicos = Object.entries(porMecanico)
    .map(([id, qtd]) => `  ↳ ${nome(id)}: ${qtd}`)
    .join("\n")

  return {
    linha: `🔧 <b>RPM Pro — Carbon</b>\n• ${os.length} OS · R$ ${valorTotal.toFixed(2)}\n${criadores}${mecanicos ? "\n<i>Mecanicos:</i>\n" + mecanicos : ""}`,
    inativo: false
  }
}

// ═══ EDR SYSTEM ═══
async function resumoEDR(j: any) {
  if (!EDR_KEY) return { linha: "EDR System: (service key nao configurada)", inativo: false }

  // Todos clientes reais
  const clientes = [
    { id: EDR_ENG_ID, nome: "EDR Engenharia" },
    { id: JACKSON_ID, nome: "Jackson Alcantara" },
    { id: RODRIGUES_ID, nome: "Rodrigues Construtora" },
  ]

  const linhas: string[] = []
  let algumInativo = false

  for (const c of clientes) {
    const lancs = await sbGet(
      EDR_URL, EDR_KEY,
      `lancamentos?company_id=eq.${c.id}&criado_em=gte.${j.inicio}&criado_em=lt.${j.fim}&select=criado_por,total`
    )

    if (lancs.length === 0) {
      const ultima = await sbGet(
        EDR_URL, EDR_KEY,
        `lancamentos?company_id=eq.${c.id}&order=criado_em.desc&limit=1&select=criado_em`
      )
      const dias = ultima.length ? diasDesde(ultima[0].criado_em) : 999
      const flag = dias >= 999 ? " 💤 nunca usou" : dias >= 7 ? ` ⚠️ ${dias}d sem uso` : ""
      if (dias >= 3) algumInativo = true
      linhas.push(`  • ${c.nome}: 0 lancamentos${flag}`)
      continue
    }

    const porUser: Record<string, number> = {}
    let total = 0
    lancs.forEach((l: any) => {
      const u = l.criado_por || "desconhecido"
      porUser[u] = (porUser[u] || 0) + 1
      total += Number(l.total) || 0
    })

    const users = Object.entries(porUser)
      .map(([u, qtd]) => `    ↳ ${u.split("@")[0]}: ${qtd}`)
      .join("\n")

    linhas.push(`  • <b>${c.nome}</b>: ${lancs.length} lancamentos · R$ ${total.toFixed(2)}\n${users}`)
  }

  return { linha: `🏗️ <b>EDR System</b>\n${linhas.join("\n")}`, inativo: algumInativo }
}

// ═══ DMTECH ═══
// schema DMTech: ordens_servico tem {company_id, total, responsavel_id, is_demo}
// NAO tem: created_by, valor_total
async function resumoDMTech(j: any) {
  if (!DMTECH_KEY) return { linha: "🔧 <b>DMTech</b>\n  (service key nao configurada)", inativo: false }

  const os = await sbGet(
    DMTECH_URL, DMTECH_KEY,
    `ordens_servico?created_at=gte.${j.inicio}&created_at=lt.${j.fim}&is_demo=eq.false&select=id,company_id,responsavel_id,total`
  )

  const companies = await sbGet(DMTECH_URL, DMTECH_KEY, `companies?select=id,name`)
  const nomeCo = (id: string) => companies.find((c: any) => c.id === id)?.name || id.slice(0, 8)
  // Filtrar tenant interno DM Stack
  const DMSTACK_TENANT = "aaaa0001-0000-0000-0000-000000000001"
  const osReais = os.filter((o: any) => o.company_id !== DMSTACK_TENANT)

  if (osReais.length === 0) {
    const ultima = await sbGet(
      DMTECH_URL, DMTECH_KEY,
      `ordens_servico?is_demo=eq.false&company_id=neq.${DMSTACK_TENANT}&order=created_at.desc&limit=1&select=created_at,company_id`
    )
    const dias = ultima.length ? diasDesde(ultima[0].created_at) : 999
    const flag = dias >= 3 ? ` ⚠️ ${dias}d sem uso` : ""
    return { linha: `🔧 <b>DMTech</b>\n  • 0 OS ontem${flag}`, inativo: dias >= 3 }
  }

  const porEmpresa: Record<string, number> = {}
  let total = 0
  osReais.forEach((o: any) => {
    const k = o.company_id || "sem-empresa"
    porEmpresa[k] = (porEmpresa[k] || 0) + 1
    total += Number(o.total) || 0
  })

  const lista = Object.entries(porEmpresa)
    .map(([id, qtd]) => `  • ${nomeCo(id)}: ${qtd} OS`)
    .join("\n")

  return { linha: `🔧 <b>DMTech</b>\n${lista}\n<i>Total: R$ ${total.toFixed(2)}</i>`, inativo: false }
}

// ═══ MONTAGEM ═══
async function gerarResumo() {
  const j = janelaOntem()

  const [rpm, edr, dmtech] = await Promise.all([
    resumoRPM(j),
    resumoEDR(j),
    resumoDMTech(j),
  ])

  const data = new Date(j.dataOntem + "T00:00:00-03:00")
  const dataFmt = data.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })

  const texto = [
    `📊 <b>Uso ontem — ${dataFmt}</b>`,
    ``,
    rpm.linha,
    ``,
    edr.linha,
    ``,
    dmtech.linha,
  ].join("\n")

  return texto
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

    const texto = await gerarResumo()

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
