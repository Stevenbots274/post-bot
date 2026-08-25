# POST BOT

POST BOT is a standalone Telegram bot for creating polished posts with formatted text, media, and real clickable inline URL buttons.

Core flow: **Create -> Format -> Buttons -> Preview -> Publish**

## Features

- Text, photo, and video drafts using Telegram `file_id` values.
- One canonical safe formatter for bold, italic, strikethrough, inline code, and HTTPS links.
- Web and WhatsApp buttons rendered as Telegram `InlineKeyboardMarkup`, never fake Markdown links.
- Two buttons per row and up to eight buttons per post.
- Preview, content editing, button editing/deletion, clear, and cancel.
- Built-in templates plus personal saved templates.
- Private-chat publishing and explicitly registered group/channel targets.
- Bot permission checks before target publishing.
- Supabase persistence for users, drafts, templates, targets, posts, publications, and processed updates.
- Webhook secret validation, bounded requests, URL validation, rate limits, and duplicate-update/publish protection.

## Requirements

- Node.js 20+
- A Telegram bot token from BotFather
- A Supabase project
- A public HTTPS URL for the webhook

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` with the Telegram and Supabase values. Apply [`DATABASE.sql`](./DATABASE.sql) in the Supabase SQL editor.

## Development

```bash
npm run build
npm test
npm run dev
```

The HTTP server exposes `GET /health` and the protected `POST /telegram/webhook` endpoint by default.

## Production

1. Deploy the Node process with `npm run build` followed by `npm start`.
2. Set every variable in `.env.example` in the hosting provider.
3. Set `APP_URL` to the public HTTPS origin, without a trailing slash.
4. Run `npm run set-webhook` once after deployment.
5. Add the bot to a group or channel as an administrator, then send `/register` there. Only registered targets appear during publishing.

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for webhook, migration, logging, and launch guidance.

## Bot commands

`/start`, `/create`, `/buttons`, `/templates`, `/posts`, `/settings`, `/help`, `/cancel`, and `/register`.

Every flow includes a Cancel action. Invalid URLs and phone numbers are rejected without losing the draft.

## Security notes

- Never commit `.env` or any real secret.
- Keep the Supabase service-role key server-side only.
- Use a long random `TELEGRAM_WEBHOOK_SECRET`.
- The bot never treats a user-supplied chat ID as authorized; targets must be registered and permission-checked.
- Rotate any access token that has been pasted into an untrusted channel before production use.

The original product and architecture blueprint documents remain in this repository alongside the implementation.
