const DAY_MS = 24 * 60 * 60 * 1000

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>()

function getDateFormatter(timezone: string): Intl.DateTimeFormat {
  if (!dateFormatterCache.has(timezone)) {
    dateFormatterCache.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    )
  }
  return dateFormatterCache.get(timezone)!
}

function getTimeFormatter(timezone: string): Intl.DateTimeFormat {
  if (!timeFormatterCache.has(timezone)) {
    timeFormatterCache.set(
      timezone,
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    )
  }
  return timeFormatterCache.get(timezone)!
}

export function formatDateKey(date: Date, timezone: string): string {
  return getDateFormatter(timezone).format(date)
}

export function getDayNumber(date: Date, timezone: string): number {
  const key = formatDateKey(date, timezone)
  const [yearStr, monthStr, dayStr] = key.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
}

export function getLocalHourMinute(date: Date, timezone: string): {
  hour: number
  minute: number
} {
  const parts = getTimeFormatter(timezone).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  return { hour, minute }
}

export function getMinutesSinceMidnight(date: Date, timezone: string): number {
  const { hour, minute } = getLocalHourMinute(date, timezone)
  return hour * 60 + minute
}
