import { CalendarClock, CheckCircle2, Pill, Syringe } from 'lucide-react';
import { dailyProgress, intervalProgress, PERCEIVED_LABEL, patternFor } from '../../shared/timeline';
import { formatDateKey, formatDateTime, formatDuration, formatTime, localDateKey } from '../../shared/time';
import type { PerceivedLevel, ScheduleType } from '../../shared/types';
import { cx } from './ui';

/** 본인 약물과 공유받은 약물을 같은 형태로 다루기 위한 표시용 모델 */
export interface MedView {
  id: string;
  name: string;
  scheduleType: ScheduleType;
  intervalDays: number | null;
  defaultTime: string | null;
  effectHours: number | null;
  patterns: { dayOffset: number; level: PerceivedLevel }[];
  takenTimes: Date[];
  /** false면 경과 정보가 공유되지 않음 */
  hasProgress: boolean;
}

export function MedIcon({ type, className }: { type: ScheduleType; className?: string }) {
  return type === 'interval' ? <Syringe size={16} className={className} aria-hidden /> : <Pill size={16} className={className} aria-hidden />;
}

function IntervalDots({ dayIndex, intervalDays, pastDue }: { dayIndex: number; intervalDays: number; pastDue: boolean }) {
  if (intervalDays > 14) {
    const ratio = Math.min(1, dayIndex / intervalDays);
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-accent-100" aria-hidden>
        <div className="h-full rounded-full bg-accent-500" style={{ width: `${ratio * 100}%` }} />
      </div>
    );
  }
  return (
    <ol className="flex items-center" aria-hidden>
      {Array.from({ length: intervalDays }, (_, d) => {
        const current = !pastDue && d === dayIndex;
        const done = pastDue || d < dayIndex;
        return (
          <li key={d} className="flex flex-1 items-center last:flex-none">
            <span
              className={cx(
                'flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                current ? 'size-6 bg-accent-500 text-white ring-4 ring-accent-100' : 'size-4',
                !current && done && 'bg-accent-300 text-white',
                !current && !done && 'border border-line bg-white text-ink-mute',
              )}
            >
              {current ? `D${d}` : ''}
            </span>
            {d < intervalDays - 1 && <span className={cx('h-0.5 flex-1', done ? 'bg-accent-300' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}

export function IntervalTimeline({ med, now, tz, compact }: { med: MedView; now: Date; tz: string; compact?: boolean }) {
  const interval = med.intervalDays ?? 7;
  const last = med.takenTimes.filter((t) => t <= now).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const p = intervalProgress(last, interval, now, tz);
  const perceived = p.hasLog && !p.pastDue ? patternFor(med.patterns, p.dayIndex) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-bold">{med.name}</span>
        {!p.hasLog ? (
          <span className="text-sm text-ink-mute">투여 기록 없음</span>
        ) : p.pastDue ? (
          <span className="text-sm font-semibold text-honey-700">예정일 경과 · 마지막 투여 후 {p.dayIndex}일</span>
        ) : (
          <span className="text-sm font-semibold text-accent-700">투여 후 {p.dayIndex === 0 ? '당일' : `${p.dayIndex}일차`}</span>
        )}
        {perceived && (
          <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">내 체감: 식욕 억제 {PERCEIVED_LABEL[perceived]}</span>
        )}
      </div>
      {p.hasLog && <IntervalDots dayIndex={p.dayIndex} intervalDays={interval} pastDue={p.pastDue} />}
      {!compact && p.hasLog && (
        <p className="text-xs text-ink-mute">
          마지막 투여 {formatDateTime(p.lastTakenAt!, tz)} · 다음 예정일 {formatDateKey(p.nextDueKey!)}
          {p.pastDue && ' · 새 투여를 기록하면 갱신됩니다'}
        </p>
      )}
    </div>
  );
}

export function DailyTimeline({
  med,
  now,
  tz,
  compact,
  onConfirm,
  confirming,
}: {
  med: MedView;
  now: Date;
  tz: string;
  compact?: boolean;
  onConfirm?: () => void;
  confirming?: boolean;
}) {
  const p = dailyProgress(med.takenTimes, med.defaultTime, med.effectHours, now, tz);
  const remaining = p.windowEnd ? p.windowEnd.getTime() - now.getTime() : 0;
  const takenOtherDay = p.takenAt && localDateKey(p.takenAt, tz) !== p.todayKey;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold">{med.name}</span>
        {p.state === 'not_taken' ? (
          <span className="text-sm text-ink-mute">오늘 복용 확인 전</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
            <CheckCircle2 size={14} aria-hidden />
            {takenOtherDay ? '어제 ' : ''}
            {formatTime(p.takenAt!, tz)} 복용 확인
          </span>
        )}
        {onConfirm && p.state === 'not_taken' && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="tap ml-auto inline-flex h-9 items-center gap-1 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-white disabled:bg-brand-200"
          >
            <CheckCircle2 size={15} aria-hidden />
            {p.defaultToday && p.defaultPassed ? `${med.defaultTime} 복용 확인` : '지금 복용 확인'}
          </button>
        )}
      </div>

      {p.state === 'not_taken' ? (
        p.defaultToday && p.defaultTodayEnd ? (
          <div>
            <div className="h-2 w-full rounded-full border border-dashed border-accent-300" aria-hidden />
            <p className="mt-1 text-xs text-ink-mute">
              기본값 {formatTime(p.defaultToday, tz)} 복용 시 예상 작용 구간 {formatTime(p.defaultToday, tz)}–{formatTime(p.defaultTodayEnd, tz)} (복용 확인
              전이라 표시만 합니다)
            </p>
          </div>
        ) : null
      ) : p.windowEnd ? (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-accent-100" aria-hidden>
            <div className="h-full rounded-full bg-accent-500 transition-[width] duration-700" style={{ width: `${p.elapsedRatio * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-soft tabular-nums">
            <span>{formatTime(p.windowStart!, tz)} 복용</span>
            <span>
              {p.state === 'active'
                ? `${formatTime(p.windowEnd, tz)} 예상 작용 구간 종료 · ${formatDuration(remaining)} 남음`
                : `${formatTime(p.windowEnd, tz)} 예상 작용 구간 종료됨`}
            </span>
          </div>
          {!compact && <p className="mt-1 text-xs text-ink-mute">막대는 경과 시간만 나타내며 작용 강도를 뜻하지 않습니다.</p>}
        </div>
      ) : null}
    </div>
  );
}

export function MedTimeline(props: { med: MedView; now: Date; tz: string; compact?: boolean; onConfirm?: () => void; confirming?: boolean }) {
  if (!props.med.hasProgress) {
    return (
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-bold">{props.med.name}</span>
        <span className="inline-flex items-center gap-1 text-sm text-ink-soft">
          <CalendarClock size={14} aria-hidden />
          {props.med.scheduleType === 'interval' ? `${props.med.intervalDays ?? 7}일 주기` : `매일 ${props.med.defaultTime ?? ''}`}
        </span>
      </div>
    );
  }
  return props.med.scheduleType === 'interval' ? <IntervalTimeline {...props} /> : <DailyTimeline {...props} />;
}
