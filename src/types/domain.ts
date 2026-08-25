export type ContentType = "text" | "photo" | "video"

export type DraftState =
  | "creating"
  | "waiting_content"
  | "waiting_media"
  | "waiting_caption"
  | "button_menu"
  | "waiting_button_label"
  | "waiting_button_url"
  | "waiting_wa_phone"
  | "waiting_wa_message"
  | "preview"
  | "publish_target"
  | "publishing"
  | "waiting_template_name"

export interface ButtonDefinition {
  label: string
  url: string
  row: number
  position: number
  type?: "web" | "whatsapp"
}

export interface Draft {
  id: string
  telegram_user_id: number
  content_type: ContentType
  body: string | null
  caption: string | null
  telegram_file_id: string | null
  telegram_file_unique_id: string | null
  buttons: ButtonDefinition[]
  state: DraftState
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PublishTarget {
  id: string
  telegram_user_id: number
  chat_id: number
  chat_title: string | null
  chat_username: string | null
  chat_type: string | null
  can_post: boolean
}

export interface Template {
  id: string
  telegram_user_id: number
  name: string
  content_type: ContentType
  body: string | null
  caption: string | null
  buttons: ButtonDefinition[]
  is_public: boolean
}

export interface TelegramUser {
  id: number
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
}
