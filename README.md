# OutfitMe v1

OutfitMe is a web app where users upload outfit photos, identify clothing items, create personal styles, and find similar products on online stores.

## Current Local MVP

Implemented in this repo:
- `frontend/`: Next.js UI with landing auth and a tabbed app (`Dashboard`, `Photo analysis`, `Outfits`, `Items`, `Settings`)
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
PORT=5000
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
- `infra/google` for Google Cloud setup template
- `infra/openai` for OpenAI config template

See `infra/README.md` for step-by-step usage (`init`, `plan`, `apply`), required variables, and outputs.

## API Endpoints

- `GET /health`
- `GET /api/diagnostics` (dev config checks for Supabase + Gemini)
- `POST /api/analyze` (requires Bearer token + multipart `image`)
- `POST /api/similar` (requires Bearer token + JSON `items`)
- `POST /api/outfits/compose` (requires Bearer token + JSON `item_ids`; creates a virtual/composed outfit from selected items)
- `GET /api/wardrobe` (requires Bearer token; returns one row per detected outfit)
- `GET /api/wardrobe/:photo_id/details?outfit_index=<n>` (requires Bearer token; returns signed original photo URL + selected outfit details)
- `GET /api/items` (requires Bearer token; returns items plus `style_label` used by catalog filters)
- `GET /api/stats` (requires Bearer token; returns dashboard metrics including photos analyzed, outfits saved, item-type/color breakdowns, and highlights)
- `DELETE /api/wardrobe/:outfit_id` (requires Bearer token; deletes a single outfit and removes the photo only when no outfits remain)
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

1. Replace mock analysis in `backend/app/routes/api.py` with real model inference.
2. Normalize and persist real similar-item search results.
3. Add server-side pagination/filtering on wardrobe and items endpoints.
4. Add richer wardrobe details and user actions (favorites, tags, notes).
