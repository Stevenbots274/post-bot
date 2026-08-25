# Security checklist

- Keep TELEGRAM_BOT_TOKEN server-side only.
- Keep Supabase service-role key server-side only.
- Validate Telegram webhook secret.
- Validate all callback data and never trust user-supplied IDs blindly.
- Escape/sanitize formatted content.
- Validate URLs and reject dangerous schemes.
- Encode WhatsApp messages with encodeURIComponent.
- Rate-limit users.
- Prevent duplicate update processing.
- Prevent duplicate publishing.
- Do not let users publish into arbitrary chats without explicit target registration.
- Check bot permissions before attempting channel/group publishing.
- Do not expose database errors to users.
- Avoid logging full private message content.
- Add abuse controls before public launch.
- Add a privacy policy if collecting persistent user data.
