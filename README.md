# Personal Portfolio — Astro + EmDash CMS

Personal portfolio with a vintage letter / postal theme. Built with Astro and managed through [EmDash CMS](https://emdashcms.com/). Deployed on [Vercel](https://vercel.com) with [Turso](https://turso.tech) database.

**Live Site**: https://angelmarie.vercel.app

## Sections

- **Home** — animated envelope reveal with name, role, and intro
- **About Me** — profile card with editable photo and personal info
- **Skills** — postage-stamp style cards split into core skills and tools
- **Projects** — browser-mockup cards with editable thumbnails (live screenshot fallback via Microlink)
- **Experience** — letter-styled work entries
- **Contact** — email + resume link

## Tech Stack

- **Astro 6** with `@astrojs/vercel` adapter
- **EmDash 0.14** for the CMS
- **Turso (libSQL)** for database storage
- **Vercel** for serverless deployment
- **Fonts**: Playfair Display (Google Fonts) and Dancing Script (`@fontsource/dancing-script`)
- **Icons**: Font Awesome 6.5

## Getting Started

### Local Development

```bash
npm install
npm run dev
```

- Site: `http://localhost:4321`
- Admin: `http://localhost:4321/_emdash/admin` (first visit prompts you to create an account)

Local development uses SQLite (`data.db`) and local file uploads (`uploads/`). These are automatically created and managed by EmDash.

## Content Management

`seed/seed.json` is the single source of truth for both schema and default content. Editors work in `/_emdash/admin`; the live site reads from EmDash and falls back to the seed if the database is unreachable.

### Collections

| Collection | Editable fields |
|---|---|
| Home | first name, last name, title, intro |
| About Me | profile photo, photo alt, two about paragraphs, birthday, degree, location, email, specialization |
| Skills | name, category (`core`/`tools`), Font Awesome icon class, display order |
| Projects | title, description, **thumbnail** (image), **thumbnail alt**, project URL, icon, tags (JSON array), display order |
| Experience | job title, company, date range, display order |
| Contact | email, resume link |

### Project thumbnails

Each project card uses the uploaded **Thumbnail Image** when present. If none is uploaded, it falls back to a live screenshot from `api.microlink.io`, which captures whatever the project URL currently shows (including modals or popups). Upload a static thumbnail in the admin to lock in a specific shot.

### Adding or changing fields

1. Edit `seed/seed.json` (collection schema + initial content).
2. If components consume the field, update the matching type and mapper in `src/lib/cms.ts`.
3. Apply the change to the local database:
   ```bash
   npx emdash seed --on-conflict update
   ```
4. Use the field in the relevant Astro component.

## Deployment (Vercel)

This portfolio is deployed on Vercel with Turso (libSQL) for database storage. Vercel's serverless functions are read-only, so we use a remote database instead of local SQLite.

### Prerequisites

1. **Turso Account**: Sign up at [turso.tech](https://turso.tech)
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
3. **GitHub Repository**: Push your code to GitHub

### Setup Steps

#### 1. Create Turso Database

```bash
# Via Turso Dashboard (easiest for Windows)
# 1. Go to https://turso.tech
# 2. Create a new database (e.g., "my-portfolio-db")
# 3. Copy the Database URL (libsql://...)
# 4. Create a token and copy it
```

#### 2. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Vercel will auto-detect Astro
4. **Before deploying**, add these environment variables:

| Variable | Value | Required |
|---|---|---|
| `SITE_URL` | `https://your-domain.vercel.app` | Yes |
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` | Yes |
| `TURSO_AUTH_TOKEN` | Your Turso token | Yes |
| `S3_ENDPOINT` | S3-compatible endpoint | Optional* |
| `S3_BUCKET` | Bucket name | Optional* |
| `S3_REGION` | `auto` or region | Optional* |
| `S3_ACCESS_KEY_ID` | S3 access key | Optional* |
| `S3_SECRET_ACCESS_KEY` | S3 secret key | Optional* |
| `S3_PUBLIC_URL` | Public bucket URL | Optional* |

*S3 variables are optional but recommended for persistent media uploads. Without them, uploaded images won't survive redeployments.

5. Click **Deploy**

#### 3. Access Admin Panel

After deployment:
1. Visit `https://your-domain.vercel.app/_emdash/admin`
2. Create your admin account using passkey authentication
3. Start managing your content!

### Important Notes

- **Sessions**: Due to Vercel's serverless architecture, sessions are stored in memory and may expire when functions restart (typically every 15-30 minutes of inactivity)
- **Media Uploads**: Without S3 configuration, uploaded images are stored temporarily and will be lost on redeployment
- **Local Admin**: For the best experience, manage content locally (`npm run dev`) and deploy changes via git push

### Recommended: Cloudflare R2 for Media Storage

For persistent media uploads, set up Cloudflare R2 (free tier available):

1. Create an R2 bucket at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Generate API credentials with Object Read/Write permissions
3. Add the S3 environment variables to Vercel
4. Redeploy

See [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md) for detailed instructions.

## Slack / Link Previews

The page emits Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`) so Slack renders a preview card. The image is `public/portfolio.png` served from `canonicalURL` (set in `src/pages/index.astro` — update this if your domain changes). Slack caches previews aggressively; append `?v=2` to the URL to force a refresh.

## Project Structure

```
src/
  components/         # Astro components for each section
  lib/cms.ts          # EmDash loader with seed.json fallback + image helpers
  live.config.ts      # EmDash live content collection config
  pages/index.astro   # Main page + SEO/OG meta
  styles/global.css
seed/seed.json        # Schema + default content (single source of truth)
scripts/bootstrap.mjs # DB init + seed + default photo wiring
public/               # Static assets (profile.jpg, portfolio.png, resume.pdf)
emdash-env.d.ts       # Auto-generated EmDash types
```

## Commands

| Command | Action |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run seed` | Re-apply seed to database |
| `vercel` | Deploy to Vercel (requires Vercel CLI) |
| `vercel --prod` | Deploy to production |

## License

Open source for personal use.

## Deployment Recommendation

This portfolio is optimized for **Vercel** deployment with **Turso** database:

✅ **Pros:**
- Free tier for both Vercel and Turso
- Automatic deployments from GitHub
- Global CDN for fast loading
- Serverless architecture scales automatically

⚠️ **Considerations:**
- Sessions may expire due to serverless function restarts
- Media uploads require S3-compatible storage (Cloudflare R2 recommended)
- Best content management experience is via local development

**Alternative:** For a simpler setup with persistent local storage, consider deploying to Render with a Persistent Disk (see git history for Render configuration).
