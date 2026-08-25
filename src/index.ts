import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { timingSafeEqual } from "node:crypto"
import { env } from "./config/env.js"
import { createRepository } from "./db/repository.js"
import { buildBot } from "./bot/handlers.js"
import { RateLimiter } from "./services/rate-limit.js"
import { TelegramService } from "./services/telegram.js"
import { Scheduler } from "./services/scheduler.js"

const repository = createRepository(env.database)
const bot = buildBot(repository, env.telegramBotToken)
const scheduler = new Scheduler(repository, new TelegramService(bot.api))
const ipLimiter = new RateLimiter(120, 60_000)
const userLimiter = new RateLimiter(60, 60_000)

function send(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(body)
}

function authorized(request: IncomingMessage): boolean {
  const value = request.headers["x-telegram-bot-api-secret-token"]
  if (typeof value !== "string") return false
  const expected = Buffer.from(env.telegramWebhookSecret)
  const actual = Buffer.from(value)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function requestIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"]
  return (typeof forwarded === "string" ? forwarded.split(",")[0] : request.socket.remoteAddress) || "unknown"
}

function updateUserId(update: Record<string, any>): number | undefined {
  const source = update.message?.from ?? update.callback_query?.from
  return Number.isInteger(source?.id) ? source.id : undefined
}

async function requestBody(request: IncomingMessage): Promise<string> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1_000_000) throw new Error("request too large")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}

const server = createServer(async (request, response) => {
  const path = request.url?.split("?", 1)[0] ?? "/"
  if (request.method === "GET" && path === "/health") {
    send(response, 200, JSON.stringify({ ok: true, service: "post-bot" }))
    return
  }
  if (request.method !== "POST" || path !== env.webhookPath) {
    send(response, 404, JSON.stringify({ error: "not found" }))
    return
  }
  if (!authorized(request)) {
    send(response, 401, JSON.stringify({ error: "unauthorized" }))
    return
  }
  if (!ipLimiter.allow(requestIp(request))) {
    send(response, 429, JSON.stringify({ error: "rate limited" }))
    return
  }

  let updateId: number | undefined
  try {
    const update = JSON.parse(await requestBody(request)) as { update_id?: unknown }
    if (!Number.isInteger(update.update_id)) {
      send(response, 400, JSON.stringify({ error: "invalid update" }))
      return
    }
    updateId = update.update_id as number
    const actorId = updateUserId(update)
    if (actorId !== undefined && !userLimiter.allow(String(actorId))) {
      send(response, 429, JSON.stringify({ error: "rate limited" }))
      return
    }
    if (!(await repository.claimUpdate(updateId))) {
      send(response, 200, JSON.stringify({ ok: true, duplicate: true }))
      return
    }
    await bot.handleUpdate(update as never)
    send(response, 200, JSON.stringify({ ok: true }))
  } catch (error) {
    if (updateId !== undefined) await repository.releaseUpdate(updateId)
    console.error("Webhook handling failed", error instanceof Error ? error.message : "unknown error")
    send(response, 500, JSON.stringify({ error: "temporary failure" }))
  }
})

await bot.api.setMyCommands([
  { command: "start", description: "Open the main menu" },
  { command: "create", description: "Create a new post" },
  { command: "quickpublish", description: "Start a fast text post" },
  { command: "buttons", description: "Open the button builder" },
  { command: "templates", description: "Use a template" },
  { command: "posts", description: "View recent posts" },
  { command: "scheduled", description: "Manage scheduled posts" },
  { command: "settings", description: "Manage your data" },
  { command: "help", description: "Show help" },
  { command: "cancel", description: "Cancel the current flow" },
])

scheduler.start()

server.listen(env.appPort, () => {
  console.log(`POST BOT listening on port ${env.appPort}`)
})

function close(signal: string): void {
  console.log(`Received ${signal}; shutting down`)
  scheduler.stop()
  server.close(() => process.exit(0))
}

process.once("SIGTERM", () => close("SIGTERM"))
process.once("SIGINT", () => close("SIGINT"))
