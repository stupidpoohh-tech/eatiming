import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, Link2, Radio, Share2, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime } from '../../shared/time';
import type { SharedView, SharePermissions, User } from '../../shared/types';
import { SharedViewPanel } from '../components/SharedViewPanel';
import { Button, Card, cx, ErrorState, Sheet, Spinner, Switch, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { qk, useMe, useShares, useSharedView, useTimeZone, type SharesData } from '../lib/queries';
import { useRealtime, type RealtimeStatus } from '../lib/realtime';
import { useExploreState } from '../state';
import { LoginRequired } from './MedsPage';

export const PERMISSION_ITEMS: { key: keyof SharePermissions; label: string; description: string }[] = [
  { key: 'shareCondition', label: '현재 식사 컨디션', description: '담백하게·보통·든든하게 상태' },
  { key: 'shareMedProgress', label: '약물 투여 경과', description: '투여 후 며칠째인지, 오늘 복용 확인 여부와 경과' },
  { key: 'shareMedSchedule', label: '등록 약물 및 복용 시간', description: '약물 이름, 용량, 기본 복용 시간, 최근 기록 시각' },
  { key: 'shareReactions', label: '음식 반응 요약', description: '편했던·불편했던 음식 목록 (메모는 공유되지 않음)' },
];

export const DEFAULT_PERMISSIONS: SharePermissions = { shareCondition: true, shareMedProgress: false, shareMedSchedule: false, shareReactions: false };

export function TogetherPage() {
  const me = useMe();
  if (me.isLoading) return <Spinner />;
  if (!me.data) return <LoginRequired what="함께 보기" />;
  return <TogetherContent user={me.data} />;
}

function TogetherContent({ user }: { user: User }) {
  const shares = useShares(true);
  if (shares.isLoading) return <Spinner />;
  if (shares.error) return <ErrorState message={errorMessage(shares.error)} onRetry={() => shares.refetch()} />;
  const data = shares.data!;
  return (
    <div className="space-y-6">
      <div className="pt-1">
        <h1 className="text-xl font-extrabold">함께 보기</h1>
        <p className="text-sm text-ink-mute">가족이나 연인과 지금 상태를 공유하고, 같은 메뉴 목록을 함께 볼 수 있어요.</p>
      </div>

      {data.incoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">나에게 공유된 사람</h2>
          {data.incoming.map((s) => (
            <IncomingCard key={s.id} share={s} user={user} />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">내가 공유하는 사람</h2>
        {data.outgoing.length === 0 && <p className="text-sm text-ink-mute">아직 연결된 동반자가 없습니다.</p>}
        {data.outgoing.map((s) => (
          <OutgoingCard key={s.id} share={s} />
        ))}
        <InviteCard invites={data.invites} />
      </section>

      <p className="px-1 text-xs leading-relaxed text-ink-mute">
        동반자는 허용한 항목만 볼 수 있고 내 기록을 수정할 수 없습니다. 약물 관련 정보는 기본적으로 공유되지 않으며, 공유를 해제하면 즉시 접근이 차단됩니다.
      </p>
    </div>
  );
}

function LiveBadge({ status }: { status: RealtimeStatus }) {
  const label = status === 'live' ? '실시간 연결됨' : status === 'connecting' ? '연결 중' : status === 'revoked' ? '공유 해제됨' : '재연결 대기';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        status === 'live' ? 'bg-sage-100 text-sage-700' : 'bg-ivory-deep text-ink-mute',
      )}
    >
      <Radio size={12} aria-hidden className={status === 'live' ? 'animate-pulse' : ''} />
      {label}
    </span>
  );
}

function IncomingCard({ share, user }: { share: SharesData['incoming'][number]; user: User }) {
  const status = useRealtime(share.owner.id, user.id);
  const view = useSharedView(share.owner.id);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { update } = useExploreState();
  const leave = useMutation({
    mutationFn: () => api(`/shares/${share.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shares });
      toast('연결을 끊었어요');
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-lg font-bold">{share.owner.displayName}님</h3>
        <LiveBadge status={status} />
      </div>
      {view.isLoading ? <Spinner /> : view.error ? <ErrorState message={errorMessage(view.error)} /> : <SharedViewPanel view={view.data!} />}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            update({ basisOwnerId: share.owner.id });
            navigate('/');
          }}
        >
          {share.owner.displayName}님 기준으로 메뉴 보기
        </Button>
        <Button variant="ghost" aria-label="연결 끊기" onClick={() => confirm(`${share.owner.displayName}님과의 연결을 끊을까요?`) && leave.mutate()}>
          <UserMinus size={18} />
        </Button>
      </div>
    </Card>
  );
}

function PermissionSwitches({ value, onChange, disabled }: { value: SharePermissions; onChange: (v: SharePermissions) => void; disabled?: boolean }) {
  return (
    <div className="divide-y divide-line">
      {PERMISSION_ITEMS.map((item) => (
        <Switch
          key={item.key}
          label={item.label}
          description={item.description}
          checked={value[item.key]}
          disabled={disabled}
          onChange={(v) => onChange({ ...value, [item.key]: v })}
        />
      ))}
    </div>
  );
}

function OutgoingCard({ share }: { share: SharesData['outgoing'][number] }) {
  const tz = useTimeZone();
  const qc = useQueryClient();
  const toast = useToast();
  const [preview, setPreview] = useState(false);
  const save = useMutation({
    mutationFn: (permissions: SharePermissions) => api(`/shares/${share.id}`, { method: 'PATCH', body: { permissions } }),
    onMutate: async (permissions) => {
      const prev = qc.getQueryData<SharesData>(qk.shares);
      if (prev) qc.setQueryData<SharesData>(qk.shares, { ...prev, outgoing: prev.outgoing.map((o) => (o.id === share.id ? { ...o, permissions } : o)) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.shares, ctx.prev);
      toast(errorMessage(e));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.shares }),
  });
  const revoke = useMutation({
    mutationFn: () => api(`/shares/${share.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shares });
      toast('공유를 해제했어요. 즉시 접근이 차단됩니다.');
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <Card>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{share.viewer.displayName}님</h3>
          <p className="text-xs text-ink-mute">{formatDateTime(new Date(share.createdAt), tz)}부터 공유 중</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setPreview(true)}>
          <Eye size={15} aria-hidden /> 미리보기
        </Button>
      </div>
      <div className="mt-2">
        <PermissionSwitches value={share.permissions} onChange={(p) => save.mutate(p)} />
      </div>
      <Button variant="danger" className="mt-3 w-full" onClick={() => confirm(`${share.viewer.displayName}님과의 공유를 해제할까요?`) && revoke.mutate()}>
        공유 해제
      </Button>
      <Sheet open={preview} onClose={() => setPreview(false)} title={`${share.viewer.displayName}님에게 보이는 화면`}>
        {preview && <PreviewBody path={`/shares/${share.id}/preview`} />}
      </Sheet>
    </Card>
  );
}

function PreviewBody({ path, permissions }: { path: string; permissions?: SharePermissions }) {
  const q = useQuery({
    queryKey: ['preview', path, permissions],
    queryFn: async () => (await api<{ view: SharedView }>(path, permissions ? { method: 'POST', body: { permissions } } : undefined)).view,
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-mute">서버에서 동반자 권한으로 실제 구성한 화면입니다.</p>
      <SharedViewPanel view={q.data!} />
    </div>
  );
}

function InviteCard({ invites }: { invites: SharesData['invites'] }) {
  const tz = useTimeZone();
  const qc = useQueryClient();
  const toast = useToast();
  const [permissions, setPermissions] = useState<SharePermissions>(DEFAULT_PERMISSIONS);
  const [agreed, setAgreed] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const sensitive = permissions.shareMedProgress || permissions.shareMedSchedule || permissions.shareReactions;

  const create = useMutation({
    mutationFn: () => api<{ token: string; expiresAt: string }>('/invites', { method: 'POST', body: { permissions } }),
    onSuccess: (r) => {
      setLink({ url: `${location.origin}/invite/${r.token}`, expiresAt: r.expiresAt });
      qc.invalidateQueries({ queryKey: qk.shares });
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shares });
      toast('초대를 취소했어요');
    },
  });

  const copy = async () => {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: '잇타이밍 함께 보기 초대', url: link.url });
        return;
      }
      await navigator.clipboard.writeText(link.url);
      toast('초대 링크를 복사했어요');
    } catch {
      /* 사용자가 공유를 취소한 경우 */
    }
  };

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="font-bold">동반자 초대</h3>
        <p className="text-sm text-ink-mute">공유할 항목을 고른 뒤 초대 링크를 보내세요. 링크는 72시간 동안 한 번만 사용할 수 있어요.</p>
      </div>
      {link ? (
        <div className="space-y-2 rounded-xl bg-sage-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-sage-700">
            <Link2 size={16} aria-hidden /> 초대 링크가 만들어졌어요
          </p>
          <input
            readOnly
            value={link.url}
            className="h-10 w-full rounded-lg border border-line bg-white px-2 text-xs"
            aria-label="초대 링크"
            data-testid="invite-link"
            onFocus={(e) => e.target.select()}
          />
          <p className="text-xs text-ink-mute">{formatDateTime(new Date(link.expiresAt), tz)}까지 유효 · 이 화면을 벗어나면 링크를 다시 볼 수 없어요.</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={copy}>
              {'share' in navigator ? <Share2 size={16} aria-hidden /> : <Copy size={16} aria-hidden />} 링크 보내기
            </Button>
            <Button variant="secondary" onClick={() => setLink(null)}>
              완료
            </Button>
          </div>
        </div>
      ) : (
        <>
          <PermissionSwitches value={permissions} onChange={setPermissions} />
          <label className="flex items-start gap-2 rounded-xl bg-ivory p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-sage-600" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              선택한 항목을 초대를 수락한 사람에게 공유하는 데 동의합니다.
              {sensitive && (
                <span className="block text-xs text-clay-700">약물·음식 반응은 민감한 건강 관련 정보입니다. 믿을 수 있는 사람에게만 공유하세요.</span>
              )}
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPreview(true)}>
              <Eye size={16} aria-hidden /> 미리보기
            </Button>
            <Button className="flex-1" disabled={!agreed || create.isPending} onClick={() => create.mutate()}>
              초대 링크 만들기
            </Button>
          </div>
        </>
      )}
      {invites.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-mute">대기 중인 초대</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{formatDateTime(new Date(i.expiresAt), tz)}까지</span>
                <button type="button" className="tap rounded-full px-2 py-1 text-xs font-semibold text-clay-700" onClick={() => cancel.mutate(i.id)}>
                  취소
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Sheet open={preview} onClose={() => setPreview(false)} title="동반자에게 보일 화면">
        {preview && <PreviewBody path="/shares/preview" permissions={permissions} />}
      </Sheet>
    </Card>
  );
}
