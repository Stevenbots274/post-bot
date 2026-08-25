# POST BOT — Button System

## Button object

{
  "label": "🛒 Buy Now",
  "url": "https://example.com",
  "row": 0,
  "position": 0
}

## Supported button type V1
1. HTTPS URL

## URL button
User provides:
Label
URL

Validate:
- URL parses
- protocol is https:// (unless a deliberately supported Telegram scheme is added)
- reject javascript:, data:, file:, and other dangerous schemes.

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
