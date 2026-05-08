# Insta Automator

An AI-powered Instagram content automation platform. Generate, review, and publish Instagram posts, carousels, and reels automatically using AI content generation and real image search.

## Architecture

- **Frontend**: React + Vite (`artifacts/insta-automator/`) — served at `/`
- **API server**: Express + TypeScript (`artifacts/api-server/`) — serves `/api/*`
- **Database**: PostgreSQL via Drizzle ORM (`lib/db/`) — local Replit Postgres
- **API contract**: OpenAPI spec in `lib/api-spec/openapi.yaml`, generated React Query hooks in `lib/api-client-react/`

## Running Locally (Workflows)

Both workflows are managed by Replit and start automatically:
- `artifacts/api-server: API Server` — builds and starts Express on `PORT=8080`
- `artifacts/insta-automator: web` — starts Vite dev server

> **Note**: The Vite and API builds require `PORT` and `BASE_PATH` env vars (set automatically by Replit workflows). Running `vite build` or the dev server outside of the workflow context without these set will fail.

## Development

### Regenerating the API client

After changing `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This regenerates:
- `lib/api-client-react/src/generated/` — React Query hooks
- `lib/api-zod/src/generated/` — Zod validators

### Database schema changes

Edit `lib/db/src/schema/` then push:

```bash
pnpm --filter @workspace/db run push
```

## Environment Variables & Secrets

The app uses the Replit Postgres database automatically (via `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` — managed by Replit).

**Optional secrets** (add via Replit Secrets panel for full functionality):
- `OPENAI_API_KEY` — GPT-4o-mini captions + DALL-E 3 images (falls back to Pollinations if absent)
- `META_APP_ID` — Facebook App ID for OAuth login flow
- `META_APP_SECRET` — Facebook App Secret for token exchange
- `SERPER_API_KEY` — Google image search via Serper (falls back to AI generation if absent)
- `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` — Alternative image search
- `VITE_META_APP_ID` — Facebook App ID exposed to frontend (for the "Connect with Facebook" button)

> **Important**: Never put API keys or secrets in `.replit` env vars — those are stored in the git-committed `.replit` file and are publicly visible. Always use the Replit Secrets panel.

## Features

- **Dashboard**: Generate posts/reels/carousels, review pending content, approve/reject/publish
- **Post History**: Browse all generated posts with filtering by status
- **Settings**: Configure niche, posting schedule, Instagram account connection, image source (AI vs real search)
- **Auto-scheduler**: Checks every minute; generates content at configured times and auto-publishes approved posts

## Security Note

API endpoints are currently unauthenticated — suitable for a private/personal tool. If deploying publicly, add authentication middleware to `/api/config` and `/api/posts/:id/publish` at minimum.

## User Preferences

- Use the Replit-native PostgreSQL database (not Supabase or other external DBs)
- AI content falls back gracefully when API keys are not configured
