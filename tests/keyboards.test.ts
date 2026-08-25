import test from "node:test"
import assert from "node:assert/strict"
import { previewKeyboardForButtons } from "../src/bot/keyboards.js"

test("preview keeps real URL buttons and edit controls on one keyboard", () => {
  const rows = previewKeyboardForButtons([{ label: "Open", url: "https://example.com/", row: 0, position: 0 }]).inline_keyboard
  assert.equal(rows.some((row) => row.some((button) => "url" in button && button.url === "https://example.com/")), true)
  assert.equal(rows.some((row) => row.some((button) => "callback_data" in button && button.callback_data === "preview:edit_content")), true)
  assert.equal(rows.some((row) => row.length === 0), false)
})
