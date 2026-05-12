#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# MoonFive Inventory — Deploy Script
# Usage: ./deploy.sh [staging|production]
# ---------------------------------------------------------------------------

PROJECT=moonfive-crm
REGION=us-central1
CLOUDSQL_INSTANCE=moonfive-crm:us-central1:crm-db
APP=inventory

# Service names
STAGING_API=inventory-api-staging
STAGING_WEB=inventory-frontend-staging
PROD_API=inventory-api-production
PROD_WEB=inventory-frontend-production

# Photo storage (one bucket per env, plus a single signer service account).
# See docs/claude/DEPLOYMENT.md for the one-time bucket + IAM bootstrap.
STAGING_PHOTO_BUCKET=moonfive-inventory-photos-staging
PROD_PHOTO_BUCKET=moonfive-inventory-photos-production
PHOTO_SIGNER_SA=inventory-api@moonfive-crm.iam.gserviceaccount.com

# URLs (derived from Cloud Run project number — do not change)
STAGING_API_URL=https://inventory-api-staging-329274314764.us-central1.run.app
STAGING_WEB_URL=https://inventory-frontend-staging-329274314764.us-central1.run.app
PROD_API_URL=https://inventory-api-production-329274314764.us-central1.run.app
PROD_WEB_URL=https://inventory-frontend-production-329274314764.us-central1.run.app

# Public-facing custom domain for production. Cloud Run domain-mapping points
# this at inventory-frontend-production. FRONTEND_URL + GOOGLE_REDIRECT_URI
# must use this so the oauth_state cookie set on the public domain survives
# the round-trip back from Google's consent screen — using the *.run.app
# URL for the callback would cookie-domain-mismatch the state.
PROD_PUBLIC_URL=https://inventory.moonfive.tech

# ---------------------------------------------------------------------------
# OAuth client IDs — one per environment, DO NOT swap these
#
#   Staging  client ID: 329274314764-abao2senfdqf7hcfdvgfu4mqf6cop03g.apps.googleusercontent.com
#            secret in: inventory-google-client-id-staging  (Secret Manager)
#
#   Prod     client ID: 329274314764-hrtrqcs0ij7gl4j0bctgp6hg69irkn1c.apps.googleusercontent.com
#            secret in: inventory-google-client-id-production  (Secret Manager)
#
# Redirect URIs registered in Google Cloud Console:
#   Staging:    $STAGING_WEB_URL/api/auth/google/callback
#   Production: $PROD_PUBLIC_URL/api/auth/google/callback  (custom domain)
# ---------------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 [local|staging|production]

  local       Bootstrap localhost dev: pull staging OAuth client id/secret
              from Secret Manager into a gitignored .env, then start the
              docker compose stack.
  staging     Deploy to Cloud Run staging.
  production  Deploy to Cloud Run production (typed confirmation).
EOF
  exit 1
}

[[ $# -eq 1 ]] || usage
ENV=$1
[[ "$ENV" == "local" || "$ENV" == "staging" || "$ENV" == "production" ]] || usage

# ---------------------------------------------------------------------------

deploy_backend() {
  local service=$1 frontend_url=$2 redirect_uri=$3 db_secret=$4 jwt_secret=$5 client_id_secret=$6 client_secret_secret=$7
  local pop_secret=$8 mobile_ios_secret=$9 mobile_android_secret=${10} photo_bucket=${11}

  echo "→ Deploying backend: $service"
  gcloud run deploy "$service" \
    --source ./backend \
    --project "$PROJECT" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --add-cloudsql-instances "$CLOUDSQL_INSTANCE" \
    --service-account "$PHOTO_SIGNER_SA" \
    --set-secrets "DATABASE_URL=${db_secret}:latest,JWT_SECRET=${jwt_secret}:latest,GOOGLE_CLIENT_ID=${client_id_secret}:latest,GOOGLE_CLIENT_SECRET=${client_secret_secret}:latest,POP_ENCRYPTION_KEY=${pop_secret}:latest,MOBILE_GOOGLE_CLIENT_ID_IOS=${mobile_ios_secret}:latest,MOBILE_GOOGLE_CLIENT_ID_ANDROID=${mobile_android_secret}:latest" \
    --set-env-vars "ENVIRONMENT=${ENV},FRONTEND_URL=${frontend_url},GOOGLE_REDIRECT_URI=${redirect_uri},AUTHORIZED_DOMAIN=moonfive.tech,GCS_BUCKET=${photo_bucket},GCS_SIGNER_SA_EMAIL=${PHOTO_SIGNER_SA}"
}

deploy_frontend() {
  local service=$1 image=$2 api_url=$3 installer_app_url=$4

  echo "→ Building frontend image: $image"
  docker buildx build --platform linux/amd64 \
    --build-arg "VITE_INSTALLER_APP_URL=${installer_app_url}" \
    -t "gcr.io/${PROJECT}/${image}:latest" \
    --push \
    ./frontend

  echo "→ Deploying frontend: $service"
  gcloud run deploy "$service" \
    --image "gcr.io/${PROJECT}/${image}:latest" \
    --project "$PROJECT" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "BACKEND_URL=${api_url}"
}

health_check() {
  local api_url=$1 web_url=$2

  echo "→ Health check..."
  API_STATUS=$(curl -s "${api_url}/api/health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "unreachable")
  WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$web_url")

  echo "  API: $API_STATUS"
  echo "  Web: HTTP $WEB_STATUS"

  [[ "$API_STATUS" == "healthy" && "$WEB_STATUS" == "200" ]] || { echo "Health check failed"; exit 1; }
  echo "  ✓ All healthy"
}

# ---------------------------------------------------------------------------

INSTALLER_APP_URL_SCHEME="moonfive-installer://device"

if [[ "$ENV" == "local" ]]; then
  # ──────────────────────────────────────────────────────────────────────
  # Local dev bootstrap. Bakes the staging Google OAuth credentials into a
  # gitignored .env so docker compose can serve a real OAuth flow on
  # localhost. JWT_SECRET, DATABASE_URL and GCS are intentionally left at
  # dev defaults — only the Google client id/secret need to come from
  # Secret Manager.
  #
  # One-time requirement: the staging Google OAuth client must have
  #   http://localhost:5180/api/auth/google/callback
  # registered as an Authorized redirect URI.
  # ──────────────────────────────────────────────────────────────────────
  command -v gcloud >/dev/null || { echo "gcloud CLI not found in PATH"; exit 1; }

  active_account=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -n1 || true)
  if [[ -z "$active_account" ]]; then
    echo "No active gcloud account. Run: gcloud auth login"
    exit 1
  fi
  echo "→ Using gcloud account: $active_account"

  echo "→ Fetching staging Google OAuth secrets from Secret Manager..."
  CLIENT_ID=$(gcloud secrets versions access latest \
    --secret=inventory-google-client-id-staging --project="$PROJECT") || {
    echo "Failed to read inventory-google-client-id-staging. Check IAM."; exit 1; }
  CLIENT_SECRET=$(gcloud secrets versions access latest \
    --secret=inventory-google-client-secret-staging --project="$PROJECT") || {
    echo "Failed to read inventory-google-client-secret-staging. Check IAM."; exit 1; }

  ENV_FILE="$(dirname "$0")/.env"
  # Backup any existing .env once.
  if [[ -f "$ENV_FILE" && ! -f "${ENV_FILE}.bak" ]]; then
    cp "$ENV_FILE" "${ENV_FILE}.bak"
    echo "→ Backed up existing .env to .env.bak"
  fi
  cat > "$ENV_FILE" <<EOF
# Generated by deploy.sh local — DO NOT COMMIT.
# Pulled from Secret Manager: inventory-google-{client-id,client-secret}-staging
# Refresh: ./deploy.sh local
GOOGLE_CLIENT_ID=${CLIENT_ID}
GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}
EOF
  chmod 600 "$ENV_FILE"
  echo "→ Wrote ${ENV_FILE} (chmod 600)"

  echo "→ Bringing up docker compose stack..."
  docker compose up -d --build

  echo ""
  echo "✓ Local dev ready"
  echo "  Frontend:  http://localhost:5180"
  echo "  Backend:   http://localhost:8000"
  echo "  Postgres:  localhost:5450 (db=inventory, user=postgres)"
  echo "  fake-gcs:  http://localhost:4443"
  echo ""
  echo "If the OAuth flow returns redirect_uri_mismatch, add"
  echo "  http://localhost:5180/api/auth/google/callback"
  echo "to the staging OAuth client's Authorized redirect URIs in"
  echo "Google Cloud Console (the client id is the staging one)."
  exit 0
fi

if [[ "$ENV" == "staging" ]]; then
  echo "=== Deploying to STAGING ==="
  deploy_backend \
    "$STAGING_API" \
    "$STAGING_WEB_URL" \
    "${STAGING_WEB_URL}/api/auth/google/callback" \
    inventory-database-url-staging \
    inventory-jwt-secret-staging \
    inventory-google-client-id-staging \
    inventory-google-client-secret-staging \
    inventory-pop-encryption-key-staging \
    inventory-mobile-google-client-id-ios-staging \
    inventory-mobile-google-client-id-android-staging \
    "$STAGING_PHOTO_BUCKET"

  deploy_frontend "$STAGING_WEB" "inventory-frontend-staging" "$STAGING_API_URL" "$INSTALLER_APP_URL_SCHEME"
  health_check "$STAGING_API_URL" "$STAGING_WEB_URL"
  echo ""
  echo "Staging: $STAGING_WEB_URL"

elif [[ "$ENV" == "production" ]]; then
  echo "=== Deploying to PRODUCTION ==="
  echo ""
  read -rp "Have you verified staging works? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborting."; exit 1; }

  deploy_backend \
    "$PROD_API" \
    "$PROD_PUBLIC_URL" \
    "${PROD_PUBLIC_URL}/api/auth/google/callback" \
    inventory-database-url-production \
    inventory-jwt-secret-production \
    inventory-google-client-id-production \
    inventory-google-client-secret-production \
    inventory-pop-encryption-key-production \
    inventory-mobile-google-client-id-ios-production \
    inventory-mobile-google-client-id-android-production \
    "$PROD_PHOTO_BUCKET"

  deploy_frontend "$PROD_WEB" "inventory-frontend-production" "$PROD_API_URL" "$INSTALLER_APP_URL_SCHEME"
  health_check "$PROD_API_URL" "$PROD_PUBLIC_URL"
  echo ""
  echo "Production: $PROD_PUBLIC_URL"
fi
