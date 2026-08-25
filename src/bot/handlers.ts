import { Bot, type Context } from "grammy"
import type { Message } from "grammy/types"
import type { Repository } from "../db/repository.js"
import type { ButtonDefinition, ContentType, Draft, PublishTarget } from "../types/domain.js"
import { draftText } from "../services/formatter.js"
import { validateButtonLabel, validateHttpsUrl } from "../services/validation.js"
import { parseScheduleTime } from "../services/schedule.js"
import { TelegramService } from "../services/telegram.js"
import {
  buttonMenuKeyboard,
  cancelKeyboard,
  contentTypeKeyboard,
  draftConflictKeyboard,
  mainMenuKeyboard,
  postsKeyboard,
  postButtonsKeyboard,
  previewKeyboard,
  publishTargetsKeyboard,
  settingsKeyboard,
  scheduledPostsKeyboard,
  skipKeyboard,
  templatesKeyboard,
} from "./keyboards.js"

const HELP_TEXT = `POST BOT helps you create polished Telegram posts.

1. Choose Text, Photo, or Video.
2. Add your body or caption.
3. Add real clickable URL buttons.
4. Preview, edit, and publish.

Formatting supported: **bold**, __italic__, ~~strikethrough~~, \`inline code\`, and [links](https://example.com).

Use /register inside a group or channel where this bot has permission to save it as a publishing target. Use /cancel at any time.`

type Preset = {
  name: string
  content_type: ContentType
  body: string
  buttons: ButtonDefinition[]
}

const PRESETS: Preset[] = [
  { name: "Product", content_type: "text", body: "**Product name**\n\nDescribe the product here.", buttons: [] },
  { name: "Sale", content_type: "text", body: "**Sale**\n\nOffer details and how to order.", buttons: [] },
  { name: "Announcement", content_type: "text", body: "**Announcement**\n\nShare the important update here.", buttons: [] },
  { name: "Event", content_type: "text", body: "**Event**\n\nDate, time, location, and details.", buttons: [] },
  { name: "New Post", content_type: "text", body: "**New post**\n\nWrite your message here.", buttons: [] },
]

function userId(ctx: Context): number {
  if (!ctx.from) throw new Error("Telegram user is missing")
  return ctx.from.id
}

async function ensureUser(ctx: Context, repository: Repository): Promise<number> {
  const id = userId(ctx)
  await repository.upsertUser({
    id,
    username: ctx.from?.username,
    first_name: ctx.from?.first_name,
    last_name: ctx.from?.last_name,
    language_code: ctx.from?.language_code,
  })
  return id
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("That doesn't")) return error.message
  if (error instanceof Error && error.message.startsWith("Please")) return error.message
  if (error instanceof Error && error.message.startsWith("Button")) return error.message
  return "⚠️ Something went wrong, but your draft is still safe. Please try again or use /cancel."
}

async function replyError(ctx: Context, error: unknown): Promise<void> {
  console.error("Bot operation failed", error instanceof Error ? error.message : "unknown error")
  await ctx.reply(errorMessage(error), { reply_markup: cancelKeyboard() })
}

function metadataWithout(draft: Draft, ...keys: string[]): Record<string, unknown> {
  const next = { ...draft.metadata }
  for (const key of keys) delete next[key]
  return next
}

function buttonSummary(buttons: ButtonDefinition[]): string {
  if (!buttons.length) return "No buttons yet. Add one or skip to preview."
  return buttons
    .map((button, index) => `${index + 1}. ${button.label}  · row ${button.row + 1}`)
    .join("\n")
}

async function showMainMenu(ctx: Context): Promise<void> {
  await ctx.reply("Choose an action:", { reply_markup: mainMenuKeyboard() })
}

async function showButtonMenu(ctx: Context, repository: Repository, draft: Draft): Promise<void> {
  const current = draft.state === "button_menu" ? draft : await repository.updateDraft(draft.id, { state: "button_menu" })
  await ctx.reply(`🔘 Button builder\n\n${buttonSummary(current.buttons)}\n\nYou can add up to 8 buttons.`, {
    reply_markup: buttonMenuKeyboard(current.buttons),
  })
}

async function startDraft(ctx: Context, repository: Repository, force = false): Promise<void> {
  const id = await ensureUser(ctx, repository)
  const existing = await repository.getDraft(id)
  if (existing && !force) {
    await ctx.reply("You already have an active draft. Continue it or start over?", { reply_markup: draftConflictKeyboard() })
    return
  }
  if (existing) await repository.deleteDraft(existing.id)
  await repository.createDraft(id, "text", "creating")
  await ctx.reply("What kind of post would you like to create?", { reply_markup: contentTypeKeyboard() })
}

async function startQuickPublish(ctx: Context, repository: Repository, body = ""): Promise<void> {
  const id = await ensureUser(ctx, repository)
  const existing = await repository.getDraft(id)
  if (existing) {
    await ctx.reply("Finish or cancel your active draft before starting Quick Publish.", { reply_markup: draftConflictKeyboard() })
    return
  }
  const draft = await repository.createDraft(id, "text", body ? "button_menu" : "waiting_content")
  if (body) {
    await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { body }))
  } else {
    await ctx.reply("Send the text for your quick post, then add buttons or publish it.", { reply_markup: cancelKeyboard() })
  }
}

async function startButtonBuilder(ctx: Context, repository: Repository): Promise<void> {
  const id = await ensureUser(ctx, repository)
  let draft = await repository.getDraft(id)
  if (!draft) draft = await repository.createDraft(id, "text", "button_menu")
  await showButtonMenu(ctx, repository, draft)
}

async function editContentPrompt(ctx: Context, repository: Repository, draft: Draft): Promise<void> {
  const state = draft.content_type === "text" ? "waiting_content" : draft.telegram_file_id ? "waiting_caption" : "waiting_media"
  const next = await repository.updateDraft(draft.id, { state })
  if (state === "waiting_content") await ctx.reply("Send the new post body. Formatting such as **bold** is supported.", { reply_markup: cancelKeyboard() })
  else if (state === "waiting_media") await ctx.reply(`Send the ${next.content_type} for this draft.`, { reply_markup: cancelKeyboard() })
  else await ctx.reply("Send the new caption.", { reply_markup: cancelKeyboard() })
}

async function sendPreview(ctx: Context, telegram: TelegramService, draft: Draft): Promise<void> {
  const text = draftText(draft)
  const markup = postButtonsKeyboard(draft.buttons)
  if (draft.content_type === "text") {
    await telegram.sendMessage(ctx.chat!.id, text || "(No text yet)", { parse_mode: "HTML", reply_markup: markup })
  } else if (!draft.telegram_file_id) {
    await ctx.reply("Add the media before previewing this draft.", { reply_markup: cancelKeyboard() })
    return
  } else if (draft.content_type === "photo") {
    await telegram.sendPhoto(ctx.chat!.id, draft.telegram_file_id, {
      ...(text ? { caption: text, parse_mode: "HTML" } : {}),
      reply_markup: markup,
    })
  } else {
    await telegram.sendVideo(ctx.chat!.id, draft.telegram_file_id, {
      ...(text ? { caption: text, parse_mode: "HTML" } : {}),
      reply_markup: markup,
    })
  }
  await ctx.reply("👀 Preview\n\nThe preview above uses the same formatting and buttons that publishing will use.", {
    reply_markup: previewKeyboard(),
  })
}

async function showTemplates(ctx: Context, repository: Repository): Promise<void> {
  const saved = await repository.listTemplates(userId(ctx))
  await ctx.reply("Choose a template to apply to your active draft:", { reply_markup: templatesKeyboard(saved) })
}

function getMessageText(message: Message.TextMessage): string {
  return message.text.trim()
}

function isAdminMember(member: { status: string; can_post_messages?: boolean }): boolean {
  return member.status === "creator" || (member.status === "administrator" && member.can_post_messages !== false)
}

type PublishablePost = Pick<Draft, "content_type" | "body" | "caption" | "telegram_file_id" | "buttons">

async function sendPost(telegram: TelegramService, chatId: number, post: PublishablePost): Promise<{ message_id: number }> {
  const text = draftText(post)
  const markup = postButtonsKeyboard(post.buttons)
  if (post.content_type === "text") return telegram.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: markup })
  if (post.content_type === "photo") {
    return telegram.sendPhoto(chatId, post.telegram_file_id!, {
      ...(text ? { caption: text, parse_mode: "HTML" } : {}),
      reply_markup: markup,
    })
  }
  return telegram.sendVideo(chatId, post.telegram_file_id!, {
    ...(text ? { caption: text, parse_mode: "HTML" } : {}),
    reply_markup: markup,
  })
}

async function verifyTargetPermission(telegram: TelegramService, target: PublishTarget): Promise<boolean> {
  const me = await telegram.getMe()
  const member = await telegram.getChatMember(target.chat_id, me.id)
  return isAdminMember(member as { status: string; can_post_messages?: boolean })
}

async function publishDraft(
  ctx: Context,
  repository: Repository,
  telegram: TelegramService,
  target: { chatId: number; label: string; stored?: PublishTarget },
): Promise<void> {
  const id = await ensureUser(ctx, repository)
  const draft = await repository.getDraft(id)
  if (!draft) {
    await ctx.reply("There is no active draft. Use /create to begin.", { reply_markup: mainMenuKeyboard() })
    return
  }
  if (draft.content_type === "text" ? !draft.body?.trim() : !draft.telegram_file_id) {
    await ctx.reply("Your draft is missing content. Choose Edit Content to finish it.", { reply_markup: previewKeyboard() })
    return
  }

  if (target.stored) {
    try {
      if (!(await verifyTargetPermission(telegram, target.stored))) {
        await ctx.reply("⚠️ I couldn't publish this because I don't have permission in that chat.", { reply_markup: previewKeyboard() })
        return
      }
    } catch {
      await ctx.reply("⚠️ I couldn't verify my permission in that chat. Your draft is still safe.", { reply_markup: previewKeyboard() })
      return
    }
  }

  const post = await repository.createPost(draft)
  const publication = await repository.claimPublication(post.id, id, target.chatId)
  if (!publication) {
    await ctx.reply("This post is already published or is currently being published to that target.", { reply_markup: mainMenuKeyboard() })
    return
  }

  try {
    const sent = await sendPost(telegram, target.chatId, draft)
    await repository.updatePublication(publication.id, { status: "published", telegram_message_id: sent.message_id })
    await repository.updatePostStatus(post.id, "published")
    await repository.deleteDraft(draft.id)
    await ctx.reply(`✅ Published to ${target.label}.\nMessage ID: ${sent.message_id}`, { reply_markup: mainMenuKeyboard() })
  } catch (error) {
    await repository.updatePublication(publication.id, {
      status: "failed",
      error_code: "TELEGRAM_API_ERROR",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
    })
    await repository.updatePostStatus(post.id, "failed")
    await ctx.reply("⚠️ Telegram could not publish this post. Your draft is still safe; fix the issue and try again.", {
      reply_markup: previewKeyboard(),
    })
  }
}

async function scheduleDraft(
  ctx: Context,
  repository: Repository,
  telegram: TelegramService,
  target: { chatId: number; label: string; stored?: PublishTarget },
): Promise<void> {
  const id = await ensureUser(ctx, repository)
  const draft = await repository.getDraft(id)
  if (!draft) throw new Error("Draft not found")
  if (draft.content_type === "text" ? !draft.body?.trim() : !draft.telegram_file_id) {
    await ctx.reply("Your draft is missing content. Choose Edit Content to finish it.", { reply_markup: previewKeyboard() })
    return
  }
  if (target.stored) {
    try {
      if (!(await verifyTargetPermission(telegram, target.stored))) {
        await ctx.reply("⚠️ I couldn't schedule this because I don't have permission in that chat.", { reply_markup: previewKeyboard() })
        return
      }
    } catch {
      await ctx.reply("⚠️ I couldn't verify my permission in that chat. Your draft is still safe.", { reply_markup: previewKeyboard() })
      return
    }
  }
  await repository.updateDraft(draft.id, {
    state: "waiting_schedule_time",
    metadata: { ...draft.metadata, scheduleChatId: target.chatId, scheduleLabel: target.label },
  })
  await ctx.reply(`Send the UTC time for ${target.label} in YYYY-MM-DD HH:MM format.\nExample: 2026-09-01 18:30`, {
    reply_markup: cancelKeyboard(),
  })
}

async function publishToAllTargets(ctx: Context, repository: Repository, telegram: TelegramService): Promise<void> {
  const id = await ensureUser(ctx, repository)
  const draft = await repository.getDraft(id)
  if (!draft) {
    await ctx.reply("There is no active draft. Use /create to begin.", { reply_markup: mainMenuKeyboard() })
    return
  }
  if (draft.content_type === "text" ? !draft.body?.trim() : !draft.telegram_file_id) {
    await ctx.reply("Your draft is missing content. Choose Edit Content to finish it.", { reply_markup: previewKeyboard() })
    return
  }
  const targets = await repository.listTargets(id)
  if (targets.length < 2) {
    await ctx.reply("Register at least two publishing targets before using channel sync.", { reply_markup: previewKeyboard() })
    return
  }

  const post = await repository.createPost(draft)
  const published: string[] = []
  const failed: string[] = []
  for (const target of targets) {
    const label = target.chat_title || target.chat_username || String(target.chat_id)
    try {
      if (!(await verifyTargetPermission(telegram, target))) {
        failed.push(`${label} (permission)`)
        continue
      }
      const publication = await repository.claimPublication(post.id, id, target.chat_id)
      if (!publication) continue
      const sent = await sendPost(telegram, target.chat_id, draft)
      await repository.updatePublication(publication.id, { status: "published", telegram_message_id: sent.message_id })
      published.push(label)
    } catch (error) {
      failed.push(label)
      console.error("Channel sync publish failed", { target: target.chat_id, message: error instanceof Error ? error.message : "unknown error" })
    }
  }

  if (published.length) await repository.updatePostStatus(post.id, "published")
  else await repository.updatePostStatus(post.id, "failed")
  if (!failed.length) await repository.deleteDraft(draft.id)
  const details = [published.length ? `Published to: ${published.join(", ")}` : "No target was published.", failed.length ? `Needs attention: ${failed.join(", ")}` : ""]
  await ctx.reply(`📡 Channel sync complete.\n\n${details.filter(Boolean).join("\n")}${failed.length ? "\n\nYour draft is still safe so you can retry the failed targets." : ""}`, {
    reply_markup: failed.length ? previewKeyboard() : mainMenuKeyboard(),
  })
}

async function showScheduled(ctx: Context, repository: Repository): Promise<void> {
  const posts = await repository.listScheduledPosts(userId(ctx))
  if (!posts.length) {
    await ctx.reply("You have no scheduled posts.", { reply_markup: mainMenuKeyboard() })
    return
  }
  await ctx.reply(
    posts.map((post, index) => `${index + 1}. ${new Date(post.scheduled_for).toISOString().replace("T", " ").slice(0, 16)} UTC · ${post.status}`).join("\n"),
    { reply_markup: scheduledPostsKeyboard(posts) },
  )
}

async function clonePost(ctx: Context, repository: Repository, postId: string): Promise<void> {
  const id = await ensureUser(ctx, repository)
  const active = await repository.getDraft(id)
  if (active) {
    await ctx.reply("Finish or cancel your active draft before cloning another post.", { reply_markup: draftConflictKeyboard() })
    return
  }
  const post = await repository.getPostForUser(postId, id)
  if (!post) throw new Error("That post is no longer available")
  const draft = await repository.createDraft(id, post.content_type, "button_menu")
  const cloned = await repository.updateDraft(draft.id, {
    body: post.body,
    caption: post.caption,
    telegram_file_id: post.telegram_file_id,
    buttons: post.buttons,
    state: "button_menu",
  })
  await showButtonMenu(ctx, repository, cloned)
}

export function buildBot(repository: Repository, token: string): Bot<Context> {
  const bot = new Bot<Context>(token)
  const telegram = new TelegramService(bot.api)

  bot.command("start", async (ctx) => {
    try {
      const id = await ensureUser(ctx, repository)
      const draft = await repository.getDraft(id)
      if (draft) {
        await ctx.reply("Welcome back. You have an active draft.", { reply_markup: draftConflictKeyboard() })
      } else {
        await ctx.reply("Welcome to POST BOT. Create clean Telegram posts with real clickable buttons.", { reply_markup: mainMenuKeyboard() })
      }
    } catch (error) {
      await replyError(ctx, error)
    }
  })

  bot.command("help", async (ctx) => ctx.reply(HELP_TEXT, { reply_markup: mainMenuKeyboard() }))
  bot.command("create", async (ctx) => {
    try {
      await startDraft(ctx, repository)
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("quickpublish", async (ctx) => {
    try {
      await startQuickPublish(ctx, repository, typeof ctx.match === "string" ? ctx.match.trim() : "")
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("buttons", async (ctx) => {
    try {
      await startButtonBuilder(ctx, repository)
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("templates", async (ctx) => {
    try {
      await ensureUser(ctx, repository)
      await showTemplates(ctx, repository)
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("settings", async (ctx) => {
    try {
      await ensureUser(ctx, repository)
      await ctx.reply("Settings\n\nYour drafts and templates stay on the server only for bot operation. You can delete active drafts below.", {
        reply_markup: settingsKeyboard(),
      })
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("posts", async (ctx) => {
    try {
      const posts = await repository.listPosts(await ensureUser(ctx, repository))
      if (!posts.length) {
        await ctx.reply("You have no published posts yet.", { reply_markup: mainMenuKeyboard() })
        return
      }
      await ctx.reply(posts.map((post, index) => `${index + 1}. ${post.content_type} · ${post.status} · ${post.created_at.slice(0, 10)}`).join("\n"), {
        reply_markup: postsKeyboard(posts),
      })
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("scheduled", async (ctx) => {
    try {
      await ensureUser(ctx, repository)
      await showScheduled(ctx, repository)
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("cancel", async (ctx) => {
    try {
      const draft = await repository.getDraft(await ensureUser(ctx, repository))
      if (draft) await repository.deleteDraft(draft.id)
      await ctx.reply("Current draft cancelled.", { reply_markup: mainMenuKeyboard() })
    } catch (error) {
      await replyError(ctx, error)
    }
  })
  bot.command("register", async (ctx) => {
    try {
      const id = await ensureUser(ctx, repository)
      if (!ctx.chat || ctx.chat.type === "private") {
        await ctx.reply("Use /register inside the group or channel where you want to publish.", { reply_markup: mainMenuKeyboard() })
        return
      }
      const member = await telegram.getChatMember(ctx.chat.id, id)
      if (!isAdminMember(member as { status: string; can_post_messages?: boolean })) {
        await ctx.reply("Only a chat administrator who can post can register this target.")
        return
      }
      const chat = await telegram.getChat(ctx.chat.id)
      await repository.registerTarget({
        telegram_user_id: id,
        chat_id: chat.id,
        chat_title: "title" in chat ? chat.title ?? null : null,
        chat_username: "username" in chat ? chat.username ?? null : null,
        chat_type: chat.type,
        can_post: true,
      })
      await ctx.reply("✅ This chat is now available as a publishing target.", { reply_markup: mainMenuKeyboard() })
    } catch (error) {
      await replyError(ctx, error)
    }
  })

  bot.callbackQuery(/.*/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery()
      const data = ctx.callbackQuery.data
      const id = await ensureUser(ctx, repository)

      if (data === "flow:cancel") {
        const draft = await repository.getDraft(id)
        if (draft) await repository.deleteDraft(draft.id)
        await ctx.reply("Current draft cancelled.", { reply_markup: mainMenuKeyboard() })
        return
      }
      if (data === "draft:restart") {
        await startDraft(ctx, repository, true)
        return
      }
      if (data === "draft:continue") {
        const draft = await repository.getDraft(id)
        if (!draft) {
          await startDraft(ctx, repository, true)
        } else if (draft.state === "preview") {
          await sendPreview(ctx, telegram, draft)
        } else if (draft.state === "button_menu") {
          await showButtonMenu(ctx, repository, draft)
        } else {
          await ctx.reply("Your draft is waiting for the next step. Use /cancel to abandon it safely.", { reply_markup: cancelKeyboard() })
        }
        return
      }
      if (data === "menu:create") return startDraft(ctx, repository)
      if (data === "menu:buttons") return startButtonBuilder(ctx, repository)
      if (data === "menu:quickpublish") return startQuickPublish(ctx, repository)
      if (data === "menu:templates") return showTemplates(ctx, repository)
      if (data === "menu:home") return showMainMenu(ctx)
      if (data === "menu:help") return ctx.reply(HELP_TEXT, { reply_markup: mainMenuKeyboard() })
      if (data === "menu:settings") return ctx.reply("Settings\n\nDelete your active draft whenever you need.", { reply_markup: settingsKeyboard() })
      if (data === "menu:posts") {
        const posts = await repository.listPosts(id)
        await ctx.reply(posts.length ? posts.map((post, index) => `${index + 1}. ${post.content_type} · ${post.status}`).join("\n") : "You have no published posts yet.", {
          reply_markup: posts.length ? postsKeyboard(posts) : mainMenuKeyboard(),
        })
        return
      }
      if (data === "menu:scheduled") return showScheduled(ctx, repository)
      if (data.startsWith("content:")) {
        const contentType = data.slice("content:".length) as ContentType
        if (!["text", "photo", "video"].includes(contentType)) throw new Error("Invalid content type")
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        const state = contentType === "text" ? "waiting_content" : "waiting_media"
        await repository.updateDraft(draft.id, {
          content_type: contentType,
          body: contentType === "text" ? draft.body : null,
          caption: contentType === "text" ? null : draft.caption,
          telegram_file_id: contentType === "text" ? null : draft.telegram_file_id,
          telegram_file_unique_id: contentType === "text" ? null : draft.telegram_file_unique_id,
          state,
        })
        await ctx.reply(
          contentType === "text" ? "Send the post body. Formatting such as **bold** and __italic__ is supported." : `Send the ${contentType} now.`,
          { reply_markup: cancelKeyboard() },
        )
        return
      }
      if (data === "button:add:url") {
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        if (draft.buttons.length >= 8) {
          await ctx.reply("A post can have up to 8 buttons in V1.", { reply_markup: buttonMenuKeyboard(draft.buttons) })
          return
        }
        await repository.updateDraft(draft.id, { state: "waiting_button_label", metadata: metadataWithout(draft, "pendingButtonLabel") })
        await ctx.reply("Send the visible label for the button, for example: Visit website", { reply_markup: cancelKeyboard() })
        return
      }
      if (data === "button:clear") {
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { buttons: [] }))
        return
      }
      if (data === "caption:skip") {
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { caption: null, state: "button_menu" }))
        return
      }
      if (data === "button:done" || data === "button:skip") {
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        if (draft.content_type === "text" ? !draft.body?.trim() : !draft.telegram_file_id) {
          await ctx.reply("Add your content before previewing.", { reply_markup: cancelKeyboard() })
          return
        }
        const next = await repository.updateDraft(draft.id, { state: "preview" })
        await sendPreview(ctx, telegram, next)
        return
      }
      const move = data.match(/^button:move:(up|down):(\d+)$/)
      if (move) {
        const draft = await repository.getDraft(id)
        const index = Number.parseInt(move[2]!, 10)
        if (!draft || !draft.buttons[index]) throw new Error("That button is no longer available")
        const delta = move[1] === "up" ? -1 : 1
        const nextIndex = index + delta
        if (nextIndex < 0 || nextIndex >= draft.buttons.length) {
          await showButtonMenu(ctx, repository, draft)
          return
        }
        await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { buttons: reorderButtons(draft.buttons, index, nextIndex) }))
        return
      }
      if (data.startsWith("button:delete:")) {
        const index = Number.parseInt(data.slice("button:delete:".length), 10)
        const draft = await repository.getDraft(id)
        if (!draft || !Number.isInteger(index) || !draft.buttons[index]) throw new Error("That button is no longer available")
        const buttons = draft.buttons.filter((_, current) => current !== index).map((button, current) => ({ ...button, row: Math.floor(current / 2), position: current % 2 }))
        await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { buttons }))
        return
      }
      if (data.startsWith("button:edit:")) {
        const index = Number.parseInt(data.slice("button:edit:".length), 10)
        const draft = await repository.getDraft(id)
        if (!draft || !Number.isInteger(index) || !draft.buttons[index]) throw new Error("That button is no longer available")
        await repository.updateDraft(draft.id, {
          state: "waiting_button_label",
          metadata: { ...draft.metadata, editingButtonIndex: index },
        })
        await ctx.reply("Send the new visible label for this button.", { reply_markup: cancelKeyboard() })
        return
      }
      if (data === "preview:edit_content") {
        const draft = await repository.getDraft(id)
        if (draft) await editContentPrompt(ctx, repository, draft)
        return
      }
      if (data === "preview:edit_buttons") {
        const draft = await repository.getDraft(id)
        if (draft) await showButtonMenu(ctx, repository, draft)
        return
      }
      if (data === "preview:refresh") {
        const draft = await repository.getDraft(id)
        if (draft) await sendPreview(ctx, telegram, draft)
        return
      }
      if (data === "preview:template") return showTemplates(ctx, repository)
      if (data === "preview:schedule") {
        const targets = await repository.listTargets(id)
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        await repository.updateDraft(draft.id, { state: "publish_target" })
        await ctx.reply("Choose where to schedule this post. The bot will verify its permission first.", {
          reply_markup: publishTargetsKeyboard(targets, "schedule"),
        })
        return
      }
      if (data === "preview:publish") {
        const targets = await repository.listTargets(id)
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        await repository.updateDraft(draft.id, { state: "publish_target" })
        await ctx.reply(targets.length ? "Choose where to publish. The bot will verify its permission first." : "Choose a target. Register a group or channel with /register there before publishing.", {
          reply_markup: publishTargetsKeyboard(targets),
        })
        return
      }
      if (data === "publish:all") {
        await publishToAllTargets(ctx, repository, telegram)
        return
      }
      if (data === "publish:self") {
        await publishDraft(ctx, repository, telegram, { chatId: ctx.chat!.id, label: "your private chat" })
        return
      }
      if (data.startsWith("publish:target:")) {
        const target = await repository.getTarget(data.slice("publish:target:".length), id)
        if (!target) throw new Error("That publishing target is not available")
        await publishDraft(ctx, repository, telegram, { chatId: target.chat_id, label: target.chat_title || String(target.chat_id), stored: target })
        return
      }
      if (data === "schedule:self") {
        await scheduleDraft(ctx, repository, telegram, { chatId: ctx.chat!.id, label: "your private chat" })
        return
      }
      if (data.startsWith("schedule:target:")) {
        const target = await repository.getTarget(data.slice("schedule:target:".length), id)
        if (!target) throw new Error("That scheduling target is not available")
        await scheduleDraft(ctx, repository, telegram, { chatId: target.chat_id, label: target.chat_title || String(target.chat_id), stored: target })
        return
      }
      if (data.startsWith("schedule:cancel:")) {
        const cancelled = await repository.cancelScheduledPost(data.slice("schedule:cancel:".length), id)
        await ctx.reply(cancelled ? "✅ Scheduled post cancelled." : "That scheduled post is no longer pending.", { reply_markup: mainMenuKeyboard() })
        return
      }
      if (data.startsWith("post:clone:")) {
        await clonePost(ctx, repository, data.slice("post:clone:".length))
        return
      }
      if (data.startsWith("template:preset:")) {
        const preset = PRESETS[Number.parseInt(data.slice("template:preset:".length), 10)]
        const draft = (await repository.getDraft(id)) ?? await repository.createDraft(id, "text", "button_menu")
        if (!preset) throw new Error("That template is no longer available")
        const next = await repository.updateDraft(draft.id, { content_type: preset.content_type, body: preset.body, caption: null, telegram_file_id: null, telegram_file_unique_id: null, buttons: preset.buttons, state: "button_menu" })
        await showButtonMenu(ctx, repository, next)
        return
      }
      if (data.startsWith("template:saved:")) {
        const template = await repository.getTemplate(data.slice("template:saved:".length), id)
        const draft = (await repository.getDraft(id)) ?? await repository.createDraft(id, "text", "button_menu")
        if (!template) throw new Error("That template is no longer available")
        const next = await repository.updateDraft(draft.id, { content_type: template.content_type, body: template.body, caption: template.caption, buttons: template.buttons, state: "button_menu" })
        await showButtonMenu(ctx, repository, next)
        return
      }
      if (data === "template:save") {
        const draft = await repository.getDraft(id)
        if (!draft) throw new Error("Draft not found")
        await repository.updateDraft(draft.id, { state: "waiting_template_name" })
        await ctx.reply("Send a name for this template.", { reply_markup: cancelKeyboard() })
        return
      }
      if (data === "settings:clear_drafts") {
        const draft = await repository.getDraft(id)
        if (draft) await repository.deleteDraft(draft.id)
        await ctx.reply("Active drafts deleted. Saved posts and templates were not changed.", { reply_markup: mainMenuKeyboard() })
        return
      }
      await ctx.reply("That action is no longer available. Use /start to open the menu.", { reply_markup: mainMenuKeyboard() })
    } catch (error) {
      await replyError(ctx, error)
    }
  })

  bot.on("message:photo", async (ctx) => {
    try {
      const id = await ensureUser(ctx, repository)
      let draft = await repository.getDraft(id)
      if (!draft) draft = await repository.createDraft(id, "photo", "waiting_caption")
      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      if (!photo) throw new Error("Photo is missing")
      draft = await repository.updateDraft(draft.id, {
        content_type: "photo",
        telegram_file_id: photo.file_id,
        telegram_file_unique_id: photo.file_unique_id,
        state: "waiting_caption",
      })
      await ctx.reply("✅ Photo added. Send a caption, or skip it.", { reply_markup: skipKeyboard("caption:skip") })
    } catch (error) {
      await replyError(ctx, error)
    }
  })

  bot.on("message:video", async (ctx) => {
    try {
      const id = await ensureUser(ctx, repository)
      let draft = await repository.getDraft(id)
      if (!draft) draft = await repository.createDraft(id, "video", "waiting_caption")
      draft = await repository.updateDraft(draft.id, {
        content_type: "video",
        telegram_file_id: ctx.message.video.file_id,
        telegram_file_unique_id: ctx.message.video.file_unique_id,
        state: "waiting_caption",
      })
      await ctx.reply("✅ Video added. Send a caption, or skip it.", { reply_markup: skipKeyboard("caption:skip") })
    } catch (error) {
      await replyError(ctx, error)
    }
  })

  bot.on("message:text", async (ctx) => {
    try {
      const id = await ensureUser(ctx, repository)
      const text = getMessageText(ctx.message)
      const draft = await repository.getDraft(id)
      if (!draft) {
        await ctx.reply("Use /create to make a post, or choose an action below.", { reply_markup: mainMenuKeyboard() })
        return
      }
      if (draft.state === "waiting_content") {
        await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { body: text, state: "button_menu" }))
      } else if (draft.state === "waiting_caption") {
        await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { caption: text, state: "button_menu" }))
      } else if (draft.state === "waiting_button_label") {
        const label = validateButtonLabel(text)
        const next = await repository.updateDraft(draft.id, { state: "waiting_button_url", metadata: { ...draft.metadata, pendingButtonLabel: label } })
        await ctx.reply("Now send the full HTTPS URL, for example https://example.com", { reply_markup: cancelKeyboard() })
        void next
      } else if (draft.state === "waiting_button_url") {
        const url = validateHttpsUrl(text)
        const label = typeof draft.metadata.pendingButtonLabel === "string" ? draft.metadata.pendingButtonLabel : "Open link"
        const index = typeof draft.metadata.editingButtonIndex === "number" ? draft.metadata.editingButtonIndex : undefined
        const buttons = index === undefined
          ? addButton(draft.buttons, { label, url, type: "url" })
          : draft.buttons.map((button, current) => current === index ? { ...button, label, url, type: "url" as const } : button)
        await showButtonMenu(ctx, repository, await repository.updateDraft(draft.id, { buttons, metadata: metadataWithout(draft, "pendingButtonLabel", "editingButtonIndex"), state: "button_menu" }))
      } else if (draft.state === "waiting_schedule_time") {
        const chatId = typeof draft.metadata.scheduleChatId === "number" ? draft.metadata.scheduleChatId : 0
        const label = typeof draft.metadata.scheduleLabel === "string" ? draft.metadata.scheduleLabel : "the selected chat"
        if (!chatId) throw new Error("Scheduling target is missing")
        const scheduledFor = parseScheduleTime(text)
        await repository.schedulePost(draft, chatId, scheduledFor)
        await repository.deleteDraft(draft.id)
        await ctx.reply(`✅ Scheduled for ${scheduledFor.replace("T", " ").slice(0, 16)} UTC in ${label}.`, { reply_markup: mainMenuKeyboard() })
      } else if (draft.state === "waiting_template_name") {
        const name = text.slice(0, 80)
        if (!name) throw new Error("Please send a template name.")
        await repository.saveTemplate({ telegram_user_id: id, name, content_type: draft.content_type, body: draft.body, caption: draft.caption, buttons: draft.buttons })
        await ctx.reply("✅ Template saved.", { reply_markup: mainMenuKeyboard() })
      } else {
        await ctx.reply("Use the buttons above for the next step, or use /cancel to leave this flow.", { reply_markup: cancelKeyboard() })
      }
    } catch (error) {
      await replyError(ctx, error)
    }
  })

  return bot
}

function addButton(buttons: ButtonDefinition[], button: Omit<ButtonDefinition, "row" | "position">): ButtonDefinition[] {
  const index = buttons.length
  return [...buttons, { ...button, row: Math.floor(index / 2), position: index % 2 }]
}

function reorderButtons(buttons: ButtonDefinition[], from: number, to: number): ButtonDefinition[] {
  const next = [...buttons]
  const [moved] = next.splice(from, 1)
  if (!moved) return buttons
  next.splice(to, 0, moved)
  return next.map((button, index) => ({ ...button, row: Math.floor(index / 2), position: index % 2 }))
}
