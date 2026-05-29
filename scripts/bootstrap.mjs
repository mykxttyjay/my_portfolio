/**
 * Bootstrap script — runs before `astro dev` and `astro build`.
 *
 * Initializes the EmDash database (creates tables, applies migrations,
 * seeds collections) and ensures the About Me row references the bundled
 * `/profile.jpg` as a sensible default photo.
 *
 * Two execution paths:
 *
 * - Local development / Render: SQLite file on disk. Uses the `emdash`
 *   CLI which is the documented happy-path.
 * - Vercel / Turso: remote libSQL via TURSO_DATABASE_URL +
 *   TURSO_AUTH_TOKEN. The CLI does not yet support libSQL URLs, so we
 *   call EmDash's public `runMigrations` and `applySeed` APIs directly
 *   against a Kysely instance bound to LibsqlDialect.
 */

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { ulid } from 'ulidx';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const seedPath = path.join(projectRoot, 'seed', 'seed.json');

const useTurso = !!process.env.TURSO_DATABASE_URL;
const isVercelBuild = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

if (isVercelBuild && !useTurso) {
  console.error(
    '\n[bootstrap] ERROR: Building on Vercel without a remote database.\n' +
      '  Vercel functions cannot use a local SQLite file (the filesystem\n' +
      '  is read-only at request time). Set TURSO_DATABASE_URL and\n' +
      '  TURSO_AUTH_TOKEN in the Vercel project Environment Variables\n' +
      '  panel. See .env.example for the full list.\n'
  );
  process.exit(1);
}

if (useTurso) {
  await bootstrapTurso();
} else {
  await bootstrapLocal();
}

// ---------------------------------------------------------------------------
// Local SQLite (development + Render)
// ---------------------------------------------------------------------------

async function bootstrapLocal() {
  const { default: Database } = await import('better-sqlite3');

  const storageDir = process.env.PERSISTENT_STORAGE_DIR;
  const dbPath = storageDir ? path.join(storageDir, 'data.db') : './data.db';
  const uploadsDir = storageDir
    ? path.join(storageDir, 'uploads')
    : './uploads';

  execSync(`npx emdash init --database ${dbPath}`, { stdio: 'inherit' });
  execSync(
    `npx emdash seed --database ${dbPath} --uploads-dir ${uploadsDir}`,
    { stdio: 'inherit' }
  );

  ensureDefaultProfilePhotoLocal({ Database, dbPath, uploadsDir });
}

function ensureDefaultProfilePhotoLocal({ Database, dbPath, uploadsDir }) {
  const db = new Database(dbPath);
  try {
    const aboutTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ec_about_me'"
      )
      .get();
    if (!aboutTable) return;

    const row = db
      .prepare("SELECT id, photo FROM ec_about_me WHERE slug='main' LIMIT 1")
      .get();
    if (!row) return;

    const removedMediaIds = cleanupLegacyDuplicateLocal(db, uploadsDir);
    const current = parseJsonOrNull(row.photo);

    let pointsAtMissingMedia = false;
    if (current && current.id && current.provider !== 'external') {
      const mediaRow = db
        .prepare('SELECT storage_key FROM media WHERE id = ?')
        .get(current.id);
      if (!mediaRow) {
        pointsAtMissingMedia = true;
      } else if (mediaRow.storage_key) {
        const onDisk = path.join(uploadsDir, mediaRow.storage_key);
        if (!existsSync(onDisk)) {
          pointsAtMissingMedia = true;
          db.prepare('DELETE FROM media WHERE id = ?').run(current.id);
        }
      }
    }

    const referencesRemoved =
      pointsAtMissingMedia ||
      (current && current.id && removedMediaIds.has(current.id));

    if (
      current &&
      current.provider &&
      current.provider !== 'external' &&
      !referencesRemoved
    ) {
      return; // Real user upload – do not overwrite.
    }
    if (current && current.src === '/profile.jpg' && !referencesRemoved) {
      return;
    }

    db.prepare(
      'UPDATE ec_about_me SET photo = ?, updated_at = ? WHERE id = ?'
    ).run(
      JSON.stringify(buildDefaultPhotoValue()),
      new Date().toISOString(),
      row.id
    );
    console.log(
      '[bootstrap] Set About Me photo default to /profile.jpg (external reference)'
    );
  } finally {
    db.close();
  }
}

function cleanupLegacyDuplicateLocal(db, uploadsDir) {
  const removed = new Set();
  const orphans = db
    .prepare(
      "SELECT id, storage_key FROM media WHERE filename='profile.jpg' AND alt='Angel Marie Sabido'"
    )
    .all();
  if (orphans.length === 0) return removed;

  for (const item of orphans) {
    if (item.storage_key) {
      const filePath = path.join(uploadsDir, item.storage_key);
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    db.prepare('DELETE FROM media WHERE id = ?').run(item.id);
    removed.add(item.id);
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Turso / libSQL (Vercel)
//
// EmDash's CLI does not yet support libSQL URLs (it always opens a local
// SQLite file). We bypass the CLI and use the documented programmatic API:
//
//   runMigrations(db)              from "emdash/db"
//   applySeed(db, seed, options)   from "emdash/seed"
//
// where `db` is a Kysely instance backed by `LibsqlDialect` (the same
// dialect EmDash itself uses at runtime).
// ---------------------------------------------------------------------------

async function bootstrapTurso() {
  console.log('[bootstrap] Using Turso/libSQL database');

  const { Kysely } = await import('kysely');
  const { LibsqlDialect } = await import('@libsql/kysely-libsql');
  const { runMigrations } = await import('emdash/db');
  const { applySeed } = await import('emdash/seed');

  const db = new Kysely({
    dialect: new LibsqlDialect({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
  });

  try {
    console.log('[bootstrap] Running migrations on Turso...');
    const { applied } = await runMigrations(db);
    console.log(
      applied.length > 0
        ? `[bootstrap] Applied ${applied.length} migrations`
        : '[bootstrap] Database already up to date'
    );

    console.log('[bootstrap] Applying seed file...');
    const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
    const result = await applySeed(db, seed, {
      includeContent: true,
      onConflict: 'skip',
    });
    console.log(
      `[bootstrap] Seed applied: collections=${JSON.stringify(result.collections)} fields=${JSON.stringify(result.fields)}`
    );

    await ensureDefaultProfilePhotoTurso(db);
  } finally {
    await db.destroy();
  }
}

async function ensureDefaultProfilePhotoTurso(db) {
  const { sql } = await import('kysely');

  // Confirm the about_me table exists before touching it.
  try {
    const tables = await sql`
      SELECT name FROM sqlite_master WHERE type='table' AND name='ec_about_me'
    `.execute(db);
    if (tables.rows.length === 0) {
      console.warn(
        '[bootstrap] ec_about_me not found yet, skipping default photo wiring'
      );
      return;
    }
  } catch (err) {
    console.warn(
      '[bootstrap] Could not check for ec_about_me, skipping default photo wiring:',
      err.message
    );
    return;
  }

  const result = await sql`
    SELECT id, photo FROM ec_about_me WHERE slug='main' LIMIT 1
  `.execute(db);
  const row = result.rows[0];
  if (!row) return;

  const current = parseJsonOrNull(row.photo);
  if (current && current.provider && current.provider !== 'external') return;
  if (current && current.src === '/profile.jpg') return;

  await sql`
    UPDATE ec_about_me
    SET photo = ${JSON.stringify(buildDefaultPhotoValue())},
        updated_at = ${new Date().toISOString()}
    WHERE id = ${row.id}
  `.execute(db);
  console.log('[bootstrap] Set About Me photo default to /profile.jpg (Turso)');
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildDefaultPhotoValue() {
  return {
    id: ulid(),
    src: '/profile.jpg',
    alt: 'Angel Marie Sabido',
    provider: 'external',
  };
}

function parseJsonOrNull(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
