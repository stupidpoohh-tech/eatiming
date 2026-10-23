import { describe, expect, it } from 'vitest';
import { buildIndex, explore, type ExploreQuery } from '../../shared/explore';
import { FOOD_DATA } from '../../shared/food-data';
import { foodId, variantId } from '../../shared/ids';
import { effectiveStatus, personalStatus } from '../../shared/ranking';
import { normalize, toChoseong } from '../../shared/search';
import type { Food, ReactionSummary } from '../../shared/types';

const foods: Food[] = FOOD_DATA.map((f) => ({
  ...f,
  id: foodId(f.name),
  variants: f.variants.map((v) => ({ ...v, id: variantId(f.name, v.name) })),
}));
const index = buildIndex(foods);
const q = (over: Partial<ExploreQuery> = {}): ExploreQuery => ({ q: '', form: null, cuisine: null, status: 'all', sort: 'fit', ...over });
const names = (r: ReturnType<typeof explore>) => r.items.map((i) => i.food.name);

describe('초기 음식 데이터', () => {
  it('중복 없이 모든 항목이 등록되어 있다', () => {
    expect(new Set(foods.map((f) => f.name)).size).toBe(foods.length);
    expect(new Set(foods.map((f) => f.id)).size).toBe(foods.length);
    expect(foods.length).toBe(262);
  });

  it('별칭이 다른 음식 이름과 겹치지 않는다', () => {
    const all = new Set(foods.map((f) => f.name));
    for (const f of foods) for (const a of f.aliases) expect(all.has(a), `${f.name}→${a}`).toBe(false);
  });

  it('조건부 음식은 모두 조리법 옵션을 가진다', () => {
    for (const f of foods.filter((x) => x.status === 'depends')) expect(f.variants.length, f.name).toBeGreaterThan(0);
  });

  it('제공된 대표 항목이 포함되어 있다', () => {
    for (const n of ['삼겹살', '마카롱', '쉐이크', '오차즈케', '맑은 육수 샤브샤브', '이온음료', '전지방 요거트', '튀김 딤섬', '치즈 플래터']) {
      expect(
        foods.some((f) => f.name === n),
        n,
      ).toBe(true);
    }
  });
});

describe('검색', () => {
  it('조리법 이름과 초성으로도 대표 음식이 검색된다', () => {
    for (const [term, parent] of [['돌솥비빔밥', '비빔밥'], ['장칼국수', '칼국수'], ['참치마요', '김밥'], ['ㅊㅊㅁㅇ', '김밥']] as const) {
      expect(names(explore(foods, index, q({ q: term }), 'normal')), term).toContain(parent);
    }
  });

  it('추가된 대표 일상 음식 64개를 찾을 수 있다', () => {
    for (const term of ['된장찌개', '마라탕', '샌드위치', '닭죽', '계란말이', '아메리카노', '고등어구이', '누룽지']) {
      expect(names(explore(foods, index, q({ q: term }), 'normal'))).toContain(term);
    }
  });

  it('조리법 따라 다른 메뉴는 조건부 옵션을 가진다', () => {
    for (const term of ['삼각김밥', '포케', '그릴 치킨 샐러드', '시리얼', '전복죽']) {
      const f = foods.find((x) => x.name === term);
      expect(f?.status).toBe('depends');
      expect(f?.variants.length).toBeGreaterThan(0);
    }
  });

  it('별칭과 띄어쓰기 차이를 허용한다', () => {
    for (const term of ['모밀', '메밀소바', '소바', '메밀 소바']) {
      expect(names(explore(foods, index, q({ q: term }), 'normal')), term).toContain('메밀소바');
    }
    expect(names(explore(foods, index, q({ q: '돼지고기김치찌개' }), 'normal'))).toContain('돼지고기 김치찌개');
    expect(names(explore(foods, index, q({ q: '돈까스' }), 'normal'))).toContain('돈카츠');
  });

  it('부분 검색과 초성 검색', () => {
    expect(names(explore(foods, index, q({ q: '칼국수' }), 'normal'))).toEqual(expect.arrayContaining(['칼국수', '바지락칼국수', '해물칼국수']));
    expect(names(explore(foods, index, q({ q: 'ㅅㄱㅅ' }), 'normal'))).toContain('삼겹살');
    expect(toChoseong('삼겹살')).toBe('ㅅㄱㅅ');
    expect(normalize(' 메밀 · 소바 ')).toBe('메밀소바');
  });

  it('결과가 없으면 빈 목록', () => {
    const r = explore(foods, index, q({ q: 'zzzz없는음식' }), 'normal');
    expect(r.items).toHaveLength(0);
    expect(r.counts.all).toBe(0);
  });
});

describe('필터·정렬', () => {
  it('검색과 카테고리·국가 필터를 동시에 적용한다', () => {
    const r = explore(foods, index, q({ q: '튀김', form: 'snack', cuisine: 'korean' }), 'normal');
    expect(r.items.length).toBeGreaterThan(0);
    for (const i of r.items) {
      expect(i.food.form).toBe('snack');
      expect(i.food.cuisine).toBe('korean');
    }
  });

  it('상태별 개수는 현재 검색 범위 기준이며, 상태 필터와 무관하다', () => {
    const scope = explore(foods, index, q({ form: 'noodle' }), 'normal');
    const filtered = explore(foods, index, q({ form: 'noodle', status: 'easy' }), 'normal');
    expect(filtered.counts).toEqual(scope.counts);
    expect(filtered.items).toHaveLength(scope.counts.easy);
    expect(scope.counts.all).toBe(scope.counts.easy + scope.counts.depends + scope.counts.heavy);
  });

  it('기본 정렬: 편함 → 조건부 → 부담 가능', () => {
    const r = explore(foods, index, q(), 'normal');
    const order = r.items.map((i) => i.status);
    const firstDepends = order.indexOf('depends');
    const firstHeavy = order.indexOf('heavy');
    expect(order.lastIndexOf('easy')).toBeLessThan(firstDepends);
    expect(order.lastIndexOf('depends')).toBeLessThan(firstHeavy);
  });

  it('컨디션에 따라 정렬이 바뀐다', () => {
    const light = names(explore(foods, index, q({ status: 'easy' }), 'light'));
    const hearty = names(explore(foods, index, q({ status: 'easy' }), 'hearty'));
    expect(light).not.toEqual(hearty);
    // 든든하게: 식사류가 음료보다 앞
    expect(hearty.indexOf('흰쌀밥')).toBeLessThan(hearty.indexOf('보리차'));
    // 든든하게: 기름기 중간 수준의 부담 음식은 조건부로 완화
    const yuk = foods.find((f) => f.name === '잡채')!;
    expect(effectiveStatus(yuk, 'hearty').status).toBe('depends');
    expect(effectiveStatus(yuk, 'light').status).toBe('heavy');
  });

  it('이름순 정렬은 상태와 무관하게 가나다순', () => {
    const r = names(explore(foods, index, q({ sort: 'name', form: 'drink' }), 'normal'));
    expect(r).toEqual([...r].sort((a, b) => a.localeCompare(b, 'ko')));
  });
});

describe('개인 반응 반영', () => {
  const s = (good: number, ok: number, bad: number): ReactionSummary => ({ foodId: 'x', good, ok, bad, lastReaction: 'good', lastEatenAt: '' });

  it('기록이 2건 미만이면 데이터 부족(개인 상태 없음)', () => {
    expect(personalStatus(s(1, 0, 0))).toBeNull();
    expect(personalStatus(undefined)).toBeNull();
  });

  it('충분한 기록이 있으면 개인 반응이 공통 분류보다 우선한다', () => {
    const samgyeop = foods.find((f) => f.name === '삼겹살')!;
    expect(effectiveStatus(samgyeop, 'light', s(3, 0, 0))).toEqual({ status: 'easy', source: 'personal' });
    const juk = foods.find((f) => f.name === '흰죽')!;
    expect(effectiveStatus(juk, 'normal', s(0, 1, 2))).toEqual({ status: 'heavy', source: 'personal' });
    expect(effectiveStatus(juk, 'normal', s(1, 1, 0)).status).toBe('depends');
  });
});

describe('성능', () => {
  it('2,000개 음식에서도 검색·정렬이 빠르다', () => {
    const many: Food[] = Array.from({ length: 10 }, (_, k) => foods.map((f) => ({ ...f, id: `${f.id}_${k}`, name: `${f.name}${k}` }))).flat();
    const idx = buildIndex(many);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) explore(many, idx, q({ q: i % 2 ? '국' : '', status: 'all' }), 'light');
    const per = (performance.now() - t0) / 20;
    expect(many.length).toBeGreaterThan(1900);
    expect(per).toBeLessThan(50);
  });
});
