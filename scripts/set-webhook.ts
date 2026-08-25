import { env } from "../src/config/env.js"

if (!env.appUrl) throw new Error("APP_URL is required to configure the webhook")

const webhook = `${env.appUrl.replace(/\/$/, "")}${env.webhookPath}`
const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhook,
    secret_token: env.telegramWebhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  }),
})

const result = await response.json() as { ok?: boolean; description?: string }
if (!response.ok || !result.ok) throw new Error(result.description || "Telegram rejected the webhook")
console.log(`Webhook configured: ${webhook}`)
