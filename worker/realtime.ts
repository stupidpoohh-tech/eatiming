/**
 * 실시간 공유 허브 (Durable Object, 사용자 1명당 1개).
 * - 데이터 자체는 보내지 않고 "어떤 주제가 바뀌었는지"만 알린다. 클라이언트는 API로 다시 조회하며,
 *   API가 매 요청마다 공유 권한을 검사하므로 권한 밖 데이터는 이 경로로 새지 않는다.
 * - 동반자 소켓에는 허용된 주제만 전달하고, 공유가 해제되면 즉시 소켓을 닫는다.
 */
import { DurableObject } from 'cloudflare:workers';
import type { SharePermissions } from '../shared/types';

export type Topic = 'condition' | 'medications' | 'reactions' | 'shares' | 'account';

interface Attachment {
  viewerId: string;
  /** null = 본인 소켓(모든 주제 수신) */
  permissions: SharePermissions | null;
}

export const CLOSE_REVOKED = 4403;

function allowed(topic: Topic, p: SharePermissions | null): boolean {
  if (!p) return true;
  switch (topic) {
    case 'condition':
      return p.shareCondition;
    case 'medications':
      return p.shareMedProgress || p.shareMedSchedule;
    case 'reactions':
      return p.shareReactions;
    default:
      return true;
  }
}

export class ShareHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const viewerId = request.headers.get('X-Viewer-Id');
    if (!viewerId) return new Response('forbidden', { status: 403 });
    const permsHeader = request.headers.get('X-Permissions');
    const attachment: Attachment = { viewerId, permissions: permsHeader ? (JSON.parse(permsHeader) as SharePermissions) : null };
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [`viewer:${viewerId}`]);
    pair[1].serializeAttachment(attachment);
    pair[1].send(JSON.stringify({ type: 'ready' }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async notify(topics: Topic[]): Promise<number> {
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      const visible = topics.filter((t) => allowed(t, a?.permissions ?? null));
      if (visible.length === 0) continue;
      try {
        ws.send(JSON.stringify({ type: 'changed', topics: visible }));
        sent++;
      } catch {
        /* 이미 닫힌 소켓 */
      }
    }
    return sent;
  }

  async updatePermissions(viewerId: string, permissions: SharePermissions): Promise<void> {
    for (const ws of this.ctx.getWebSockets(`viewer:${viewerId}`)) {
      ws.serializeAttachment({ viewerId, permissions } satisfies Attachment);
    }
  }

  async disconnectViewer(viewerId: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets(`viewer:${viewerId}`)) {
      try {
        ws.send(JSON.stringify({ type: 'revoked' }));
        ws.close(CLOSE_REVOKED, 'revoked');
      } catch {
        /* noop */
      }
    }
  }

  async connectionCount(): Promise<number> {
    return this.ctx.getWebSockets().length;
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') ws.send('pong');
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      /* noop */
    }
  }
}

export function hub(env: Env, userId: string): DurableObjectStub<ShareHub> {
  const ns = env.SHARE_HUB as unknown as DurableObjectNamespace<ShareHub>;
  return ns.get(ns.idFromName(userId));
}

export async function notify(env: Env, userId: string, topics: Topic[]): Promise<void> {
  try {
    await hub(env, userId).notify(topics);
  } catch (err) {
    console.error('realtime notify failed', (err as Error).message);
  }
}

export async function notifyAccountDeleted(
  env: Env,
  userId: string,
  related: { owner_id: string; viewer_id: string }[],
): Promise<void> {
  await Promise.all(
    related.map(async (r) => {
      if (r.owner_id === userId) {
        await hub(env, userId).disconnectViewer(r.viewer_id).catch(() => undefined);
        await notify(env, r.viewer_id, ['shares']);
      } else {
        await hub(env, r.owner_id).disconnectViewer(userId).catch(() => undefined);
        await notify(env, r.owner_id, ['shares']);
      }
    }),
  );
}
