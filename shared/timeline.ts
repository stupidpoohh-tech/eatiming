/**
 * 약물 투여 경과 계산.
 * - 경과 시간/일수만 계산한다. 혈중 농도나 약효 강도(퍼센트)를 추정하지 않는다.
 * - 기록이 없는 날의 투여·복용을 자동으로 만들어내지 않는다. 계산은 실제 입력된 기록만 사용한다.
 */
import type { PerceivedLevel } from './types';
import { addDaysToKey, calendarDaysBetween, localDateKey, zonedDateTimeToDate } from './time';

export interface IntervalProgress {
  kind: 'interval';
  hasLog: boolean;
  lastTakenAt: Date | null;
  /** 마지막 투여일 = 0 */
  dayIndex: number;
  intervalDays: number;
  /** 다음 투여 예정일(마지막 기록 + 주기) 'YYYY-MM-DD' */
  nextDueKey: string | null;
  /** dayIndex >= intervalDays: 예정일이 지났으나 새 기록이 입력되지 않음 */
  pastDue: boolean;
  daysPastDue: number;
}

export function intervalProgress(lastTakenAt: Date | null, intervalDays: number, now: Date, timeZone: string): IntervalProgress {
  if (!lastTakenAt) {
    return { kind: 'interval', hasLog: false, lastTakenAt: null, dayIndex: 0, intervalDays, nextDueKey: null, pastDue: false, daysPastDue: 0 };
  }
  const dayIndex = Math.max(0, calendarDaysBetween(lastTakenAt, now, timeZone));
  const nextDueKey = addDaysToKey(localDateKey(lastTakenAt, timeZone), intervalDays);
  const pastDue = dayIndex >= intervalDays;
  return {
    kind: 'interval',
    hasLog: true,
    lastTakenAt,
    dayIndex,
    intervalDays,
    nextDueKey,
    pastDue,
    daysPastDue: pastDue ? dayIndex - intervalDays : 0,
  };
}

export type DailyState = 'active' | 'ended' | 'not_taken';

export interface DailyProgress {
  kind: 'daily';
  state: DailyState;
  /** 실제 확인된 복용 시각 (active/ended일 때) */
  takenAt: Date | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  /** 작용 구간 중 경과 비율(0~1). 시간 경과만 의미하며 작용 강도가 아니다. */
  elapsedRatio: number;
  /** 오늘 날짜의 기본 복용 시간(단순 기본값, 실제 복용 아님) */
  defaultToday: Date | null;
  defaultTodayEnd: Date | null;
  /** 오늘 기본 복용 시간이 이미 지났는지 */
  defaultPassed: boolean;
  todayKey: string;
}

export function dailyProgress(takenTimes: Date[], defaultTime: string | null, effectHours: number | null, now: Date, timeZone: string): DailyProgress {
  const effectMs = (effectHours ?? 0) * 3_600_000;
  const todayKey = localDateKey(now, timeZone);
  const past = takenTimes.filter((t) => t.getTime() <= now.getTime()).sort((a, b) => b.getTime() - a.getTime());

  const active = effectMs > 0 ? past.find((t) => now.getTime() < t.getTime() + effectMs) : undefined;
  const today = past.find((t) => localDateKey(t, timeZone) === todayKey);
  const taken = active ?? today ?? null;

  const defaultToday = defaultTime ? zonedDateTimeToDate(todayKey, defaultTime, timeZone) : null;
  const base = {
    kind: 'daily' as const,
    defaultToday,
    defaultTodayEnd: defaultToday && effectMs > 0 ? new Date(defaultToday.getTime() + effectMs) : null,
    defaultPassed: defaultToday ? now.getTime() >= defaultToday.getTime() : false,
    todayKey,
  };

  if (!taken) {
    return { ...base, state: 'not_taken', takenAt: null, windowStart: null, windowEnd: null, elapsedRatio: 0 };
  }
  const windowEnd = effectMs > 0 ? new Date(taken.getTime() + effectMs) : null;
  const elapsedRatio = windowEnd ? Math.min(1, Math.max(0, (now.getTime() - taken.getTime()) / effectMs)) : 1;
  return {
    ...base,
    state: active ? 'active' : 'ended',
    takenAt: taken,
    windowStart: taken,
    windowEnd,
    elapsedRatio,
  };
}

export const PERCEIVED_LABEL: Record<PerceivedLevel, string> = {
  strongest: '가장 강함',
  strong: '강한 편',
  normal: '보통',
  weak: '약한 편',
  weakest: '가장 약함',
};

export function patternFor(patterns: { dayOffset: number; level: PerceivedLevel }[], dayIndex: number): PerceivedLevel | null {
  return patterns.find((p) => p.dayOffset === dayIndex)?.level ?? null;
}

/** 음식 반응 기록에 함께 저장하는 '당시 투여 경과' 라벨 */
export function contextLabel(
  med: { scheduleType: 'interval' | 'daily'; intervalDays: number | null; effectHours: number | null; defaultTime: string | null },
  takenTimes: Date[],
  at: Date,
  timeZone: string,
): string {
  if (med.scheduleType === 'interval') {
    const last = takenTimes.filter((t) => t.getTime() <= at.getTime()).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    if (!last) return '투여 기록 없음';
    const p = intervalProgress(last, med.intervalDays ?? 7, at, timeZone);
    return p.pastDue ? `D${p.dayIndex} (예정일 경과)` : `D${p.dayIndex}`;
  }
  const p = dailyProgress(takenTimes, med.defaultTime, med.effectHours, at, timeZone);
  if (p.state === 'not_taken') return '당일 복용 확인 없음';
  const hours = Math.floor((at.getTime() - p.takenAt!.getTime()) / 3_600_000);
  return p.state === 'active' ? `복용 후 ${hours}시간 (예상 작용 구간 내)` : `복용 후 ${hours}시간 (예상 작용 구간 이후)`;
}
