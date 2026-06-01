# Portfolio Website - Complete Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [EmDash CMS Integration](#emdash-cms-integration)
4. [Database Strategy](#database-strategy)
5. [Deployment Process](#deployment-process)
6. [Data Flow](#data-flow)
7. [Troubleshooting](#troubleshooting)
8. [Development Workflow](#development-workflow)

---

## Project Overview

### What This Is

A personal portfolio website with a vintage postal/letter theme, built with modern web technologies and a headless CMS for easy content management.

### Tech Stack

- **Frontend Framework**: Astro 6
- **CMS**: EmDash 0.14
- **Database**: 
  - Local: SQLite
  - Production: Turso (libSQL)
- **Deployment**: Vercel (serverless)
- **Styling**: Custom CSS with vintage postal theme
- **Fonts**: Playfair Display, Dancing Script
- **Icons**: Font Awesome 6.5

### Live URLs

- **Website**: https://angelmarie.vercel.app
- **Admin Panel**: https://angelmarie.vercel.app/_emdash/admin
- **Repository**: https://github.com/mykxttyjay/my_portfolio

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                       │
│                  (Global CDN + Routing)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Vercel Serverless Functions                 │
│                    (Astro SSR Runtime)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Astro Application                        │  │
│  │  ┌────────────────┐      ┌────────────────────────┐ │  │
│  │  │  Public Pages  │      │   EmDash Admin Panel   │ │  │
│  │  │  (Portfolio)   │      │   (/_emdash/admin)     │ │  │
│  │  └────────┬───────┘      └──────────┬─────────────┘ │  │
│  │           │                          │               │  │
│  │           └──────────┬───────────────┘               │  │
│  │                      │                               │  │
│  │                      ▼                               │  │
│  │           ┌──────────────────────┐                  │  │
│  │           │  EmDash Integration  │                  │  │
│  │           │   (CMS Layer)        │                  │  │
│  │           └──────────┬───────────┘                  │  │
│  └──────────────────────┼──────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Turso Database                            │
│                  (Remote libSQL/SQLite)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  • Content Collections (Home, About, Skills, etc.)   │  │
│  │  • User Accounts & Authentication                    │  │
│  │  • Session Storage                                   │  │
│  │  • Media Metadata                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
my_portfolio/
├── .astro/                    # Astro build cache
├── public/                    # Static assets
│   ├── profile.jpg           # Profile photo
│   ├── portfolio.png         # OG image
│   └── resume.pdf            # Resume file
├── scripts/
│   └── bootstrap.mjs         # Database initialization script
├── seed/
│   └── seed.json             # CMS schema + default content
├── src/
│   ├── components/           # Astro components
│   │   ├── About.astro
│   │   ├── Contact.astro
│   │   ├── Experience.astro
│   │   ├── Footer.astro
│   │   ├── Header.astro
│   │   ├── Home.astro
│   │   ├── Projects.astro
│   │   └── Skills.astro
│   ├── lib/
│   │   └── cms.ts            # EmDash data fetching + types
│   ├── pages/
│   │   └── index.astro       # Main page
│   ├── styles/
│   │   └── global.css        # Global styles
│   └── live.config.ts        # EmDash live collections config
├── astro.config.mjs          # Astro + EmDash configuration
├── emdash-env.d.ts           # Auto-generated EmDash types
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── vercel.json               # Vercel deployment config
└── .env                      # Local environment variables
```

---

## EmDash CMS Integration

### What is EmDash?

EmDash is a headless CMS built specifically for Astro. Unlike traditional CMSs:
- Schema is defined in code (not in a database)
- Content is stored in a database (SQLite/Turso)
- Provides a built-in admin UI at `/_emdash/admin`
- Integrates seamlessly with Astro's content collections

### How EmDash Works in This Project

#### 1. Schema Definition (`seed/seed.json`)

The CMS schema is defined in a single JSON file:

```json
{
  "settings": {
    "site:title": "Angel Marie Sabido",
    "site:tagline": "Designer & Developer Portfolio"
  },
  "collections": [
    {
      "slug": "home",
      "label": "Home",
      "type": "singleton",
      "fields": [
        { "slug": "first_name", "label": "First Name", "type": "string" },
        { "slug": "last_name", "label": "Last Name", "type": "string" }
      ]
    }
  ]
}
```

**Key Concepts:**
- **Collections**: Groups of content (Home, About, Skills, etc.)
- **Singleton**: Only one entry allowed (Home, About, Contact)
- **Multiple**: Many entries allowed (Skills, Projects, Experience)
- **Fields**: Define what data each collection can store

#### 2. Integration Configuration (`astro.config.mjs`)

```javascript
import emdash, { local } from 'emdash/astro';
import { sqlite, libsql } from 'emdash/db';

const useTurso = !!process.env.TURSO_DATABASE_URL;

const database = useTurso
  ? libsql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : sqlite({ url: 'file:./data.db' });

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  
  // Session configuration for authentication
  session: {
    driver: sessionDrivers.lruCache({
      max: 2000,
    }),
  },
  
  integrations: [
    emdash({
      siteUrl: process.env.SITE_URL,
      database,
      storage: local({
        directory: './uploads',
        baseUrl: '/_emdash/api/media/file',
      }),
    }),
  ],
});
```

**Configuration Breakdown:**
- **Database Switching**: Automatically uses Turso in production, SQLite locally
- **Session Driver**: Required for admin authentication on Vercel
- **Storage**: Local file storage for development (S3 recommended for production)

#### 3. Data Fetching (`src/lib/cms.ts`)

EmDash provides a type-safe API for fetching content:

```typescript
import { getCollection, getEntry } from 'emdash/live';

// Fetch singleton content
export async function getHomeData() {
  const entry = await getEntry('home', 'main');
  return {
    firstName: entry?.data.first_name || '',
    lastName: entry?.data.last_name || '',
  };
}

// Fetch multiple entries
export async function getSkills() {
  const entries = await getCollection('skills');
  return entries
    .sort((a, b) => a.data.display_order - b.data.display_order)
    .map(entry => ({
      name: entry.data.name,
      category: entry.data.category,
      icon: entry.data.icon,
    }));
}
```

#### 4. Bootstrap Process (`scripts/bootstrap.mjs`)

The bootstrap script runs before every build:

```javascript
// 1. Detect environment (Turso vs SQLite)
const useTurso = !!process.env.TURSO_DATABASE_URL;

if (useTurso) {
  // Production: Use Turso
  await bootstrapTurso();
} else {
  // Local: Use SQLite
  await bootstrapLocal();
}

async function bootstrapTurso() {
  // 1. Connect to Turso
  const db = new Kysely({ dialect: new LibsqlDialect(...) });
  
  // 2. Run migrations (create tables)
  await runMigrations(db);
  
  // 3. Apply seed (insert default content)
  const seed = JSON.parse(readFileSync('seed/seed.json'));
  await applySeed(db, seed, { onConflict: 'skip' });
}
```

**What Bootstrap Does:**
1. Creates database tables if they don't exist
2. Applies schema from `seed.json`
3. Inserts default content (only if not already present)
4. Sets up default profile photo reference

---

## Database Strategy

### Local Development (SQLite)

**Location**: `./data.db` (in project root)

**Characteristics:**
- Single file database
- Fast read/write
- Perfect for development
- Automatically created on first run
- Gitignored (not committed to repository)

**Files:**
- `data.db` - Main database file
- `data.db-shm` - Shared memory file (temporary)
- `data.db-wal` - Write-Ahead Log (temporary)

### Production (Turso/libSQL)

**What is Turso?**
- Cloud-hosted SQLite database
- Built on libSQL (SQLite fork)
- Optimized for edge computing
- Free tier: 500 databases, 9 GB total storage

**Why Turso for Vercel?**
- Vercel serverless functions have read-only filesystems
- Can't use local SQLite in production
- Turso provides remote SQLite-compatible database
- Low latency with edge replication

**Connection:**
```javascript
libsql({
  url: 'libsql://my-portfolio-db-xxx.turso.io',
  authToken: 'eyJhbGci...',
})
```

### Database Schema

EmDash automatically creates these tables:

**Core Tables:**
- `_emdash_collections` - Collection definitions
- `_emdash_fields` - Field definitions
- `_emdash_migrations` - Migration tracking
- `users` - Admin user accounts
- `credentials` - Passkey credentials
- `auth_tokens` - Session tokens
- `options` - Site settings

**Content Tables** (auto-generated from seed.json):
- `ec_home` - Home page content
- `ec_about_me` - About page content
- `ec_skills` - Skills entries
- `ec_projects` - Project entries
- `ec_experience` - Experience entries
- `ec_contact` - Contact information

**Media Tables:**
- `media` - Uploaded file metadata

---

## Deployment Process

### Prerequisites Setup

#### 1. Turso Database Setup

```bash
# Option A: Via Turso Dashboard (Recommended for Windows)
1. Go to https://turso.tech
2. Sign up for free account
3. Create new database: "my-portfolio-db"
4. Copy Database URL: libsql://my-portfolio-db-xxx.turso.io
5. Create token and copy it

# Option B: Via CLI (Linux/Mac/WSL)
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create my-portfolio-db
turso db show my-portfolio-db  # Get URL
turso db tokens create my-portfolio-db  # Get token
```

#### 2. GitHub Repository

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit"

# Create GitHub repo and push
git remote add origin https://github.com/username/my_portfolio.git
git branch -M main
git push -u origin main
```

### Vercel Deployment Steps

#### 1. Initial Deployment

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click "Import Git Repository"
3. Select your GitHub repository
4. Vercel auto-detects Astro framework
5. **Before deploying**, configure environment variables

#### 2. Environment Variables Configuration

In Vercel dashboard, add these variables for **all environments** (Production, Preview, Development):

| Variable | Value | Purpose |
|---|---|---|
| `SITE_URL` | `https://your-domain.vercel.app` | Base URL for authentication callbacks |
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` | Turso database connection |
| `TURSO_AUTH_TOKEN` | `eyJhbGci...` | Turso authentication token |

**Optional (for persistent media uploads):**
| Variable | Value | Purpose |
|---|---|---|
| `S3_ENDPOINT` | `https://xxx.r2.cloudflarestorage.com` | S3-compatible storage endpoint |
| `S3_BUCKET` | `portfolio-media` | Bucket name |
| `S3_REGION` | `auto` | Region |
| `S3_ACCESS_KEY_ID` | `xxx` | Access key |
| `S3_SECRET_ACCESS_KEY` | `xxx` | Secret key |
| `S3_PUBLIC_URL` | `https://pub-xxx.r2.dev` | Public URL for uploaded files |

#### 3. Deploy

Click "Deploy" button. Vercel will:

1. Clone your repository
2. Install dependencies (`npm install`)
3. Run bootstrap script (`node scripts/bootstrap.mjs`)
   - Connects to Turso
   - Runs database migrations
   - Applies seed data
4. Build Astro site (`astro build`)
5. Deploy to edge network

**Build Output:**
```
[bootstrap] Running migrations on Turso...
[bootstrap] Applied 45 migrations
[bootstrap] Applying seed file...
[bootstrap] Seed applied: collections=6 fields=31
[bootstrap] Set About Me photo default to /profile.jpg
```

#### 4. Post-Deployment Setup

1. Visit `https://your-domain.vercel.app/_emdash/admin`
2. You'll be redirected to setup wizard
3. Create admin account using passkey authentication
4. Start managing content!

### Continuous Deployment

After initial setup, every git push triggers automatic deployment:

```bash
git add .
git commit -m "Update content"
git push origin main
# Vercel automatically deploys
```

---

## Data Flow

### Content Rendering Flow

```
User Request
    ↓
Vercel Edge Network
    ↓
Serverless Function (Astro SSR)
    ↓
Component calls getCollection('skills')
    ↓
EmDash queries Turso database
    ↓
Data returned to component
    ↓
Astro renders HTML
    ↓
HTML sent to user
```

### Admin Panel Flow

```
User visits /_emdash/admin
    ↓
EmDash checks authentication
    ↓
If not authenticated → Redirect to login
    ↓
User authenticates with passkey
    ↓
Session created (stored in LRU cache)
    ↓
Admin UI loads
    ↓
User edits content
    ↓
Changes saved to Turso database
    ↓
Live site immediately reflects changes
```

### Authentication Flow

```
1. User clicks "Sign in with Passkey"
    ↓
2. Browser prompts for biometric/PIN
    ↓
3. WebAuthn creates credential
    ↓
4. Credential sent to server
    ↓
5. Server verifies credential against database
    ↓
6. Session token created
    ↓
7. Token stored in session driver (LRU cache)
    ↓
8. User redirected to admin dashboard
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Not authenticated" Error After Login

**Symptom**: Successfully log in but immediately redirected back to login page

**Cause**: Session driver not configured or sessions expiring

**Solution**:
```javascript
// astro.config.mjs
session: {
  driver: sessionDrivers.lruCache({
    max: 2000,
  }),
}
```

**Note**: Sessions in LRU cache are stored in memory and will expire when serverless functions restart (typically 15-30 minutes of inactivity).

#### Issue 2: "EmDash is not initialized"

**Symptom**: Admin panel shows initialization error

**Cause**: Database migrations haven't run or environment variables missing

**Solution**:
1. Check environment variables in Vercel dashboard
2. Redeploy to trigger bootstrap script
3. Check build logs for migration errors

#### Issue 3: Uploaded Images Disappear After Deployment

**Symptom**: Images uploaded in admin panel are gone after redeploy

**Cause**: Local file storage doesn't persist on Vercel

**Solution**: Configure S3-compatible storage (Cloudflare R2):
1. Create R2 bucket
2. Add S3 environment variables to Vercel
3. Redeploy

#### Issue 4: Session Expires Frequently

**Symptom**: Logged out every few minutes

**Cause**: Vercel serverless functions restart frequently, clearing in-memory sessions

**Workaround**:
- Manage content locally (`npm run dev`)
- Deploy changes via git push
- Or accept occasional re-authentication

**Future Solution**: Implement Redis-based session storage for persistence

#### Issue 5: Build Fails with "sessionDrivers.libSQL is not a function"

**Symptom**: Build error mentioning libSQL driver

**Cause**: Attempted to use non-existent libSQL session driver

**Solution**: Use lruCache driver instead:
```javascript
session: {
  driver: sessionDrivers.lruCache({ max: 2000 }),
}
```

---

## Development Workflow

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/username/my_portfolio.git
cd my_portfolio

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
# Edit .env with local settings

# 4. Start dev server
npm run dev

# 5. Access site
# Website: http://localhost:4321
# Admin: http://localhost:4321/_emdash/admin
```

### Making Content Changes

**Option A: Via Admin Panel (Recommended)**
1. Run `npm run dev`
2. Go to `http://localhost:4321/_emdash/admin`
3. Edit content in UI
4. Changes saved to local `data.db`
5. Commit and push to deploy

**Option B: Via Seed File**
1. Edit `seed/seed.json`
2. Run `npm run seed` to apply changes
3. Commit and push to deploy

### Adding New Collections

1. **Define in seed.json:**
```json
{
  "slug": "testimonials",
  "label": "Testimonials",
  "type": "multiple",
  "fields": [
    { "slug": "name", "label": "Name", "type": "string" },
    { "slug": "quote", "label": "Quote", "type": "text" }
  ]
}
```

2. **Create TypeScript types in `src/lib/cms.ts`:**
```typescript
export interface Testimonial {
  name: string;
  quote: string;
}

export async function getTestimonials(): Promise<Testimonial[]> {
  const entries = await getCollection('testimonials');
  return entries.map(e => ({
    name: str(e.data.name),
    quote: str(e.data.quote),
  }));
}
```

3. **Create component `src/components/Testimonials.astro`:**
```astro
---
import { getTestimonials } from '../lib/cms';
const testimonials = await getTestimonials();
---

<section>
  {testimonials.map(t => (
    <blockquote>
      <p>{t.quote}</p>
      <cite>{t.name}</cite>
    </blockquote>
  ))}
</section>
```

4. **Add to main page:**
```astro
---
import Testimonials from '../components/Testimonials.astro';
---

<Testimonials />
```

5. **Apply changes:**
```bash
npm run seed
git add .
git commit -m "Add testimonials section"
git push
```

### Deployment Workflow

```bash
# 1. Make changes locally
# Edit files, test locally

# 2. Commit changes
git add .
git commit -m "Description of changes"

# 3. Push to GitHub
git push origin main

# 4. Vercel automatically deploys
# Monitor at vercel.com/dashboard

# 5. Verify deployment
# Visit https://your-domain.vercel.app
```

### Database Management

**View local database:**
```bash
# Install SQLite browser
# Open data.db in SQLite browser
# Or use CLI:
sqlite3 data.db "SELECT * FROM ec_home;"
```

**Reset local database:**
```bash
# Delete database files
rm data.db data.db-shm data.db-wal

# Restart dev server (will recreate)
npm run dev
```

**Query Turso database:**
```bash
# Via Turso CLI
turso db shell my-portfolio-db

# Or via custom script
node -e "
import { Kysely } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
const db = new Kysely({
  dialect: new LibsqlDialect({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  }),
});
const result = await db.selectFrom('ec_home').selectAll().execute();
console.log(result);
"
```

---

## Performance Considerations

### Caching Strategy

- **Static Assets**: Cached by Vercel CDN indefinitely
- **Dynamic Pages**: Rendered on-demand (SSR)
- **Database Queries**: No caching (always fresh data)

### Optimization Tips

1. **Images**: Use Astro's Image component for optimization
2. **Fonts**: Self-host fonts to reduce external requests
3. **CSS**: Inline critical CSS, defer non-critical
4. **JavaScript**: Minimal client-side JS (Astro islands)

### Monitoring

- **Vercel Analytics**: Built-in performance monitoring
- **Build Logs**: Check for warnings/errors
- **Database**: Monitor Turso usage in dashboard

---

## Security Considerations

### Authentication

- **Passkey-based**: More secure than passwords
- **WebAuthn**: Industry-standard authentication
- **Session Management**: Tokens stored server-side

### Environment Variables

- **Never commit**: `.env` is gitignored
- **Vercel Secrets**: Encrypted at rest
- **Turso Tokens**: Rotate periodically

### Content Security

- **Admin Access**: Only authenticated users
- **Database**: Isolated per project
- **API Endpoints**: Protected by EmDash

---

## Conclusion

This documentation covers the complete architecture, integration, and deployment of the portfolio website with EmDash CMS on Vercel. The system successfully demonstrates that headless CMS can work on serverless platforms with proper configuration of remote database (Turso) and session management.

**Key Takeaways:**
- EmDash provides a powerful, Astro-native CMS solution
- Turso enables SQLite-like experience on serverless platforms
- Vercel offers excellent performance with global CDN
- Trade-offs exist (session persistence, media storage) but are manageable

For questions or issues, refer to:
- [EmDash Documentation](https://emdashcms.com/docs)
- [Turso Documentation](https://docs.turso.tech)
- [Vercel Documentation](https://vercel.com/docs)
- [Astro Documentation](https://docs.astro.build)
