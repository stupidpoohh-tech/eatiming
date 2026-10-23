import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  ConditionState,
  Food,
  FoodReaction,
  MealCondition,
  Medication,
  MedicationLog,
  ReactionSummary,
  SharedView,
  SharePermissions,
  User,
} from '../../shared/types';
import { DEFAULT_TIMEZONE } from '../../shared/time';
import { api, ApiError } from './api';

export const qk = {
  me: ['me'] as const,
  foods: ['foods'] as const,
  condition: ['condition'] as const,
  medications: ['medications'] as const,
  summaries: ['reactions', 'summary'] as const,
  reactions: (foodId: string) => ['reactions', 'food', foodId] as const,
  shares: ['shares'] as const,
  shared: (ownerId: string) => ['shared', ownerId] as const,
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useTimeZone(): string {
  return useMe().data?.timezone ?? DEFAULT_TIMEZONE;
}

export function useFoods() {
  return useQuery({
    queryKey: qk.foods,
    queryFn: async () => (await api<{ foods: Food[] }>('/foods')).foods,
    staleTime: 10 * 60_000,
  });
}

const GUEST_CONDITION_KEY = 'et_guest_condition';

function readGuestCondition(): ConditionState {
  try {
    const v = localStorage.getItem(GUEST_CONDITION_KEY);
    if (v === 'light' || v === 'normal' || v === 'hearty') return v;
  } catch {
    /* storage unavailable */
  }
  return 'normal';
}

/** 로그인 사용자는 서버 값, 비로그인 사용자는 이 기기에만 저장되는 값 */
export function useMyCondition(user: User | null | undefined) {
  const qc = useQueryClient();
  const [guest, setGuest] = useState<ConditionState>(readGuestCondition);
  const query = useQuery({
    queryKey: qk.condition,
    queryFn: async () => (await api<{ condition: MealCondition }>('/condition')).condition,
    enabled: !!user,
  });
  const mutation = useMutation({
    mutationFn: (state: ConditionState) => api<{ condition: MealCondition }>('/condition', { method: 'PUT', body: { state } }),
    onMutate: async (state) => {
      await qc.cancelQueries({ queryKey: qk.condition });
      const prev = qc.getQueryData<MealCondition>(qk.condition);
      qc.setQueryData<MealCondition>(qk.condition, { state, symptoms: prev?.symptoms ?? [], updatedAt: new Date().toISOString() });
      return { prev };
    },
    onError: (_e, _s, ctx) => ctx?.prev && qc.setQueryData(qk.condition, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.condition }),
  });
  const setState = (state: ConditionState) => {
    if (user) mutation.mutate(state);
    else {
      setGuest(state);
      try {
        localStorage.setItem(GUEST_CONDITION_KEY, state);
      } catch {
        /* noop */
      }
    }
  };
  return {
    state: user ? (query.data?.state ?? 'normal') : guest,
    updatedAt: user ? query.data?.updatedAt : undefined,
    loading: !!user && query.isLoading,
    setState,
    error: mutation.error,
  };
}

export function useMedications(enabled: boolean) {
  return useQuery({
    queryKey: qk.medications,
    queryFn: () => api<{ medications: Medication[]; logs: MedicationLog[] }>('/medications'),
    enabled,
  });
}

export function useReactionSummaries(enabled: boolean) {
  return useQuery({
    queryKey: qk.summaries,
    queryFn: async () => (await api<{ summaries: ReactionSummary[] }>('/reactions/summary')).summaries,
    enabled,
  });
}

export function useFoodReactions(foodId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.reactions(foodId),
    queryFn: async () => (await api<{ reactions: FoodReaction[] }>(`/reactions?foodId=${encodeURIComponent(foodId)}`)).reactions,
    enabled,
  });
}

export interface SharesData {
  outgoing: { id: string; viewer: { id: string; displayName: string; email?: string }; permissions: SharePermissions; createdAt: string }[];
  incoming: { id: string; owner: { id: string; displayName: string }; permissions: SharePermissions; createdAt: string }[];
  invites: { id: string; permissions: SharePermissions; createdAt: string; expiresAt: string }[];
}

export function useShares(enabled: boolean) {
  return useQuery({ queryKey: qk.shares, queryFn: () => api<SharesData>('/shares'), enabled });
}

export function useSharedView(ownerId: string | null) {
  return useQuery({
    queryKey: qk.shared(ownerId ?? ''),
    queryFn: async () => (await api<{ view: SharedView }>(`/shared/${ownerId}`)).view,
    enabled: !!ownerId,
    retry: (count, e) => !(e instanceof ApiError && (e.status === 403 || e.status === 401)) && count < 2,
  });
}

/**
 * 경과 시간 표시를 자동으로 갱신하기 위한 현재 시각 (30초 간격 + 화면 복귀 시 다시 렌더링).
 * 데이터 변경으로 렌더링될 때도 항상 최신 시각을 돌려준다.
 */
export function useNow(intervalMs = 30_000): Date {
  const [, setTick] = useState(0);
  useEffect(() => {
    const tick = () => setTick((n) => n + 1);
    const id = setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return new Date();
}

/** 계정이 바뀔 때(로그인·로그아웃·탈퇴) 개인 데이터 캐시를 초기화한다. 구독 중인 화면은 자동으로 다시 불러온다. */
export function resetSession(qc: QueryClient, user: User | null) {
  qc.setQueryData(qk.me, user);
  return qc.resetQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'foods' });
}
