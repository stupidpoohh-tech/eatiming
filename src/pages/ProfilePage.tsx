import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { User } from '../../shared/types';
import { Button, Card, Field, inputClass, Sheet, Spinner, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { qk, resetSession, useMe } from '../lib/queries';
import { LoginRequired } from './MedsPage';

const TIMEZONES = [
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

export function ProfilePage() {
  const me = useMe();
  if (me.isLoading) return <Spinner />;
  if (!me.data) return <LoginRequired what="프로필" />;
  return <ProfileContent user={me.data} />;
}

function ProfileContent({ user }: { user: User }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user.displayName);
  const [tz, setTz] = useState(user.timezone);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const tzOptions = TIMEZONES.includes(user.timezone) ? TIMEZONES : [user.timezone, ...TIMEZONES];

  const save = useMutation({
    mutationFn: () => api<{ user: User }>('/me', { method: 'PATCH', body: { displayName: name.trim(), timezone: tz } }),
    onSuccess: (r) => {
      qc.setQueryData(qk.me, r.user);
      toast('저장했어요');
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST', body: {} }),
    onSettled: () => {
      resetSession(qc, null);
      navigate('/', { replace: true });
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4 pt-1">
      <h1 className="text-xl font-extrabold">프로필 · 설정</h1>
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="text-sm text-ink-mute">{user.email}</p>
          <Field label="표시 이름">
            <input className={inputClass} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="시간대" hint="투여 경과·복용 시간 계산의 날짜 기준입니다.">
            <select className={inputClass} value={tz} onChange={(e) => setTz(e.target.value)}>
              {tzOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" className="w-full" disabled={save.isPending || !name.trim()}>
            저장
          </Button>
        </form>
      </Card>

      <Card className="divide-y divide-line p-0">
        <Link to="/privacy" className="tap flex items-center justify-between px-4 py-3.5 font-medium">
          개인정보 처리 안내 <ChevronRight size={18} className="text-ink-mute" aria-hidden />
        </Link>
        <button type="button" onClick={() => logout.mutate()} className="tap flex w-full items-center justify-between px-4 py-3.5 font-medium">
          로그아웃 <LogOut size={18} className="text-ink-mute" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="tap flex w-full items-center justify-between px-4 py-3.5 font-medium text-clay-700"
        >
          회원 탈퇴 및 데이터 삭제 <ChevronRight size={18} aria-hidden />
        </button>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-ink-mute">
        잇타이밍은 의료 진단이나 처방을 제공하지 않습니다. 음식 분류와 경과 표시는 참고 정보이며, 약물 용량·일정 변경은 의료진과 상의하세요.
      </p>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="회원 탈퇴">
        <DeleteAccount
          onDone={() => {
            resetSession(qc, null);
            navigate('/', { replace: true });
          }}
        />
      </Sheet>
    </div>
  );
}

function DeleteAccount({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const del = useMutation({ mutationFn: () => api('/me', { method: 'DELETE', body: { password } }), onSuccess: onDone });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        del.mutate();
      }}
    >
      <p className="text-sm text-ink-soft">
        계정과 약물·복용 기록, 체감 패턴, 식사 컨디션, 음식 반응, 공유 관계가 <strong>즉시 영구 삭제</strong>되며 되돌릴 수 없습니다. 연결된 동반자의 접근도
        바로 차단됩니다.
      </p>
      <Field label="비밀번호 확인">
        <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {del.error && (
        <p className="text-sm text-clay-700" role="alert">
          {errorMessage(del.error)}
        </p>
      )}
      <Button type="submit" variant="danger" size="lg" className="w-full" disabled={!password || del.isPending}>
        모든 데이터 삭제하고 탈퇴
      </Button>
    </form>
  );
}
