# POST BOT — Acceptance Tests

## Basic
[ ] /start responds.
[ ] Main menu renders.
[ ] /cancel works from every flow.
[ ] /help works.

## Text post
[ ] User creates text post.
[ ] Bold/italic/basic formatting renders correctly.
[ ] Preview matches final post.

## Media
[ ] Photo can be uploaded.
[ ] Video can be uploaded.
[ ] Caption can be added.
[ ] Media preview works.
[ ] Telegram file_id is retained.

## Buttons
[ ] User adds a URL button.
[ ] URL button is clickable.
[ ] URL is not exposed as button text.
[ ] Multiple buttons work.
[ ] Row arrangement works.
[ ] Invalid URLs are rejected.
[ ] Dangerous URL schemes are rejected.

## Editing
[ ] Content can be edited before publish.
[ ] Buttons can be edited before publish.
[ ] Draft survives a temporary error.
[ ] Cancel deletes/abandons the active draft safely.

## Publishing
[ ] User can select an authorized target.
[ ] Bot permission is checked.
[ ] Post publishes once.
[ ] Double-click does not duplicate publication.
[ ] Telegram API failures are handled gracefully.

## Persistence
[ ] User is stored.
[ ] Draft is stored.
[ ] Templates are stored.
[ ] Publications are recorded.
[ ] Processed update IDs prevent duplicate processing.

## Security
[ ] Secrets are not in source code.
[ ] Webhook secret is checked.
[ ] Service-role key never reaches client.
[ ] URL validation works.
[ ] Rate limiting works.

## UX
[ ] Every action has a clear next step.
[ ] Every flow has Cancel.
[ ] Errors explain what to do next.
[ ] Mobile Telegram experience is clean.
