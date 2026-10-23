import { Pill, UserRound, UsersRound, UtensilsCrossed } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useMe } from '../lib/queries';
import { cx } from './ui';

export function Logo() {
  return (
    <Link to="/" className="inline-flex items-center gap-2" aria-label="잇타이밍 홈">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#4F7A5E" />
        <circle cx="32" cy="34" r="17" fill="none" stroke="#FBF8F2" strokeWidth="5" />
        <path d="M32 22v12l8 5" fill="none" stroke="#FBF8F2" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="10" r="4" fill="#9CC3E6" />
      </svg>
      <span className="leading-none">
        <span className="block text-[17px] font-extrabold tracking-[0.08em] text-sage-700">EATIMING</span>
        <span className="block text-[10px] font-medium text-ink-mute">내 몸의 타이밍에 맞는 한 끼</span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: '/', label: '메뉴 탐색', icon: UtensilsCrossed, end: true },
  { to: '/meds', label: '약물 기록', icon: Pill },
  { to: '/together', label: '함께 보기', icon: UsersRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  return (
    <div className="mx-auto min-h-dvh max-w-5xl">
      <header className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 md:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="주요 메뉴">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('tap rounded-full px-4 py-2 text-sm font-semibold', isActive ? 'bg-sage-100 text-sage-700' : 'text-ink-soft hover:bg-ivory-deep')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Link
          to={me.data ? '/profile' : '/login'}
          className="tap inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm font-semibold text-ink-soft"
        >
          <UserRound size={18} aria-hidden />
          <span className="max-w-24 truncate">{me.data ? me.data.displayName : '로그인'}</span>
        </Link>
      </header>
      <main className="px-4 pb-28 md:px-6 md:pb-12">{children}</main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="하단 메뉴"
      >
        <ul className="mx-auto flex max-w-md">
          {NAV.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx('tap flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-semibold', isActive ? 'text-sage-700' : 'text-ink-mute')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-sage-100')}>
                      <n.icon size={20} aria-hidden />
                    </span>
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
