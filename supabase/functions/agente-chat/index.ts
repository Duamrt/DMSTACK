// Edge Function: agente-chat
// Chat interativo — Duam pergunta sobre seus negocios, agente responde com dados reais
// Busca dados frescos do EDR e RPM, envia pro Claude com contexto

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || ""
const EDR_URL = "https://mepzoxoahpwcvvlymlfh.supabase.co"
const EDR_KEY = Deno.env.get("EDR_SERVICE_KEY") || ""
const RPM_URL = "https://roeeyypssutzfzzkypsq.supabase.co"
const RPM_KEY = Deno.env.get("RPM_SERVICE_KEY") || ""
const DMS_URL = "https://bkfkzauhnlulrtttgcii.supabase.co"
const DMS_KEY = Deno.env.get("DMS_SERVICE_KEY") || ""

const DMS_MASTER_OFICINA = "aaaa0001-0000-0000-0000-000000000001"

const hoje = () => new Date().toISOString().split("T")[0]
const mesAtual = () => hoje().substring(0, 7)

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

// Validar usuario
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

// Coleta rapida de dados (resumo pra contexto do chat)
async function coletarContexto() {
  const ma = mesAtual()
  const hj = hoje()

  // Busca IDs dinamicamente
  const [edrCompanies, rpmOficinas] = await Promise.all([
    sbGet(EDR_URL, EDR_KEY, "companies", `?select=id,name`),
    sbGet(RPM_URL, RPM_KEY, "oficinas", `?id=neq.${DMS_MASTER_OFICINA}&select=id,nome`),
  ])

  const edrIds = edrCompanies.map((c: any) => c.id)
  const rpmIds = rpmOficinas.map((o: any) => o.id)

  const edrFilter = edrIds.length ? `?company_id=in.(${edrIds.join(",")})` : `?company_id=eq.nenhum`
  const rpmFilter = rpmIds.length ? `?oficina_id=in.(${rpmIds.join(",")})` : `?oficina_id=eq.nenhum`

  // EDR: obras, financeiro, estoque, diarias, cronograma, contas
  // RPM: OS, clientes, pecas, equipe
  const [obras, lanc, rep, apg, oadd, materiais, nfs, diarias, diariasFuncs, cronograma, contasPagar, projecoesCaixa,
         os, cli, pecas, prof] = await Promise.all([
    // EDR
    sbGet(EDR_URL, EDR_KEY, "obras", `${edrFilter}&arquivada=eq.false&select=id,nome,valor_venda`),
    sbGet(EDR_URL, EDR_KEY, "lancamentos", `${edrFilter}&select=obra_id,total,data,etapa,descricao&order=data.desc&limit=3000`),
    sbGet(EDR_URL, EDR_KEY, "repasses_cef", `${edrFilter}&select=valor,data_credito,obra_id&order=data_credito.desc`),
    sbGet(EDR_URL, EDR_KEY, "adicional_pagamentos", `?order=data.desc`),
    sbGet(EDR_URL, EDR_KEY, "obra_adicionais", `${edrFilter}`),
    sbGet(EDR_URL, EDR_KEY, "materiais", `${edrFilter}&select=id,nome,obra_id,quantidade,valor_unitario,unidade&order=nome&limit=500`),
    sbGet(EDR_URL, EDR_KEY, "notas_fiscais", `${edrFilter}&select=id,fornecedor,valor,data,obra_id&order=data.desc&limit=100`),
    sbGet(EDR_URL, EDR_KEY, "diarias", `?select=id,quinzena_id,data,funcionario,cargo,valor,periodos&order=data.desc&limit=500`),
    sbGet(EDR_URL, EDR_KEY, "diarias_funcionarios", `?select=id,nome,cargo,diaria,ativo&ativo=eq.true`),
    sbGet(EDR_URL, EDR_KEY, "cronograma_tarefas", `${edrFilter}&select=id,obra_id,titulo,progresso,data_inicio,data_fim&order=data_inicio&limit=200`),
    sbGet(EDR_URL, EDR_KEY, "contas_pagar", `${edrFilter}&select=id,descricao,valor,vencimento,pago,obra_id&order=vencimento&limit=100`),
    sbGet(EDR_URL, EDR_KEY, "projecoes_caixa", `?select=id,descricao,tipo,valor,data_prevista,realizado&order=data_prevista&limit=100`),
    // RPM
    sbGet(RPM_URL, RPM_KEY, "ordens_servico", `${rpmFilter}&select=id,numero,status,valor_total,data_entrada,data_entrega,mecanico_id,forma_pagamento,pago,created_at,clientes(nome),veiculos(placa)&order=created_at.desc&limit=200`),
    sbGet(RPM_URL, RPM_KEY, "clientes", `${rpmFilter}&select=id,nome,whatsapp`),
    sbGet(RPM_URL, RPM_KEY, "pecas", `${rpmFilter}&select=id,nome,quantidade,custo,preco_venda&limit=100`),
    sbGet(RPM_URL, RPM_KEY, "profiles", `${rpmFilter}&select=id,nome,role`),
  ])

  // EDR resumo
  const idsAtivas = new Set(obras.map((o: any) => o.id))
  const lancAtivas = lanc.filter((l: any) => !l.obra_id || idsAtivas.has(l.obra_id))
  const lm = lancAtivas.filter((l: any) => (l.data || "").startsWith(ma))
  const tSai = lm.reduce((s: number, l: any) => s + Number(l.total || 0), 0)
  const tMao = lm.filter((l: any) => (l.etapa || "") === "28_mao").reduce((s: number, l: any) => s + Number(l.total || 0), 0)
  const rm = rep.filter((r: any) => (r.data_credito || "").startsWith(ma))
  const tEnt = rm.reduce((s: number, r: any) => s + Number(r.valor || 0), 0)

  const obrasResumo = obras.map((o: any) => {
    const lo = lancAtivas.filter((l: any) => l.obra_id === o.id)
    const gt = lo.reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    const gm = lo.filter((l: any) => (l.data || "").startsWith(ma)).reduce((s: number, l: any) => s + Number(l.total || 0), 0)
    // Receita = valor_venda + adicionais
    const ta = oadd.filter((a: any) => a.obra_id === o.id).reduce((s: number, a: any) => s + Number(a.valor || 0), 0)
    const rc = Number(o.valor_venda || 0) + ta
    // Entradas = repasses CEF + pagamentos de adicionais
    const repsObra = rep.filter((r: any) => r.obra_id === o.id)
    const entradasRep = repsObra.reduce((s: number, r: any) => s + Number(r.valor || 0), 0)
    const addIds = new Set(oadd.filter((a: any) => a.obra_id === o.id).map((a: any) => a.id))
    const addReceb = apg.filter((p: any) => addIds.has(p.adicional_id)).reduce((s: number, p: any) => s + Number(p.valor || 0), 0)
    const entradas = entradasRep + addReceb
    const faltaReceber = rc - entradas
    const pct = rc > 0 ? Math.round(gt / rc * 100) : 0
    // Estoque da obra
    const mats = materiais.filter((m: any) => m.obra_id === o.id)
    const totalMats = mats.length
    const valorEstoque = mats.reduce((s: number, m: any) => s + (Number(m.quantidade || 0) * Number(m.valor_unitario || 0)), 0)
    // Cronograma da obra
    const tarefas = cronograma.filter((t: any) => t.obra_id === o.id)
    const tarefasConcluidas = tarefas.filter((t: any) => (t.progresso || 0) >= 100).length
    const progressoGeral = tarefas.length ? Math.round(tarefas.reduce((s: number, t: any) => s + (t.progresso || 0), 0) / tarefas.length) : 0
    // NFs da obra
    const nfsObra = nfs.filter((n: any) => n.obra_id === o.id)
    const totalNFs = nfsObra.reduce((s: number, n: any) => s + Number(n.valor || 0), 0)

    return {
      nome: o.nome, gasto_total: gt, gasto_mes: gm, receita: rc, entradas, falta_receber: faltaReceber, pct, saldo: entradas - gt,
      estoque: { itens: totalMats, valor: valorEstoque },
      cronograma: { tarefas: tarefas.length, concluidas: tarefasConcluidas, progresso: progressoGeral },
      nfs: { qtd: nfsObra.length, valor: totalNFs }
    }
  })

  // Diarias resumo (tabela diarias tem: data, funcionario, valor, periodos)
  const diariasMes = diarias.filter((d: any) => (d.data || "").startsWith(ma))
  const totalDiarias = diariasMes.reduce((s: number, d: any) => s + Number(d.valor || 0), 0)
  // Funcionarios: quanto cada um recebeu no mes
  const porFunc: Record<string, number> = {}
  diariasMes.forEach((d: any) => {
    const nome = d.funcionario || '-'
    porFunc[nome] = (porFunc[nome] || 0) + Number(d.valor || 0)
  })
  const topFuncionarios = Object.entries(porFunc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nome, valor]) => ({ nome, valor }))

  // Contas a pagar
  const contasPendentes = contasPagar.filter((c: any) => !c.pago)
  const totalContasPendentes = contasPendentes.reduce((s: number, c: any) => s + Number(c.valor || 0), 0)
  const contasVencidas = contasPendentes.filter((c: any) => (c.vencimento || '') < hj)

  // RPM resumo
  const abertas = os.filter((o: any) => !['entregue','cancelada','cancelado'].includes(o.status))
  const entregues = os.filter((o: any) => o.status === 'entregue')
  const semPgto = entregues.filter((o: any) => !o.pago)
  const osMes = os.filter((o: any) => (o.data_entrada || "").startsWith(ma))
  const entresMes = osMes.filter((o: any) => o.status === 'entregue')
  const fatMes = entresMes.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0)

  return {
    data_hoje: hj,
    edr: {
      saldo_mes: tEnt - tSai, entradas_mes: tEnt, saidas_mes: tSai,
      mao_obra_mes: tMao, pct_mao: tSai > 0 ? Math.round(tMao/tSai*100) : 0,
      obras: obrasResumo,
      diarias: {
        total_mes: totalDiarias,
        funcionarios: topFuncionarios,
        ultimas_7_dias: diarias.filter((d: any) => (d.data||'') >= new Date(Date.now()-7*864e5).toISOString().split('T')[0])
          .map((d: any) => ({ data: d.data, funcionario: d.funcionario, cargo: d.cargo, valor: d.valor, periodos: d.periodos }))
      },
      contas_pagar: { pendentes: contasPendentes.length, valor: totalContasPendentes, vencidas: contasVencidas.length },
      estoque_geral: { total_itens: materiais.length, valor_total: materiais.reduce((s: number, m: any) => s + (Number(m.quantidade||0) * Number(m.valor_unitario||0)), 0) },
      notas_fiscais_mes: nfs.filter((n: any) => (n.data||"").startsWith(ma)).length,
      caixa: {
        projecoes_pendentes: projecoesCaixa.filter((p: any) => !p.realizado).map((p: any) => ({
          descricao: p.descricao, tipo: p.tipo, valor: p.valor, data: p.data_prevista
        })),
        total_entradas_previstas: projecoesCaixa.filter((p: any) => p.tipo === 'entrada' && !p.realizado).reduce((s: number, p: any) => s + Number(p.valor||0), 0),
        total_saidas_previstas: projecoesCaixa.filter((p: any) => p.tipo === 'saida' && !p.realizado).reduce((s: number, p: any) => s + Number(p.valor||0), 0),
      },
    },
    rpm: {
      os_abertas: abertas.length, os_entregues: entregues.length,
      sem_pagamento: semPgto.length,
      valor_sem_pgto: semPgto.reduce((s: number, o: any) => s + Number(o.valor_total || 0), 0),
      faturamento_mes: fatMes, entregas_mes: entresMes.length,
      total_clientes: cli.length, total_pecas: pecas.length,
      mecanicos: prof.filter((p: any) => p.role === 'mecanico').map((p: any) => p.nome),
      os_recentes: os.slice(0, 10).map((o: any) => ({
        numero: o.numero, status: o.status, valor: o.valor_total,
        cliente: o.clientes?.nome || '-', placa: o.veiculos?.placa || '-',
        pago: o.pago
      })),
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const autorizado = await validarUsuario(req)
  if (!autorizado) {
    return new Response(JSON.stringify({ ok: false, erro: "Nao autorizado" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json()
    const pergunta = body.pergunta || ""
    if (!pergunta.trim()) {
      return new Response(JSON.stringify({ ok: false, erro: "Pergunta vazia" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    // Coleta dados frescos
    const ctx = await coletarContexto()

    // Chama Claude
    const systemPrompt = `Voce e o agente pessoal do Duam no DM.Stack.

QUEM E O DUAM:
- Dono da EDR Engenharia (construcao civil, 6 obras ativas)
- Criador de 4 SaaS: RPM Pro (oficinas), LoadPro (personal), NaRegua (beleza), EDR System (gestao obras)
- RPM Pro tem 1 cliente ativo: Carbon Auto Center (dono: Marcondes JR, aux_admin: Rafael)
- Pai de 5 filhos, tempo escasso, vai pra obra todo dia
- Elyda = esposa, engenheira responsavel (CREA)

DADOS DISPONIVEIS POR OBRA:
- Financeiro: gasto_total, gasto_mes, receita, entradas, falta_receber, pct (% consumido), saldo
- Estoque: itens e valor dos materiais em estoque
- Cronograma: tarefas totais, concluidas, progresso geral (%)
- NFs: quantidade e valor de notas fiscais
- Diarias: total do mes, ranking de funcionarios por valor
- Contas a pagar: pendentes, vencidas, valor total
- Caixa: projecoes de entradas e saidas futuras (previsoes)

COMO RESPONDER:
- Direto, curto, sem formalidade — como socio falando
- Use dados reais do contexto abaixo — SEMPRE cite numeros
- Se nao tiver o dado, diga que nao tem — nao invente
- Foque em dinheiro e acoes praticas
- Portugues brasileiro sem acento
- Obras com nome contendo "ESCRITORIO" ou "EDR -" sao CUSTO INTERNO — nao tem receita, nao tem cliente. Ignore nas analises de receita/pagamento.

DADOS ATUAIS:
${JSON.stringify(ctx, null, 2)}`

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: pergunta }],
      }),
    })

    const resp = await r.json()
    const text = resp?.content?.[0]?.text || "Nao consegui processar."

    return new Response(JSON.stringify({ ok: true, resposta: text }), {
      headers: { ...cors, "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, erro: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    })
  }
})
