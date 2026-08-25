import "dotenv/config"
import type { DatabaseConfig, DatabaseProvider } from "../db/repository.js"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback
}

const databaseProviderValue = optional("DB_PROVIDER", "supabase").toLowerCase()
if (!(["supabase", "neon", "mongodb"] as string[]).includes(databaseProviderValue)) {
  throw new Error("DB_PROVIDER must be one of: supabase, neon, mongodb")
}

const databaseProvider = databaseProviderValue as DatabaseProvider
const database: DatabaseConfig = databaseProvider === "supabase"
  ? { provider: databaseProvider, supabaseUrl: required("SUPABASE_URL"), supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY") }
  : databaseProvider === "neon"
    ? { provider: databaseProvider, databaseUrl: required("DATABASE_URL") }
    : { provider: databaseProvider, mongodbUri: required("MONGODB_URI"), mongodbDatabase: optional("MONGODB_DATABASE", "post_bot") }

export const env = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramWebhookSecret: required("TELEGRAM_WEBHOOK_SECRET"),
  webhookPath: optional("WEBHOOK_PATH", "/telegram/webhook"),
  database,
  appPort: Number.parseInt(optional("APP_PORT", optional("PORT", "3000")), 10),
  appUrl: optional("APP_URL"),
  botUsername: optional("BOT_USERNAME"),
  botName: optional("BOT_NAME"),
  botDescription: optional("BOT_DESCRIPTION"),
  botShortDescription: optional("BOT_SHORT_DESCRIPTION"),
  botProfilePhoto: optional("BOT_PROFILE_PHOTO"),
  adminTelegramUserIds: optional("ADMIN_TELEGRAM_USER_IDS")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite),
} as const

if (!Number.isInteger(env.appPort) || env.appPort < 1 || env.appPort > 65535) {
  throw new Error("APP_PORT must be a valid TCP port")
}
