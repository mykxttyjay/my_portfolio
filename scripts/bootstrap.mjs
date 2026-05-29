/**
 * Bootstrap script — runs before `astro dev` and `astro build`.
 *
 * Initializes the EmDash database (creates tables, applies migrations,
 * seeds collections) and ensures the About Me row references the bundled
 * `/profile.jpg` as a sensible default photo.
 *
 * Works in two modes:
 *
 * - Local / Render (default): plain SQLite file on disk.
 * - Vercel / Turso: remote libSQL via `TURSO_DATABASE_URL` +
 *   `TURSO_AUTH_TOKEN`. The CLI runs against the remote DB; we touch the
 *   `ec_about_me` row over the libSQL HTTP client.
 */

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulidx';

const useTurso = !!process.env.TURSO_DATABASE_URL;

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
          console.log(
            `[bootstrap] Removed orphan media row ${current.id} (file missing on disk)`
          );
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
      return; // Already pointed at the default.
    }

    const photoValue = JSON.stringify(buildDefaultPhotoValue());
    db.prepare(
      'UPDATE ec_about_me SET photo = ?, updated_at = ? WHERE id = ?'
    ).run(photoValue, new Date().toISOString(), row.id);

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
  console.log(
    `[bootstrap] Removed ${orphans.length} duplicated profile.jpg upload(s) from media library`
  );
  return removed;
}

// ---------------------------------------------------------------------------
// Turso / libSQL (Vercel)
// ---------------------------------------------------------------------------

async function bootstrapTurso() {
  // The CLI talks to a `--database` URL; libsql:// works directly.
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  console.log('[bootstrap] Using Turso/libSQL database');

  // EmDash's CLI accepts file URLs and libsql URLs. We pass through the
  // libsql:// URL plus auth token via env variables it understands.
  const env = { ...process.env, LIBSQL_URL: dbUrl, LIBSQL_AUTH_TOKEN: authToken };

  try {
    execSync(`npx emdash init --database ${dbUrl}`, { stdio: 'inherit', env });
  } catch (err) {
    // `init` is idempotent — fall through if the schema already exists.
    console.warn('[bootstrap] emdash init reported an issue (continuing):', err.message);
  }

  try {
    execSync(`npx emdash seed --database ${dbUrl} --on-conflict update`, {
      stdio: 'inherit',
      env,
    });
  } catch (err) {
    console.warn('[bootstrap] emdash seed reported an issue (continuing):', err.message);
  }

  await ensureDefaultProfilePhotoTurso({ url: dbUrl, authToken });
}

async function ensureDefaultProfilePhotoTurso({ url, authToken }) {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url, authToken });

  try {
    const aboutTable = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ec_about_me'"
    );
    if (aboutTable.rows.length === 0) return;

    const result = await client.execute(
      "SELECT id, photo FROM ec_about_me WHERE slug='main' LIMIT 1"
    );
    const row = result.rows[0];
    if (!row) return;

    const current = parseJsonOrNull(row.photo);

    if (current && current.provider && current.provider !== 'external') {
      return; // Real user upload — leave it alone.
    }
    if (current && current.src === '/profile.jpg') {
      return; // Already correct.
    }

    const photoValue = JSON.stringify(buildDefaultPhotoValue());
    await client.execute({
      sql: 'UPDATE ec_about_me SET photo = ?, updated_at = ? WHERE id = ?',
      args: [photoValue, new Date().toISOString(), row.id],
    });

    console.log(
      '[bootstrap] Set About Me photo default to /profile.jpg (Turso)'
    );
  } finally {
    client.close();
  }
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
