# MoonFive Inventory Manager

## Overview
Hardware device inventory tracking system for commissioning pipeline (Assembly -> Firmware -> Calibration -> QA -> Staging -> Deployed). Supports QR codes, barcode scanning, audit trails, CSV import/export, and bulk operations.

## Tech Stack
- **Backend:** FastAPI + asyncpg + PostgreSQL 16
- **Frontend:** React + Vite + Tailwind CSS v4
- **Auth:** Google OAuth with JWT HTTP-only cookies
- **State:** Zustand
- **Icons:** Lucide React
- **Font:** HEX Franklin

## Local Development
```bash
docker-compose up
```
- Backend: http://localhost:8000
- Frontend: http://localhost:5173
- PostgreSQL: localhost:5432

## Project Structure
```
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app
│   │   ├── config.py         # Environment config
│   │   ├── database.py       # asyncpg pool
│   │   ├── dependencies.py   # Auth dependencies
│   │   ├── models.py         # Pydantic schemas
│   │   ├── routes/           # API route handlers
│   │   └── services/         # Business logic
│   ├── alembic/              # Database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom hooks
│   │   ├── pages/            # Page components
│   │   ├── stores/           # Zustand stores
│   │   └── styles/           # CSS
│   └── package.json
└── docker-compose.yml
```

## API Endpoints
- `GET /api/health` — Health check
- `GET /api/auth/google` — Start OAuth flow
- `GET /api/auth/google/callback` — OAuth callback
- `GET /api/auth/me` — Current user
- `POST /api/auth/logout` — Logout
- `GET /api/devices` — List devices (filterable)
- `POST /api/devices` — Create device
- `GET /api/devices/{id}` — Get device
- `PATCH /api/devices/{id}` — Update device
- `DELETE /api/devices/{id}` — Delete device
- `GET /api/devices/lookup/{mac}` — Lookup by MAC
- `GET /api/devices/{id}/qr` — QR code PNG
- `POST /api/devices/bulk-import` — CSV import
- `GET /api/devices/export` — CSV export
- `POST /api/devices/bulk-stage` — Bulk stage change
- `GET /api/audit/{device_id}` — Audit trail
- `GET /api/stages` — List stages
- `POST /api/stages` — Create stage (admin)
- `PATCH /api/stages/{id}` — Update stage (admin)
- `DELETE /api/stages/{id}` — Delete stage (admin)

## Roles
- **admin** — Full access, @moonfive.tech emails
- **technician** — CRUD devices
- **viewer** — Read-only

## Common Gotchas
- Always use parameterized queries with asyncpg ($1, $2...)
- JWT stored in HTTP-only cookie, not localStorage
- Frontend proxy: `/api` routes proxied to backend via Vite config
