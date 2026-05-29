import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import emdash, { local, s3 } from 'emdash/astro';
import { sqlite, libsql } from 'emdash/db';

/**
 * EmDash on Vercel
 *
 * Vercel's filesystem is read-only at request time, so the local
 * SQLite + local uploads setup that works on Render does not survive a
 * redeploy here. The config switches automatically based on env vars:
 *
 * - Production (Vercel): libSQL/Turso for the database, S3-compatible
 *   storage (Cloudflare R2 by default) for media uploads.
 * - Locally (no env vars set): SQLite + local uploads.
 */

const useTurso = !!process.env.TURSO_DATABASE_URL;
const useS3 = !!process.env.S3_BUCKET || !!process.env.S3_ENDPOINT;

const localDbPath = process.env.PERSISTENT_STORAGE_DIR
  ? path.join(process.env.PERSISTENT_STORAGE_DIR, 'data.db')
  : './data.db';
const localUploadsDir = process.env.PERSISTENT_STORAGE_DIR
  ? path.join(process.env.PERSISTENT_STORAGE_DIR, 'uploads')
  : './uploads';

const database = useTurso
  ? libsql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : sqlite({ url: `file:${localDbPath}` });

// When the S3_* env vars are set, the s3() adapter resolves credentials
// from them automatically. Locally we use the filesystem adapter.
const storage = useS3
  ? s3({
      publicUrl: process.env.S3_PUBLIC_URL,
    })
  : local({
      directory: localUploadsDir,
      baseUrl: '/_emdash/api/media/file',
    });

export default defineConfig({
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: false },
    maxDuration: 30,
  }),

  server: {
    host: true,
    port: Number(process.env.PORT) || 4321,
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    react(),
    emdash({
      siteUrl:
        process.env.SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
      database,
      storage,
    }),
  ],
});
