import test from "node:test"
import assert from "node:assert/strict"
import { autoButtonsKeyboard, previewKeyboardForButtons, settingsKeyboard, targetsKeyboard } from "../src/bot/keyboards.js"

test("preview keeps real URL buttons and edit controls on one keyboard", () => {
  const rows = previewKeyboardForButtons([{ label: "Open", url: "https://example.com/", row: 0, position: 0 }]).inline_keyboard
  assert.equal(rows.some((row) => row.some((button) => "url" in button && button.url === "https://example.com/")), true)
  assert.equal(rows.some((row) => row.some((button) => "callback_data" in button && button.callback_data === "preview:edit_content")), true)
  assert.equal(rows.some((row) => row.length === 0), false)
})

test("settings exposes Auto Buttons and publishing target management", () => {
  const settings = settingsKeyboard(2, 1).inline_keyboard
  assert.equal("callback_data" in settings[0]![0]! && settings[0]![0]!.callback_data === "settings:auto_buttons", true)
  assert.equal("callback_data" in settings[1]![0]! && settings[1]![0]!.callback_data === "settings:targets", true)

  const autoButtons = autoButtonsKeyboard([{ label: "Open", url: "https://example.com/", row: 0, position: 0 }]).inline_keyboard
  assert.equal(autoButtons.some((row) => row.some((button) => "callback_data" in button && button.callback_data === "settings:auto:delete:0")), true)

  const targets = targetsKeyboard([{ id: "target-1", telegram_user_id: 1, chat_id: -1, chat_title: "News", chat_username: null, chat_type: "channel", can_post: true }]).inline_keyboard
  assert.equal(targets.some((row) => row.some((button) => "callback_data" in button && button.callback_data === "settings:target:remove:target-1")), true)
})
