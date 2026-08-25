import type { ContentType, Draft } from "../types/domain.js"
import { validateHttpsUrl } from "./validation.js"

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** Converts the small supported input dialect into one Telegram HTML representation. */
export function formatTelegramHtml(input: string): string {
  let output = escapeHtml(input)

  output = output.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (match, label: string, url: string) => {
    try {
      return `<a href="${validateHttpsUrl(url).replaceAll('"', "&quot;")}">${label}</a>`
    } catch {
      return match
    }
  })
  output = output.replace(/`([^`\n]+)`/g, "<code>$1</code>")
  output = output.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
  output = output.replace(/__([^_\n]+)__/g, "<i>$1</i>")
  output = output.replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
  return output
}

export function draftText(draft: Pick<Draft, "content_type" | "body" | "caption">): string {
  const raw = draft.content_type === ("text" satisfies ContentType) ? draft.body : draft.caption
  return formatTelegramHtml(raw || "")
}
