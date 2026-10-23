import { describe, expect, it } from 'vitest';
import { contextLabel, dailyProgress, intervalProgress, patternFor } from '../../shared/timeline';
import { calendarDaysBetween, localDateKey, zonedDateTimeToDate } from '../../shared/time';

const TZ = 'Asia/Seoul';
const kst = (s: string) => new Date(`${s}+09:00`);

describe('시간대 계산', () => {
  it('사용자 시간대 기준 달력 날짜를 계산한다', () => {
    // UTC로는 전날이지만 KST로는 다음 날
    expect(localDateKey(new Date('2026-10-22T15:30:00Z'), TZ)).toBe('2026-10-23');
    expect(localDateKey(new Date('2026-10-22T15:30:00Z'), 'America/New_York')).toBe('2026-10-22');
  });

  it('자정 경계를 넘으면 하루로 센다', () => {
    expect(calendarDaysBetween(kst('2026-10-20T23:50:00'), kst('2026-10-21T00:10:00'), TZ)).toBe(1);
    expect(calendarDaysBetween(kst('2026-10-20T00:10:00'), kst('2026-10-20T23:50:00'), TZ)).toBe(0);
  });

  it('현지 날짜·시간을 실제 시각으로 변환한다(DST 포함)', () => {
    expect(zonedDateTimeToDate('2026-10-23', '05:00', TZ).toISOString()).toBe('2026-10-22T20:00:00.000Z');
    expect(zonedDateTimeToDate('2026-07-01', '05:00', 'America/New_York').toISOString()).toBe('2026-07-01T09:00:00.000Z');
    expect(zonedDateTimeToDate('2026-12-01', '05:00', 'America/New_York').toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });
});

describe('마운자로(주기 투여) 타임라인', () => {
  const dose = kst('2026-10-20T21:00:00');

  it('투여 당일은 D0, 이후 D1~D6', () => {
    expect(intervalProgress(dose, 7, kst('2026-10-20T23:59:00'), TZ).dayIndex).toBe(0);
    expect(intervalProgress(dose, 7, kst('2026-10-21T00:01:00'), TZ).dayIndex).toBe(1);
    const d6 = intervalProgress(dose, 7, kst('2026-10-26T12:00:00'), TZ);
    expect(d6.dayIndex).toBe(6);
    expect(d6.pastDue).toBe(false);
    expect(d6.nextDueKey).toBe('2026-10-27');
  });

  it('D7 이후에는 예정일 경과로 표시하고 기록을 만들지 않는다', () => {
    const p = intervalProgress(dose, 7, kst('2026-10-29T09:00:00'), TZ);
    expect(p.dayIndex).toBe(9);
    expect(p.pastDue).toBe(true);
    expect(p.daysPastDue).toBe(2);
    expect(p.lastTakenAt).toBe(dose);
  });

  it('투여 주기를 개인 설정으로 바꿀 수 있다', () => {
    const p = intervalProgress(dose, 10, kst('2026-10-29T09:00:00'), TZ);
    expect(p.pastDue).toBe(false);
    expect(p.nextDueKey).toBe('2026-10-30');
  });

  it('기록이 없으면 미입력 상태', () => {
    expect(intervalProgress(null, 7, new Date(), TZ).hasLog).toBe(false);
  });

  it('개인 체감 패턴은 해당 일차에만 표시된다', () => {
    const patterns = [
      { dayOffset: 1, level: 'strongest' as const },
      { dayOffset: 6, level: 'weakest' as const },
    ];
    expect(patternFor(patterns, 1)).toBe('strongest');
    expect(patternFor(patterns, 6)).toBe('weakest');
    expect(patternFor(patterns, 3)).toBeNull();
  });
});

describe('콘서타(매일 복용) 타임라인', () => {
  it('복용 확인이 없으면 기본값(05:00~17:00)만 안내하고 상태는 미확인', () => {
    const p = dailyProgress([], '05:00', 12, kst('2026-10-23T08:00:00'), TZ);
    expect(p.state).toBe('not_taken');
    expect(p.takenAt).toBeNull();
    expect(p.defaultToday!.toISOString()).toBe(kst('2026-10-23T05:00:00').toISOString());
    expect(p.defaultTodayEnd!.toISOString()).toBe(kst('2026-10-23T17:00:00').toISOString());
    expect(p.defaultPassed).toBe(true);
  });

  it('복용 확인 시각 기준으로 예상 작용 구간을 계산한다', () => {
    const taken = kst('2026-10-23T05:00:00');
    const p = dailyProgress([taken], '05:00', 12, kst('2026-10-23T11:00:00'), TZ);
    expect(p.state).toBe('active');
    expect(p.windowEnd!.toISOString()).toBe(kst('2026-10-23T17:00:00').toISOString());
    expect(p.elapsedRatio).toBeCloseTo(0.5);
  });

  it('특정 날짜에 다른 시간으로 복용하면 그 시각 기준으로 계산한다', () => {
    const p = dailyProgress([kst('2026-10-23T07:30:00')], '05:00', 12, kst('2026-10-23T18:00:00'), TZ);
    expect(p.state).toBe('active');
    expect(p.windowEnd!.toISOString()).toBe(kst('2026-10-23T19:30:00').toISOString());
  });

  it('작용 구간이 끝나면 ended', () => {
    const p = dailyProgress([kst('2026-10-23T05:00:00')], '05:00', 12, kst('2026-10-23T17:01:00'), TZ);
    expect(p.state).toBe('ended');
  });

  it('어제 기록은 오늘의 복용으로 간주하지 않는다(미복용일 자동 기록 없음)', () => {
    const p = dailyProgress([kst('2026-10-22T05:00:00')], '05:00', 12, kst('2026-10-23T09:00:00'), TZ);
    expect(p.state).toBe('not_taken');
  });

  it('자정을 넘기는 작용 구간은 다음 날에도 이어서 표시한다', () => {
    const p = dailyProgress([kst('2026-10-22T20:00:00')], '05:00', 12, kst('2026-10-23T01:00:00'), TZ);
    expect(p.state).toBe('active');
    expect(p.todayKey).toBe('2026-10-23');
  });

  it('오늘 기본 시간 이전에는 defaultPassed=false', () => {
    const p = dailyProgress([], '05:00', 12, kst('2026-10-23T04:00:00'), TZ);
    expect(p.defaultPassed).toBe(false);
  });
});

describe('반응 기록용 투여 경과 라벨', () => {
  it('주기 투여와 매일 복용 라벨', () => {
    const at = kst('2026-10-22T12:00:00');
    expect(contextLabel({ scheduleType: 'interval', intervalDays: 7, effectHours: null, defaultTime: null }, [kst('2026-10-20T21:00:00')], at, TZ)).toBe('D2');
    expect(contextLabel({ scheduleType: 'interval', intervalDays: 7, effectHours: null, defaultTime: null }, [], at, TZ)).toBe('투여 기록 없음');
    expect(contextLabel({ scheduleType: 'daily', intervalDays: null, effectHours: 12, defaultTime: '05:00' }, [kst('2026-10-22T05:00:00')], at, TZ)).toBe(
      '복용 후 7시간 (예상 작용 구간 내)',
    );
  });
});
