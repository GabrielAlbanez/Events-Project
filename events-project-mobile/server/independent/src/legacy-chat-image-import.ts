import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

const serverRoot = process.cwd();
const require = createRequire(path.join(serverRoot, 'package.json'));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const legacyFilenamePattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|avif)$/i;
const maximumImageBytes = 5 * 1024 * 1024;

interface LegacyImageRow {
  id: string;
  eventId: string;
  authorId: string;
  matchId: string | null;
  filename: string | null;
  messageId: string | null;
}

export interface LegacyChatImageImportResult {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  imported: number;
  alreadyImported: number;
  skipped: number;
  issues: string[];
}

function mediaType(bytes: Uint8Array, extension: string): string | null {
  if (extension === '.jpg' && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (extension === '.png' && bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (extension === '.webp' && bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  if (extension === '.avif' && bytes.length >= 16
    && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
    && ['avif', 'avis'].includes(String.fromCharCode(...bytes.subarray(8, 12)))) return 'image/avif';
  return null;
}

async function importRow(
  client: PoolClient,
  root: string,
  row: LegacyImageRow,
  apply: boolean,
): Promise<'eligible' | 'imported' | 'already' | string> {
  const match = row.filename ? legacyFilenamePattern.exec(row.filename) : null;
  if (!uuidPattern.test(row.id) || !row.matchId || !uuidPattern.test(row.matchId)
    || !row.messageId || !/^[1-9]\d*$/.test(row.messageId) || !match) {
    return 'legacy image metadata is incomplete or invalid';
  }
  if (match[1].toLowerCase() !== row.id.toLowerCase()) return 'legacy file id does not match its database record';
  const messageId = Number(row.messageId);
  if (!Number.isSafeInteger(messageId)) return 'legacy message id is invalid';
  const filename = `${match[1]}${path.extname(row.filename!).toLowerCase()}`;
  const target = path.resolve(root, filename);
  if (path.dirname(target) !== root) return 'legacy path escapes source directory';
  let info: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    info = await fs.lstat(target);
  } catch {
    return 'legacy file is missing';
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximumImageBytes) {
    return 'legacy file is not a regular image-sized file';
  }
  const bytes = await fs.readFile(target);
  if (bytes.length !== info.size || bytes.length > maximumImageBytes) return 'legacy file changed while being read or is too large';
  const contentType = mediaType(bytes, path.extname(filename).toLowerCase());
  if (!contentType) return 'legacy image content does not match its extension';

  const message = await client.query<{ matchId: string; authorId: string; clientId: string }>(
    `SELECT "matchId", "authorId", "clientId" FROM "PartyMessage" WHERE id = $1`,
    [messageId],
  );
  if (!message.rows[0] || message.rows[0].matchId !== row.matchId || message.rows[0].authorId !== row.authorId) {
    return 'legacy image has no matching private message';
  }
  if (!apply) return 'eligible';

  await client.query('BEGIN');
  try {
    const inserted = await client.query(
      `INSERT INTO "PrivateChatMedia" (id, "eventId", "matchId", "uploaderId", "contentType", bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [row.id, row.eventId, row.matchId, row.authorId, contentType, Buffer.from(bytes)],
    );
    if (!inserted.rowCount) {
      const existing = await client.query<{ same: boolean }>(
        `SELECT "eventId" = $2 AND "matchId" = $3 AND "uploaderId" = $4
                  AND "contentType" = $5 AND bytes = $6 AS same
           FROM "PrivateChatMedia" WHERE id = $1`,
        [row.id, row.eventId, row.matchId, row.authorId, contentType, Buffer.from(bytes)],
      );
      if (existing.rows[0]?.same !== true) {
        await client.query('ROLLBACK');
        return 'API media id already exists with different content or ownership';
      }
    }
    await client.query(
      `INSERT INTO "PartyMessageMedia" ("matchId", "authorId", "clientId", "mediaId")
       SELECT $1, $2, $4, $3
       ON CONFLICT ("matchId", "authorId", "clientId") DO NOTHING`,
      [row.matchId, row.authorId, row.id, message.rows[0].clientId],
    );
    const attached = await client.query<{ mediaId: string }>(
      `SELECT "mediaId" FROM "PartyMessageMedia"
        WHERE "matchId" = $1 AND "authorId" = $2 AND "clientId" = $3`,
      [row.matchId, row.authorId, message.rows[0].clientId],
    );
    if (attached.rows[0]?.mediaId !== row.id) {
      await client.query('ROLLBACK');
      return 'private message already has another image attached';
    }
    await client.query('COMMIT');
    return inserted.rowCount ? 'imported' : 'already';
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  }
}

export async function importLegacyChatImages(
  pool: Pool,
  sourceDirectory: string,
  apply = false,
): Promise<LegacyChatImageImportResult> {
  const suppliedRoot = path.resolve(sourceDirectory);
  const suppliedInfo = await fs.lstat(suppliedRoot);
  if (!suppliedInfo.isDirectory() || suppliedInfo.isSymbolicLink()) throw new Error('Source must be a real directory, not a symbolic link.');
  const root = await fs.realpath(suppliedRoot);
  const rootInfo = await fs.lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Source must be a real directory.');
  const client = await pool.connect();
  const result: LegacyChatImageImportResult = {
    dryRun: !apply, scanned: 0, eligible: 0, imported: 0, alreadyImported: 0, skipped: 0, issues: [],
  };
  try {
    const legacy = await client.query<LegacyImageRow>(
      `SELECT id, "eventId", "authorId",
              data->>'matchId' AS "matchId",
              data->>'filename' AS filename,
              data->>'messageId' AS "messageId"
         FROM "CommunityEntry"
        WHERE kind = 'party.image'
        ORDER BY "createdAt", id`,
    );
    result.scanned = legacy.rows.length;
    for (const row of legacy.rows) {
      const outcome = await importRow(client, root, row, apply);
      if (outcome === 'eligible') result.eligible += 1;
      else if (outcome === 'imported') { result.eligible += 1; result.imported += 1; }
      else if (outcome === 'already') { result.eligible += 1; result.alreadyImported += 1; }
      else {
        result.skipped += 1;
        result.issues.push(`${row.id}: ${outcome}`);
      }
    }
    return result;
  } finally {
    client.release();
  }
}

async function runCli(): Promise<void> {
  const dotenv = require('dotenv') as { config(options: { path: string }): void };
  dotenv.config({ path: path.resolve(serverRoot, '.env') });
  const sourceIndex = process.argv.indexOf('--source');
  const source = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : process.env.LEGACY_CHAT_UPLOAD_DIR;
  const apply = process.argv.includes('--apply');
  if (!source) {
    throw new Error('Provide --source <Events-Project\\.private-uploads\\chat> (or LEGACY_CHAT_UPLOAD_DIR). Defaults to dry-run; pass --apply to import.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Configure DATABASE_URL in the independent server environment.');
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  try {
    const result = await importLegacyChatImages(pool, source, apply);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void runCli().catch(cause => {
    console.error(cause instanceof Error ? cause.message : 'Legacy image import failed.');
    process.exitCode = 1;
  });
}
