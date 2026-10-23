import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { qk } from './queries';

export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'revoked';

const CLOSE_REVOKED = 4403;

/**
 * 실시간 채널 구독. 서버는 "바뀐 주제"만 알려주고, 여기서 해당 쿼리를 다시 불러온다.
 * ownerId === selfId 이면 본인 채널(다른 기기·탭 동기화), 아니면 동반자 채널.
 */
export function useRealtime(ownerId: string | null, selfId: string | null): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('idle');

  useEffect(() => {
    if (!ownerId || !selfId) {
      setStatus('idle');
      return;
    }
    const isSelf = ownerId === selfId;
    let ws: WebSocket | null = null;
    let retry = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const refresh = (topics: string[]) => {
      if (isSelf) {
        if (topics.includes('condition')) qc.invalidateQueries({ queryKey: qk.condition });
        if (topics.includes('medications')) qc.invalidateQueries({ queryKey: qk.medications });
        if (topics.includes('reactions')) qc.invalidateQueries({ queryKey: ['reactions'] });
      } else {
        qc.invalidateQueries({ queryKey: qk.shared(ownerId) });
      }
      if (topics.includes('shares') || topics.includes('account')) qc.invalidateQueries({ queryKey: qk.shares });
    };

    const connect = () => {
      if (stopped) return;
      setStatus('connecting');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/realtime?owner=${encodeURIComponent(ownerId)}`);
      ws.onopen = () => {
        retry = 0;
        setStatus('live');
        // 연결 직후 놓친 변경이 있을 수 있으므로 한 번 갱신
        refresh(['condition', 'medications', 'reactions', 'shares']);
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000);
      };
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'changed') refresh(msg.topics);
          if (msg.type === 'revoked') {
            stopped = true;
            setStatus('revoked');
            refresh(['shares']);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = (e) => {
        clearInterval(ping);
        if (e.code === CLOSE_REVOKED) {
          stopped = true;
          setStatus('revoked');
          refresh(['shares']);
          return;
        }
        if (stopped) return;
        setStatus('offline');
        const delay = Math.min(30_000, 1000 * 2 ** retry++);
        timer = setTimeout(connect, delay);
      };
    };
    connect();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !stopped && ws?.readyState !== WebSocket.OPEN) {
        clearTimeout(timer);
        retry = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', onVisible);
      ws?.close();
    };
  }, [ownerId, selfId, qc]);

  return status;
}
