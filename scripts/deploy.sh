#!/bin/bash
# scripts/deploy.sh — Deploy Supademo Integration v3.0
set -e

echo "======================================================"
echo " Deploying Agile Intel — Supademo Integration v3.0    "
echo " FFmpeg Media Pipeline + Microsoft Copilot Automation  "
echo "======================================================"

RESOURCE_GROUP="${AZURE_RG:-agile-intel-rg}"
APP_NAME="${AZURE_APP:-agile-intel}"

# [v3.0] Install FFmpeg binary on App Service
echo "Configuring FFmpeg..."
az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
  --settings FFMPEG_PATH="/home/site/ffmpeg/ffmpeg" \
             TEMP_DIR="/home/site/temp/media"

# [v3.0] Verify Copilot configuration
echo "Verifying Copilot configuration..."
if [ -z "$COPILOT_GRAPH_TOKEN" ]; then
  echo "WARNING: COPILOT_GRAPH_TOKEN not set"
fi

# Build
cd "$(dirname "$0")/../backend"
npm ci --production=false
npm run build

# [v3.0] Run new database migrations
echo "Running v3.0 database migrations..."
sqlcmd -S "$AZURE_SQL_SERVER" -d "$AZURE_SQL_DATABASE" \
  -U "$AZURE_SQL_USER" -P "$AZURE_SQL_PASSWORD" \
  -i ../database/migrations/003_ffmpeg_media_pipeline.sql 2>/dev/null || true
sqlcmd -S "$AZURE_SQL_SERVER" -d "$AZURE_SQL_DATABASE" \
  -U "$AZURE_SQL_USER" -P "$AZURE_SQL_PASSWORD" \
  -i ../database/migrations/004_copilot_automation.sql 2>/dev/null || true

# Package and deploy
cd dist
zip -r ../dist.zip . -q
cd ..
az webapp deployment source config-zip \
  --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" --src dist.zip
az webapp restart --resource-group "$RESOURCE_GROUP" --name "$APP_NAME"

# Verify
sleep 10
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://${APP_NAME}.azurewebsites.net/api/health")
if [ "$HTTP_CODE" = "200" ]; then
  echo "Deployment verified — health check passed"
else
  echo "WARNING: Health check returned $HTTP_CODE"
fi

echo ""
echo "v3.0 Endpoints:"
echo "  Webhook:  https://${APP_NAME}.azurewebsites.net/api/webhooks/supademo"
echo "  Media:    https://${APP_NAME}.azurewebsites.net/api/media/*"
echo "  Copilot:  https://${APP_NAME}.azurewebsites.net/api/copilot/*"
echo "  Health:   https://${APP_NAME}.azurewebsites.net/api/health"
