# Deployment Guide

## Database

Run `DATABASE.sql` in the Supabase SQL editor before starting the bot. The service-role key is used only by the trusted backend. Do not put it in a browser bundle.

The `publications_active_post_target_idx` index makes concurrent publish clicks converge on one active publication for a post and target.

## Webhook

The server accepts only `POST ${WEBHOOK_PATH}` and checks the `X-Telegram-Bot-Api-Secret-Token` header. `npm run set-webhook` configures both the URL and Telegram's matching `secret_token`.

Check the deployment with:

```bash
curl -i https://your-domain.example/health
```

## Hosting

Use any Node 20 host that supports a long-running HTTP process. Configure the start command as `npm start` and the build command as `npm run build`. The process must be reachable over HTTPS so Telegram can deliver updates.

## Target registration

Add the bot as an administrator with permission to post. An administrator sends `/register` inside the group or channel. The target is stored for that Telegram user and is checked again immediately before publishing.

## Scheduled publishing

From a preview, choose **Schedule**, select a registered target, and enter a future UTC time as `YYYY-MM-DD HH:MM`. A single scheduler worker runs inside the bot process and claims due rows atomically, so multiple deployed instances will not intentionally publish the same schedule twice. Use `/scheduled` to review or cancel pending schedules.

## Operations

- Keep structured logs limited to update type, Telegram IDs, operation, and Telegram error code.
- Do not log full message text, tokens, webhook secrets, or database errors to end users.
- Monitor the `/health` endpoint and Telegram webhook error responses.
- Apply Supabase backups and retention policies appropriate for your users.
- Add a privacy policy and deletion workflow before a broad public launch.
