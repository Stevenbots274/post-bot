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

  sendAnimation(chatId: number, fileId: string, options: Record<string, unknown> = {}) {
    return this.api.sendAnimation(chatId, fileId, options as never)
  }

  editMessageText(chatId: number, messageId: number, text: string, options: Record<string, unknown> = {}) {
    return this.api.editMessageText(chatId, messageId, text, options as never)
  }

  editMessageCaption(chatId: number, messageId: number, options: Record<string, unknown> = {}) {
    return this.api.editMessageCaption(chatId, messageId, options as never)
  }

  editMessageMedia(chatId: number, messageId: number, media: Record<string, unknown>, options: Record<string, unknown> = {}) {
    return this.api.editMessageMedia(chatId, messageId, { media, ...options } as never)
  }

  deleteMessage(chatId: number, messageId: number) {
    return this.api.deleteMessage(chatId, messageId)
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
