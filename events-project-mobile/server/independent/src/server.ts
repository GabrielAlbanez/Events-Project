import { config as loadEnv } from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import nodemailer from 'nodemailer';
import { Pool } from 'pg';
import path from 'node:path';
import { createAccessToken } from './access-token';
import { PostgresAccountService } from './account-service';
import { createGoogleTokenVerifier } from './google-token-verifier';
import { PostgresEventReader } from './event-repository';
import { PostgresEventAuthoringService } from './event-authoring-service';
import { PostgresEventReadCalendarService } from './event-read-calendar-service';
import { PostgresEventMediaService } from './event-media-service';
import { PostgresAdminService } from './admin-service';
import { createImpersonationToken } from './impersonation-token';
import { PostgresCommunityService, PostgresCommunityRealtimeAccess } from './community-service';
import { PostgresChatPartyService } from './chat-party-service';
import { PostgresInteractionService } from './interaction-service';
import { PostgresPromoterService } from './promoter-service';
import { closeIndependentAuthServer, createIndependentAuthServer } from './http-server';
import { PostgresAuthRepository } from './postgres-auth-repository';
import { listenForProfileImageChanges } from './profile-image-notifications';
import { PostgresRealtimePresence } from './realtime-presence';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Configure DATABASE_URL no ambiente privado da API mobile.');
const authSecret = process.env.MOBILE_AUTH_SECRET;
if (!authSecret || Buffer.byteLength(authSecret, 'utf8') < 32) {
  throw new Error('Configure MOBILE_AUTH_SECRET com pelo menos 32 bytes.');
}
const googleAudiences = (process.env.GOOGLE_NATIVE_CLIENT_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30_000,
});
pool.on('error', error => {
  console.error('Independent mobile database connection error:', error.message);
});

const google = new OAuth2Client();
const publicAppUrl = process.env.MOBILE_APP_URL || 'eventmap:///';
const eventReader = new PostgresEventReader(pool);
const publicApiUrl = process.env.MOBILE_API_PUBLIC_URL?.trim().replace(/\/+$/, '');
if (publicApiUrl) {
  const parsed = new URL(publicApiUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('MOBILE_API_PUBLIC_URL deve conter apenas a origem pública da API (https://api.exemplo.com).');
  }
}
const publicWebOrigin = process.env.MOBILE_WEB_MEDIA_ORIGIN?.trim().replace(/\/+$/, '');
if (publicWebOrigin) {
  const parsed = new URL(publicWebOrigin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('MOBILE_WEB_MEDIA_ORIGIN deve conter apenas a origem pública da Web (https://www.exemplo.com).');
  }
}
const eventMedia = new PostgresEventMediaService(pool, publicApiUrl, publicWebOrigin);
const accessToken = createAccessToken(authSecret);
const impersonationTokens = createImpersonationToken(authSecret);
const realtimePresence = new PostgresRealtimePresence(pool, 'mobile');
const adminService = new PostgresAdminService(pool, undefined, impersonationTokens, accessToken);
const community = new PostgresCommunityService(pool);
const chatParty = new PostgresChatPartyService(pool);
const server = createIndependentAuthServer({
  accounts: new PostgresAccountService(
    pool,
    accessToken,
    async (to, subject, text) => {
      const emailUser = process.env.EMAIL_USER;
      const emailPassword = process.env.EMAIL_PASS;
      if (!emailUser || !emailPassword) throw new Error('Configure EMAIL_USER e EMAIL_PASS no ambiente da API mobile.');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        auth: { user: emailUser, pass: emailPassword },
      });
      await transporter.sendMail({ from: emailUser, to, subject, text });
    },
    publicAppUrl,
  ),
  repository: new PostgresAuthRepository(pool),
  events: eventReader,
  eventAuthoring: new PostgresEventAuthoringService(pool),
  eventReadCalendar: new PostgresEventReadCalendarService(pool),
  eventMedia,
  admin: adminService,
  impersonationTokens,
  community,
  chatParty,
  realtimeAccess: new PostgresCommunityRealtimeAccess(pool),
  readActiveUserIds: () => realtimePresence.readActiveUserIds(),
  onActiveUserIdsChanged: userIds => realtimePresence.updateUsers(userIds),
  listenForProfileImageChanges: (onChange, onRoleChange) => listenForProfileImageChanges(
    process.env.MOBILE_DATABASE_LISTEN_URL || databaseUrl,
    onChange,
    onRoleChange,
  ),
  interactions: new PostgresInteractionService(
    pool,
    new PostgresEventReader(pool),
    authSecret,
  ),
  promoters: new PostgresPromoterService(pool, eventReader),
  accessToken,
  browserOrigins: (process.env.MOBILE_API_BROWSER_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  verifyGoogleIdToken: createGoogleTokenVerifier(google, googleAudiences),
});

const port = Number(process.env.MOBILE_API_PORT || 4100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('MOBILE_API_PORT inválida.');
}
realtimePresence.start();
server.listen(port, process.env.MOBILE_API_HOST || '127.0.0.1', () => {
  console.log(`Independent mobile auth API available on port ${port}.`);
});

async function shutdown(): Promise<void> {
  await closeIndependentAuthServer(server);
  await realtimePresence.close();
  await pool.end();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
