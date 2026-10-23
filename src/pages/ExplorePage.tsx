import { ArrowDownUp, ChevronRight, Search, X } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { buildIndex, explore, type StatusFilter } from '../../shared/explore';
import { CONDITIONS, CUISINES, FORM_CATEGORIES, STATUS_LABEL, STATUS_SHORT } from '../../shared/labels';
import type { RankedFood } from '../../shared/ranking';
import type { ConditionState, Food, ReactionSummary, User } from '../../shared/types';
import { FoodSheet } from '../components/FoodSheet';
import { MedTimeline } from '../components/timeline';
import { Button, cx, ErrorState, StatusIcon, useToast } from '../components/ui';
import { errorMessage } from '../lib/api';
import { oneTapTime, ownMedViews, sharedMedViews, useAddLog } from '../lib/meds';
import { useFoods, useMe, useMedications, useMyCondition, useNow, useReactionSummaries, useShares, useSharedView } from '../lib/queries';
import { useRealtime } from '../lib/realtime';
import { scrollMemory, useExploreState } from '../state';
import { DEFAULT_TIMEZONE } from '../../shared/time';

export function ExplorePage() {
  const me = useMe();
  const user = me.data ?? null;
  const { state, update } = useExploreState();
  const shares = useShares(!!user);
  const basisShare = shares.data?.incoming.find((s) => s.owner.id === state.basisOwnerId) ?? null;
  const basisOwnerId = basisShare ? basisShare.owner.id : null;

  // 공유가 해제되면 본인 기준으로 되돌린다
  useEffect(() => {
    if (state.basisOwnerId && shares.data && !basisShare) update({ basisOwnerId: null });
  }, [state.basisOwnerId, shares.data, basisShare, update]);

  useRealtime(basisOwnerId, user?.id ?? null);
  const shared = useSharedView(basisOwnerId);
  const myCondition = useMyCondition(user);
  const mySummaries = useReactionSummaries(!!user && !basisOwnerId);

  const condition: ConditionState = basisOwnerId ? (shared.data?.condition?.state ?? 'normal') : myCondition.state;
  const summaries = basisOwnerId ? (shared.data?.reactionSummaries ?? undefined) : mySummaries.data;

  return (
    <div className="space-y-4">
      <div className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">오늘의 메뉴</h1>
        <p className="mt-0.5 text-sm text-ink-soft">지금 컨디션에 맞는 음식을 찾아보세요.</p>
      </div>
      {user && shares.data && shares.data.incoming.length > 0 && (
        <BasisPicker
          value={basisOwnerId}
          options={shares.data.incoming.map((s) => ({ id: s.owner.id, name: s.owner.displayName }))}
          onChange={(id) => update({ basisOwnerId: id })}
        />
      )}
      <TimelineSummary user={user} basisOwnerId={basisOwnerId} />
      <ConditionPicker
        value={condition}
        readOnlyName={basisOwnerId ? basisShare!.owner.displayName : null}
        conditionShared={basisOwnerId ? !!shared.data?.condition : true}
        onChange={myCondition.setState}
      />
      <FoodExplorer condition={condition} summaries={summaries} user={user} basisName={basisShare?.owner.displayName ?? null} />
    </div>
  );
}

function BasisPicker({ value, options, onChange }: { value: string | null; options: { id: string; name: string }[]; onChange: (id: string | null) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" role="radiogroup" aria-label="탐색 기준">
      <span className="shrink-0 text-xs font-semibold text-ink-mute">기준</span>
      {[{ id: null as string | null, name: '나' }, ...options].map((o) => (
        <button
          key={o.id ?? 'me'}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'tap h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold',
            value === o.id ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-line bg-white text-ink-soft',
          )}
        >
          {o.id ? `${o.name}님` : o.name}
        </button>
      ))}
    </div>
  );
}

function TimelineSummary({ user, basisOwnerId }: { user: User | null; basisOwnerId: string | null }) {
  const now = useNow();
  const meds = useMedications(!!user && !basisOwnerId);
  const shared = useSharedView(basisOwnerId);
  const addLog = useAddLog();
  const toast = useToast();

  if (!user) {
    return (
      <Link to="/login" className="tap flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">투여 경과와 내 기록을 함께 보려면 로그인하세요</span>
          <span className="block text-sm text-ink-mute">로그인 없이도 음식 목록은 모두 둘러볼 수 있어요.</span>
        </span>
        <ChevronRight size={18} className="text-ink-mute" aria-hidden />
      </Link>
    );
  }

  if (basisOwnerId) {
    const view = shared.data;
    if (shared.isLoading) return <div className="h-16 animate-pulse rounded-2xl bg-ivory-deep" />;
    if (!view?.medications) {
      return (
        <p className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink-mute">
          {view?.owner.displayName}님이 약물 정보를 공유하지 않았습니다.
        </p>
      );
    }
    return (
      <section className="space-y-3 rounded-2xl border border-line bg-white px-4 py-3" aria-label="투여 경과 요약">
        {sharedMedViews(view.medications).map((m) => (
          <MedTimeline key={m.id} med={m} now={now} tz={view.owner.timezone} compact />
        ))}
      </section>
    );
  }

  if (meds.isLoading) return <div className="h-16 animate-pulse rounded-2xl bg-ivory-deep" />;
  if (meds.error) return <ErrorState message={errorMessage(meds.error)} onRetry={() => meds.refetch()} />;
  const views = ownMedViews(meds.data?.medications ?? [], meds.data?.logs ?? []);
  if (views.length === 0) {
    return (
      <Link to="/meds" className="tap flex items-center gap-3 rounded-2xl border border-dashed border-accent-300 bg-accent-50 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-accent-700">복용 중인 약물을 등록해 보세요</span>
          <span className="block text-sm text-ink-soft">마지막 투여일을 입력하면 경과가 여기에 표시됩니다.</span>
        </span>
        <ChevronRight size={18} className="text-accent-700" aria-hidden />
      </Link>
    );
  }
  const tz = user.timezone ?? DEFAULT_TIMEZONE;
  return (
    <section className="rounded-2xl border border-line bg-white px-4 py-3" aria-label="투여 경과 요약">
      <div className="space-y-3">
        {views.map((m) => (
          <div key={m.id}>
            <MedTimeline
              med={m}
              now={now}
              tz={tz}
              compact
              confirming={addLog.isPending}
              onConfirm={
                m.scheduleType === 'daily'
                  ? () =>
                      addLog.mutate(
                        { medicationId: m.id, takenAt: oneTapTime(m.defaultTime, new Date(), tz) },
                        { onSuccess: () => toast(`${m.name} 복용을 기록했어요`), onError: (e) => toast(errorMessage(e)) },
                      )
                  : undefined
              }
            />
          </div>
        ))}
      </div>
      <Link to="/meds" className="mt-2 flex items-center justify-end gap-0.5 text-xs font-semibold text-ink-mute">
        상세 기록 <ChevronRight size={14} aria-hidden />
      </Link>
    </section>
  );
}

function ConditionPicker({
  value,
  onChange,
  readOnlyName,
  conditionShared,
}: {
  value: ConditionState;
  onChange: (s: ConditionState) => void;
  readOnlyName: string | null;
  conditionShared: boolean;
}) {
  return (
    <section aria-labelledby="condition-title">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="condition-title" className="text-[15px] font-bold">
          {readOnlyName ? `${readOnlyName}님의 지금 식사 컨디션` : '지금 식사 컨디션'}
        </h2>
        <span className="text-xs text-ink-mute">{readOnlyName ? (conditionShared ? '실시간 반영' : '공유되지 않음') : '목록 정렬에 반영돼요'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="식사 컨디션">
        {CONDITIONS.map((c) => {
          const active = value === c.id && conditionShared;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!!readOnlyName}
              onClick={() => onChange(c.id)}
              className={cx(
                'tap flex min-h-14 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center',
                active ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-[var(--shadow-soft)]' : 'border-line bg-white text-ink-soft',
                readOnlyName && !active && 'opacity-60',
              )}
            >
              <span className="text-[15px] font-bold">{c.label}</span>
              <span className="text-[11px] leading-tight opacity-80">
                {c.id === 'light' ? '담백하게 먹고 싶음' : c.id === 'hearty' ? '든든하게 먹을 수 있음' : '평소처럼'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'easy', label: STATUS_SHORT.easy },
  { id: 'depends', label: STATUS_SHORT.depends },
  { id: 'heavy', label: '부담' },
];

function FoodExplorer({
  condition,
  summaries,
  user,
  basisName,
}: {
  condition: ConditionState;
  summaries: ReactionSummary[] | undefined;
  user: User | null;
  basisName: string | null;
}) {
  const foods = useFoods();
  const { state, update } = useExploreState();
  const [selected, setSelected] = useState<string | null>(null);
  const deferredQ = useDeferredValue(state.q);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => (foods.data ? buildIndex(foods.data) : null), [foods.data]);
  const summaryMap = useMemo(() => new Map((summaries ?? []).map((s) => [s.foodId, s])), [summaries]);
  const result = useMemo(
    () =>
      foods.data && index
        ? explore(foods.data, index, { q: deferredQ, form: state.form, cuisine: state.cuisine, status: state.status, sort: state.sort }, condition, summaryMap)
        : null,
    [foods.data, index, deferredQ, state.form, state.cuisine, state.status, state.sort, condition, summaryMap],
  );

  // 탭 이동 후 돌아왔을 때 스크롤 위치 복원
  useLayoutEffect(() => {
    if (result && scrollMemory.explore > 0) {
      window.scrollTo(0, scrollMemory.explore);
    }
    // 최초 데이터 준비 시점에만 복원
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!result]);
  useEffect(() => {
    const onScroll = () => {
      scrollMemory.explore = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToResults = () => {
    const el = resultsRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  };

  const onOpen = useCallback((id: string) => setSelected(id), []);
  const selectedRanked = selected && result ? (result.items.find((i) => i.food.id === selected) ?? null) : null;
  const selectedFood = selected ? (foods.data?.find((f) => f.id === selected) ?? null) : null;

  return (
    <section aria-label="음식 탐색" ref={resultsRef} className="scroll-mt-2">
      {/* 스크롤 중에도 바로 쓸 수 있는 검색·필터 */}
      <div className="sticky top-0 z-30 -mx-4 space-y-2 border-b border-line/70 bg-white/97 px-4 pt-2 pb-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-mute" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={state.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="음식 이름으로 찾기 (예: 모밀, 죽, ㅅㄱㅅ)"
            aria-label="음식 검색"
            className="h-12 w-full rounded-2xl border border-line bg-white pr-11 pl-10 text-[16px] shadow-[var(--shadow-soft)] placeholder:text-ink-mute focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {state.q && (
            <button
              type="button"
              onClick={() => {
                update({ q: '' });
                inputRef.current?.focus();
              }}
              className="tap absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-mute hover:bg-ivory-deep"
              aria-label="검색어 지우기"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 scrollbar-none md:mx-0 md:flex-wrap md:px-0">
          <button
            type="button"
            onClick={() => update({ sort: state.sort === 'fit' ? 'name' : 'fit' })}
            className="tap inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 text-[13px] font-semibold text-ink-soft"
            aria-label={`정렬: ${state.sort === 'fit' ? '적합도순' : '이름순'} (눌러서 변경)`}
          >
            <ArrowDownUp size={14} aria-hidden />
            {state.sort === 'fit' ? '적합도' : '이름'}
          </button>
          <label className="relative shrink-0">
            <span className="sr-only">국가별 분류</span>
            <select
              value={state.cuisine ?? ''}
              onChange={(e) => {
                update({ cuisine: (e.target.value || null) as typeof state.cuisine });
                scrollToResults();
              }}
              className={cx(
                'h-9 appearance-none rounded-full border pr-7 pl-3 text-sm font-semibold',
                state.cuisine ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-line bg-white text-ink-soft',
              )}
            >
              <option value="">모든 나라</option>
              {CUISINES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronRight size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rotate-90 text-ink-mute" aria-hidden />
          </label>
          <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
          <div className="flex gap-1.5 md:flex-wrap" role="radiogroup" aria-label="음식 종류">
            {[{ id: null, label: '전체' }, ...FORM_CATEGORIES].map((c) => (
              <button
                key={c.id ?? 'all'}
                type="button"
                role="radio"
                aria-checked={state.form === c.id}
                onClick={() => {
                  update({ form: c.id });
                  scrollToResults();
                }}
                className={cx(
                  'tap h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap',
                  state.form === c.id ? 'bg-brand-600 text-white' : 'border border-line bg-white text-ink-soft',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0" role="radiogroup" aria-label="상태 필터">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={state.status === f.id}
              aria-label={`${f.id === 'all' ? '전체' : STATUS_LABEL[f.id]} ${result ? result.counts[f.id] : ''}개`}
              onClick={() => {
                update({ status: f.id });
                scrollToResults();
              }}
              className={cx(
                'tap inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[13px] font-semibold whitespace-nowrap',
                state.status === f.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-white text-ink-soft',
              )}
            >
              {f.id !== 'all' && <StatusIcon status={f.id} size="sm" />}
              {f.label}
              <span className="tabular-nums opacity-70" data-testid={`count-${f.id}`}>
                {result ? result.counts[f.id] : '–'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3">
        {foods.isLoading && <GridSkeleton />}
        {foods.error && <ErrorState message={`음식 목록을 불러오지 못했습니다. ${errorMessage(foods.error)}`} onRetry={() => foods.refetch()} />}
        {result && (state.form || state.cuisine || state.status !== 'all' || state.q) && result.items.length > 0 && (
          <div className="mb-3 flex items-center justify-between text-sm text-ink-soft">
            <span>
              <strong className="tabular-nums">{result.items.length}</strong>개 메뉴
            </span>
            <button
              type="button"
              onClick={() => update({ q: '', form: null, cuisine: null, status: 'all' })}
              className="tap rounded-full px-2 py-1 font-semibold text-ink-mute underline-offset-2 hover:underline"
            >
              조건 초기화
            </button>
          </div>
        )}
        {result && (
          <FoodResults
            items={result.items}
            sort={state.sort}
            summaryMap={summaryMap}
            onOpen={onOpen}
            emptyAction={
              <EmptyResults
                q={state.q}
                hasFilters={!!(state.form || state.cuisine || state.status !== 'all')}
                onClearQuery={() => update({ q: '' })}
                onClearFilters={() => update({ form: null, cuisine: null, status: 'all' })}
              />
            }
          />
        )}
      </div>

      <FoodSheet
        food={selectedFood}
        ranked={selectedRanked}
        condition={condition}
        summary={selectedFood ? summaryMap.get(selectedFood.id) : undefined}
        user={user}
        basisName={basisName}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className="h-[52px] animate-pulse rounded-[var(--radius-chip)] bg-ivory-deep" />
      ))}
    </div>
  );
}

function EmptyResults({
  q,
  hasFilters,
  onClearQuery,
  onClearFilters,
}: {
  q: string;
  hasFilters: boolean;
  onClearQuery: () => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
      <p className="font-semibold">{q ? `‘${q}’에 맞는 음식이 없어요` : '조건에 맞는 음식이 없어요'}</p>
      <p className="mt-1 text-sm text-ink-mute">다른 이름이나 줄임말로 검색하거나, 필터를 넓혀 보세요.</p>
      <div className="mt-4 flex justify-center gap-2">
        {q && (
          <Button variant="secondary" size="sm" onClick={onClearQuery}>
            검색어 지우기
          </Button>
        )}
        {hasFilters && (
          <Button variant="secondary" size="sm" onClick={onClearFilters}>
            필터 해제
          </Button>
        )}
      </div>
    </div>
  );
}

const FoodResults = memo(function FoodResults({
  items,
  sort,
  summaryMap,
  onOpen,
  emptyAction,
}: {
  items: RankedFood[];
  sort: 'fit' | 'name';
  summaryMap: Map<string, ReactionSummary>;
  onOpen: (id: string) => void;
  emptyAction: React.ReactNode;
}) {
  if (items.length === 0) return <>{emptyAction}</>;
  if (sort === 'name') {
    return <FoodGrid items={items} summaryMap={summaryMap} onOpen={onOpen} />;
  }
  const groups = (['easy', 'depends', 'heavy'] as const).map((s) => ({ status: s, items: items.filter((i) => i.status === s) })).filter((g) => g.items.length);
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.status} aria-label={STATUS_LABEL[g.status]}>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-ink-soft">
            <StatusIcon status={g.status} size="sm" />
            {STATUS_LABEL[g.status]}
            <span className="font-medium text-ink-mute tabular-nums">{g.items.length}</span>
          </h3>
          <FoodGrid items={g.items} summaryMap={summaryMap} onOpen={onOpen} />
        </section>
      ))}
    </div>
  );
});

function FoodGrid({ items, summaryMap, onOpen }: { items: RankedFood[]; summaryMap: Map<string, ReactionSummary>; onOpen: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="food-grid">
      {items.map((i) => (
        <li key={i.food.id} className="food-chip">
          <FoodChip item={i} hasRecord={summaryMap.has(i.food.id)} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

const FoodChip = memo(function FoodChip({ item, hasRecord, onOpen }: { item: RankedFood; hasRecord: boolean; onOpen: (id: string) => void }) {
  const { food, status, source } = item;
  const hint = conditionHint(food, source);
  return (
    <button
      type="button"
      onClick={() => onOpen(food.id)}
      className="tap flex h-full min-h-[60px] w-full items-center gap-2.5 rounded-[var(--radius-chip)] border border-line bg-white px-3 py-2 text-left hover:border-brand-200"
      aria-label={`${food.name}, ${STATUS_LABEL[status]}${hint ? `, ${hint}` : ''}${hasRecord ? ', 내 기록 있음' : ''}`}
      data-food={food.name}
    >
      <StatusIcon status={status} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] leading-snug font-semibold">{food.name}</span>
        {hint && <span className="block truncate text-[11px] leading-tight text-ink-mute">{hint}</span>}
      </span>
      {hasRecord && <span className="size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />}
    </button>
  );
});

function conditionHint(food: Food, source: RankedFood['source']): string | null {
  if (source === 'personal') return '내 기록 기준';
  if (food.variants.length > 0) return '조리법 확인';
  if (source === 'condition') return '컨디션 반영';
  return null;
}
