# Frontend

Next.js app for OutfitsMe. In the serverless target this project lives on Vercel and still serves Better Auth under `/api/auth`.

## Local Dev

1. Copy `frontend/.env.example` to `frontend/.env.local`.
2. Fill in:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
3. Run `npm run dev`.

Local defaults assume:

- frontend at `http://localhost:3000`
- backend at `http://localhost:5000`

## Vercel Deploy

Set these Vercel env vars:

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `NEXT_PUBLIC_API_BASE_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

After Terraform apply, copy:

- `NEXT_PUBLIC_API_BASE_URL` from `backend_api_base_url`
- `APP_URL`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, and `BETTER_AUTH_TRUSTED_ORIGINS` from `vercel_environment`
- Google callback allowlist from `google_oauth_redirect_uri`

## Auth Notes

- Better Auth uses the resolved app URL from explicit env vars first.
- If Vercel system env vars are exposed, the app can also infer `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, and `VERCEL_URL`.
- Google OAuth needs exact callback URLs. If you want auth on previews, use a stable preview or branch alias instead of relying on changing per-commit preview URLs.
