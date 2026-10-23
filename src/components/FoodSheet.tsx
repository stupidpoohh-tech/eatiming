import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CONDITION_LABEL, CUISINE_LABEL, FORM_LABEL, LEVEL_LABEL, REACTION_LABEL, REACTIONS, STATUS_LABEL } from '../../shared/labels';
import { MIN_PERSONAL_RECORDS, type RankedFood } from '../../shared/ranking';
import { formatDateTime } from '../../shared/time';
import { fromLocalInput, toLocalInput } from '../lib/datetime';
import type { ConditionState, Food, FoodReaction, ReactionKind, ReactionSummary, User } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { qk, useFoodReactions } from '../lib/queries';
import { Button, cx, inputClass, LevelMeter, Sheet, StatusBadge, StatusIcon, useToast } from './ui';

export function FoodSheet({
  food,
  ranked,
  condition,
  summary,
  user,
  basisName,
  onClose,
}: {
  food: Food | null;
  ranked: RankedFood | null;
  condition: ConditionState;
  summary: ReactionSummary | undefined;
  user: User | null;
  basisName: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!food} onClose={onClose} title={food?.name ?? ''}>
      {food && <FoodDetail food={food} ranked={ranked} condition={condition} summary={summary} user={user} basisName={basisName} />}
    </Sheet>
  );
}

function relevance(food: Food, ranked: RankedFood | null, condition: ConditionState, basisName: string | null): string {
  const who = basisName ? `${basisName}님의` : '내';
  if (ranked?.source === 'personal') return `${who} 반응 기록이 충분해 공통 분류보다 개인 기록을 우선해 정렬했습니다.`;
  if (ranked?.source === 'condition') {
    return condition === 'hearty'
      ? '지금 컨디션(든든하게 먹을 수 있음)을 반영해 조건부로 완화해 보여줍니다. 양과 조리법에 따라 부담이 달라질 수 있습니다.'
      : '지금 컨디션(담백하게 먹고 싶음)을 반영해 한 단계 신중하게 보여줍니다.';
  }
  if (condition === 'light') return `지금은 담백한 식사를 원하는 상태라, 같은 분류 안에서 기름기·자극이 낮은 메뉴를 먼저 보여줍니다.`;
  if (condition === 'hearty') return '지금은 든든한 식사가 가능한 상태라, 같은 분류 안에서 식사가 되는 메뉴를 먼저 보여줍니다.';
  return food.variants.length > 0 ? '이름만으로 판단하기 어려운 음식입니다. 아래 조리법별 차이를 확인하세요.' : '공통 분류 기준으로 보여줍니다.';
}

function FoodDetail({
  food,
  ranked,
  condition,
  summary,
  user,
  basisName,
}: {
  food: Food;
  ranked: RankedFood | null;
  condition: ConditionState;
  summary: ReactionSummary | undefined;
  user: User | null;
  basisName: string | null;
}) {
  const status = ranked?.status ?? food.status;
  const total = summary ? summary.good + summary.ok + summary.bad : 0;

  return (
    <div className="space-y-5" data-testid="food-detail">
      <div className="space-y-2">
        <StatusBadge status={status} />
        <p className="text-sm text-ink-soft">
          {FORM_LABEL[food.form]} · {CUISINE_LABEL[food.cuisine]}
          {food.tags.length > 0 && <span className="text-ink-mute"> · {food.tags.slice(0, 4).join(' · ')}</span>}
        </p>
        {food.aliases.length > 0 && <p className="text-xs text-ink-mute">다른 이름: {food.aliases.join(', ')}</p>}
      </div>

      <section className="rounded-2xl bg-ivory p-4">
        <h3 className="mb-3 text-sm font-bold">음식 특성</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ink-mute">기름기 정도</dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold">
              <LevelMeter value={food.fat} label={`기름기 ${LEVEL_LABEL[food.fat]}`} />
              {LEVEL_LABEL[food.fat]}
            </dd>
          </div>
          <div>
            <dt className="text-ink-mute">자극 정도</dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold">
              <LevelMeter value={food.spice} label={`자극 ${LEVEL_LABEL[food.spice]}`} />
              {LEVEL_LABEL[food.spice]}
            </dd>
          </div>
        </dl>
        {food.description && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{food.description}</p>}
      </section>

      {food.variants.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold">조리법별 차이</h3>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {food.variants.map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-3.5 py-3">
                <StatusIcon status={v.status} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{v.name}</p>
                  <p className="text-sm text-ink-soft">{v.note}</p>
                </div>
                <span className="sr-only">{STATUS_LABEL[v.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-sm font-bold">지금 상태와의 관련성</h3>
        <p className="text-sm leading-relaxed text-ink-soft">{relevance(food, ranked, condition, basisName)}</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold">{basisName ? `${basisName}님의 반응 기록` : '내 반응 기록'}</h3>
        {basisName ? (
          summary ? (
            <ReactionSummaryLine summary={summary} />
          ) : (
            <p className="text-sm text-ink-mute">공유된 반응 기록이 없거나 반응 공유가 허용되지 않았습니다.</p>
          )
        ) : user ? (
          <>
            {total > 0 && total < MIN_PERSONAL_RECORDS && (
              <p className="mb-2 text-xs text-ink-mute">기록이 {MIN_PERSONAL_RECORDS}건 이상 쌓이면 정렬에 반영돼요. (현재 데이터 부족)</p>
            )}
            <MyReactions food={food} timeZone={user.timezone} />
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            <Link to="/login" className="font-semibold text-brand-700 underline underline-offset-2">
              로그인
            </Link>
            하면 먹어본 뒤의 반응을 기록하고 내 기준으로 정렬할 수 있어요.
          </p>
        )}
      </section>

      <p className="rounded-xl bg-ivory px-3 py-2.5 text-xs leading-relaxed text-ink-mute">
        분류는 일반적인 조리 기준의 참고 정보이며, 특정 음식의 섭취 안전을 보장하지 않습니다. 실제 반응은 사람마다 다르니 내 기록을 우선해 주세요.
      </p>
    </div>
  );
}

function ReactionSummaryLine({ summary }: { summary: ReactionSummary }) {
  return (
    <p className="flex flex-wrap gap-2 text-sm">
      {REACTIONS.map((r) => (
        <span key={r.id} className="rounded-full bg-ivory px-2.5 py-1">
          {r.label} <strong className="tabular-nums">{summary[r.id]}</strong>
        </span>
      ))}
    </p>
  );
}

const REACTION_STYLE: Record<ReactionKind, string> = {
  good: 'border-brand-500 bg-brand-50 text-brand-700',
  ok: 'border-accent-500 bg-accent-50 text-accent-700',
  bad: 'border-clay-500 bg-clay-50 text-clay-700',
};

function MyReactions({ food, timeZone }: { food: Food; timeZone: string }) {
  const list = useFoodReactions(food.id, true);
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<FoodReaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.reactions(food.id) });
    qc.invalidateQueries({ queryKey: qk.summaries });
  };
  const remove = useMutation({
    mutationFn: (id: string) => api(`/reactions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast('기록을 삭제했어요');
    },
    onError: (e) => toast(errorMessage(e)),
  });

  return (
    <div className="space-y-3">
      {formOpen || editing ? (
        <ReactionForm
          key={editing?.id ?? 'new'}
          food={food}
          timeZone={timeZone}
          initial={editing}
          onDone={() => {
            setEditing(null);
            setFormOpen(false);
            invalidate();
          }}
          onCancel={() => {
            setEditing(null);
            setFormOpen(false);
          }}
        />
      ) : (
        <QuickReaction food={food} onSaved={invalidate} onDetail={() => setFormOpen(true)} />
      )}

      {list.isLoading ? (
        <p className="text-sm text-ink-mute">기록을 불러오는 중…</p>
      ) : list.data && list.data.length > 0 ? (
        <ul className="divide-y divide-line rounded-2xl border border-line" aria-label="반응 기록 목록">
          {list.data.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-3.5 py-3">
              <span className={cx('mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold', REACTION_STYLE[r.reaction])}>
                {REACTION_LABEL[r.reaction]}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-ink-soft">
                  {formatDateTime(new Date(r.eatenAt), timeZone)}
                  {r.variantId && <span className="text-ink-mute"> · {food.variants.find((v) => v.id === r.variantId)?.name}</span>}
                </p>
                <p className="text-xs text-ink-mute">
                  {[...r.medicationContext.map((m) => `${m.name} ${m.label}`), r.conditionState ? `컨디션: ${CONDITION_LABEL[r.conditionState]}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {r.note && <p className="mt-1 whitespace-pre-wrap">{r.note}</p>}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <button type="button" className="tap rounded-full p-2 text-ink-mute hover:bg-ivory-deep" aria-label="기록 수정" onClick={() => setEditing(r)}>
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="tap rounded-full p-2 text-ink-mute hover:bg-clay-50 hover:text-clay-700"
                  aria-label="기록 삭제"
                  onClick={() => confirm('이 기록을 삭제할까요?') && remove.mutate(r.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-mute">아직 기록이 없어요. 먹어본 뒤 느낌을 남겨 보세요.</p>
      )}
    </div>
  );
}

function QuickReaction({ food, onSaved, onDetail }: { food: Food; onSaved: () => void; onDetail: () => void }) {
  const toast = useToast();
  const save = useMutation({
    mutationFn: (reaction: ReactionKind) => api('/reactions', { method: 'POST', body: { foodId: food.id, reaction } }),
    onSuccess: () => {
      onSaved();
      toast('지금 먹은 기록으로 저장했어요');
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <div>
      <p className="mb-2 text-xs text-ink-mute">방금 먹었다면 한 번만 누르세요. 시간·조리법·메모는 ‘자세히 기록’에서 남길 수 있어요.</p>
      <div className="grid grid-cols-3 gap-2">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate(r.id)}
            className={cx('tap h-12 rounded-xl border text-sm font-bold', REACTION_STYLE[r.id])}
          >
            {r.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onDetail} className="tap mt-2 h-10 w-full rounded-xl text-sm font-semibold text-ink-soft hover:bg-ivory-deep">
        자세히 기록하기
      </button>
    </div>
  );
}

function ReactionForm({
  food,
  timeZone,
  initial,
  onDone,
  onCancel,
}: {
  food: Food;
  timeZone: string;
  initial: FoodReaction | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [reaction, setReaction] = useState<ReactionKind | null>(initial?.reaction ?? null);
  const [variantId, setVariantId] = useState<string>(initial?.variantId ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [eatenAt, setEatenAt] = useState(() => toLocalInput(initial ? new Date(initial.eatenAt) : new Date(), timeZone));
  const [maxInput, setMaxInput] = useState(() => toLocalInput(new Date(), timeZone));
  useEffect(() => setMaxInput(toLocalInput(new Date(), timeZone)), [timeZone]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        reaction,
        variantId: variantId || null,
        note: note.trim() || null,
        eatenAt: fromLocalInput(eatenAt, timeZone).toISOString(),
      };
      return initial ? api(`/reactions/${initial.id}`, { method: 'PATCH', body }) : api('/reactions', { method: 'POST', body: { ...body, foodId: food.id } });
    },
    onSuccess: () => {
      toast(initial ? '기록을 수정했어요' : '기록을 저장했어요');
      onDone();
    },
    onError: (e) => toast(errorMessage(e)),
  });

  return (
    <form
      className="space-y-3 rounded-2xl border border-line p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (reaction) save.mutate();
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink-soft">먹어보니 어땠나요?</legend>
        <div className="grid grid-cols-3 gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={reaction === r.id}
              onClick={() => setReaction(r.id)}
              className={cx('tap h-11 rounded-xl border text-sm font-bold', reaction === r.id ? REACTION_STYLE[r.id] : 'border-line bg-white text-ink-soft')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>
      {food.variants.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-ink-soft">조리법</span>
          <select className={inputClass} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">선택 안 함</option>
            {food.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink-soft">먹은 시각</span>
        <input type="datetime-local" className={inputClass} value={eatenAt} max={maxInput} onChange={(e) => setEatenAt(e.target.value)} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink-soft">메모 (선택)</span>
        <textarea
          className={cx(inputClass, 'h-20 resize-none py-2')}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 반 그릇 정도는 편했음"
        />
      </label>
      <p className="text-xs text-ink-mute">저장할 때 당시 투여 경과와 식사 컨디션이 함께 기록됩니다.</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" className="flex-1" disabled={!reaction || save.isPending}>
          {initial ? '수정 저장' : '기록 저장'}
        </Button>
      </div>
    </form>
  );
}
