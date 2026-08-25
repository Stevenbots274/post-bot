import type { Api } from "grammy"
import type { InlineKeyboard } from "grammy"

export class TelegramService {
  constructor(private readonly api: Api) {}

  sendMessage(chatId: number, text: string, options: Record<string, unknown> = {}) {
    return this.api.sendMessage(chatId, text, options as never)
  }

  sendPhoto(chatId: number, fileId: string, options: Record<string, unknown> = {}) {
    return this.api.sendPhoto(chatId, fileId, options as never)
  }

  sendVideo(chatId: number, fileId: string, options: Record<string, unknown> = {}) {
    return this.api.sendVideo(chatId, fileId, options as never)
  }

  sendChatAction(chatId: number, action: "typing" | "upload_photo" | "upload_video") {
    return this.api.sendChatAction(chatId, action)
  }

  getChat(chatId: number) {
    return this.api.getChat(chatId)
  }

  getChatMember(chatId: number, userId: number) {
    return this.api.getChatMember(chatId, userId)
  }

  getMe() {
    return this.api.getMe()
  }

  // Keeps the allowed markup type visible at the service boundary.
  static keyboard(value: InlineKeyboard): InlineKeyboard {
    return value
  }
}
