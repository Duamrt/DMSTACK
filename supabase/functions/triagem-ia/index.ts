// Edge Function: triagem-ia
// Recebe texto bruto de análise → Claude Haiku classifica em bugs/demandas estruturados
// Retorna array JSON pronto pra revisão e importação

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const { texto, sistema } = await req.json()
    if (!texto || texto.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Texto muito curto" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      })
    }

    const sistemaInstrucao = sistema
      ? `\nATENÇÃO: Este texto é sobre o sistema ${sistema}. TODOS os itens devem ter sistema="${sistema}". NÃO classifique nada como outro sistema a menos que o texto mencione EXPLICITAMENTE outro produto.\n`
      : ''

    const prompt = `Você é um assistente de triagem técnica para um portfólio de SaaS (EDR System, RPM Pro, NaRegua, LoadPro, DM Stack).
${sistemaInstrucao}
Analise o texto abaixo e extraia APENAS os itens acionáveis: bugs confirmados e demandas de melhoria/feature.

REGRAS:
- Ignore itens já implementados, "já feito", "já existe", "funciona"
- Ignore itens genéricos sem ação concreta
- Classifique cada item como "bug" (algo quebrado) ou "demanda" (melhoria/feature nova)
- sistema: use exatamente um de: EDR, RPM, NAREGUA, LOADPRO, DMSTACK
- prioridade: "critico" (trava escala/segurança), "alto" (impacto direto em usuários), "medio" (melhoria relevante), "baixo" (nice-to-have)
- titulo: máximo 80 caracteres, direto ao ponto
- descricao: 1-2 frases contextualizando o problema ou a melhoria

Retorne SOMENTE um array JSON válido, sem markdown, sem explicação, sem texto fora do JSON:
[
  {
    "tipo": "bug" | "demanda",
    "sistema": "EDR" | "RPM" | "NAREGUA" | "LOADPRO" | "DMSTACK",
    "titulo": "...",
    "prioridade": "critico" | "alto" | "medio" | "baixo",
    "descricao": "..."
  }
]

TEXTO PARA ANALISAR:
${texto}`

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`Anthropic error: ${err}`)
    }

    const ai = await resp.json()
    const raw = ai.content?.[0]?.text?.trim() || "[]"

    // Garantir que é JSON válido
    let itens = []
    try {
      itens = JSON.parse(raw)
      if (!Array.isArray(itens)) itens = []
    } catch {
      // tentar extrair JSON se vier com texto extra
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) {
        try { itens = JSON.parse(match[0]) } catch { itens = [] }
      }
    }

    return new Response(JSON.stringify({ itens }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    })
  }
})
