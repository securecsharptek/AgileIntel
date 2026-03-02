# Agile Intel — Supademo Integration v3.0

Enhanced with FFmpeg Media Pipeline & Microsoft Copilot Automation

## What Changed from v2.0

- **+6 new source files** (0 files modified destructively)
- **+3 database tables** (FFmpeg) + **+3 database tables** (Copilot)
- **+6 new API endpoints** (media/*, copilot/*)
- **+4 npm dependencies** (fluent-ffmpeg, @azure/storage-blob, bull, ioredis)
- **~1,240 total lines** TypeScript (up from ~820)

## New Capabilities

### FFmpeg Media Pipeline
- POST `/api/media/process-webinar` — Process raw Zoom recording into 12 assets
- GET `/api/media/assets/:webinarId` — Retrieve all derivative assets
- POST `/api/media/generate-thumbnail` — On-demand thumbnail generation

### Microsoft Copilot Automation
- POST `/api/copilot/generate-blog` — AI-drafted blog posts
- POST `/api/copilot/generate-email` — Personalized sales follow-up emails
- POST `/api/copilot/summarize-meeting` — Teams meeting summaries with action items
- POST `/api/copilot/agent-query` — Copilot Studio lead intelligence queries

## Deployment

```bash
# Set environment variables (see config/.env.example)
# Run deploy script
./scripts/deploy.sh
```

## Architecture

All v2.0 code is unchanged. New services are additive layers:
- `ffmpeg.service.ts` — Media processing via fluent-ffmpeg
- `copilot.service.ts` — Microsoft Graph + Copilot Studio APIs
- Two new route files mount at `/api/media/*` and `/api/copilot/*`
- Two new database migrations add 6 tables (zero impact on existing 5)
