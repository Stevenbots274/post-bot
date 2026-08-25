# POST BOT — Architecture Blueprint

## Components

Telegram User
    ↓
Telegram Bot API
    ↓ webhook
POST BOT API
    ├── Telegram update handler
    ├── Conversation/state manager
    ├── Post builder
    ├── Button builder
    ├── Formatter/parser
    ├── Preview service
    ├── Publisher
    ├── Validation/security
    └── Database repository
             ↓
        Supabase PostgreSQL

## Suggested modules

src/
  bot/
    commands/
    callbacks/
    handlers/
    keyboards/
    middleware/
  features/
    create-post/
    buttons/
    templates/
    publishing/
    settings/
  services/
    telegram/
    formatter/
    schedule/
    validation/
  db/
    repositories/
    migrations/
  lib/
  config/
  types/
  index.ts

## State machine

IDLE
 → CREATING
 → WAITING_CONTENT
 → WAITING_MEDIA/CAPTION
 → BUTTON_MENU
 → WAITING_BUTTON_LABEL
 → WAITING_BUTTON_URL
 → PREVIEW
 → PUBLISH_TARGET
 → PUBLISHING
 → PUBLISHED

At any state:
CANCEL → IDLE
START → confirm restart, then IDLE

Store state server-side so webhook requests are stateless.

## Idempotency
Telegram may retry updates. Persist Telegram update IDs and/or use deterministic handling so the same update cannot create duplicate records/actions.

Publishing must also guard against double-clicks.

## Telegram webhook
Use a secret webhook path/token or Telegram secret header validation.
Configure webhook only after deployment.
Provide a setup script/endpoint for setting the webhook.

## Telegram API abstractions
Create a TelegramService with methods such as:
sendMessage
sendPhoto
sendVideo
editMessageText
editMessageCaption
editMessageReplyMarkup
editMessageMedia
sendAnimation
sendChatAction
getChat
getMe
setWebhook
deleteWebhook

Keep Telegram-specific code isolated.

## Publishing targets
A target record should include:
- chat_id
- title
- username if available
- type
- bot_can_post
- created_at
- updated_at

Only show targets that the user has explicitly registered/selected.

## Media
Prefer Telegram file_id for Telegram-to-Telegram publishing.
Do not download large media unnecessarily.
If persistent external storage is later added, make it optional and abstracted behind a MediaService.

## Formatting
Implement one canonical formatter:
Input → sanitized internal rich text → Telegram HTML or MarkdownV2.

Escape Telegram-reserved characters correctly.
For URLs, validate and generate Telegram inline keyboard URL buttons instead of putting links in body text when the intent is a button.

## Rate limiting
Per-user and per-IP/webhook endpoint limits.
Avoid excessive Telegram API calls.
Use exponential backoff for transient API failures.

## Logging
Log:
- update type
- user/chat ID (prefer structured/redacted logging)
- operation
- success/failure
- Telegram API error code
Never log bot tokens or sensitive message payloads unnecessarily.
