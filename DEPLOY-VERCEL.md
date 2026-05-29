# Deploying to Vercel

This portfolio runs on Astro + EmDash CMS. EmDash needs a database and a
place to store uploaded media; on Vercel both have to be remote because
the function filesystem is read-only at request time.

This guide walks through getting a free Turso database, a free Cloudflare
R2 bucket, wiring them into Vercel, and shipping the site.

---

## 1. Prerequisites

- A GitHub account with this repo pushed.
- A free [Vercel](https://vercel.com) account.
- A free [Turso](https://turso.tech) account (database).
- A free [Cloudflare](https://dash.cloudflare.com) account (R2 storage —
  10 GB free tier, no card required).

> Why these? EmDash supports SQLite/Turso/Postgres for the database and
> S3-compatible storage for media. Turso + R2 is the cheapest happy path.

---

## 2. Create a Turso database

```bash
# install once (https://docs.turso.tech/cli/installation)
curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup
turso db create portfolio
turso db show portfolio                 # copy "URL" (libsql://…)
turso db tokens create portfolio        # copy "Token"
```

Save the URL and token — you will paste them into Vercel in step 5.

If you do not want to install the CLI, you can do the same in the Turso
web console: **Create Database → portfolio**, then **Generate Token**.

---

## 3. Create a Cloudflare R2 bucket

1. Cloudflare dashboard → **R2 Object Storage → Create bucket**
   - Name: `portfolio-media`
   - Location: any (auto)
2. Open the bucket → **Settings → Public access → R2.dev subdomain →
   Allow Access**. Copy the public URL (looks like
   `https://pub-<id>.r2.dev`).
3. R2 home → **Manage R2 API Tokens → Create API Token**
   - Permission: **Object Read & Write**
   - Specify the `portfolio-media` bucket
   - Click **Create**, then copy:
     - Access Key ID
     - Secret Access Key
     - The S3 endpoint URL
       (`https://<account-id>.r2.cloudflarestorage.com`)

---

## 4. Push the project to GitHub

```bash
git init
git add .
git commit -m "Portfolio with EmDash CMS"
git branch -M main
git remote add origin git@github.com:<you>/my-portfolio.git
git push -u origin main
```

`.env` and `data.db` are gitignored — don't worry about secrets leaking.

---

## 5. Import the repo into Vercel

1. Vercel dashboard → **Add New → Project → Import Git Repository**.
2. Pick the repo. Vercel auto-detects Astro.
3. Before clicking **Deploy**, expand **Environment Variables** and add:

   | Name                    | Value                                                     |
   | ----------------------- | --------------------------------------------------------- |
   | `SITE_URL`              | `https://your-domain.vercel.app` (update after deploy)    |
   | `TURSO_DATABASE_URL`    | `libsql://portfolio-...turso.io` (from step 2)            |
   | `TURSO_AUTH_TOKEN`      | Token from step 2                                         |
   | `S3_ENDPOINT`           | `https://<account-id>.r2.cloudflarestorage.com`           |
   | `S3_BUCKET`             | `portfolio-media`                                         |
   | `S3_REGION`             | `auto`                                                    |
   | `S3_ACCESS_KEY_ID`      | From step 3                                               |
   | `S3_SECRET_ACCESS_KEY`  | From step 3                                               |
   | `S3_PUBLIC_URL`         | `https://pub-<id>.r2.dev`                                 |

4. Click **Deploy**.

The first build runs `node scripts/bootstrap.mjs && astro build`, which:

- Connects to Turso and runs every EmDash migration.
- Applies `seed/seed.json` (creates the six collections).
- Builds the Astro site and packages it as a Vercel serverless function.

If the build fails with `Building on Vercel without a remote database`,
the env vars above are not actually set on the build environment — go to
**Settings → Environment Variables** and confirm they are present for
**Production**, **Preview**, and **Development**.

---

## 6. First admin login

Visit `https://<your-domain>.vercel.app/_emdash/admin`. EmDash redirects
you to `/_emdash/admin/setup` because no users exist yet. Create your
admin account (passkey or email + password). After that, the same URL
brings you straight into the dashboard — that is where you edit the
profile, projects, skills, and so on.

---

## 7. Local development

Local dev does not need Turso or R2. Leave the production env vars unset
in `.env` and the project falls back to a SQLite file (`./data.db`) and
local uploads (`./uploads`) automatically.

```bash
npm install
npm run dev
```

Open `http://localhost:4321` and `http://localhost:4321/_emdash/admin`.

---

## Troubleshooting

**`EmDash is not initialized`** in the deployed admin

This means the runtime opened the database but found no schema, or could
not open it at all.

- Confirm `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are in the Vercel
  env. Redeploy from **Deployments → … → Redeploy** so the build runs
  again with the new vars.
- Check the build logs for `[bootstrap] Applied N migrations` — if you
  don't see it, the bootstrap step never reached Turso.

**Uploads fail with 4xx in the admin**

The S3 credentials or endpoint are wrong. Re-check the R2 token
permissions (Object Read & Write on the right bucket) and that
`S3_PUBLIC_URL` points at an R2 public bucket URL or a custom domain
that you mapped to the bucket.

**Need to wipe Turso and re-seed**

```bash
turso db shell portfolio "DROP TABLE IF EXISTS _emdash_migrations;"
# then redeploy on Vercel — bootstrap will recreate everything
```
