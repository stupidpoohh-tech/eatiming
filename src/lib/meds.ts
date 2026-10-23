import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zonedDateTimeToDate, localDateKey } from '../../shared/time';
import type { Medication, MedicationLog, SharedMedication } from '../../shared/types';
import type { MedView } from '../components/timeline';
import { api } from './api';
import { qk } from './queries';

export function ownMedViews(meds: Medication[], logs: MedicationLog[]): MedView[] {
  return meds.map((m) => ({
    id: m.id,
    name: m.name,
    scheduleType: m.scheduleType,
    intervalDays: m.intervalDays,
    defaultTime: m.defaultTime,
    effectHours: m.effectHours,
    patterns: m.patterns,
    takenTimes: logs.filter((l) => l.medicationId === m.id).map((l) => new Date(l.takenAt)),
    hasProgress: true,
  }));
}

export function sharedMedViews(meds: SharedMedication[]): MedView[] {
  return meds.map((m) => ({
    id: m.id,
    name: m.name,
    scheduleType: m.scheduleType,
    intervalDays: m.progress?.intervalDays ?? m.schedule?.intervalDays ?? null,
    defaultTime: m.schedule?.defaultTime ?? null,
    effectHours: m.progress?.effectHours ?? m.schedule?.effectHours ?? null,
    patterns: m.progress?.patterns ?? [],
    takenTimes: (m.progress?.recentTakenAt ?? []).map((t) => new Date(t)),
    hasProgress: !!m.progress,
  }));
}

/** 원터치 복용 확인 시각: 오늘 기본 시간이 지났으면 그 시각, 아니면 지금 */
export function oneTapTime(defaultTime: string | null, now: Date, tz: string): Date {
  if (!defaultTime) return now;
  const d = zonedDateTimeToDate(localDateKey(now, tz), defaultTime, tz);
  return d.getTime() <= now.getTime() ? d : now;
}

export function useAddLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { medicationId: string; takenAt: Date; doseLabel?: string | null; note?: string | null }) =>
      api<{ id: string }>(`/medications/${v.medicationId}/logs`, {
        method: 'POST',
        body: { takenAt: v.takenAt.toISOString(), doseLabel: v.doseLabel ?? null, note: v.note ?? null },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.medications }),
  });
}
