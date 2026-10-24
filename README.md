# TENVORIA — Founder + Public Platform Foundation

This repository is an implementation foundation, not a claim that the product is already production-live.

## Product separation
- `src/` — existing Founder MVP interface (v0.3 UI; not yet fully wired to the new API).
- `server/` — Node.js API foundation, Neon PostgreSQL, separated founder/public auth scopes, task approval flow, audit log, and a gated Hermes CLI adapter.
- `public-site/` — separate public marketing site preview. It is intentionally not wired to live signup or billing yet.

## Prerequisites
- Node.js 20+
- Neon PostgreSQL database
- Hermes Agent installed and configured on the worker host if you want real agent execution

## Configure API
1. `cd server`
2. Copy `.env.example` to `.env` and fill the values locally or as deployment secrets.
3. Apply `sql/001_foundation.sql` to the Neon database using the Neon SQL Editor.
4. `npm install`
5. `npm run seed:founder` to create/reset the founder account using `FOUNDER_EMAIL` and `FOUNDER_PASSWORD`.
6. `npm run dev`
7. Check `GET http://localhost:8788/health`.

Never commit `.env` or put credentials in `VITE_*` variables. Use Neon's pooled connection string for serverless app traffic where appropriate.

## Hermes integration status
The server has a gated adapter in `server/src/hermes.js` that starts Hermes as a separate CLI process using fixed arguments (no shell interpolation). Execution is disabled by default. First install Hermes using its official documentation, configure a model/provider, run `hermes doctor` and a smoke test, then set `HERMES_ENABLED=true` only on the private worker host. Keep public execution disabled until rate limits, billing limits, isolation and abuse controls are implemented and tested.

The adapter assumes the installed CLI supports `hermes chat -q <prompt>`; verify against the installed version before enabling. It deliberately does not grant publishing, spending or deployment permission.

## API routes in this foundation
- `POST /api/founder/login` — founder-only login
- `POST /api/public/register` — public user registration
- `POST /api/public/login` — public-only login
- `GET /api/founder/me`, `GET /api/public/me`
- `POST/GET /api/{founder|public}/tasks`
- `POST /api/{founder|public}/tasks/:id/approve`
- `POST /api/{founder|public}/tasks/:id/execute`

Execution requires an owner-approved task and `HERMES_ENABLED=true`; public execution additionally requires `PUBLIC_AGENT_EXECUTION_ENABLED=true`. These API routes are a backend foundation; the existing Founder UI still needs to be wired to them, and the public site still needs signup/login screens, user workspace, billing, and deployment configuration.

## Two domains (Option A)
- `founder.tenvoria.com` → private Founder application/API access, allowlisted founder account only.
- `tenvoria.com` → public marketing/application.

Use host-level routing and server-side authorization; a hidden URL is not a security boundary. Keep private admin endpoints inaccessible to the public frontend. You can use separate deployments and separate DB roles for stronger isolation.

## Honest status
This iteration establishes the server-side structure and initial Hermes adapter. It has not been deployed, the database migration has not been applied to your Neon instance, Hermes has not been installed/configured in your cloud environment, and the UI/API end-to-end flow has not been verified. Do not label it production-ready until those checks pass.
