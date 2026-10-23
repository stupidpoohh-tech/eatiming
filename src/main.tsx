import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/ui';
import { ApiError } from './lib/api';
import { useMe } from './lib/queries';
import { useRealtime } from './lib/realtime';
import { LoginPage, SignupPage } from './pages/AuthPages';
import { ExplorePage } from './pages/ExplorePage';
import { InvitePage } from './pages/InvitePage';
import { MedsPage } from './pages/MedsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProfilePage } from './pages/ProfilePage';
import { TogetherPage } from './pages/TogetherPage';
import { ExploreStateProvider } from './state';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

/** 본인 채널 구독: 다른 기기·탭에서 바꾼 내 기록을 바로 반영 */
function SelfSync() {
  const me = useMe();
  useRealtime(me.data?.id ?? null, me.data?.id ?? null);
  return null;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname !== '/') window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="pt-10 text-center">
      <p className="font-semibold">페이지를 찾을 수 없어요</p>
      <Link to="/" className="mt-2 inline-block text-brand-700 underline">
        메뉴 탐색으로 가기
      </Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ExploreStateProvider>
            <SelfSync />
            <ScrollTop />
            <AppShell>
              <Routes>
                <Route path="/" element={<ExplorePage />} />
                <Route path="/meds" element={<MedsPage />} />
                <Route path="/together" element={<TogetherPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/invite/:token" element={<InvitePage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
          </ExploreStateProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
