// Edge Function: notificar-telegram
// Envia mensagem via Telegram bot de forma segura (token no servidor, não no frontend)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TG_TOKEN = Deno.env.get("TG_TOKEN") || ""
const TG_CHAT  = Deno.env.get("TG_CHAT")  || ""

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const { text } = await req.json()
    if (!text) return new Response(JSON.stringify({ ok: false, error: "text required" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 })

    if (!TG_TOKEN || !TG_CHAT) {
      console.error("TG_TOKEN ou TG_CHAT não configurados")
      return new Response(JSON.stringify({ ok: false, error: "Telegram não configurado" }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 })
    }

    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML" })
    })

    const result = await r.json()
    return new Response(JSON.stringify({ ok: result.ok }), { headers: { ...CORS, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: { ...CORS, "Content-Type": "application/json" }, status: 500 })
  }
})
