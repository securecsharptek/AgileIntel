# Deployment Guide — 4-Hour Timeline

---

## Hour 1: Database & Configuration (30 min)

```bash
# 1. Run migration
sqlcmd -S agileintel.database.windows.net \
  -d agile-intel-db -U sqladmin -P 'YourPassword' \
  -i database/migrations/002_supademo_integration.sql

# 2. Set environment variables in Azure
az webapp config appsettings set \
  --resource-group agile-intel-rg \
  --name agile-intel \
  --settings \
    SUPADEMO_API_KEY=sk_live_xxx \
    SUPADEMO_WEBHOOK_SECRET=whsec_xxx \
    HUBSPOT_API_KEY=pat-na1-xxx \
    SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx

# 3. Verify tables
sqlcmd -S agileintel.database.windows.net -d agile-intel-db -U sqladmin \
  -Q "SELECT name FROM sys.tables WHERE name LIKE 'Supademo%' OR name LIKE 'Demo%'"
```

## Hour 2: Backend Deployment (1 hour)

```bash
cd backend
npm install
npm run build    # Compile TypeScript
npm run dev      # Test locally — visit http://localhost:3000/api/health
```

Deploy: `./scripts/deploy.sh`

## Hour 3: Supademo Setup (1 hour)

1. Login: https://app.supademo.com
2. Create 4 demos using Chrome extension
3. Configure webhook: Settings → Integrations → Webhooks
   - URL: `https://agileintel.io/api/webhooks/supademo`
   - Events: demo.viewed, demo.completed, step_viewed
4. Copy embed codes → update `config/supademo.config.ts`
5. Test webhook delivery

## Hour 4: Testing & Verification (1.5 hours)

```bash
# Health check
curl https://agileintel.io/api/health

# Test webhook (should return 401 — signature validation working)
curl -X POST https://agileintel.io/api/webhooks/supademo \
  -H "Content-Type: application/json" -d '{"test":true}'

# End-to-end: View demo → verify HubSpot contact → verify Slack notification
```

## Post-Deployment Checklist

- [ ] All 4 demos load within 3 seconds
- [ ] Email capture form working
- [ ] Webhooks delivering events
- [ ] Database recording engagements
- [ ] Lead scores calculating correctly
- [ ] HubSpot contacts syncing
- [ ] Slack notifications sending (if configured)
- [ ] .gov/.mil email detection working
- [ ] Landing pages responsive on mobile
