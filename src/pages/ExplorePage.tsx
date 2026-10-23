import { ArrowDownUp, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { buildIndex, explore, type StatusFilter } from '../../shared/explore';
import { CUISINES, FORM_CATEGORIES, STATUS_LABEL, STATUS_SHORT } from '../../shared/labels';
import type { RankedFood } from '../../shared/ranking';
import type { ConditionState, Food, ReactionSummary, User } from '../../shared/types';
import { FoodSheet } from '../components/FoodSheet';
import { MedStatusOverview } from '../components/MedStatusOverview';
import { EatimingMascot, FeaturedShowcase } from '../components/ExploreShowcase';
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
    <div className="space-y-4 pb-4">
      <div className="relative flex min-h-[130px] items-center justify-between gap-2 overflow-hidden pt-2">
        <div className="relative z-10 max-w-[75%] pb-1">
          <h1 className="text-[clamp(25px,6.5vw,35px)] font-extrabold leading-[1.22] tracking-tight text-ink">
            지금 <span className="text-brand-600">뭐 먹을까요?</span>
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft sm:text-sm">
            지금의 복용 기록과 내 식사 경험을 참고해<br className="hidden min-[375px]:block" /> 메뉴를 살펴보세요.
          </p>
        </div>
        <div className="pointer-events-none absolute right-0 bottom-[-14px] w-[29%] max-w-[154px] opacity-95">
          <EatimingMascot />
        </div>
      </div>

      {user && shares.data && shares.data.incoming.length > 0 && (
        <BasisPicker
          value={basisOwnerId}
          options={shares.data.incoming.map((s) => ({ id: s.owner.id, name: s.owner.displayName }))}
          onChange={(id) => update({ basisOwnerId: id })}
        />
      )}

      <TimelineSummary user={user} basisOwnerId={basisOwnerId} />
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
    return <MedStatusOverview views={sharedMedViews(view.medications)} now={now} tz={view.owner.timezone} />;
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
    <MedStatusOverview
      views={views}
      now={now}
      tz={tz}
      confirming={addLog.isPending}
      onConfirm={(m) => addLog.mutate(
        { medicationId: m.id, takenAt: oneTapTime(m.defaultTime, new Date(), tz) },
        { onSuccess: () => toast(`${m.name} 복용을 기록했어요`), onError: (e) => toast(errorMessage(e)) },
      )}
    />
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

  // 추천 영역은 검색·카테고리 필터와 무관하게 항상 기본 탐색 기준으로 계산한다.
  const baseline = useMemo(
    () => foods.data && index
      ? explore(foods.data, index, { q: '', form: null, cuisine: null, status: 'all', sort: 'fit' }, condition, summaryMap)
      : null,
    [foods.data, index, condition, summaryMap],
  );
  const featured = useMemo(() => {
    if (!baseline) return [];
    const targetNames = ['닭죽', '계란찜', '구운 흰살 생선 플레이트', '광어초밥', '순두부죽', '가케우동', '대구구이'];
    const candidates = baseline.items.filter((i) => i.status !== 'heavy');
    const personal = candidates.filter((i) => i.source === 'personal' && i.status === 'easy').slice(0, 2);
    const curated = targetNames.map((name) => candidates.find((i) => i.food.name === name)).filter((i): i is RankedFood => !!i);
    return [...new Map([...personal, ...curated, ...candidates].map((item) => [item.food.id, item])).values()].slice(0, 8);
  }, [baseline]);

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
  const selectedRanked = selected ? (result?.items.find((i) => i.food.id === selected) ?? baseline?.items.find((i) => i.food.id === selected) ?? null) : null;
  const selectedFood = selected ? (foods.data?.find((f) => f.id === selected) ?? null) : null;

  return (
    <div className="space-y-4">
      <FeaturedShowcase items={featured} summaryMap={summaryMap} onOpen={onOpen} basisName={basisName} />
      <section className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="추천 적합도 분류">
        {STATUS_FILTERS.slice(1).map((f) => (
          <button key={f.id} type="button" role="radio"
            aria-checked={state.status === f.id}
            aria-label={`${STATUS_LABEL[f.id as Exclude<StatusFilter, 'all'>]} ${result ? result.counts[f.id] : ''}개`}
            onClick={() => { update({ status: state.status === f.id ? 'all' : f.id }); scrollToResults(); }}
            className={cx(
              'tap flex min-h-[74px] flex-col items-start justify-center gap-1 rounded-[18px] border px-2.5 py-2.5 text-left sm:px-4',
              state.status === f.id ? 'border-brand-400 ring-1 ring-brand-100' : 'border-transparent',
              f.id === 'easy' ? 'bg-[#EFF8F1] text-[#287247]' : f.id === 'depends' ? 'bg-[#FFF8EC] text-[#A26B19]' : 'bg-[#FFF0EF] text-[#A9514C]',
            )}
          >
            <span className="text-[12px] font-extrabold sm:text-sm">
              {f.id === 'easy' ? '✓' : f.id === 'depends' ? '?' : '−'} {f.label} <span className="tabular-nums" data-testid={`count-${f.id}`}>{result ? result.counts[f.id] : '–'}</span>
            </span>
            <span className="text-[10px] leading-tight opacity-75">
              {f.id === 'easy' ? '편한 후보부터' : f.id === 'depends' ? '조건 확인' : '부담될 수 있어요'}
            </span>
          </button>
        ))}
      </section>
      <section aria-label="음식 탐색" id="all-foods" ref={resultsRef} className="scroll-mt-3 rounded-[26px] border border-line bg-white pt-4 shadow-[var(--shadow-soft)]">
        <div className="mb-2 flex items-center justify-between gap-2 px-3.5 sm:px-5">
          <div>
            <h2 className="text-[19px] font-extrabold">전체 메뉴 탐색</h2>
            <p className="mt-0.5 text-xs text-ink-soft">검색하거나 종류별로 찾아보세요.</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-ink-soft">전체 <strong data-testid="count-all">{result ? result.counts.all : '–'}</strong></span>
        </div>
      <div className="sticky top-0 z-30 space-y-2 border-b border-line/60 bg-white/95 px-3.5 pt-2 pb-3 backdrop-blur sm:px-5">
        <div className="relative">
          <Search size={19} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-mute" aria-hidden />
          <input ref={inputRef} type="search" inputMode="search" enterKeyHint="search" value={state.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="음식 이름으로 검색 (예: 계란찜, 김치찌개)"
            aria-label="음식 검색"
            className="h-12 w-full rounded-full border border-line bg-white pr-11 pl-11 text-[16px] placeholder:text-ink-mute focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {state.q && <button type="button" onClick={() => { update({ q: '' }); inputRef.current?.focus(); }}
            className="tap absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-mute"
            aria-label="검색어 지우기"><X size={18} /></button>}
        </div>
        <div className="-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="음식 종류">
          {[{ id: null, label: '전체', emoji: '▦' }, ...FORM_CATEGORIES.map((c) => ({ ...c, emoji: c.id === 'rice' ? '🍚' : c.id === 'soup' ? '🍲' : c.id === 'noodle' ? '🍜' : c.id === 'protein' ? '🐟' : c.id === 'healthy' ? '🥗' : '🍽️' }))].map((c) => (
            <button key={c.id ?? 'all'} type="button" role="radio" aria-checked={state.form === c.id}
              onClick={() => { update({ form: c.id }); scrollToResults(); }}
              className={cx('tap h-10 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap',
                state.form === c.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-soft')}>
              <span className="mr-1" aria-hidden>{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
        <details className="group rounded-xl bg-[#FAFAFB] px-3 py-1.5">
          <summary className="tap flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal size={15} aria-hidden /> 필터 및 정렬
            <ChevronRight size={14} aria-hidden className="ml-auto rotate-90 transition-transform group-open:-rotate-90" />
          </summary>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 pb-1 mt-2">
            <button type="button" onClick={() => update({ sort: state.sort === 'fit' ? 'name' : 'fit' })}
              className="tap inline-flex h-9 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs font-semibold"
              aria-label={`정렬: ${state.sort === 'fit' ? '적합도순' : '이름순'} (눌러서 변경)`}>
              <ArrowDownUp size={14} /> {state.sort === 'fit' ? '적합도순' : '이름순'}
            </button>
            <label className="text-xs font-semibold text-ink-soft">나라별
              <select aria-label="국가별 분류" value={state.cuisine ?? ''}
                onChange={(e) => { update({ cuisine: (e.target.value || null) as typeof state.cuisine }); scrollToResults(); }}
                className="ml-1 h-9 rounded-full border border-line bg-white px-2 text-xs">
                <option value="">전체</option>
                {CUISINES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            {(state.form || state.cuisine || state.status !== 'all' || state.q) && (
              <button type="button" onClick={() => update({ q: '', form: null, cuisine: null, status: 'all' })} className="tap ml-auto text-xs font-bold text-brand-700">조건 초기화</button>
            )}
          </div>
        </details>
      </div>

      <div className="px-3.5 pt-3 pb-4 sm:px-5">
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

      </section>
      <FoodSheet
        food={selectedFood}
        ranked={selectedRanked}
        condition={condition}
        summary={selectedFood ? summaryMap.get(selectedFood.id) : undefined}
        user={user}
        basisName={basisName}
        onClose={() => setSelected(null)}
      />
    </div>
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
