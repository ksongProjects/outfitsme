# OutfitsMe

OutfitsMe is a wardrobe app that turns outfit photos into structured closet data.

Current app flow:
- Sign in with Google.
- Upload and crop an outfit photo.
- Run async Gemini analysis to detect outfits and items.
- Save results into a wardrobe and item catalog.
- Build new AI-generated outfits from saved items.
- Generate "OutfitsMe" try-on previews from a saved profile reference photo.

## High-Level Use Cases

Use OutfitsMe when you want to:
- Turn outfit photos into a searchable digital wardrobe instead of keeping everything in your camera roll.
- Break down a look into reusable clothing items so you can organize what you own or what inspires you.
- Explore new combinations from saved pieces and generate fresh outfit ideas from your catalog.
- Preview how an analyzed outfit might look on you using a profile reference photo.
- Track AI usage, outfit history, and wardrobe growth in one place.

At a high level, OutfitsMe is part closet organizer, part outfit idea generator, and part try-on preview tool.

## Current Status

This repo contains a working full-stack app, not just a landing page or concept demo.

What is working today:
- Google OAuth sign-in through Better Auth
- Protected dashboard with usage, recent activity, and wardrobe stats
- Photo analysis queue with job polling and progress states
- Automatic outfit + item persistence to Supabase
- Generated item thumbnails after analysis
- Wardrobe browsing, rename, single delete, bulk delete, image download
- Item catalog filtering by type, color, and style
- Custom outfit generation from selected saved items
- OutfitsMe try-on preview generation for analyzed outfits after profile photo upload and feature enablement
- User profile settings, profile photo upload, feature toggles, and cost summary
- History table for analysis, custom outfit, and try-on jobs

Known limitations:
- Online store search is not live yet. Settings marks it as coming soon.
- `POST /api/similar` still returns placeholder/mock store results.
- Only Gemini is wired into the current product flow. Bedrock is not part of the active app path right now.
- Frontend has linting, but no `npm test` script is configured at the moment.

## Stack

- `frontend/`: Next.js 16, React 19, Better Auth, Drizzle, TanStack Query, Zustand, Tailwind CSS
- `backend/`: Flask API, Flask-Limiter, Supabase storage/database access, Gemini integration
- `supabase/`: schema and RLS migrations
- `infra/aws/`: AWS Terraform template currently checked into this repo
- `deploy/`, `proxy/`, `compose.yaml`: Docker Compose and production deploy assets

## Repo Layout

- `frontend/`: public landing page, auth, dashboard UI, app tabs
- `backend/`: Flask routes, auth validation, analysis job worker, Supabase and Gemini services
- `supabase/migrations/`: database, auth-table, storage, and AI pipeline setup
- `infra/aws/`: AWS infrastructure template
- `deploy/`: deployment scripts used by GitHub Actions
- `proxy/`: nginx templates for HTTP bootstrap and TLS runtime

## User-Facing Features

### Landing + Auth

- Public landing page with Google sign-in CTA
- Better Auth handles auth routes under `frontend/src/app/api/auth`
- Session-backed JWT is used to call the Flask API

### Dashboard

- Library totals for analyzed photos, generated outfit images, and cataloged items
- Trial/unlimited access summary
- Recent AI activity summary

### Photo Analysis

- Upload JPG/PNG/WEBP photos
- Optional crop selection before upload
- Async analysis jobs with queue state and polling
- Up to 5 concurrent analysis jobs from the UI
- Saved analysis cards with detected outfits and item breakdowns
- Generated item thumbnails for detected pieces
- Optional accessory analysis toggle from Settings

### My Outfits

- Browse saved outfits from photo analysis, custom outfit generation, and OutfitsMe generation
- Open outfit details modal
- Rename outfits
- Delete one or many outfits
- Download current outfit image
- Generate try-on previews from analyzed outfits after enabling outfit image generation and uploading a profile photo

### Item Catalog

- Browse detected items with pagination
- Filter by type, color, and style
- Select saved items and create a new composed outfit

### Settings

- Upload profile reference photo
- Save display name, gender, and age
- Toggle outfit image generation
- Toggle accessory analysis
- View monthly AI usage and estimated costs

## Auth + Data Model

Auth is split across frontend and backend:

- Next.js uses Better Auth with Google OAuth and a PostgreSQL connection from `DATABASE_URL`
- Better Auth tables live in Supabase/Postgres public schema
- Backend validates Better Auth JWTs against the JWKS endpoint
- Supabase stores photos, profile photos, generated outfit images, outfits, items, jobs, and user settings

Current role model:
- `trial`
- `premium`
- `admin`

Trial behavior in current code:
- trial length controlled by `TRIAL_DAYS`
- daily AI limit controlled by `TRIAL_DAILY_AI_ACTION_LIMIT`
- unlimited AI access for `premium` and `admin`

## Supabase Setup

Run these migrations in order:

1. `supabase/migrations/0001_auth_and_storage.sql`
2. `supabase/migrations/0002_photos_and_user_settings.sql`
3. `supabase/migrations/0003_ai_pipeline.sql`

What these migrations do:
- create Better Auth tables in Postgres
- create private `outfit-images` storage bucket
- create app tables for photos, settings, jobs, outfits, items, and outfit-item joins
- enable row-level security and owner-scoped policies

## Environment Setup

Frontend local env lives at `frontend/.env.local`. Start from `frontend/.env.example`.

Important frontend vars:
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Backend local env lives at `backend/.env`. Start from `backend/.env.example`.

Important backend vars:
- `APP_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_JWKS_URL`
- `BETTER_AUTH_JWT_ISSUER`
- `BETTER_AUTH_JWT_AUDIENCE`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_BUCKET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_IMAGE_MODEL`
- `SETTINGS_ENCRYPTION_KEY`

Production runtime env lives in top-level `.env.example`. That file is meant for `/etc/outfitsme/app.env` on the server.

## Prerequisites

- Node.js suitable for Next.js 16
- Python 3.10+
- Supabase project
- Google OAuth credentials
- Gemini API key

## Run Locally

### 1. Start backend

```bash
cd backend
python -m venv .venv
# PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

Backend runs on `http://localhost:5000`.

### 2. Start frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## API Summary

All `/api/*` routes require a Bearer token unless noted otherwise.

- `GET /health`
- `POST /api/analyze`
- `GET /api/analyze/jobs/<job_id>`
- `POST /api/similar`
- `POST /api/outfits/compose`
- `GET /api/wardrobe`
- `DELETE /api/delete-wardrobe`
- `DELETE /api/wardrobe/<outfit_id>`
- `PUT /api/wardrobe/<outfit_id>`
- `GET /api/wardrobe/<photo_id>/details?outfit_index=<n>`
- `POST /api/wardrobe/<photo_id>/outfitsme`
- `GET /api/items`
- `GET /api/history`
- `GET /api/stats`
- `GET /api/limits`
- `GET /api/models`
- `GET /api/settings/preferences`
- `PUT /api/settings/preferences`
- `GET /api/settings/costs`
- `POST /api/settings/profile-photo`

Notes:
- `POST /api/analyze` queues async analysis work and returns `202`
- `POST /api/outfits/compose` creates a new AI-generated outfit image from selected saved items
- `POST /api/wardrobe/<photo_id>/outfitsme` generates a try-on preview using the user's profile photo
- `POST /api/similar` is still placeholder/mock data today

## Testing And Checks

Backend tests:

```bash
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

Frontend checks:

```bash
cd frontend
npm run lint
```

There is currently no frontend `npm test` script in `frontend/package.json`.

## Production Runtime

Production deploy assets in this repo:
- `compose.yaml`
- `proxy/nginx.http.conf`
- `proxy/nginx.ssl.conf`
- `deploy/remote-deploy.sh`
- `.env.example`

Current production runtime shape:
- `frontend` container
- `backend` container
- `proxy` nginx container
- optional `certbot` container/profile

`deploy/remote-deploy.sh` handles:
- loading runtime and deploy env files
- rendering nginx config
- pulling new images
- running Docker Compose
- bootstrapping TLS certificates if needed
- installing cert renewal cron

GitHub Actions workflows in `.github/workflows/`:
- `bootstrap-runtime-env.yml`
- `deploy.yml`
- `sync-deploy-assets.yml`

## Infrastructure

This repo currently includes AWS Terraform under `infra/aws/`.

## Security Notes

- Better Auth secrets stay server-side
- Backend uses `SUPABASE_SECRET_KEY`; frontend does not
- Storage bucket is private
- RLS is enabled on app tables and storage access is scoped by user folder
- Keep `.env`, `.env.local`, and server runtime env files out of git
