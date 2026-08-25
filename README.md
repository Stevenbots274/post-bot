# POST BOT

POST BOT is a standalone Telegram bot for creating polished posts with formatted text, media, and real clickable inline URL buttons.

Core flow: **Create -> Format -> Buttons -> Preview -> Publish**

## Features

- Text, photo, video, and animation/GIF drafts using Telegram `file_id` values.
- One canonical safe formatter for bold, italic, strikethrough, inline code, and HTTPS links.
- HTTPS URL buttons rendered as Telegram `InlineKeyboardMarkup`, never fake Markdown links.
- Two buttons per row and up to eight buttons per post.
- Preview, content editing, button editing/deletion, clear, and cancel in one editable preview message.
- Built-in templates plus personal saved templates.
- Persisted scheduled publishing with UTC time input and cancellation.
- Channel-sync publishing to every registered target with per-target permission checks.
- Auto Buttons saved in Settings and copied into newly created drafts.
- Publishing target management, including removing old targets from future publish menus.
- Clone any recent post into a new editable draft.
- URL buttons and edit/publish controls appear together on the preview message.
- Private-chat publishing and explicitly registered group/channel targets.
- Bot permission checks before target publishing.
- Provider-neutral persistence for users, drafts, templates, targets, posts, publications, and processed updates.
- Supabase, Neon/PostgreSQL, or MongoDB can be selected with `DB_PROVIDER`.
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

Fill in `.env` with the Telegram and selected database provider values. Apply [`DATABASE.sql`](./DATABASE.sql) in Supabase; Neon applies it automatically on startup, and MongoDB initializes its collections and indexes automatically.

For Supabase upgrades, run the SQL file again so the `users.settings` column is added for Auto Buttons. Neon applies the file on startup.

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
4. Set `APP_URL` before the final deployment; startup automatically registers the Telegram webhook.
5. Optionally set `BOT_NAME`, `BOT_DESCRIPTION`, `BOT_SHORT_DESCRIPTION`, and `BOT_PROFILE_PHOTO` to update the bot profile on startup.
6. Add the bot to a group or channel as an administrator, then send `/register` there. Only registered targets appear during publishing.

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for Supabase, mobile migration, webhook, logging, and provider-specific launch guidance for Railway, Koyeb, Render, and Fly.io.

## Bot commands

`/start`, `/create`, `/quickpublish`, `/buttons`, `/templates`, `/posts`, `/scheduled`, `/settings`, `/help`, `/cancel`, and `/register`.

Every flow includes a Cancel action. Invalid URLs are rejected without losing the draft.

Use **Publish to All Targets** from the publish screen for channel-sync behavior. Use **Clone** from `/posts` to reuse a prior post without changing the original.
Use **Settings -> Auto Buttons** to save URL buttons that should appear on new drafts. Use **Settings -> Publishing Targets** to remove targets that should no longer appear in publish menus.

## Security notes

- Never commit `.env` or any real secret.
- Keep the Supabase service-role key server-side only.
- Use a long random `TELEGRAM_WEBHOOK_SECRET`.
- The bot never treats a user-supplied chat ID as authorized; targets must be registered and permission-checked.
- Rotate any access token that has been pasted into an untrusted channel before production use.

The original product and architecture blueprint documents remain in this repository alongside the implementation.
