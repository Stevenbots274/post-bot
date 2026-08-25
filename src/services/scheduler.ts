import type { Repository } from "../db/repository.js"
import { draftText } from "./formatter.js"
import { TelegramService } from "./telegram.js"
import { postButtonsKeyboard } from "../bot/keyboards.js"

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly repository: Repository, private readonly telegram: TelegramService) {}

  start(): void {
    void this.processDue()
    this.timer = setInterval(() => void this.processDue(), 30_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async processDue(): Promise<void> {
    let due
    try {
      due = await this.repository.listDueSchedules()
    } catch (error) {
      console.error("Could not load scheduled posts", error instanceof Error ? error.message : "unknown error")
      return
    }
    for (const candidate of due) {
      const schedule = await this.repository.claimSchedule(candidate.id)
      if (!schedule) continue
      const post = await this.repository.getPost(schedule.post_id)
      if (!post) {
        await this.repository.updateScheduledPost(schedule.id, { status: "failed", error_message: "post not found" })
        continue
      }
      const publication = await this.repository.claimPublication(post.id, schedule.telegram_user_id, schedule.chat_id)
      if (!publication) {
        await this.repository.updateScheduledPost(schedule.id, { status: "published" })
        continue
      }
      try {
        const text = draftText(post)
        const markup = postButtonsKeyboard(post.buttons)
        let sent: { message_id: number }
        if (post.content_type === "text") {
          sent = await this.telegram.sendMessage(schedule.chat_id, text, { parse_mode: "HTML", reply_markup: markup })
        } else if (post.content_type === "photo") {
          sent = await this.telegram.sendPhoto(schedule.chat_id, post.telegram_file_id!, {
            ...(text ? { caption: text, parse_mode: "HTML" } : {}),
            reply_markup: markup,
          })
        } else if (post.content_type === "video") {
          sent = await this.telegram.sendVideo(schedule.chat_id, post.telegram_file_id!, {
            ...(text ? { caption: text, parse_mode: "HTML" } : {}),
            reply_markup: markup,
          })
        } else {
          sent = await this.telegram.sendAnimation(schedule.chat_id, post.telegram_file_id!, {
            ...(text ? { caption: text, parse_mode: "HTML" } : {}),
            reply_markup: markup,
          })
        }
        await this.repository.updatePublication(publication.id, { status: "published", telegram_message_id: sent.message_id })
        await this.repository.updatePostStatus(post.id, "published")
        await this.repository.updateScheduledPost(schedule.id, { status: "published", telegram_message_id: sent.message_id })
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "unknown error"
        await this.repository.updatePublication(publication.id, { status: "failed", error_code: "TELEGRAM_API_ERROR", error_message: message })
        await this.repository.updatePostStatus(post.id, "failed")
        await this.repository.updateScheduledPost(schedule.id, { status: "failed", error_message: message })
        console.error("Scheduled publish failed", { scheduleId: schedule.id, message })
      }
    }
  }
}
