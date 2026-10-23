import { Check, ChevronRight, Info, Pill, Syringe } from 'lucide-react';
import { Link } from 'react-router';
import { dailyProgress, intervalProgress, patternFor, PERCEIVED_LABEL } from '../../shared/timeline';
import { formatTime } from '../../shared/time';
import type { MedView } from './timeline';

interface Props {
  views: MedView[];
  now: Date;
  tz: string;
  onConfirm?: (med: MedView) => void;
  confirming?: boolean;
}

/** 기록된 경과만 시각화합니다. 막대를 약효 강도로 해석하지 않습니다. */
export function MedStatusOverview({ views, now, tz, onConfirm, confirming }: Props) {
  return (
    <section className="rounded-[26px] border border-line bg-white p-3.5 shadow-[var(--shadow-soft)] sm:p-5" aria-label="현재 약물 상태">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[17px] font-extrabold">
          현재 약물 상태
          <span title="등록된 복용 기록에 따른 시간 경과입니다. 약효의 강도나 음식 섭취 가능 여부를 뜻하지 않습니다." aria-label="약물 상태 안내">
            <Info size={15} className="text-ink-mute" />
          </span>
        </h2>
        <Link to="/meds" className="tap inline-flex shrink-0 items-center text-xs font-semibold text-ink-soft">
          내 기록 보기 <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {views.map((med) => {
          const icon = med.scheduleType === 'interval' ? <Syringe size={18} aria-hidden /> : <Pill size={18} aria-hidden />;
          if (!med.hasProgress) {
            return (
              <div key={med.id} className="rounded-[20px] bg-[#FAF7F5] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-white p-2 text-brand-700">{icon}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{med.name}</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-soft">투여 경과 정보가 공유되지 않았습니다.</p>
              </div>
            );
          }
          if (med.scheduleType === 'interval') {
            const intervalDays = med.intervalDays ?? 7;
            const last = med.takenTimes.filter((t) => t <= now).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
            const progress = intervalProgress(last, intervalDays, now, tz);
            const day = progress.dayIndex + 1;
            const perceived = !progress.pastDue && progress.hasLog ? patternFor(med.patterns, progress.dayIndex) : null;
            return (
              <div key={med.id} className="rounded-[20px] bg-[#FFF5F0] p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-xl bg-white/85 p-2 text-brand-700">{icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{med.name}</span>
                  <span className="rounded-full bg-[#FCE2D2] px-2.5 py-1 text-[11px] font-bold text-brand-700">
                    {!progress.hasLog ? '기록 없음' : progress.pastDue ? '다음 투여일 경과' : `투여 ${day}일차`}
                  </span>
                </div>
                {progress.hasLog && (
                  <>
                    <ol className="mt-3 flex items-center gap-1" aria-label={`투여 ${day}일차, 주기 ${intervalDays}일`}>
                      {Array.from({ length: Math.min(intervalDays, 14) }, (_, n) => (
                        <li key={n} className="min-w-0 flex-1 text-center">
                          <div className={`mx-auto flex h-5 w-full max-w-8 items-center justify-center rounded-full text-[10px] font-bold ${n === progress.dayIndex && !progress.pastDue ? 'bg-brand-600 text-white ring-2 ring-brand-100' : n < progress.dayIndex ? 'bg-[#F2B692] text-brand-700' : 'border border-[#E8DCD5] bg-white text-ink-mute'}`}>
                            {n === progress.dayIndex && !progress.pastDue ? `D${n + 1}` : ''}
                          </div>
                          <span className="mt-1 block text-[9px] text-ink-mute">D{n + 1}</span>
                        </li>
                      ))}
                    </ol>
                    {intervalDays > 14 && <p className="mt-1 text-xs text-ink-mute">전체 {intervalDays}일 주기 중 {day}일차</p>}
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                      {perceived ? `기록한 체감: 식욕 억제 ${PERCEIVED_LABEL[perceived]}` : '투여 경과 표시 · 실제 체감은 개인마다 달라요.'}
                    </p>
                  </>
                )}
                {!progress.hasLog && <p className="mt-3 text-xs text-ink-soft">투여 기록을 추가하면 주기가 표시됩니다.</p>}
              </div>
            );
          }
          const p = dailyProgress(med.takenTimes, med.defaultTime, med.effectHours, now, tz);
          const active = p.state === 'active';
          return (
            <div key={med.id} className="rounded-[20px] bg-[#F3F7FC] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-white/85 p-2 text-[#547CAC]">{icon}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{med.name}</span>
                <span className="rounded-full bg-[#E3EDF8] px-2.5 py-1 text-[11px] font-bold text-[#476E9B]">
                  {active ? '예상 작용 구간' : p.state === 'ended' ? '예상 구간 종료' : '오늘 복용 미확인'}
                </span>
              </div>
              {p.state !== 'not_taken' && p.windowEnd ? (
                <>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#D9E3F0]" aria-label="복용 후 시간 경과">
                    <div className="h-full rounded-full bg-[#6B91BD]" style={{ width: `${p.elapsedRatio * 100}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between gap-2 text-[11px] font-medium text-ink-soft tabular-nums">
                    <span>{formatTime(p.takenAt!, tz)} 복용</span>
                    <span>{formatTime(p.windowEnd, tz)} 예상 종료</span>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-soft">예상 시간 경과이며 실제 약효와 다를 수 있습니다.</p>
                </>
              ) : (
                <div className="mt-3">
                  <p className="text-[11px] leading-relaxed text-ink-soft">
                    {p.defaultToday ? `설정된 복용 시각 ${formatTime(p.defaultToday, tz)} · 아직 복용 확인 전` : '아직 오늘의 복용 기록이 없습니다.'}
                  </p>
                  {onConfirm && (
                    <button type="button" onClick={() => onConfirm(med)} disabled={confirming}
                      className="tap mt-2 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-700 disabled:opacity-50">
                      <Check size={13} /> {p.defaultToday && p.defaultPassed ? '설정 시각 복용 확인' : '지금 복용 확인'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">복용 기록의 시간 경과이며 약효 강도를 의미하지 않습니다.</p>
    </section>
  );
}
