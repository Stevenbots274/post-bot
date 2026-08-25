# POST BOT — Button System

## Button object

{
  "label": "🛒 Buy Now",
  "url": "https://example.com",
  "row": 0,
  "position": 0
}

## Supported button types V1
1. Web URL
2. WhatsApp URL

## Web button
User provides:
Label
URL

Validate:
- URL parses
- protocol is https:// (unless a deliberately supported Telegram scheme is added)
- reject javascript:, data:, file:, and other dangerous schemes.

## WhatsApp button
User provides:
Phone
Optional message

Normalize:
09012345678 + Nigeria context should become 2349012345678 if the UI explicitly knows Nigeria.
For a generic public bot, preferably ask for country code or accept an international number.

Build:
https://wa.me/<digits>?text=<encodeURIComponent(message)>

Never display the generated URL as the button text.
Telegram inline keyboard should display only the label.

## Layout editor
Allow:
- add
- rename
- change URL
- move left/right
- move up/down row
- delete
- clear all

V1 can cap at 8 buttons per post to keep the UI manageable.
