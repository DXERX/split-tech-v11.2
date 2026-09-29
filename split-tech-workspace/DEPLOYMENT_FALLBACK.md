# SplitTech V11.2 Fallback Deployment Notes

## Temporary Cloud Targets

- Frontend: deploy `dashboard-frontend/` to Vercel or Netlify.
- Backend API: deploy `server-side/` to Render or Railway as a Node.js 20 service.
- Database: create a Supabase PostgreSQL project and run SQL files in `server-side/migrations/` in numeric order.
- Edge Client: set `SPLITTECH_API_URL` on the shop laptop to the temporary Render/Railway API URL.

## Required Runtime Variables

Backend service:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `ENCRYPTION_KEY`
- `APP_URL`
- `RESEND_API_KEY`
- `RESEND_FROM`

Frontend service:

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL`

Edge client:

- `SPLITTECH_API_URL`
- `SPLITTECH_CONFIG`

## V11.2 Edge Stability Change

`client-side-edge/split_engine_v11.py` now decouples telemetry delivery from the computer vision loop using an in-memory `queue.Queue` and a daemon `threading.Thread`.

- Heartbeats, camera snapshots, camera failure reports, and audit payloads are queued without blocking the main orchestrator.
- The telemetry worker retries failed HTTP delivery with exponential backoff and jitter.
- Failed ingest payloads are persisted to `engine/queue/pending_uploads.json` and retried by the worker.
- Capture windows remain in `tracking_data.window` and `client_environment`, so delayed ingestion can still be interpreted by capture time instead of API receive time.
