import type { NextRequest } from 'next/server';
import * as communityEvent from '@/app/api/community/events/[eventId]/route';
import * as communityRooms from '@/app/api/community/rooms/route';
import * as communityRoom from '@/app/api/community/rooms/[roomId]/route';
import * as activity from '@/app/api/community/activity/route';
import * as eventChat from '@/app/api/event-chat/[eventId]/route';
import * as connections from '@/app/api/party-connections/[eventId]/route';
import * as match from '@/app/api/party-connections/[eventId]/matches/[matchId]/route';
import * as matchImages from '@/app/api/party-connections/[eventId]/matches/[matchId]/images/route';
import * as matchImage from '@/app/api/party-connections/[eventId]/matches/[matchId]/images/[imageId]/route';
import * as registration from '@/app/api/events/[id]/registration/route';
import * as checkInToken from '@/app/api/events/[id]/check-in-token/route';
import * as checkIn from '@/app/api/events/[id]/check-in/route';
import * as reports from '@/app/api/events/[id]/reports/route';
import * as calendar from '@/app/api/event-calendar/[id]/route';
import * as engagement from '@/app/api/event-engagement/[id]/route';
import * as adminEvents from '@/app/api/admin/events/route';
import * as adminUserEvents from '@/app/api/admin/users/[id]/events/route';
import * as suspension from '@/app/api/admin/users/[id]/suspension/route';
import * as adminReports from '@/app/api/admin/reports/route';
import * as adminReport from '@/app/api/admin/reports/[id]/route';
import * as partyReports from '@/app/api/admin/party-reports/route';
import * as impersonationAudit from '@/app/api/admin/impersonation/audit/route';
import * as impersonationStatus from '@/app/api/admin/impersonation/status/route';
import * as recovery from '@/app/api/account/recovery/route';
import * as resend from '@/app/api/account/resend-verification/route';
import * as reset from '@/app/api/account/reset-password/route';
import * as upload from '@/app/api/upload/route';
import * as media from '@/app/api/media/[filename]/route';

type Handler = (request: NextRequest, context: { params: Record<string, string> }) => Promise<Response>;
type RouteModule = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', Handler>>;
export interface Route { template: string; module: RouteModule; public?: boolean; binary?: boolean; admin?: boolean; }
const route = (template: string, module: unknown, options: Omit<Route, 'template' | 'module'> = {}): Route => ({ template, module: module as RouteModule, ...options });
/** Explicit capability list. Never resolve an arbitrary module/function from a request. */
export const routes: Route[] = [
  route('/community/events/:eventId', communityEvent, { public: true }),
  route('/community/rooms', communityRooms), route('/community/rooms/:roomId', communityRoom),
  route('/community/activity', activity), route('/event-chat/:eventId', eventChat),
  route('/party-connections/:eventId', connections),
  route('/party-connections/:eventId/matches/:matchId', match),
  route('/party-connections/:eventId/matches/:matchId/images', matchImages),
  route('/party-connections/:eventId/matches/:matchId/images/:imageId', matchImage, { binary: true }),
  route('/events/:id/registration', registration, { public: true }), route('/events/:id/check-in-token', checkInToken),
  route('/events/:id/check-in', checkIn), route('/events/:id/reports', reports),
  route('/event-calendar/:id', calendar, { public: true, binary: true }),
  route('/event-engagement/:id', engagement, { public: true }),
  route('/admin/events', adminEvents, { admin: true }), route('/admin/users/:id/events', adminUserEvents, { admin: true }),
  route('/admin/users/:id/suspension', suspension, { admin: true }), route('/admin/reports', adminReports, { admin: true }),
  route('/admin/reports/:id', adminReport, { admin: true }), route('/admin/party-reports', partyReports, { admin: true }),
  route('/admin/impersonation/audit', impersonationAudit, { admin: true }),
  route('/admin/impersonation/status', impersonationStatus, { admin: true }),
  route('/auth/recovery', recovery, { public: true }), route('/auth/resend-verification', resend, { public: true }),
  route('/auth/reset-password', reset, { public: true }), route('/upload', upload),
  route('/media/:filename', media, { public: true, binary: true }),
];
export function matchTemplate(template: string, pathname: string): Record<string, string> | null {
  const expected = template.split('/'), actual = pathname.split('/');
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index++) {
    if (expected[index].startsWith(':')) {
      try { params[expected[index].slice(1)] = decodeURIComponent(actual[index]); } catch { return null; }
      if (!params[expected[index].slice(1)] || /[\/\\\u0000]/.test(params[expected[index].slice(1)])) return null;
    } else if (actual[index] !== expected[index]) return null;
  }
  return params;
}
