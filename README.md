# OutfitMe v1

OutfitMe is a web app where users upload outfit photos, identify clothing items, create personal styles, and find similar products on online stores.

## Current Local MVP

Implemented in this repo:
- `frontend/`: Next.js UI with landing auth and a tabbed app (`Home`, `Photo analysis`, `My Outfits`, `Item catalog`, `Settings`)
- `backend/`: Flask API with authenticated endpoints, Gemini + Bedrock analysis routing, Supabase token verification, private bucket upload, and DB persistence

Frontend data/state stack:
- TanStack Query for query/mutation API flows with cache invalidation
- TanStack Table for item catalog pagination + table rendering

Gemini and AWS Bedrock Agent are supported for analysis. Similar-item results are still mocked for now.

## Prerequisites

- Node.js 18+
- Python 3.10+
- Supabase project

## Supabase Setup

1. Create a private storage bucket named `outfit-images`.
2. Create tables (`photos`, `outfit_analyses`, `items`, `outfits`, `outfit_items`, `user_settings`) from migrations.
3. Enable RLS and add owner-based policies by `user_id`.
4. Enable email/password auth in Supabase Auth.
5. Run:
   - `supabase/migrations/20260217_000001_initial_schema.sql`
   - `supabase/migrations/20260217_000002_user_settings.sql`
   - `supabase/migrations/20260217_000003_bedrock_agent_settings.sql`
   - `supabase/migrations/20260217_000004_drop_unused_bedrock_model_id.sql`
   - `supabase/migrations/20260217_000005_drop_unused_aws_credentials.sql`
   - `supabase/migrations/20260217_000006_outfits_table_and_itemized_deletes.sql`
   - `supabase/migrations/20260222_000007_analysis_jobs.sql`

## Environment Variables

Frontend: `frontend/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Backend: `backend/.env`

```env
FLASK_ENV=development
DEBUG=true
PORT=5000
CORS_ALLOWED_ORIGINS=http://localhost:3000
DIAGNOSTICS_ENABLED=true
RATE_LIMIT_STORAGE_URI=memory://
MONTHLY_ANALYSIS_LIMIT=100
ENABLE_BEDROCK_ANALYSIS=false
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_BUCKET=outfit-images
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
ITEM_IMAGE_MAX=3
SETTINGS_ENCRYPTION_KEY=
DEFAULT_ANALYSIS_MODEL=gemini-2.5-flash
```

Production defaults/safety:
- `FLASK_ENV=production` disables diagnostics unless explicitly enabled.
- Set `CORS_ALLOWED_ORIGINS` to your exact frontend domain(s), comma-separated.
- For multi-instance deployments, use Redis for shared rate-limit state (for example, `RATE_LIMIT_STORAGE_URI=redis://...`).
- `MONTHLY_ANALYSIS_LIMIT` enforces per-user monthly analyze quota (`0` disables the cap).
- `ENABLE_BEDROCK_ANALYSIS=false` keeps analysis provider scope to Gemini-only. Set to `true` to re-enable Bedrock model options.

Generate `SETTINGS_ENCRYPTION_KEY` once (Fernet key) and keep it private:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Run Locally

### 1) Backend

```bash
cd backend
python -m venv .venv
# PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

Backend: `http://localhost:5000`

### 2) Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`

## Infrastructure (Terraform)

Terraform templates are available in `infra/`:
- `infra/aws` for AWS Bedrock Agent creation
- `infra/aws-minimal` for low-cost AWS production app deployment (EC2 + Docker + TLS + optional CloudFront/WAF)
- `infra/google` for Google Cloud setup template
- `infra/openai` for OpenAI config template

See `infra/README.md` for step-by-step usage (`init`, `plan`, `apply`), required variables, and outputs.

## Production Runtime (Docker + Gunicorn)

Production deploy assets:
- `backend/Dockerfile` (Flask served by Gunicorn)
- `frontend/Dockerfile` (Next.js production build/start)
- `deploy/docker-compose.prod.yml` (frontend + backend + Caddy reverse proxy)

For local production-like test:

```bash
# ensure frontend/.env.production exists with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# and NEXT_PUBLIC_API_BASE_URL (or add it in the file before build)
cd deploy
# edit Caddyfile if you are not using app.example.com
cp Caddyfile.example Caddyfile
docker compose -f docker-compose.prod.yml up --build
```

## API Endpoints

- `GET /health`
- `GET /api/diagnostics` (dev config checks for Supabase + Gemini)
- `POST /api/analyze` (requires Bearer token + multipart `image`; enqueues async analyze job and returns `job_id`)
- `GET /api/analyze/jobs/:job_id?wait_seconds=<0-20>` (requires Bearer token; long-poll job status/result)
- `POST /api/similar` (requires Bearer token + JSON `items`)
- `POST /api/outfits/compose` (requires Bearer token + JSON `item_ids`; creates a virtual/composed outfit from selected items)
- `GET /api/wardrobe` (requires Bearer token; returns one row per detected outfit)
- `GET /api/wardrobe/:photo_id/details?outfit_index=<n>` (requires Bearer token; returns signed original photo URL + selected outfit details)
- `GET /api/items` (requires Bearer token; returns items plus `style_label` used by catalog filters)
- `GET /api/stats` (requires Bearer token; returns dashboard metrics including photos analyzed, outfits saved, item-type/color breakdowns, and highlights)
- `GET /api/limits` (requires Bearer token; returns per-user analysis quota usage and remaining monthly quota)
- `DELETE /api/wardrobe/:outfit_id` (requires Bearer token; deletes a single outfit row and its related item rows only)
- `GET /api/models` (requires Bearer token; returns model capability + per-user availability)
- `GET /api/settings/model-keys` (requires Bearer token; returns masked model settings)
- `PUT /api/settings/model-keys` (requires Bearer token; saves encrypted model credentials/preferences)

## Testing

### Backend tests (pytest)

```bash
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

### Frontend tests (vitest)

```bash
cd frontend
npm test
```

## Security Notes

- Frontend uses only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Backend uses `SUPABASE_SECRET_KEY` only on server.
- Model keys are stored encrypted in `user_settings` with `SETTINGS_ENCRYPTION_KEY`.
- Keep `.env` and `.env.local` out of git.
- Use private bucket + RLS policies for user data isolation.

## Next Steps

1. Add a cleanup workflow for orphaned photos/analyses after outfit-level deletes (optional retention policy).
2. Normalize and persist real similar-item search results.
3. Add server-side pagination/filtering on wardrobe and items endpoints.
4. Add richer wardrobe details and user actions (favorites, tags, notes).
