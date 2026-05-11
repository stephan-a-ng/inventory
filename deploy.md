# Deployment Guide

## Environments

| | Staging | Production |
|---|---|---|
| **Frontend** | https://inventory-frontend-staging-329274314764.us-central1.run.app | https://inventory-frontend-production-329274314764.us-central1.run.app |
| **Backend** | https://inventory-api-staging-329274314764.us-central1.run.app | https://inventory-api-production-329274314764.us-central1.run.app |
| **Database** | `crm_staging` (inventory schema) | `crm_production` (inventory schema) |
| **GCP Project** | `moonfive-crm` | `moonfive-crm` |

## Deploying

Always deploy staging first and verify before pushing to production.

```bash
# Make executable (first time only)
chmod +x deploy.sh

# Deploy staging
./deploy.sh staging

# Deploy production (prompts for confirmation)
./deploy.sh production
```

## Google OAuth Clients

Each environment has its own OAuth client registered in Google Cloud Console. **Do not swap these.**

### Staging
- **Client ID:** `329274314764-abao2senfdqf7hcfdvgfu4mqf6cop03g.apps.googleusercontent.com`
- **Redirect URI:** `https://inventory-frontend-staging-329274314764.us-central1.run.app/api/auth/google/callback`
- **Secrets:** `inventory-google-client-id-staging`, `inventory-google-client-secret-staging`

### Production
- **Client ID:** `329274314764-hrtrqcs0ij7gl4j0bctgp6hg69irkn1c.apps.googleusercontent.com`
- **Redirect URI:** `https://inventory-frontend-production-329274314764.us-central1.run.app/api/auth/google/callback`
- **Secrets:** `inventory-google-client-id-production`, `inventory-google-client-secret-production`

## Updating OAuth Credentials

If you need to rotate or replace OAuth credentials, update Secret Manager directly — the next deploy will pick up the latest version automatically:

```bash
# Staging
echo -n "NEW_CLIENT_ID" | gcloud secrets versions add inventory-google-client-id-staging --data-file=- --project=moonfive-crm
echo -n "NEW_CLIENT_SECRET" | gcloud secrets versions add inventory-google-client-secret-staging --data-file=- --project=moonfive-crm

# Production
echo -n "NEW_CLIENT_ID" | gcloud secrets versions add inventory-google-client-id-production --data-file=- --project=moonfive-crm
echo -n "NEW_CLIENT_SECRET" | gcloud secrets versions add inventory-google-client-secret-production --data-file=- --project=moonfive-crm
```

## Infrastructure

- **Cloud Run:** 4 services in `us-central1` (`inventory-api-staging`, `inventory-frontend-staging`, `inventory-api-production`, `inventory-frontend-production`)
- **Database:** Tables live in the `inventory` schema inside the shared `crm-db` Cloud SQL instance
- **Secrets:** All in Secret Manager under the `moonfive-crm` project, prefixed `inventory-`

## Local Development

```bash
docker-compose up
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
