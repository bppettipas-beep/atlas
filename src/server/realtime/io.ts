import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../auth/cookies';
import { verifyAccessToken } from '../auth/tokens';
import { env } from '../env';
import { prisma } from '../prisma';
import type { NotificationDto } from '../../shared/types';

let io: SocketServer | null = null;

interface SocketAuth {
  userId: string;
  membershipId: string;
  companyId: string;
  role: 'OWNER' | 'MANAGER' | 'WORKER';
}

/** Minimal cookie parser — Socket.IO handshakes do not run Express middleware. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function companyRoom(companyId: string) {
  return `company:${companyId}`;
}

/** Room that only owners and managers join — used for privileged broadcasts. */
export function leadershipRoom(companyId: string) {
  return `company:${companyId}:leadership`;
}

export function memberRoom(membershipId: string) {
  return `member:${membershipId}`;
}

export function initRealtime(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: env.isProduction
      ? { origin: env.allowedOrigins, credentials: true }
      : { origin: env.allowedOrigins, credentials: true },
  });

  io.use(async (socket: Socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const claims = verifyAccessToken(cookies[ACCESS_COOKIE] ?? '');
      if (!claims) {
        next(new Error('unauthorized'));
        return;
      }
      const membership = await prisma.membership.findFirst({
        where: { id: claims.mid, status: 'ACTIVE', deactivatedAt: null },
        select: { id: true, companyId: true, userId: true, role: true },
      });
      if (!membership) {
        next(new Error('unauthorized'));
        return;
      }
      (socket.data as { auth: SocketAuth }).auth = {
        userId: membership.userId,
        membershipId: membership.id,
        companyId: membership.companyId,
        role: membership.role,
      };
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const auth = (socket.data as { auth: SocketAuth }).auth;
    socket.join(companyRoom(auth.companyId));
    socket.join(memberRoom(auth.membershipId));
    if (auth.role === 'OWNER' || auth.role === 'MANAGER') {
      socket.join(leadershipRoom(auth.companyId));
    }
    socket.emit('ready', { companyId: auth.companyId, membershipId: auth.membershipId });
  });

  return io;
}

type BroadcastPayload = Record<string, unknown>;

/** Broadcast to everyone in the company. Never include owner-only data here. */
export function emitToCompany(companyId: string, event: string, payload: BroadcastPayload = {}) {
  io?.to(companyRoom(companyId)).emit(event, payload);
}

/** Broadcast only to owners and managers of the company. */
export function emitToLeadership(companyId: string, event: string, payload: BroadcastPayload = {}) {
  io?.to(leadershipRoom(companyId)).emit(event, payload);
}

export function emitToMember(membershipId: string, event: string, payload: BroadcastPayload = {}) {
  io?.to(memberRoom(membershipId)).emit(event, payload);
}

export function emitNotification(membershipId: string, notification: NotificationDto) {
  emitToMember(membershipId, 'notification:new', { notification });
}

export function getIo(): SocketServer | null {
  return io;
}

export async function closeRealtime() {
  if (!io) return;
  await io.close();
  io = null;
}
