export function validateHttpsUrl(value: string): string {
  const input = value.trim()
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error("That doesn't look like a valid HTTPS URL. Please send the full link, e.g. https://example.com")
  }

  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("That doesn't look like a valid HTTPS URL. Please send the full link, e.g. https://example.com")
  }
  return parsed.toString()
}

export function validateButtonLabel(value: string): string {
  const label = value.trim()
  if (!label) throw new Error("Please send a button label.")
  if (label.length > 64) throw new Error("Button labels must be 64 characters or fewer.")
  return label
}

export function normalizePhone(value: string): string {
  const input = value.trim()
  if (!/^[+\d\s().-]+$/.test(input)) {
    throw new Error("Please send an international phone number using digits, for example +2348012345678.")
  }
  let digits = input.replace(/[\s().+-]/g, "")
  if (input.replace(/[\s().-]/g, "").startsWith("00")) digits = digits.slice(2)
  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Please send a valid international phone number, including the country code.")
  }
  return digits
}

export function createWhatsAppUrl(phone: string, message = ""): string {
  const digits = normalizePhone(phone)
  const query = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : ""
  return `https://wa.me/${digits}${query}`
}

export function isDangerousUrl(value: string): boolean {
  try {
    return new URL(value).protocol !== "https:"
  } catch {
    return true
  }
}
