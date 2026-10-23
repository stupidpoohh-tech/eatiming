import { ArrowRight, CheckCircle2, Info, Utensils } from 'lucide-react';
import type { RankedFood } from '../../shared/ranking';
import type { ReactionSummary } from '../../shared/types';

const FEATURED_IMAGE_POSITIONS: Record<string, string> = {
  '닭죽': '0% 50%',
  '계란찜': '50% 50%',
  '구운 흰살 생선 플레이트': '100% 50%',
};

const STATUS_COPY = {
  easy: '편한 후보',
  depends: '조건부',
  heavy: '부담 가능',
} as const;

export function EatimingMascot() {
  return (
    <svg className="h-auto w-full max-w-[154px] drop-shadow-[0_7px_15px_rgb(173_103_50_/_0.10)]" viewBox="0 0 166 145" aria-hidden="true">
      <path d="M50 24 43 9M72 18 72 3M94 20 103 7" fill="none" stroke="#FFA51E" strokeWidth="6" strokeLinecap="round" />
      <path d="M27 83 9 40M140 84 157 42" stroke="#A4A7B1" strokeWidth="5" strokeLinecap="round" />
      <path d="M7 31 15 52M4 34 11 53M11 28 18 51M17 30 20 55M152 31C167 28 170 52 153 57" stroke="#A4A7B1" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M23 69C14 54 25 39 40 39 46 12 78 12 92 23 109 15 133 32 133 50 153 56 152 79 141 92 149 120 120 139 86 139H59C24 140 8 110 23 69Z" fill="#FFFAF4" stroke="#F1E7DC" strokeWidth="2" />
      <ellipse cx="45" cy="86" rx="13" ry="8" fill="#F8C0B7" opacity=".74" />
      <ellipse cx="119" cy="86" rx="13" ry="8" fill="#F8C0B7" opacity=".74" />
      <path d="M58 70q7-11 15 0M93 70q7-11 15 0" fill="none" stroke="#423027" strokeWidth="4" strokeLinecap="round" />
      <path d="M70 88Q81 113 101 87Z" fill="#7D352A" stroke="#693027" strokeWidth="2" strokeLinejoin="round" />
      <path d="M79 101q10-10 20-3" stroke="#F3A29B" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M45 118q35 15 73-2l-10 24H56Z" fill="#F9A826" />
    </svg>
  );
}

function featureLabels(item: RankedFood): string[] {
  const labels: string[] = [];
  if (item.food.fat === 1) labels.push('기름기 적은 편');
  if (item.food.spice === 1) labels.push('자극 적은 편');
  if (item.food.variants.length > 0) labels.push('조리법 확인');
  if (labels.length === 0) labels.push('음식 특성 보기');
  return labels.slice(0, 2);
}

export function FeaturedShowcase({
  items,
  summaryMap,
  onOpen,
  basisName,
}: {
  items: RankedFood[];
  summaryMap: Map<string, ReactionSummary>;
  onOpen: (id: string) => void;
  basisName: string | null;
}) {
  if (items.length === 0) return null;
  const personalized = items.some((i) => i.source === 'personal');
  return (
    <section className="rounded-[26px] border border-line bg-white px-3.5 py-4 shadow-[var(--shadow-soft)] sm:p-5" aria-label="지금 살펴볼 추천 메뉴">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[19px] font-extrabold tracking-tight">
            지금 먹기 편한 메뉴
            <span title="개인 반응 기록이 충분한 메뉴는 개인 기록을, 그 외에는 공통 음식 특성을 기준으로 참고 분류합니다." aria-label="추천 기준 안내">
              <Info size={15} className="text-ink-mute" />
            </span>
          </h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
            {personalized ? `${basisName ? basisName + '님의' : '내'} 반응 기록을 우선해 보여드려요.` : '일반적인 음식 특성에 따른 추천 후보예요.'}
          </p>
        </div>
        <a href="#all-foods" className="tap mt-1 inline-flex shrink-0 items-center text-xs font-semibold text-ink-soft">전체 보기 <ArrowRight size={14} /></a>
      </div>
      <div className="-mx-3.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3.5 pb-1 scrollbar-none sm:mx-0 sm:px-0" data-testid="featured-scroll">
        {items.map((item) => {
          const pos = FEATURED_IMAGE_POSITIONS[item.food.name];
          const summary = summaryMap.get(item.food.id);
          const hasRecord = !!summary && (summary.good + summary.ok + summary.bad) > 0;
          return (
            <button key={item.food.id} type="button" onClick={() => onOpen(item.food.id)}
              className="tap w-[174px] shrink-0 snap-start overflow-hidden rounded-[19px] border border-line bg-white text-left shadow-[var(--shadow-soft)] sm:w-[198px]"
              data-testid="featured-food" data-featured-food={item.food.name}
              aria-label={`${item.food.name} 상세 보기, ${STATUS_COPY[item.status]}`}>
              <div className="relative aspect-[1.34] w-full overflow-hidden bg-[#FFF2E7]"
                role="img" aria-label={pos ? `${item.food.name} 사진` : `${item.food.name} 이미지 준비 중`}
                style={pos ? { backgroundImage: "url('/featured-foods.webp')", backgroundSize: '300% 100%', backgroundPosition: pos } : undefined}>
                {!pos && <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#FFF7ED] to-[#FBE8D7] text-brand-500"><Utensils size={30} /><span className="text-[11px] font-semibold text-brand-700">사진 준비 중</span></div>}
                <span className={`absolute bottom-2 left-2 rounded-full px-2 py-1 text-[10px] font-extrabold shadow-sm ${item.status === 'easy' ? 'bg-[#E6F4E8] text-[#287247]' : item.status === 'depends' ? 'bg-[#FFF0C9] text-[#976200]' : 'bg-[#FBE3E0] text-[#AF504B]'}`}>
                  {item.status === 'easy' && <CheckCircle2 size={11} className="mr-0.5 inline" />}
                  {STATUS_COPY[item.status]}
                </span>
              </div>
              <div className="min-h-[102px] space-y-1.5 p-2.5">
                <p className="line-clamp-1 text-[14px] font-extrabold">{item.food.name}</p>
                <p className="line-clamp-1 text-[11px] text-ink-soft">{item.source === 'personal' ? '내 식사 경험에 따른 분류' : item.food.description || '음식 특성을 확인해 보세요.'}</p>
                <div className="flex flex-wrap gap-1">
                  {hasRecord && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">먹어본 기록</span>}
                  {featureLabels(item).map((label) => <span key={label} className="rounded-full bg-[#FFF4ED] px-2 py-0.5 text-[10px] text-[#B86035]">{label}</span>)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-mute">일반 음식 분류는 섭취 안전을 보장하지 않으며 조리법과 개인 반응에 따라 달라질 수 있습니다.</p>
    </section>
  );
}
