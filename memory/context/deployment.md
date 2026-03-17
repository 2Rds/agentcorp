# Deployment Context

## Services

| Service | Platform | URL/Port | Status |
|---------|----------|----------|--------|
| Frontend | Vercel | corp.blockdrive.co | Live |
| CFO Agent (Morgan) | DO App Platform | Port 3001 | Live |
| EA Agent (Alex) | DO App Platform | Port 3002, ingress /ea | Live |
| n8n | DO Droplet (167.172.24.255) | n8n.blockdrive.co | Live |

## DigitalOcean App Platform
- **App ID:** 854138bf-004c-4992-a5f9-7af5a13bc3d9
- **EA health:** https://cfo-agent-9glt5.ondigitalocean.app/ea/health
- **Auto-deploy:** Enabled from GitHub
- **CLI:** doctl (installed and authenticated locally)

## Environment Variables

### Required (both agents)
- ANTHROPIC_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- MEM0_API_KEY
- OPENROUTER_API_KEY

### CFO-specific optional
- MOONSHOT_API_KEY, COHERE_API_KEY, REDIS_URL
- CF_ACCOUNT_ID, CF_GATEWAY_ID, CF_API_TOKEN, CF_AIG_TOKEN
- GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path to service account JSON)

### EA-specific optional
- TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
- SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_ID
- AGENT_MESSAGE_SECRET

## Supabase
- **Project:** eisiohgjfviwxgdyfnsd.supabase.co
- **Auth:** Native email+password with auth.uid() UUID-based RLS
- **Key functions:** is_org_member(), has_role() (SECURITY DEFINER)
- **RPC:** create_organization(_name) — atomic org creation
