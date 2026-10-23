import { useMemo } from 'react';
import { CONDITION_LABEL, REACTION_LABEL } from '../../shared/labels';
import { formatDateTime } from '../../shared/time';
import type { SharedView } from '../../shared/types';
import { sharedMedViews } from '../lib/meds';
import { useFoods, useNow } from '../lib/queries';
import { MedTimeline } from './timeline';

/** 동반자가 보는 화면. 소유자 미리보기에서도 동일하게 사용한다. */
export function SharedViewPanel({ view }: { view: SharedView }) {
  const now = useNow();
  const foods = useFoods();
  const foodName = useMemo(() => new Map((foods.data ?? []).map((f) => [f.id, f.name])), [foods.data]);
  const p = view.permissions;
  const nothing = !p.shareCondition && !p.shareMedProgress && !p.shareMedSchedule && !p.shareReactions;

  const comfy = (view.reactionSummaries ?? [])
    .filter((s) => s.good > s.bad)
    .sort((a, b) => b.good - a.good)
    .slice(0, 8);
  const uneasy = (view.reactionSummaries ?? [])
    .filter((s) => s.bad > s.good)
    .sort((a, b) => b.bad - a.bad)
    .slice(0, 8);

  return (
    <div className="space-y-3" data-testid="shared-view">
      {nothing && <p className="text-sm text-ink-mute">공유 중인 항목이 없습니다.</p>}
      {p.shareCondition && (
        <div className="rounded-xl bg-sage-50 px-3.5 py-3">
          <p className="text-xs font-semibold text-sage-700">지금 식사 컨디션</p>
          <p className="mt-0.5 text-lg font-bold" data-testid="shared-condition">
            {view.condition ? CONDITION_LABEL[view.condition.state] : '–'}
          </p>
          {view.condition && <p className="text-xs text-ink-mute">{formatDateTime(new Date(view.condition.updatedAt), view.owner.timezone)} 업데이트</p>}
        </div>
      )}
      {view.medications && (
        <div className="space-y-3 rounded-xl bg-sky-50 px-3.5 py-3" data-testid="shared-meds">
          <p className="text-xs font-semibold text-sky-700">{p.shareMedProgress ? '투여 경과' : '등록 약물 및 복용 시간'}</p>
          {view.medications.length === 0 && <p className="text-sm text-ink-mute">등록된 약물이 없습니다.</p>}
          {sharedMedViews(view.medications).map((m, i) => {
            const sched = view.medications![i].schedule;
            return (
              <div key={m.id} className="space-y-1">
                <MedTimeline med={m} now={now} tz={view.owner.timezone} compact />
                {sched && (
                  <p className="text-xs text-ink-soft">
                    {sched.intervalDays ? `${sched.intervalDays}일 주기` : `기본 복용 ${sched.defaultTime ?? '-'}`}
                    {sched.doseLabel && ` · ${sched.doseLabel}`}
                    {sched.recentLogs[0] && ` · 최근 기록 ${formatDateTime(new Date(sched.recentLogs[0].takenAt), view.owner.timezone)}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {view.reactionSummaries && (
        <div className="rounded-xl bg-ivory px-3.5 py-3">
          <p className="text-xs font-semibold text-ink-soft">음식 반응 요약</p>
          {view.reactionSummaries.length === 0 ? (
            <p className="mt-1 text-sm text-ink-mute">아직 기록이 없습니다.</p>
          ) : (
            <div className="mt-1.5 space-y-1.5 text-sm">
              {comfy.length > 0 && (
                <p>
                  <span className="font-semibold text-sage-700">{REACTION_LABEL.good}</span> · {comfy.map((s) => foodName.get(s.foodId) ?? '').join(', ')}
                </p>
              )}
              {uneasy.length > 0 && (
                <p>
                  <span className="font-semibold text-clay-700">{REACTION_LABEL.bad}</span> · {uneasy.map((s) => foodName.get(s.foodId) ?? '').join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
