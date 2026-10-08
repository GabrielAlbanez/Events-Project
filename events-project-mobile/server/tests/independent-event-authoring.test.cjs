const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

const sourceRoot = path.resolve(__dirname, '../independent/src');

async function loadTypeScript(entry) {
  const filename = path.join(sourceRoot, entry);
  const result = await build({
    entryPoints: [filename],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  return compiled.exports;
}

const baseEvent = {
  nome: 'Feira de Outono',
  banner: 'https://cdn.example.test/banner.jpg',
  carrossel: [],
  descricao: 'Uma feira local.',
  dataInicio: '2026-10-10',
  dataFim: '2026-10-10',
  endereco: 'Praça Central',
  linkParaCompra: '',
  category: 'Cultura',
  isFree: true,
  priceCents: 0,
  capacity: null,
  lat: null,
  lng: null,
  startTime: '10:00',
  endTime: '18:00',
  timezone: 'America/Sao_Paulo',
};

function fixtureEvent(overrides = {}) {
  return {
    id: 'event-1',
    ...baseEvent,
    userId: 'promoter-1',
    validate: false,
    status: 'PENDING',
    recurrenceSeriesId: null,
    ...overrides,
  };
}

function fakePool({ role = 'PROMOTER', event = fixtureEvent() } = {}) {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes('FROM "User" WHERE id = $1')) {
        return { rows: [{ id: 'promoter-1', name: 'Organizer', role }], rowCount: 1 };
      }
      if (/SELECT \* FROM events\s+WHERE id = \$1/.test(sql)) {
        return { rows: [event], rowCount: 1 };
      }
      if (sql.includes('SELECT id, nome, "userId", status FROM events')) {
        return { rows: [event], rowCount: 1 };
      }
      if (sql.includes('RETURNING *')) {
        return { rows: [event], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return {
    queries,
    pool: { async connect() { return client; } },
  };
}

let serviceModule;
let readModule;
let mediaModule;
async function readServices() {
  [readModule, mediaModule] = await Promise.all([
    loadTypeScript('event-read-calendar-service.ts'),
    loadTypeScript('event-media-service.ts'),
  ]);
}

test('event authoring service rejects malformed event data before database access', async () => {
  serviceModule ??= await loadTypeScript('event-authoring-service.ts');
  const { pool, queries } = fakePool();
  const service = new serviceModule.PostgresEventAuthoringService(pool);
  await assert.rejects(
    service.create({ id: 'promoter-1', role: 'PROMOTER' }, { ...baseEvent, dataInicio: '2026-02-30' }),
    error => error.status === 400,
  );
  assert.equal(queries.length, 0);
});

test('event creation authorizes the database role and persists submitted events as pending', async () => {
  serviceModule ??= await loadTypeScript('event-authoring-service.ts');
  const { pool, queries } = fakePool();
  const service = new serviceModule.PostgresEventAuthoringService(pool);
  const result = await service.create({ id: 'promoter-1', role: 'PROMOTER' }, baseEvent, true);
  const insert = queries.find(query => query.sql.startsWith('INSERT INTO events'));
  assert.ok(insert);
  assert.equal(insert.values[9], 'promoter-1');
  assert.equal(insert.values[10], 'PENDING');
  assert.equal(result.success, true);
  assert.ok(queries.some(query => query.sql.includes('INSERT INTO "EventHistory"')));

  const denied = fakePool({ role: 'BASIC' });
  const unauthorized = new serviceModule.PostgresEventAuthoringService(denied.pool);
  await assert.rejects(
    unauthorized.create({ id: 'promoter-1', role: 'BASIC' }, baseEvent),
    error => error.status === 403,
  );
});

test('event updates retain existing uploaded media when the mobile form omits it', async () => {
  serviceModule ??= await loadTypeScript('event-authoring-service.ts');
  const existing = fixtureEvent({
    banner: 'https://cdn.example.test/current-banner.jpg',
    carrossel: ['https://cdn.example.test/current-slide.jpg'],
  });
  const { pool, queries } = fakePool({ event: existing });
  const service = new serviceModule.PostgresEventAuthoringService(pool);
  const { banner, carrossel, ...formFields } = baseEvent;
  await service.update({ id: 'promoter-1', role: 'PROMOTER' }, 'event-1', formFields);
  const update = queries.find(query => query.sql.startsWith('UPDATE events SET'));
  assert.equal(update.values[1], existing.banner);
  assert.deepEqual(update.values[2], existing.carrossel);
});

test('admin correction stores CHANGES_REQUESTED, the note, and its audit action', async () => {
  serviceModule ??= await loadTypeScript('event-authoring-service.ts');
  const { pool, queries } = fakePool({ role: 'ADMIN' });
  const service = new serviceModule.PostgresEventAuthoringService(pool);
  await service.requestCorrection(
    { id: 'promoter-1', role: 'ADMIN' },
    'event-1',
    { reason: 'Inclua o endereço completo.' },
  );
  const update = queries.find(query => query.sql.startsWith('UPDATE events SET status = \'CHANGES_REQUESTED\''));
  assert.ok(update);
  assert.equal(update.values[0], 'Inclua o endereço completo.');
  const history = queries.find(query => query.sql.includes('INSERT INTO "EventHistory"'));
  assert.equal(history.values[6], 'CHANGES_REQUESTED');
  assert.equal(history.values[7], 'Inclua o endereço completo.');
});

test('recurrence creates indexed draft occurrences using the requested calendar interval', async () => {
  serviceModule ??= await loadTypeScript('event-authoring-service.ts');
  const original = fixtureEvent({ dataInicio: '2026-01-31', dataFim: '2026-01-31' });
  const { pool, queries } = fakePool({ event: original });
  const service = new serviceModule.PostgresEventAuthoringService(pool);
  const result = await service.createRecurrence(
    { id: 'promoter-1', role: 'PROMOTER' },
    'event-1',
    { frequency: 'MONTHLY', interval: 1, count: 2 },
  );
  const series = queries.find(query => query.sql.includes('INSERT INTO "EventSeries"'));
  const occurrences = queries.filter(query => query.sql.startsWith('INSERT INTO events'));
  assert.equal(series.values[4], 3);
  assert.equal(result.created, 2);
  assert.equal(occurrences.length, 2);
  assert.deepEqual(occurrences.map(query => [query.values[5], query.values[6]]), [
    ['2026-02-28', '2026-02-28'],
    ['2026-03-31', '2026-03-31'],
  ]);
});

test('admin approval transitions pending events and records validation audit', async () => {
  serviceModule ??= await loadTypeScript('event-authoring-service.ts');
  const { pool, queries } = fakePool({ role: 'ADMIN' });
  const service = new serviceModule.PostgresEventAuthoringService(pool);
  const result = await service.validate({ id: 'promoter-1', role: 'ADMIN' }, ['event-1']);
  assert.deepEqual(result, { success: true, validatedIds: ['event-1'] });
  assert.ok(queries.some(query => query.sql.includes("SET status = 'PUBLISHED'")));
  const history = queries.find(query => query.sql.includes('INSERT INTO "EventHistory"'));
  assert.equal(history.values[6], 'VALIDATED');
});

test('event read service allows public reads and returns per-event and global history contracts', async () => {
  await readServices();
  const queries = [];
  const pool = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes('FROM events e')) return { rows: [{ ...fixtureEvent({ status: 'PUBLISHED' }), organizerId: 'promoter-1' }], rowCount: 1 };
      if (sql.includes('FROM "User"')) return { rows: [{ id: 'promoter-1', role: 'PROMOTER' }], rowCount: 1 };
      if (sql.includes('FROM "EventHistory"')) return { rows: [{ id: 'history-1', action: 'CREATED' }], rowCount: 1 };
      if (sql.includes('SELECT id FROM events')) return { rows: [{ id: 'event-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const service = new readModule.PostgresEventReadCalendarService(pool);
  assert.equal((await service.read('event-1')).status, 'PUBLISHED');
  assert.equal((await service.history({ id: 'promoter-1', role: 'PROMOTER' })).history.length, 1);
  assert.equal((await service.eventHistory({ id: 'promoter-1', role: 'PROMOTER' }, 'event-1')).history.length, 1);
  assert.ok(queries.some(query => query.sql.includes('WHERE "promoterId" = $1')));
});

test('calendar service returns a standalone escaped ICS attachment contract', async () => {
  await readServices();
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT id, nome, descricao')) {
        return {
          rows: [{
            id: 'event-1',
            nome: 'Feira, de Outono',
            descricao: 'Portas abertas\nVenha!',
            endereco: 'Rua Central',
            status: 'PUBLISHED',
            userId: 'promoter-1',
            dataInicio: '2026-10-10',
            dataFim: '2026-10-10',
            startTime: null,
            endTime: null,
            timezone: 'America/Sao_Paulo',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const service = new readModule.PostgresEventReadCalendarService(pool, () => new Date('2026-10-07T12:00:00.000Z'));
  const result = await service.calendar('event-1');
  assert.equal(result.status, 200);
  assert.equal(result.contentType, 'text/calendar; charset=utf-8');
  assert.equal(result.headers['Content-Disposition'], 'attachment; filename="event-event-1.ics"');
  assert.match(result.body, /SUMMARY:Feira\\, de Outono/);
  assert.match(result.body, /DESCRIPTION:Portas abertas\\nVenha!/);
  assert.match(result.body, /DTEND;VALUE=DATE:20261011/);
});

test('mobile event media persists validated image bytes in PostgreSQL and returns binary response metadata', async () => {
  await readServices();
  const image = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const queries = [];
  const pool = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.startsWith('SELECT id, role')) return { rows: [{ id: 'promoter-1', role: 'PROMOTER' }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO "MobileEventMedia"')) return { rows: [], rowCount: 1 };
      if (sql.includes('EXISTS (')) {
        return {
          rows: [{
            id: values[0],
            ownerId: 'promoter-1',
            mimeType: 'image/jpeg',
            size: image.length,
            content: image,
            isPublic: true,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const service = new mediaModule.PostgresEventMediaService(pool);
  const saved = await service.save(
    { id: 'promoter-1', role: 'PROMOTER' },
    { bytes: image, mimeType: 'image/jpeg', fileName: 'banner.jpg' },
  );
  assert.match(saved.url, /^\/v1\/media\/events\/[0-9a-f-]{36}$/);
  assert.ok(queries.some(query => query.sql.startsWith('INSERT INTO "MobileEventMedia"')));
  const response = await service.read(saved.id);
  assert.equal(response.contentType, 'image/jpeg');
  assert.deepEqual(response.body, image);
});
