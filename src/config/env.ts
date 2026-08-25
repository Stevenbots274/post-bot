import "dotenv/config"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback
}

export const env = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramWebhookSecret: required("TELEGRAM_WEBHOOK_SECRET"),
  webhookPath: optional("WEBHOOK_PATH", "/telegram/webhook"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  appPort: Number.parseInt(optional("APP_PORT", "3000"), 10),
  appUrl: optional("APP_URL"),
  botUsername: optional("BOT_USERNAME"),
  adminTelegramUserIds: optional("ADMIN_TELEGRAM_USER_IDS")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite),
} as const

if (!Number.isInteger(env.appPort) || env.appPort < 1 || env.appPort > 65535) {
  throw new Error("APP_PORT must be a valid TCP port")
}
