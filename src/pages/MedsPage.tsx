import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { dailyProgress, PERCEIVED_LABEL } from '../../shared/timeline';
import { formatDateTime, isValidTime } from '../../shared/time';
import type { Medication, MedicationLog, PerceivedLevel, ScheduleType, User } from '../../shared/types';
import { MedIcon, MedTimeline } from '../components/timeline';
import { Button, Card, ErrorState, Field, inputClass, Sheet, Spinner, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { fromLocalInput, toLocalInput } from '../lib/datetime';
import { oneTapTime, ownMedViews, useAddLog } from '../lib/meds';
import { qk, useMe, useMedications, useNow } from '../lib/queries';

export function MedsPage() {
  const me = useMe();
  if (me.isLoading) return <Spinner />;
  if (!me.data) return <LoginRequired what="약물 기록" />;
  return <MedsContent user={me.data} />;
}

export function LoginRequired({ what }: { what: string }) {
  return (
    <Card className="mt-4 text-center">
      <p className="font-semibold">{what}은 로그인 후 사용할 수 있어요</p>
      <p className="mt-1 text-sm text-ink-mute">개인 기록은 본인 계정에만 저장되고, 직접 허용한 범위만 동반자에게 공유됩니다.</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link to="/login" className="tap inline-flex h-11 items-center rounded-xl bg-sage-600 px-5 font-semibold text-white">
          로그인
        </Link>
        <Link to="/signup" className="tap inline-flex h-11 items-center rounded-xl border border-line bg-white px-5 font-semibold">
          가입하기
        </Link>
      </div>
    </Card>
  );
}

type SheetState =
  | { kind: 'add' }
  | { kind: 'edit'; med: Medication }
  | { kind: 'log'; med: Medication; log?: MedicationLog }
  | { kind: 'pattern'; med: Medication }
  | null;

function MedsContent({ user }: { user: User }) {
  const meds = useMedications(true);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [params, setParams] = useSearchParams();
  const welcome = params.get('welcome') === '1';

  if (meds.isLoading) return <Spinner />;
  if (meds.error) return <ErrorState message={errorMessage(meds.error)} onRetry={() => meds.refetch()} />;
  const list = meds.data!.medications;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between pt-1">
        <div>
          <h1 className="text-xl font-extrabold">약물 기록</h1>
          <p className="text-sm text-ink-mute">실제로 투여·복용한 기록만 저장됩니다.</p>
        </div>
        {list.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'add' })}>
            <Plus size={16} aria-hidden /> 약물 추가
          </Button>
        )}
      </div>

      {welcome && (
        <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <p className="font-semibold">가입을 환영해요, {user.displayName}님.</p>
          <p className="mt-0.5">
            복용 중인 약물을 등록하고 마지막 투여일을 입력하면 메뉴 탐색 화면에 경과가 표시됩니다. 약물 없이 음식 탐색만 사용해도 괜찮아요.
          </p>
          <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => setParams({})}>
            닫기
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <Presets onCreated={(med) => med.scheduleType === 'interval' && setSheet({ kind: 'log', med })} onCustom={() => setSheet({ kind: 'add' })} />
      ) : null}

      {list.map((m) => (
        <MedCard key={m.id} med={m} logs={meds.data!.logs.filter((l) => l.medicationId === m.id)} user={user} onSheet={setSheet} />
      ))}

      <p className="px-1 text-xs leading-relaxed text-ink-mute">
        투여 주기·기본 복용 시간은 실제 처방과 복용 일정을 기록하기 위한 설정이며, 의료적 권장 일정이 아닙니다. 경과 표시는 시간이 얼마나 지났는지만 보여주며
        혈중 농도나 약효를 나타내지 않습니다. 용량·일정 변경은 반드시 의료진과 상의하세요.
      </p>

      <MedEditorSheet
        state={sheet}
        onClose={() => setSheet(null)}
        onCreated={(med) => (med.scheduleType === 'interval' ? setSheet({ kind: 'log', med }) : setSheet(null))}
      />
      <LogSheet state={sheet?.kind === 'log' ? sheet : null} tz={user.timezone} onClose={() => setSheet(null)} />
      <PatternSheet state={sheet?.kind === 'pattern' ? sheet : null} onClose={() => setSheet(null)} />
    </div>
  );
}

const PRESETS: { label: string; desc: string; body: Partial<Medication> & { name: string; scheduleType: ScheduleType } }[] = [
  { label: '마운자로', desc: '주 1회 투여 · 7일 주기', body: { name: '마운자로', scheduleType: 'interval', intervalDays: 7 } },
  {
    label: '콘서타',
    desc: '매일 복용 · 기본 05:00 · 예상 작용 12시간',
    body: { name: '콘서타', scheduleType: 'daily', defaultTime: '05:00', effectHours: 12 },
  },
];

function Presets({ onCreated, onCustom }: { onCreated: (m: Medication) => void; onCustom: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: async (body: (typeof PRESETS)[number]['body']) => {
      const { id } = await api<{ id: string }>('/medications', { method: 'POST', body });
      return { intervalDays: null, defaultTime: null, effectHours: null, doseLabel: null, sortOrder: 0, patterns: [], ...body, id } as Medication;
    },
    onSuccess: async (med) => {
      await qc.invalidateQueries({ queryKey: qk.medications });
      toast(`${med.name}을(를) 등록했어요`);
      onCreated(med);
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <Card>
      <h2 className="font-bold">복용 중인 약물을 등록하세요</h2>
      <p className="mt-0.5 text-sm text-ink-mute">약물마다 다른 시간 단위로 경과를 보여줍니다. 나중에 언제든 수정할 수 있어요.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate(p.body)}
            className="tap flex items-center gap-3 rounded-2xl border border-line bg-ivory px-4 py-3 text-left hover:border-sage-400"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <MedIcon type={p.body.scheduleType} />
            </span>
            <span>
              <span className="block font-bold">{p.label}</span>
              <span className="block text-xs text-ink-mute">{p.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <Button variant="ghost" className="mt-2 w-full" onClick={onCustom}>
        <Plus size={16} aria-hidden /> 다른 약물 직접 추가
      </Button>
    </Card>
  );
}

function MedCard({ med, logs, user, onSheet }: { med: Medication; logs: MedicationLog[]; user: User; onSheet: (s: SheetState) => void }) {
  const now = useNow();
  const toast = useToast();
  const addLog = useAddLog();
  const [view] = ownMedViews([med], logs);
  const history = useQuery({
    queryKey: [...qk.medications, 'logs', med.id, logs.length, logs[0]?.takenAt],
    queryFn: async () => (await api<{ logs: MedicationLog[] }>(`/medications/${med.id}/logs?limit=60`)).logs,
  });
  const [showAll, setShowAll] = useState(false);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/logs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.medications });
      toast('기록을 삭제했어요');
    },
    onError: (e) => toast(errorMessage(e)),
  });

  const daily = med.scheduleType === 'daily' ? dailyProgress(view.takenTimes, med.defaultTime, med.effectHours, now, user.timezone) : null;
  const record = (takenAt: Date) =>
    addLog.mutate(
      { medicationId: med.id, takenAt, doseLabel: med.doseLabel },
      { onSuccess: () => toast('복용을 기록했어요'), onError: (e) => toast(errorMessage(e)) },
    );

  const items = history.data ?? logs;
  const shown = showAll ? items : items.slice(0, 5);

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <MedIcon type={med.scheduleType} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{med.name}</h2>
          <p className="text-sm text-ink-mute">
            {med.scheduleType === 'interval'
              ? `${med.intervalDays}일 주기 투여`
              : `매일 · 기본 ${med.defaultTime ?? '미설정'}${med.effectHours ? ` · 예상 작용 ${med.effectHours}시간` : ''}`}
            {med.doseLabel && ` · ${med.doseLabel}`}
          </p>
        </div>
        <button
          type="button"
          className="tap rounded-full p-2 text-ink-soft hover:bg-ivory-deep"
          aria-label={`${med.name} 설정`}
          onClick={() => onSheet({ kind: 'edit', med })}
        >
          <Settings2 size={20} />
        </button>
      </div>

      <div className="rounded-2xl bg-ivory p-3.5" data-testid={`timeline-${med.name}`}>
        <MedTimeline med={view} now={now} tz={user.timezone} />
      </div>

      <div className="flex flex-wrap gap-2">
        {med.scheduleType === 'interval' ? (
          <Button onClick={() => onSheet({ kind: 'log', med })}>
            <Plus size={16} aria-hidden /> 투여 기록
          </Button>
        ) : (
          <>
            {daily?.state === 'not_taken' && med.defaultTime && daily.defaultPassed && (
              <Button onClick={() => record(oneTapTime(med.defaultTime, new Date(), user.timezone))} disabled={addLog.isPending}>
                <CheckCircle2 size={16} aria-hidden /> 오늘 {med.defaultTime} 복용 확인
              </Button>
            )}
            {daily?.state === 'not_taken' && (
              <Button variant={med.defaultTime && daily.defaultPassed ? 'secondary' : 'primary'} onClick={() => record(new Date())} disabled={addLog.isPending}>
                <Clock size={16} aria-hidden /> 지금 복용
              </Button>
            )}
            <Button variant="secondary" onClick={() => onSheet({ kind: 'log', med })}>
              다른 시간으로 기록
            </Button>
          </>
        )}
      </div>

      {med.scheduleType === 'interval' && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-bold">개인 체감 패턴</h3>
            <button type="button" className="tap rounded-full px-2 py-1 text-sm font-semibold text-sky-700" onClick={() => onSheet({ kind: 'pattern', med })}>
              {med.patterns.length ? '수정' : '설정'}
            </button>
          </div>
          {med.patterns.length ? (
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {med.patterns.map((p) => (
                <li key={p.dayOffset} className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                  D{p.dayOffset} 식욕 억제 {PERCEIVED_LABEL[p.level]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-mute">
              설정하지 않으면 투여 후 경과 일수만 표시합니다. 본인이 느끼는 식욕 변화를 기록해 두면 타임라인에 함께 보여줘요.
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-sm font-bold">{med.scheduleType === 'interval' ? '투여 기록' : '복용 기록'}</h3>
        {items.length === 0 ? (
          <p className="text-sm text-ink-mute">아직 기록이 없어요.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {shown.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium tabular-nums">{formatDateTime(new Date(l.takenAt), user.timezone)}</p>
                  {(l.doseLabel || l.note) && <p className="truncate text-xs text-ink-mute">{[l.doseLabel, l.note].filter(Boolean).join(' · ')}</p>}
                </div>
                <button
                  type="button"
                  className="tap rounded-full p-2 text-ink-mute hover:bg-ivory-deep"
                  aria-label="기록 수정"
                  onClick={() => onSheet({ kind: 'log', med, log: l })}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="tap rounded-full p-2 text-ink-mute hover:bg-clay-50 hover:text-clay-700"
                  aria-label="기록 삭제"
                  onClick={() => confirm('이 기록을 삭제할까요?') && remove.mutate(l.id)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 5 && (
          <button type="button" className="tap mt-1 w-full rounded-xl py-2 text-sm font-semibold text-ink-soft" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '접기' : `과거 기록 ${items.length - 5}개 더 보기`}
          </button>
        )}
      </div>
    </Card>
  );
}

function MedEditorSheet({ state, onClose, onCreated }: { state: SheetState; onClose: () => void; onCreated: (m: Medication) => void }) {
  const open = state?.kind === 'add' || state?.kind === 'edit';
  const med = state?.kind === 'edit' ? state.med : null;
  return (
    <Sheet open={open} onClose={onClose} title={med ? `${med.name} 설정` : '약물 추가'}>
      {open && <MedForm key={med?.id ?? 'new'} med={med} onClose={onClose} onCreated={onCreated} />}
    </Sheet>
  );
}

function MedForm({ med, onClose, onCreated }: { med: Medication | null; onClose: () => void; onCreated: (m: Medication) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(med?.name ?? '');
  const [type, setType] = useState<ScheduleType>(med?.scheduleType ?? 'interval');
  const [intervalDays, setIntervalDays] = useState(String(med?.intervalDays ?? 7));
  const [defaultTime, setDefaultTime] = useState(med?.defaultTime ?? '05:00');
  const [effectHours, setEffectHours] = useState(String(med?.effectHours ?? 12));
  const [dose, setDose] = useState(med?.doseLabel ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        intervalDays: type === 'interval' ? Number(intervalDays) : null,
        defaultTime: type === 'daily' ? defaultTime : null,
        effectHours: type === 'daily' && effectHours ? Number(effectHours) : null,
        doseLabel: dose.trim() || null,
      };
      if (med) {
        await api(`/medications/${med.id}`, { method: 'PATCH', body });
        return null;
      }
      const { id } = await api<{ id: string }>('/medications', { method: 'POST', body: { ...body, scheduleType: type } });
      return { id, ...body, scheduleType: type, sortOrder: 0, patterns: [] } as Medication;
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: qk.medications });
      toast(med ? '설정을 저장했어요' : '약물을 등록했어요');
      if (created) onCreated(created);
      else onClose();
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/medications/${med!.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.medications });
      toast('약물과 기록을 삭제했어요');
      onClose();
    },
    onError: (e) => toast(errorMessage(e)),
  });

  const valid =
    name.trim().length > 0 &&
    (type === 'interval'
      ? Number(intervalDays) >= 1 && Number(intervalDays) <= 60
      : isValidTime(defaultTime) && (!effectHours || (Number(effectHours) > 0 && Number(effectHours) <= 48)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <Field label="약물 이름">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: 마운자로" required />
      </Field>
      {!med && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink-soft">시간 단위</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['interval', '며칠 간격 투여', '예: 주 1회 주사'],
                ['daily', '매일 복용', '예: 아침 약'],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                aria-pressed={type === id}
                onClick={() => setType(id)}
                className={`tap rounded-xl border px-3 py-2.5 text-left ${type === id ? 'border-sage-500 bg-sage-50' : 'border-line bg-white'}`}
              >
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-ink-mute">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {type === 'interval' ? (
        <Field label="투여 주기 (일)" hint="실제 처방·투여 일정을 기록하는 값입니다. 기본 7일.">
          <input
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
          />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="기본 복용 시간" hint="복용 확인 시 기본값으로 사용">
            <input className={inputClass} type="time" value={defaultTime} onChange={(e) => setDefaultTime(e.target.value)} required />
          </Field>
          <Field label="예상 작용 구간 (시간)" hint="표시용 참고값">
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              min={1}
              max={48}
              step="0.5"
              value={effectHours}
              onChange={(e) => setEffectHours(e.target.value)}
            />
          </Field>
        </div>
      )}
      <Field label="용량 (선택)">
        <input className={inputClass} value={dose} onChange={(e) => setDose(e.target.value)} maxLength={40} placeholder="예: 2.5mg" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={!valid || save.isPending}>
        {med ? '저장' : '등록'}
      </Button>
      {med && (
        <Button variant="danger" className="w-full" onClick={() => confirm(`${med.name}과(와) 모든 기록을 삭제할까요?`) && remove.mutate()}>
          <Trash2 size={16} aria-hidden /> 약물 삭제
        </Button>
      )}
    </form>
  );
}

function LogSheet({ state, tz, onClose }: { state: { med: Medication; log?: MedicationLog } | null; tz: string; onClose: () => void }) {
  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      title={state ? `${state.med.name} ${state.log ? '기록 수정' : state.med.scheduleType === 'interval' ? '투여 기록' : '복용 기록'}` : ''}
    >
      {state && <LogForm key={state.log?.id ?? state.med.id} med={state.med} log={state.log} tz={tz} onClose={onClose} />}
    </Sheet>
  );
}

function LogForm({ med, log, tz, onClose }: { med: Medication; log?: MedicationLog; tz: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [takenAt, setTakenAt] = useState(() => toLocalInput(log ? new Date(log.takenAt) : new Date(), tz));
  const [dose, setDose] = useState(log?.doseLabel ?? med.doseLabel ?? '');
  const [note, setNote] = useState(log?.note ?? '');
  const max = toLocalInput(new Date(), tz);
  const save = useMutation({
    mutationFn: () => {
      const body = { takenAt: fromLocalInput(takenAt, tz).toISOString(), doseLabel: dose.trim() || null, note: note.trim() || null };
      return log ? api(`/logs/${log.id}`, { method: 'PATCH', body }) : api(`/medications/${med.id}/logs`, { method: 'POST', body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.medications });
      toast(log ? '기록을 수정했어요' : '기록했어요');
      onClose();
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label={med.scheduleType === 'interval' ? '투여 날짜와 시간' : '복용 날짜와 시간'} hint="지나간 시각만 기록할 수 있어요.">
        <input className={inputClass} type="datetime-local" value={takenAt} max={max} onChange={(e) => setTakenAt(e.target.value)} required />
      </Field>
      <Field label="용량 (선택)">
        <input className={inputClass} value={dose} onChange={(e) => setDose(e.target.value)} maxLength={40} />
      </Field>
      <Field label="메모 (선택)">
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={!takenAt || save.isPending}>
        저장
      </Button>
    </form>
  );
}

const LEVELS: PerceivedLevel[] = ['strongest', 'strong', 'normal', 'weak', 'weakest'];

function PatternSheet({ state, onClose }: { state: { med: Medication } | null; onClose: () => void }) {
  return (
    <Sheet open={!!state} onClose={onClose} title="개인 체감 패턴">
      {state && <PatternForm key={state.med.id} med={state.med} onClose={onClose} />}
    </Sheet>
  );
}

function PatternForm({ med, onClose }: { med: Medication; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const days = med.intervalDays ?? 7;
  const [values, setValues] = useState<Record<number, PerceivedLevel | ''>>(() =>
    Object.fromEntries(Array.from({ length: days }, (_, d) => [d, med.patterns.find((p) => p.dayOffset === d)?.level ?? ''])),
  );
  const save = useMutation({
    mutationFn: () =>
      api(`/medications/${med.id}/patterns`, {
        method: 'PUT',
        body: {
          patterns: Object.entries(values)
            .filter(([, v]) => v)
            .map(([d, v]) => ({ dayOffset: Number(d), level: v })),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.medications });
      toast('체감 패턴을 저장했어요');
      onClose();
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        투여 후 며칠째에 식욕 억제를 어떻게 <strong>체감</strong>하는지 기록합니다. 본인에게만 적용되며, 실제 약물 농도나 약효를 의미하지 않습니다.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {Array.from({ length: days }, (_, d) => (
          <li key={d} className="flex items-center gap-3 px-3 py-2">
            <span className="w-10 font-bold tabular-nums">D{d}</span>
            <select
              aria-label={`D${d} 체감`}
              className={`${inputClass} h-10`}
              value={values[d]}
              onChange={(e) => setValues((v) => ({ ...v, [d]: e.target.value as PerceivedLevel | '' }))}
            >
              <option value="">기록 안 함</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  식욕 억제 {PERCEIVED_LABEL[l]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <Button size="lg" className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
        저장
      </Button>
    </div>
  );
}
