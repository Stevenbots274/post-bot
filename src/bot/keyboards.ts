import { InlineKeyboard } from "grammy"
import type { ButtonDefinition, PublishTarget, ScheduledPost, Template } from "../types/domain.js"

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Create Post", "menu:create")
    .text("🔘 Button Builder", "menu:buttons")
    .row()
    .text("🧩 Templates", "menu:templates")
    .text("📚 My Posts", "menu:posts")
    .row()
    .text("📅 Scheduled", "menu:scheduled")
    .text("⚙️ Settings", "menu:settings")
    .row()
    .text("❓ Help", "menu:help")
}

export function contentTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Text Post", "content:text")
    .row()
    .text("🖼️ Photo Post", "content:photo")
    .text("🎥 Video Post", "content:video")
    .row()
    .text("❌ Cancel", "flow:cancel")
}

export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("❌ Cancel", "flow:cancel")
}

export function draftConflictKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Start New", "draft:restart")
    .text("↩️ Continue", "draft:continue")
    .row()
    .text("❌ Cancel", "flow:cancel")
}

export function skipKeyboard(callbackData: string): InlineKeyboard {
  return new InlineKeyboard().text("⏭️ Skip", callbackData).text("❌ Cancel", "flow:cancel")
}

export function buttonMenuKeyboard(buttons: ButtonDefinition[]): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  buttons.forEach((button, index) => {
    keyboard
      .text("⬆️", `button:move:up:${index}`)
      .text("⬇️", `button:move:down:${index}`)
      .text(`✏️ ${index + 1}`, `button:edit:${index}`)
      .text(`🗑️ ${index + 1}`, `button:delete:${index}`)
      .row()
  })
  keyboard
    .text("🔗 URL Button", "button:add:url")
    .row()
    .text("🧹 Clear Buttons", "button:clear")
    .text("✅ Done", "button:done")
    .row()
    .text("⏭️ Skip", "button:skip")
    .text("❌ Cancel", "flow:cancel")
  return keyboard
}

export function postButtonsKeyboard(buttons: ButtonDefinition[]): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  const rows = new Map<number, ButtonDefinition[]>()
  for (const button of buttons) rows.set(button.row, [...(rows.get(button.row) ?? []), button])
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    for (const button of (rows.get(row) ?? []).sort((a, b) => a.position - b.position)) {
      keyboard.url(button.label, button.url)
    }
    keyboard.row()
  }
  return keyboard
}

export function previewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Edit Content", "preview:edit_content")
    .text("🔘 Edit Buttons", "preview:edit_buttons")
    .row()
    .text("🧩 Add Template", "preview:template")
    .text("💾 Save Template", "template:save")
    .row()
    .text("⏰ Schedule", "preview:schedule")
    .text("👀 Refresh Preview", "preview:refresh")
    .text("📤 Publish", "preview:publish")
    .row()
    .text("❌ Cancel", "flow:cancel")
}

export function publishTargetsKeyboard(targets: PublishTarget[], action: "publish" | "schedule" = "publish"): InlineKeyboard {
  const selfAction = action === "schedule" ? "schedule:self" : "publish:self"
  const targetAction = action === "schedule" ? "schedule:target:" : "publish:target:"
  const keyboard = new InlineKeyboard().text(action === "schedule" ? "📨 Schedule for me" : "📨 Send to me", selfAction).row()
  for (const target of targets) {
    const name = target.chat_title || (target.chat_username ? `@${target.chat_username}` : String(target.chat_id))
    keyboard.text(`📣 ${name.slice(0, 40)}`, `${targetAction}${target.id}`).row()
  }
  keyboard.text("❌ Cancel", "flow:cancel")
  return keyboard
}

export function scheduledPostsKeyboard(posts: ScheduledPost[]): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  for (const post of posts) {
    const time = new Date(post.scheduled_for).toISOString().replace("T", " ").slice(0, 16)
    keyboard.text(`🗑️ Cancel ${time} UTC`, `schedule:cancel:${post.id}`).row()
  }
  keyboard.text("⬅️ Main Menu", "menu:home")
  return keyboard
}

export function templatesKeyboard(saved: Template[]): InlineKeyboard {
  const presets = ["Product", "Sale", "Announcement", "Event", "New Post"]
  const keyboard = new InlineKeyboard()
  presets.forEach((name, index) => keyboard.text(`🧩 ${name}`, `template:preset:${index}`).row())
  saved.forEach((template) => keyboard.text(`📌 ${template.name.slice(0, 35)}`, `template:saved:${template.id}`).row())
  keyboard.text("❌ Cancel", "flow:cancel")
  return keyboard
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🧹 Delete My Drafts", "settings:clear_drafts").row().text("❌ Cancel", "flow:cancel")
}
