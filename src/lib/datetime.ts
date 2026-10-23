import { localDateKey, zonedDateTimeToDate, zonedParts } from '../../shared/time';

/** <input type="datetime-local"> 값 ('YYYY-MM-DDTHH:MM', 사용자 시간대 기준) */
export function toLocalInput(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDateKey(d, tz)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** 사용자 시간대 기준 입력값('YYYY-MM-DDTHH:MM')을 실제 시각으로 변환 */
export function fromLocalInput(v: string, tz: string): Date {
  const [date, time] = v.split('T');
  return zonedDateTimeToDate(date, time, tz);
}
