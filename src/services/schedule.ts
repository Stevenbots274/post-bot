export function parseScheduleTime(value: string, now = new Date()): string {
  const input = value.trim()
  const short = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input)
  const iso = short ? `${input.replace(" ", "T")}:00Z` : input
  const parsed = new Date(iso)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Please use UTC time in YYYY-MM-DD HH:MM format, for example 2026-09-01 18:30.")
  }
  if (short) {
    const [, year, month, day, hour, minute] = short
    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() + 1 !== Number(month) ||
      parsed.getUTCDate() !== Number(day) ||
      parsed.getUTCHours() !== Number(hour) ||
      parsed.getUTCMinutes() !== Number(minute)
    ) {
      throw new Error("Please use a real UTC date and time in YYYY-MM-DD HH:MM format.")
    }
  }
  if (parsed.getTime() <= now.getTime() + 30_000) {
    throw new Error("Please choose a time at least 30 seconds in the future.")
  }
  return parsed.toISOString()
}
