import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { SharePermissions } from '../../shared/types';
import { Button, Card, ErrorState, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { qk, useMe } from '../lib/queries';
import { PERMISSION_ITEMS } from './TogetherPage';

interface InviteInfo {
  state: 'valid' | 'expired' | 'used' | 'revoked' | 'invalid';
  requiresLogin?: boolean;
  ownerName?: string;
  isOwner?: boolean;
  permissions?: SharePermissions;
}

const STATE_MESSAGE: Record<Exclude<InviteInfo['state'], 'valid'>, string> = {
  expired: '만료된 초대 링크입니다. 새 링크를 요청해 주세요.',
  used: '이미 사용된 초대 링크입니다.',
  revoked: '취소된 초대 링크입니다.',
  invalid: '유효하지 않은 초대 링크입니다.',
};

export function InvitePage() {
  const { token = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const info = useQuery({
    queryKey: ['invite', token, me.data?.id ?? null],
    queryFn: () => api<InviteInfo>(`/invites/${encodeURIComponent(token)}`),
    enabled: !me.isLoading,
  });
  const accept = useMutation({
    mutationFn: () => api<{ ownerId: string }>(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: {} }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.shares });
      navigate('/together', { replace: true });
    },
  });

  if (me.isLoading || info.isLoading) return <Spinner />;
  if (info.error) return <ErrorState message={errorMessage(info.error)} onRetry={() => info.refetch()} />;
  const data = info.data!;
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="mx-auto max-w-md pt-4">
      <h1 className="text-2xl font-extrabold">함께 보기 초대</h1>
      <Card className="mt-4 space-y-4">
        {data.state !== 'valid' ? (
          <p className="text-ink-soft">{STATE_MESSAGE[data.state]}</p>
        ) : data.requiresLogin ? (
          <>
            <p className="text-ink-soft">초대를 확인하려면 로그인하거나 가입해 주세요.</p>
            <div className="flex gap-2">
              <Link
                to={`/login?next=${next}`}
                className="tap inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white"
              >
                로그인
              </Link>
              <Link
                to={`/signup?next=${next}`}
                className="tap inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-line bg-white font-semibold"
              >
                가입하기
              </Link>
            </div>
          </>
        ) : data.isOwner ? (
          <p className="text-ink-soft">본인이 만든 초대 링크입니다. 동반자에게 링크를 보내 주세요.</p>
        ) : (
          <>
            <p>
              <strong>{data.ownerName}</strong>님이 잇타이밍에서 다음 정보를 함께 보자고 초대했어요.
            </p>
            <ul className="space-y-1.5 text-sm">
              {PERMISSION_ITEMS.filter((i) => data.permissions?.[i.key]).map((i) => (
                <li key={i.key} className="rounded-lg bg-brand-50 px-3 py-2 text-brand-700">
                  {i.label}
                </li>
              ))}
              {PERMISSION_ITEMS.every((i) => !data.permissions?.[i.key]) && <li className="text-ink-mute">공유 항목 없음 (나중에 상대가 설정할 수 있어요)</li>}
            </ul>
            <p className="text-xs text-ink-mute">공유받은 정보는 볼 수만 있으며, 상대의 기록을 수정할 수 없습니다.</p>
            {accept.error && (
              <p className="text-sm text-clay-700" role="alert">
                {errorMessage(accept.error)}
              </p>
            )}
            <Button size="lg" className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
              초대 수락
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
