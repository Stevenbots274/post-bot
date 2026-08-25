# POST BOT — Product Specification

## Identity
Name: POST BOT
Category: Telegram post creation/publishing utility
Audience: General Telegram users, creators, communities, sellers, marketers, channel admins.

## User promise
Create clean Telegram posts with proper formatting and real clickable buttons without manually constructing Markdown/HTML links.

## Main commands
/start
/help
/create
/buttons
/templates
/settings
/cancel

Optional later:
/posts
/schedule
/broadcast

## Main menu
Use Telegram inline keyboard buttons:

➕ Create Post
🔘 Button Builder
🧩 Templates
📚 My Posts
⚙️ Settings
❓ Help

## Create flow

### Step 1 — Choose content type
Buttons:
- 📝 Text Post
- 🖼️ Photo Post
- 🎥 Video Post

Also accept direct media uploads so the user does not have to start with the menu.

### Step 2 — Content
For text:
Ask for the post body.

For photo:
Ask user to upload a photo, then ask for caption.

For video:
Ask user to upload a video, then ask for caption.

Allow Telegram-supported formatting. Prefer a safe internal representation and render to Telegram HTML or MarkdownV2 consistently. Do not mix parser modes accidentally.

### Step 3 — Buttons
Ask:
“Add buttons?”

Options:
- ➕ Add Button
- ⏭️ Skip
- 🧹 Clear Buttons
- ✅ Done

Button fields:
- Button label
- Button URL

Validate URL:
- Must be absolute HTTPS URL for normal web links.
- Allow tg:// only if explicitly supported by implementation.

### Button layout
Support rows. Example:

[🛒 Buy Now] [🌐 Website]

User chooses one or two buttons per row in V1.

### Step 4 — Preview
Render an actual Telegram-style preview:
- media if present
- caption/body
- inline buttons

Buttons:
✏️ Edit Content
🔘 Edit Buttons
🧩 Add Template
👀 Refresh Preview
📤 Publish
❌ Cancel

Preview must use the same formatting/parser that publishing uses.

### Step 5 — Publish
Ask where to publish.

V1 recommended:
- “Send to me” for private testing.
- “Publish to channel/chat” after the user provides/chooses a target where the bot has permission.

Never assume the bot can post to a chat.

Before publishing:
- verify bot access/permission when possible
- confirm target
- publish once
- return message/chat identifiers
- prevent accidental duplicate publish when user double-clicks

## Formatting
Support:
- Bold
- Italic
- Underline
- Strikethrough
- Inline code
- Links

The implementation may accept simple Markdown-like input, but the bot should normalize it into a single Telegram-safe format.

Do not expose raw URLs when a user asks for a clickable button.

## Templates
V1 templates can be simple saved structures:
- Product
- Sale
- Announcement
- Event
- New Post
- Custom

Template fields:
- title/body
- default button definitions
- optional media placeholder
- formatting settings

Users can save personal templates later.

## User experience
- Every flow has Cancel.
- Every invalid input gets a useful error and retry button.
- Keep conversation state clear.
- If a user sends /start during a flow, offer to restart.
- Do not lose a draft because the user accidentally sends an unsupported message.
- Autosave draft state after important steps.

## Errors
Friendly examples:
“⚠️ That doesn’t look like a valid HTTPS URL. Please send the full link, e.g. https://example.com”
“⚠️ I couldn't publish this because I don't have permission in that chat.”
“⚠️ Your draft is still safe. Try again.”

## Privacy
Only store what is needed:
- Telegram user/chat identifiers
- profile metadata needed for operation
- drafts/posts/templates
- publishing targets
- timestamps
Do not store message content forever by default. Provide deletion controls.
