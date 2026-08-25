# BUILD INSTRUCTION — POST BOT

Build POST BOT as a production-ready public Telegram bot according to all files in this blueprint.

IMPORTANT:
- POST BOT is a standalone product.
- Do not reference or hard-code Boss Lady Perfumery.
- Do not add business-specific branding.
- Follow the product, architecture, database, security, button, and acceptance-test documents.
- The primary V1 objective is Create → Format → Buttons → Preview → Publish.

## Required implementation
1. Create the Telegram bot backend.
2. Configure webhook handling.
3. Implement /start, /help, /create, /buttons, /templates, /settings, /cancel.
4. Implement stateful draft creation.
5. Support text, photo, and video posts.
6. Support safe Telegram formatting.
7. Implement real Telegram inline URL buttons.
8. Implement HTTPS URL button generation with safe validation.
9. Implement button rows and editing.
10. Implement preview.
11. Implement publishing to authorized Telegram chats/channels.
12. Implement duplicate-update protection.
13. Implement duplicate-publish protection.
14. Implement Supabase persistence using the supplied schema.
15. Implement secure environment variables.
16. Implement rate limiting and validation.
17. Add friendly error handling.
18. Test every acceptance test.

The implementation may additionally support persisted scheduled publishing, cloning recent posts, and publishing to all explicitly registered targets. Keep these actions authorization-checked and idempotent.

## Critical Telegram requirement
Do NOT fake clickable links using plain Markdown text.

Use Telegram's actual InlineKeyboardMarkup with URL buttons.

Visible button text must be separate from the underlying HTTPS URL.
The URL itself must not appear in the visible button label.

## Architecture requirement
Keep Telegram-specific operations in a Telegram service.
Keep formatting/validation independent and testable.
Keep database access in repositories/services.
Keep conversation state explicit.

## Deployment
Prepare the project for deployment.
Provide:
- environment variable documentation
- webhook setup instructions
- database migration instructions
- local development instructions
- production deployment instructions

## Final deliverables
Return:
- complete source code
- database migration
- README
- .env.example
- tests
- deployment instructions
- webhook setup script/endpoint
- concise explanation of how each major component works

Before declaring completion, run the acceptance tests and fix failures.
