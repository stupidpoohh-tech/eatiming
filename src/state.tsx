import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ExploreQuery } from '../shared/explore';

export interface ExploreState extends ExploreQuery {
  /** 동반자로서 다른 사용자의 컨디션 기준으로 탐색할 때 그 사용자 ID */
  basisOwnerId: string | null;
}

const DEFAULT: ExploreState = { q: '', form: null, cuisine: null, status: 'all', sort: 'fit', basisOwnerId: null };
const KEY = 'et_explore_state';

function read(): ExploreState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  return DEFAULT;
}

const Ctx = createContext<{ state: ExploreState; update: (patch: Partial<ExploreState>) => void } | null>(null);

/** 탭을 오가도 검색어·필터·스크롤 위치가 유지되도록 앱 단위로 보관한다. */
export function ExploreStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ExploreState>(read);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* noop */
    }
  }, [state]);
  return <Ctx.Provider value={{ state, update: (patch) => setState((s) => ({ ...s, ...patch })) }}>{children}</Ctx.Provider>;
}

export function useExploreState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('ExploreStateProvider missing');
  return ctx;
}

export const scrollMemory = { explore: 0 };
