import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { User } from '../../shared/types';
import { Button, Card, Field, inputClass } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { resetSession } from '../lib/queries';

function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

function useAuthSuccess(fallback: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (user: User) => {
    resetSession(qc, user);
    navigate(safeNext(params.get('next'), fallback), { replace: true });
  };
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [params] = useSearchParams();
  const onSuccess = useAuthSuccess('/');
  const login = useMutation({
    mutationFn: () => api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } }),
    onSuccess: (r) => onSuccess(r.user),
  });
  const next = params.get('next');
  return (
    <div className="mx-auto max-w-sm pt-4">
      <h1 className="text-2xl font-extrabold">로그인</h1>
      <p className="mt-1 text-sm text-ink-mute">투여 경과와 내 음식 반응을 이어서 확인하세요.</p>
      <Card className="mt-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <Field label="이메일">
            <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="비밀번호">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {login.error && (
            <p className="text-sm text-clay-700" role="alert">
              {errorMessage(login.error)}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
            로그인
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-soft">
        처음이신가요?{' '}
        <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700 underline underline-offset-2">
          가입하기
        </Link>
      </p>
    </div>
  );
}

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [agree, setAgree] = useState(false);
  const [params] = useSearchParams();
  const onSuccess = useAuthSuccess('/meds?welcome=1');
  const signup = useMutation({
    mutationFn: () =>
      api<{ user: User }>('/auth/signup', {
        method: 'POST',
        body: { email, password, displayName, agreePrivacy: agree, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      }),
    onSuccess: (r) => onSuccess(r.user),
  });
  const next = params.get('next');
  return (
    <div className="mx-auto max-w-sm pt-4">
      <h1 className="text-2xl font-extrabold">가입하기</h1>
      <p className="mt-1 text-sm text-ink-mute">이메일과 표시 이름만 받습니다.</p>
      <Card className="mt-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (agree) signup.mutate();
          }}
        >
          <Field label="표시 이름" hint="동반자에게 보이는 이름입니다.">
            <input
              className={inputClass}
              autoComplete="nickname"
              maxLength={30}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </Field>
          <Field label="이메일">
            <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="비밀번호" hint="8자 이상">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <label className="flex items-start gap-2 rounded-xl bg-ivory p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              <Link to="/privacy" className="font-semibold text-brand-700 underline underline-offset-2" target="_blank">
                개인정보 처리 안내
              </Link>
              를 확인했으며, 서비스 제공을 위한 개인정보(이메일, 약물·식사 기록) 수집·이용에 동의합니다.
            </span>
          </label>
          {signup.error && (
            <p className="text-sm text-clay-700" role="alert">
              {errorMessage(signup.error)}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={!agree || signup.isPending}>
            가입하고 시작하기
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-soft">
        이미 계정이 있나요?{' '}
        <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700 underline underline-offset-2">
          로그인
        </Link>
      </p>
    </div>
  );
}
