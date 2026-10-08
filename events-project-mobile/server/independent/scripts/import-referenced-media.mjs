import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
export const maximumAssetBytes = 5 * 1024 * 1024;
const mediaUrl = id => `/v1/media/events/${id}`;

export function parseReferencedUpload(value) {
  if (typeof value !== 'string' || !value.startsWith('/uploads/')) return null;
  const match = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]{0,254})$/.exec(value);
  if (!match || match[1] === '.' || match[1] === '..' || match[1].includes('..')) {
    throw new Error(`Unsafe upload reference: ${JSON.stringify(value)}`);
  }
  return match[1];
}

export function inspectImage(bytes, fileName) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maximumAssetBytes) {
    throw new Error(`Image size must be between 1 byte and ${maximumAssetBytes} bytes.`);
  }
  const extension = path.extname(fileName).toLowerCase();
  const detected = (() => {
    if (bytes.length >= 24
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF'
      && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp'
      && ['avif', 'avis'].some(brand => bytes.subarray(8, Math.min(bytes.readUInt32BE(0), bytes.length, 128))
        .includes(Buffer.from(brand)))) return 'image/avif';
    return null;
  })();
  const expectedByExtension = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
  };
  if (!detected || expectedByExtension[extension] !== detected) {
    throw new Error(`Unsupported or mismatched image format for ${fileName}.`);
  }
  return detected;
}

async function resolveSafeSource(sourcePath) {
  const absolute = path.resolve(sourcePath);
  const rootStat = await lstat(absolute);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('The uploads source must be an existing, non-symlink directory.');
  }
  const root = await realpath(absolute);
  return async fileName => {
    // parseReferencedUpload already restricts this to one basename component.
    const target = path.join(root, fileName);
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`Referenced asset is not a regular, non-symlink file: ${fileName}`);
    }
    const resolvedTarget = await realpath(target);
    if (path.dirname(resolvedTarget) !== root) {
      throw new Error(`Referenced asset resolves outside the uploads source: ${fileName}`);
    }
    if (targetStat.size <= 0 || targetStat.size > maximumAssetBytes) {
      throw new Error(`Referenced asset has an invalid size: ${fileName}`);
    }
    const bytes = await readFile(resolvedTarget);
    if (bytes.length !== targetStat.size) throw new Error(`Referenced asset changed while reading: ${fileName}`);
    const mimeType = inspectImage(bytes, fileName);
    return { bytes, mimeType, digest: createHash('sha256').update(bytes).digest('hex') };
  };
}

function addReference(map, value, reference) {
  const fileName = parseReferencedUpload(value);
  if (!fileName) return;
  const current = map.get(value) ?? { fileName, references: [] };
  current.references.push(reference);
  map.set(value, current);
}

async function readReferences(client) {
  const refs = new Map();
  const events = await client.query(
    `SELECT id, banner, carrossel FROM events
     WHERE banner LIKE '/uploads/%'
        OR EXISTS (SELECT 1 FROM unnest(carrossel) AS media_url WHERE media_url LIKE '/uploads/%')
     FOR UPDATE`,
  );
  for (const row of events.rows) {
    addReference(refs, row.banner, { table: 'events.banner', eventId: row.id, old: row.banner });
    const carouselValues = new Set();
    for (let index = 0; index < row.carrossel.length; index++) {
      if (carouselValues.has(row.carrossel[index])) continue;
      carouselValues.add(row.carrossel[index]);
      addReference(refs, row.carrossel[index], {
        table: 'events.carrossel',
        eventId: row.id,
        old: row.carrossel[index],
      });
    }
  }
  const users = await client.query(
    `SELECT id, image FROM "User" WHERE image LIKE '/uploads/%' FOR UPDATE`,
  );
  for (const row of users.rows) {
    addReference(refs, row.image, { table: 'User.image', userId: row.id, old: row.image });
  }
  const partyProfiles = await client.query(
    `SELECT "eventId", "userId", "photoUrl" FROM "PartyProfile"
     WHERE "photoUrl" LIKE '/uploads/%' FOR UPDATE`,
  );
  for (const row of partyProfiles.rows) {
    addReference(refs, row.photoUrl, {
      table: 'PartyProfile.photoUrl',
      eventId: row.eventId,
      userId: row.userId,
      old: row.photoUrl,
    });
  }
  return refs;
}

async function persistAndRewrite(client, refs, readSource) {
  const imported = new Map();
  for (const [oldUrl, value] of refs) {
    const asset = await readSource(value.fileName);
    const id = randomUUID();
    await client.query(
      `INSERT INTO "MobileEventMedia" (id, "ownerId", "mimeType", size, content)
       VALUES ($1, NULL, $2, $3, $4)`,
      [id, asset.mimeType, asset.bytes.length, asset.bytes],
    );
    const newUrl = mediaUrl(id);
    imported.set(oldUrl, { newUrl, sha256: asset.digest, bytes: asset.bytes.length });
    for (const reference of value.references) {
      let result;
      if (reference.table === 'events.banner') {
        result = await client.query(
          `UPDATE events SET banner = $1, "updatedAt" = NOW()
           WHERE id = $2 AND banner = $3`,
          [newUrl, reference.eventId, reference.old],
        );
      } else if (reference.table === 'events.carrossel') {
        result = await client.query(
          `UPDATE events SET carrossel = array_replace(carrossel, $1, $2), "updatedAt" = NOW()
           WHERE id = $3 AND $1 = ANY(carrossel)`,
          [reference.old, newUrl, reference.eventId],
        );
      } else if (reference.table === 'User.image') {
        result = await client.query(
          `UPDATE "User" SET image = $1 WHERE id = $2 AND image = $3`,
          [newUrl, reference.userId, reference.old],
        );
      } else {
        result = await client.query(
          `UPDATE "PartyProfile" SET "photoUrl" = $1, "updatedAt" = NOW()
           WHERE "eventId" = $2 AND "userId" = $3 AND "photoUrl" = $4`,
          [newUrl, reference.eventId, reference.userId, reference.old],
        );
      }
      if (result.rowCount !== 1) {
        throw new Error(`Reference changed during import: ${reference.table} ${reference.old}`);
      }
    }
  }
  return imported;
}

function parseArguments(argv) {
  let source;
  let apply = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--source' && argv[index + 1]) {
      source = argv[++index];
    } else if (arg === '--help' || arg === '-h') {
      return { help: true };
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  if (!source || !path.isAbsolute(source)) {
    throw new Error('Pass --source with an absolute path to the existing web public/uploads directory.');
  }
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for the mobile API database.');
  return { source, apply };
}

export async function runImport({ source, apply, databaseUrl = process.env.DATABASE_URL, log = console.log }) {
  if (!source || !path.isAbsolute(source)) throw new Error('An absolute --source path is required.');
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const readSource = await resolveSafeSource(source);
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    if (apply) {
      await client.query(
        `CREATE TABLE IF NOT EXISTS "MobileEventMedia" (
           id text PRIMARY KEY,
           "ownerId" text REFERENCES "User"(id) ON DELETE SET NULL,
           "mimeType" text NOT NULL,
           size integer NOT NULL CHECK (size > 0 AND size <= ${maximumAssetBytes}),
           content bytea NOT NULL,
           "createdAt" timestamptz NOT NULL DEFAULT NOW()
         )`,
      );
      await client.query(`ALTER TABLE "MobileEventMedia" ALTER COLUMN "ownerId" DROP NOT NULL`);
    }
    const refs = await readReferences(client);
    const checked = new Map();
    for (const [oldUrl, value] of refs) {
      const file = await readSource(value.fileName);
      checked.set(oldUrl, { ...file, fileName: value.fileName, references: value.references });
    }
    const countRefs = [...refs.values()].reduce((sum, value) => sum + value.references.length, 0);
    log(`${apply ? 'APPLY' : 'DRY RUN'}: ${refs.size} distinct assets, ${countRefs} references.`);
    for (const [oldUrl, value] of refs) {
      const file = checked.get(oldUrl);
      log(`${oldUrl} -> ${apply ? '(mobile media UUID assigned on commit)' : '(not written)'}; ${file.mimeType}; ${file.bytes.length} bytes; ${value.references.length} reference(s).`);
    }
    if (apply) {
      const imported = await persistAndRewrite(client, refs, async fileName => {
        const match = [...checked].find(([, item]) => item.fileName === fileName);
        if (!match) throw new Error(`Asset was not preflighted: ${fileName}`);
        return match[1];
      });
      await client.query('COMMIT');
      log(`Committed ${imported.size} imported assets and ${countRefs} reference rewrites.`);
    } else {
      await client.query('ROLLBACK');
      log('Dry run complete; database and source files were not modified.');
    }
    return { assets: refs.size, references: countRefs, applied: Boolean(apply) };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Report the original validation/database error.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const helpText = [
  'One-time referenced media import into the mobile API PostgreSQL database.',
  'Default is a read-only dry run. --apply is required to import/update rows.',
  'Usage: node import-referenced-media.mjs --source "C:\\\\path\\\\Events-Project\\\\public\\\\uploads" [--apply]',
  'Required environment: DATABASE_URL (mobile API database).',
].join('\n');

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      console.log(helpText);
    } else {
      await runImport(args);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Media import failed.');
    process.exitCode = 1;
  }
}
