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

# URLs (derived from Cloud Run project number — do not change)
STAGING_API_URL=https://inventory-api-staging-329274314764.us-central1.run.app
STAGING_WEB_URL=https://inventory-frontend-staging-329274314764.us-central1.run.app
PROD_API_URL=https://inventory-api-production-329274314764.us-central1.run.app
PROD_WEB_URL=https://inventory-frontend-production-329274314764.us-central1.run.app

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
#   Production: $PROD_WEB_URL/api/auth/google/callback
# ---------------------------------------------------------------------------

usage() {
  echo "Usage: $0 [staging|production]"
  exit 1
}

[[ $# -eq 1 ]] || usage
ENV=$1
[[ "$ENV" == "staging" || "$ENV" == "production" ]] || usage

# ---------------------------------------------------------------------------

deploy_backend() {
  local service=$1 frontend_url=$2 redirect_uri=$3 db_secret=$4 jwt_secret=$5 client_id_secret=$6 client_secret_secret=$7

  echo "→ Deploying backend: $service"
  gcloud run deploy "$service" \
    --source ./backend \
    --project "$PROJECT" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --add-cloudsql-instances "$CLOUDSQL_INSTANCE" \
    --set-secrets "DATABASE_URL=${db_secret}:latest,JWT_SECRET=${jwt_secret}:latest,GOOGLE_CLIENT_ID=${client_id_secret}:latest,GOOGLE_CLIENT_SECRET=${client_secret_secret}:latest" \
    --set-env-vars "ENVIRONMENT=${ENV},FRONTEND_URL=${frontend_url},GOOGLE_REDIRECT_URI=${redirect_uri},AUTHORIZED_DOMAIN=moonfive.tech"
}

deploy_frontend() {
  local service=$1 image=$2 api_url=$3

  echo "→ Building frontend image: $image"
  docker buildx build --platform linux/amd64 \
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

if [[ "$ENV" == "staging" ]]; then
  echo "=== Deploying to STAGING ==="
  deploy_backend \
    "$STAGING_API" \
    "$STAGING_WEB_URL" \
    "${STAGING_WEB_URL}/api/auth/google/callback" \
    inventory-database-url-staging \
    inventory-jwt-secret-staging \
    inventory-google-client-id-staging \
    inventory-google-client-secret-staging

  deploy_frontend "$STAGING_WEB" "inventory-frontend-staging" "$STAGING_API_URL"
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
    "$PROD_WEB_URL" \
    "${PROD_WEB_URL}/api/auth/google/callback" \
    inventory-database-url-production \
    inventory-jwt-secret-production \
    inventory-google-client-id-production \
    inventory-google-client-secret-production

  deploy_frontend "$PROD_WEB" "inventory-frontend-production" "$PROD_API_URL"
  health_check "$PROD_API_URL" "$PROD_WEB_URL"
  echo ""
  echo "Production: $PROD_WEB_URL"
fi
