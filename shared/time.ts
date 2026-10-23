/** 사용자 시간대 기준 날짜·시간 계산 유틸. 외부 라이브러리 없이 Intl만 사용한다. */

export const DEFAULT_TIMEZONE = 'Asia/Seoul';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' (사용자 시간대 기준 달력 날짜) */
export function localDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function dateKeyToDayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDaysToKey(key: string, days: number): string {
  const n = dateKeyToDayNumber(key) + days;
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 두 시각 사이의 달력 날짜 차이(사용자 시간대 기준). 같은 날이면 0. */
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  return dateKeyToDayNumber(localDateKey(to, timeZone)) - dateKeyToDayNumber(localDateKey(from, timeZone));
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** 사용자 시간대의 'YYYY-MM-DD' + 'HH:MM'을 실제 시각(UTC Date)으로 변환한다. */
export function zonedDateTimeToDate(dateKey: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - offsetMs(new Date(guess), timeZone);
  // DST 경계 보정
  const second = guess - offsetMs(new Date(result), timeZone);
  if (second !== result) result = second;
  return new Date(result);
}

export function formatTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDateKey(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  const wd = new Date(dateKeyToDayNumber(key) * 86_400_000).getUTCDay();
  return `${m}월 ${d}일 (${WEEKDAYS[wd]})`;
}

export function formatDateTime(date: Date, timeZone: string): string {
  return `${formatDateKey(localDateKey(date, timeZone))} ${formatTime(date, timeZone)}`;
}

/** 'HH:MM' 검증 */
export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
