# OutfitMe v1

OutfitMe is a web app where users upload outfit photos, identify clothing items, create personal styles, and find similar products on online stores.

## Current Local MVP

Implemented in this repo:
- `frontend/`: Next.js UI with landing page auth flow and a tabbed dashboard (`Analyze outfit`, `Wardrobe`)
- `backend/`: Flask API with authenticated endpoints, Gemini outfit analysis, Supabase token verification, private bucket upload, and DB persistence

Gemini powers outfit analysis. Similar-item results are still mocked for now.

## Prerequisites

- Node.js 18+
- Python 3.10+
- Supabase project

## Supabase Setup

1. Create a private storage bucket named `outfit-images`.
2. Create tables (`photos`, `outfit_analyses`, `items`) from the project spec SQL.
3. Enable RLS and add owner-based policies by `user_id`.
4. Enable email/password auth in Supabase Auth.
5. Run `supabase/migrations/20260217_000001_initial_schema.sql` in Supabase SQL editor.

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

## API Endpoints

- `GET /health`
- `GET /api/diagnostics` (dev config checks for Supabase + Gemini)
- `POST /api/analyze` (requires Bearer token + multipart `image`)
- `POST /api/similar` (requires Bearer token + JSON `items`)
- `GET /api/wardrobe` (requires Bearer token; returns minimal outfit list for fast loading)
- `GET /api/wardrobe/:photo_id/original` (requires Bearer token; returns signed URL for original photo preview)
- `GET /api/items` (requires Bearer token; returns items-only list for item selection/combining)
- `DELETE /api/wardrobe/:photo_id` (requires Bearer token; deletes wardrobe entry + stored image)

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
- Keep `.env` and `.env.local` out of git.
- Use private bucket + RLS policies for user data isolation.

## Next Steps

1. Replace mock analysis in `backend/app/routes/api.py` with real model inference.
2. Normalize and persist real similar-item search results.
3. Add pagination and filtering on wardrobe endpoint/UI.
4. Add richer wardrobe details (season, tags, favorite looks).
