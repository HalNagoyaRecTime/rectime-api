const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toJstDateString(date: Date): string | null {
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidEventDate(
  eventDate: string | undefined
): eventDate is string {
  if (!eventDate || !EVENT_DATE_PATTERN.test(eventDate)) return false;

  const date = new Date(`${eventDate}T00:00:00+09:00`);
  return toJstDateString(date) === eventDate;
}

export function isEventDate(
  eventDate: string | undefined,
  date: Date
): boolean {
  return isValidEventDate(eventDate) && toJstDateString(date) === eventDate;
}

export function buildEventNotificationSendAt(
  eventDate: string,
  startTime: string,
  minutesBefore = 15
): string {
  if (
    !isValidEventDate(eventDate) ||
    !/^([01]\d|2[0-3])[0-5]\d$/.test(startTime)
  ) {
    throw new Error('Invalid event date or start time');
  }

  const year = Number(eventDate.slice(0, 4));
  const month = Number(eventDate.slice(5, 7));
  const day = Number(eventDate.slice(8, 10));
  const hour = Number(startTime.slice(0, 2));
  const minute = Number(startTime.slice(2, 4));
  const eventTimeUtc = Date.UTC(year, month - 1, day, hour - 9, minute);
  return new Date(eventTimeUtc - minutesBefore * 60 * 1000).toISOString();
}
