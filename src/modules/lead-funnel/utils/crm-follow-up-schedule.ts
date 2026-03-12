const DEFAULT_ALLOWED_WEEKDAYS = [1, 2, 3, 4, 5];
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '18:00';
const DEFAULT_TIMEZONE = 'America/Bogota';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
};

export function sanitizeWeekdays(value?: number[] | null) {
  const normalized = Array.from(
    new Set(
      (value ?? []).filter(
        (item): item is number =>
          Number.isInteger(item) && item >= 0 && item <= 6,
      ),
    ),
  ).sort((a, b) => a - b);

  return normalized.length ? normalized : DEFAULT_ALLOWED_WEEKDAYS;
}

export function sanitizeTimeValue(value: string | null | undefined, fallback: string) {
  const clean = String(value ?? '').trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(clean) ? clean : fallback;
}

export function sanitizeTimezone(timezone?: string | null) {
  const clean = String(timezone ?? '').trim();
  return clean || DEFAULT_TIMEZONE;
}

function parseTimeToMinutes(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return 0;
  }

  return hour * 60 + minute;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    weekday: WEEKDAY_MAP[read('weekday')] ?? 0,
    hour: Number(read('hour')),
    minute: Number(read('minute')),
    second: Number(read('second')),
  };
}

function getTimezoneOffsetMs(date: Date, timeZone: string) {
  const zoned = getZonedParts(date, timeZone);
  const utcFromLocal = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );

  return utcFromLocal - date.getTime();
}

function zonedDateTimeToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}) {
  const guess = new Date(
    Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, args.second ?? 0),
  );
  const initialOffset = getTimezoneOffsetMs(guess, args.timeZone);
  const firstPass = new Date(guess.getTime() - initialOffset);
  const correctedOffset = getTimezoneOffsetMs(firstPass, args.timeZone);

  if (correctedOffset === initialOffset) {
    return firstPass;
  }

  return new Date(guess.getTime() - correctedOffset);
}

export function isWithinCrmFollowUpWindow(args: {
  date: Date;
  timeZone?: string | null;
  allowedWeekdays?: number[] | null;
  sendStartTime?: string | null;
  sendEndTime?: string | null;
}) {
  const timeZone = sanitizeTimezone(args.timeZone);
  const allowedWeekdays = sanitizeWeekdays(args.allowedWeekdays);
  const sendStartTime = sanitizeTimeValue(args.sendStartTime, DEFAULT_START_TIME);
  const sendEndTime = sanitizeTimeValue(args.sendEndTime, DEFAULT_END_TIME);

  const zoned = getZonedParts(args.date, timeZone);
  const localMinutes = zoned.hour * 60 + zoned.minute;
  const startMinutes = parseTimeToMinutes(sendStartTime);
  const endMinutes = parseTimeToMinutes(sendEndTime);

  return (
    allowedWeekdays.includes(zoned.weekday) &&
    localMinutes >= startMinutes &&
    localMinutes <= endMinutes
  );
}

export function computeNextCrmFollowUpDate(args: {
  baseDate: Date;
  timeZone?: string | null;
  allowedWeekdays?: number[] | null;
  sendStartTime?: string | null;
  sendEndTime?: string | null;
}) {
  const timeZone = sanitizeTimezone(args.timeZone);
  const allowedWeekdays = sanitizeWeekdays(args.allowedWeekdays);
  const sendStartTime = sanitizeTimeValue(args.sendStartTime, DEFAULT_START_TIME);
  const sendEndTime = sanitizeTimeValue(args.sendEndTime, DEFAULT_END_TIME);

  if (
    isWithinCrmFollowUpWindow({
      date: args.baseDate,
      timeZone,
      allowedWeekdays,
      sendStartTime,
      sendEndTime,
    })
  ) {
    return args.baseDate;
  }

  const [startHourText, startMinuteText] = sendStartTime.split(':');
  const startHour = Number(startHourText);
  const startMinute = Number(startMinuteText);
  const baseZoned = getZonedParts(args.baseDate, timeZone);
  const calendarBase = new Date(
    Date.UTC(baseZoned.year, baseZoned.month - 1, baseZoned.day),
  );

  for (let offset = 0; offset < 21; offset += 1) {
    const localDate = new Date(calendarBase.getTime() + offset * 24 * 60 * 60 * 1000);
    const weekday = localDate.getUTCDay();

    if (!allowedWeekdays.includes(weekday)) {
      continue;
    }

    const candidate = zonedDateTimeToUtc({
      year: localDate.getUTCFullYear(),
      month: localDate.getUTCMonth() + 1,
      day: localDate.getUTCDate(),
      hour: startHour,
      minute: startMinute,
      timeZone,
    });

    if (candidate.getTime() >= args.baseDate.getTime()) {
      return candidate;
    }
  }

  return args.baseDate;
}
