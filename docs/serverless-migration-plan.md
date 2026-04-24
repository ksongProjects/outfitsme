# OutfitsMe Serverless Migration Plan

## Goal

Replace always-on EC2 + Docker Compose + nginx with:

- Vercel for frontend and Better Auth routes
- AWS Lambda for backend API and async analysis worker
- Amazon SQS for durable background job execution
- Supabase retained for Postgres and storage

Target end state:

- no EC2
- no Elastic IP
- no nginx
- no Docker Compose in production

## Why This Shape

Current production shape is tightly coupled to one VM:

- EC2 infra in `infra/aws/main.tf`
- nginx reverse proxy in `proxy/nginx.ssl.conf`
- Docker Compose runtime in `compose.yaml`
- EC2/SSM deploy workflows in `.github/workflows/deploy.yml`, `.github/workflows/bootstrap-runtime-env.yml`, and `.github/workflows/sync-deploy-assets.yml`

Main technical blocker for Lambda is not Flask itself. It is the in-process background queue in `backend/app/services/analysis_jobs_service.py`, which uses `ThreadPoolExecutor`. That must become a durable queue + worker.

## Recommended Target Architecture

### Production request flow

1. Browser loads Next.js app from Vercel.
2. Better Auth runs on Vercel under `/api/auth`.
3. Frontend calls backend at `NEXT_PUBLIC_API_BASE_URL`.
4. Backend API runs on AWS Lambda.
5. `POST /api/analyze` uploads image to Supabase, writes job row, sends `job_id` to SQS, returns `202`.
6. Worker Lambda consumes SQS message, runs Gemini analysis, persists results to Supabase, marks job complete or failed.
7. Frontend continues polling `GET /api/analyze/jobs/<job_id>`.

### Target services

- Vercel project: frontend + Better Auth
- Lambda API function: Flask app via Lambda Web Adapter
- Lambda worker function: async analysis processor
- SQS queue: analysis jobs
- SQS dead-letter queue: failed jobs
- CloudWatch log groups: API + worker
- ECR repositories: Lambda container images
- Optional later: API Gateway HTTP API or CloudFront if custom API domain becomes necessary

## Cost Strategy

### Lowest-cost first pass

- Vercel Hobby for frontend
- Lambda Function URL for backend API
- SQS for jobs
- Supabase free tier if usage remains small
- default Lambda URL for backend instead of custom `api.` domain

This is best path if goal is "close to zero" with least infrastructure.

### Cleaner production variant

- Vercel frontend
- API Gateway HTTP API in front of Lambda API
- custom API domain such as `api.outfitsme.com`

Use this only if custom API hostname, API Gateway throttling, or cleaner API observability matters more than minimizing cost.

## Exact Terraform Plan

Do not replace `infra/aws/main.tf` in-place first. That stack currently owns live EC2 state.

Create a new Terraform root:

```text
infra/aws-serverless/
  versions.tf
  providers.tf
  variables.tf
  locals.tf
  iam.tf
  ecr.tf
  logs.tf
  sqs.tf
  lambda_api.tf
  lambda_worker.tf
  function_url.tf
  outputs.tf
  terraform.tfvars.example
```

### Resources to add

#### `iam.tf`

- `aws_iam_role.lambda_api_exec`
- `aws_iam_role.lambda_worker_exec`
- `aws_iam_role_policy.lambda_api_policy`
- `aws_iam_role_policy.lambda_worker_policy`
- `aws_iam_role_policy_attachment` for CloudWatch Logs basic execution

Permissions needed:

- Supabase and Gemini use external HTTPS only, so no AWS service permissions needed for those
- SQS send for API Lambda
- SQS consume/delete and DLQ access for worker Lambda
- CloudWatch Logs write for both functions

#### `ecr.tf`

- `aws_ecr_repository.backend_api`
- `aws_ecr_repository.backend_worker`

#### `logs.tf`

- `aws_cloudwatch_log_group.lambda_api`
- `aws_cloudwatch_log_group.lambda_worker`

#### `sqs.tf`

- `aws_sqs_queue.analysis_jobs_dlq`
- `aws_sqs_queue.analysis_jobs`
  - redrive policy to DLQ
  - visibility timeout longer than worst-case Gemini job runtime
  - receive wait time enabled

#### `lambda_api.tf`

- `aws_lambda_function.api`
  - package type `Image`
  - env vars for Flask, Supabase, Better Auth issuer/audience, Gemini, CORS
  - reserved concurrency set low initially to cap spend
  - timeout sized for sync endpoints
  - memory sized for image upload and API work

#### `lambda_worker.tf`

- `aws_lambda_function.analysis_worker`
  - package type `Image`
  - timeout sized for analysis work
  - memory sized for Pillow + Gemini flows
  - reserved concurrency set very low initially
- `aws_lambda_event_source_mapping.analysis_jobs`
  - queue -> worker mapping
  - batch size 1 initially

#### `function_url.tf`

First pass:

- `aws_lambda_function_url.api`
  - auth type `NONE`
  - CORS restricted to Vercel production and preview origins
- `aws_lambda_permission.api_function_url_public`

If custom API domain becomes required, replace this file with `api_gateway.tf`.

#### `outputs.tf`

- `api_function_url`
- `analysis_queue_url`
- `analysis_queue_arn`
- `backend_api_image_repo_url`
- `backend_worker_image_repo_url`

### Resources to remove later

Do this only after production cutover and bake time:

- `aws_instance.app_server`
- `aws_eip.app_server_eip`
- `aws_security_group.web_stack_sg`
- `aws_iam_role.ec2_ssm_role`
- `aws_iam_instance_profile.ec2_profile`
- `aws_iam_role_policy_attachment.ssm_attach`
- `aws_iam_role_policy.terraform_passrole_ec2_profile`

## Application Refactor Plan

### Backend file plan

Add:

```text
backend/
  Dockerfile.lambda-api
  Dockerfile.lambda-worker
  lambda_worker.py
  app/services/job_queue_service.py
```

Refactor:

- `backend/app/routes/api.py`
- `backend/app/services/analysis_jobs_service.py`
- `backend/app/config.py`
- `backend/requirements.txt`

### Backend behavior changes

#### 1. Replace in-process queue

Current:

- `enqueue_analysis_job_processing(job_id)` submits to local thread pool

Target:

- `enqueue_analysis_job_processing(job_id)` becomes queue publisher
- new worker entrypoint consumes SQS event and calls `process_analysis_job(job_id)`

This keeps most analysis logic intact while changing only execution model.

#### 2. Tighten upload path for Lambda limits

Current Flask max body is 10 MB.

Target:

- either reduce accepted upload size to fit Lambda sync limits
- or move to direct-to-Supabase signed upload flow

Recommended order:

1. first reduce frontend-prepared upload size aggressively
2. then migrate to direct signed uploads if needed

#### 3. Move rate limiting away from local memory assumptions

Current default `RATE_LIMIT_STORAGE_URI=memory://` is fine on one VM, weak on Lambda.

Target:

- keep app-level limits for business rules
- rely on low reserved concurrency first
- if needed later, add API Gateway throttling or external limiter storage

#### 4. CORS becomes explicit

Backend must allow:

- Vercel production domain
- optional `www` domain
- optional Vercel preview domain pattern if previews need live API

## Frontend Plan

Frontend remains Next.js on Vercel.

### What stays

- Better Auth in Next.js
- `/api/auth/*` served by Vercel
- current frontend polling flow

### What changes

- production envs move to Vercel
- `NEXT_PUBLIC_API_BASE_URL` points to Lambda URL or API Gateway URL
- Google OAuth redirect URIs updated to Vercel domain
- Better Auth issuer/audience values point to Vercel origin, not EC2 origin
- Better Auth trusted origins should be explicit via `BETTER_AUTH_TRUSTED_ORIGINS`
- preview auth should use stable branch/preview aliases because Google OAuth redirect allowlists are exact-match

### No nginx needed

nginx exists today only to terminate TLS and split traffic:

- `/api/auth` -> frontend container
- `/api` -> backend container
- `/` -> frontend container

Once Vercel serves frontend/auth and Lambda serves backend, nginx has no job left.

## CI/CD Plan

### Frontend

- Let Vercel handle frontend deploys from GitHub
- Remove frontend build/push from AWS deploy workflow after cutover

### Backend

Replace EC2/SSM deployment with:

```text
.github/workflows/deploy-serverless.yml
```

Workflow responsibilities:

1. configure AWS credentials
2. login to ECR
3. build `backend/Dockerfile.lambda-api`
4. build `backend/Dockerfile.lambda-worker`
5. push both images to ECR
6. run `aws lambda update-function-code` for API and worker
7. optionally publish versions

### Infra lifecycle

Keep Terraform infra changes separate from app deploys:

```text
.github/workflows/infra-serverless-plan.yml
.github/workflows/infra-serverless-apply.yml
```

This avoids using Terraform for every image tag rollout.

## Environment Variable Plan

### Remove from runtime after cutover

- `DOMAIN`
- `WWW_DOMAIN`
- `CERTBOT_EMAIL`
- `DOCKERHUB_USERNAME`
- `IMAGE_TAG`

### Keep

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_JWKS_URL`
- `BETTER_AUTH_JWT_ISSUER`
- `BETTER_AUTH_JWT_AUDIENCE`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `CORS_ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_BUCKET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_IMAGE_MODEL`
- `SETTINGS_ENCRYPTION_KEY`
- `DEFAULT_ANALYSIS_MODEL`
- `UPLOAD_MAX_BYTES`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Add

- `ANALYSIS_QUEUE_URL`
- `AWS_LWA_PORT` or equivalent Lambda Web Adapter port config for API image

## Recommended Migration Sequence

### Phase 0: Prepare

1. Create Vercel project for `frontend/`
2. Add Vercel env vars matching current production auth config
3. Add Google OAuth redirect URIs for Vercel prod and preview domains
4. Create `infra/aws-serverless/`

### Phase 1: Build serverless backend

1. Add SQS-backed queue publisher
2. Add worker Lambda entrypoint
3. Add Lambda API container image
4. Deploy serverless infra
5. Verify Lambda API against local frontend or Vercel preview

### Phase 2: Frontend cutover

1. Deploy frontend to Vercel
2. Point `NEXT_PUBLIC_API_BASE_URL` to Lambda URL
3. Set `APP_URL`, `NEXT_PUBLIC_APP_URL`, and Better Auth URLs to Vercel domain
4. Verify login, token issuance, CORS, and JWT validation

### Phase 3: Production bake

1. Keep EC2 stack alive but idle for rollback
2. Run real user traffic through Vercel + Lambda
3. Watch:
   - Lambda errors
   - SQS backlog
   - DLQ messages
   - Gemini timeout rates
   - Supabase write failures

### Phase 4: Decommission

1. Remove EC2 workflows
2. Remove Compose and nginx from prod process
3. Destroy legacy EC2 Terraform stack

## Rollback Plan

If Lambda or auth cutover fails:

1. point Vercel `NEXT_PUBLIC_API_BASE_URL` back to existing EC2 API
2. restore `APP_URL` and Better Auth origin values if auth issue is origin-related
3. leave serverless infra deployed but unused
4. inspect SQS/DLQ before retrying

Do not destroy EC2 until rollback is no longer needed.

## Concrete Repo Change List

### Add

- `docs/serverless-migration-plan.md`
- `infra/aws-serverless/*`
- `backend/Dockerfile.lambda-api`
- `backend/Dockerfile.lambda-worker`
- `backend/lambda_worker.py`
- `backend/app/services/job_queue_service.py`
- `.github/workflows/deploy-serverless.yml`
- `.github/workflows/infra-serverless-plan.yml`
- `.github/workflows/infra-serverless-apply.yml`

### Remove later

- `compose.yaml`
- `deploy/remote-deploy.sh`
- `proxy/nginx.http.conf`
- `proxy/nginx.ssl.conf`
- `.github/workflows/deploy.yml`
- `.github/workflows/bootstrap-runtime-env.yml`
- `.github/workflows/sync-deploy-assets.yml`

## Recommendation

Proceed in this order:

1. create separate serverless Terraform root
2. refactor analysis queue to SQS worker
3. deploy backend Lambda first
4. move frontend/auth to Vercel
5. remove EC2 only after bake period

This keeps migration reversible and avoids replacing current working production stack in one step.
