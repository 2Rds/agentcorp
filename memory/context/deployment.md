# Deployment Context

## Services

| Service | Platform | URL/Port | Status |
|---------|----------|----------|--------|
| Frontend | Vercel | agentcorp.work, app.agentcorp.work, corp.blockdrive.co | Live |
| CFO Agent (Morgan) | DO App Platform NYC1 (shared $12/mo) | Port 3001 | Live |
| EA Agent (Alex) | DO App Platform NYC1 (dedicated $29/mo) | Port 3002, ingress /ea | Live |
| COA Agent (Jordan) | DO App Platform NYC1 (shared $12/mo) | Port 3003, ingress /coa | Built |
| CMA Agent (Taylor) | DO App Platform NYC1 (shared $12/mo) | Port 3004, ingress /cma | Built |
| Compliance Agent (Parker) | DO App Platform NYC1 (shared $12/mo) | Port 3005, ingress /compliance | Built |
| Legal Agent (Casey) | DO App Platform NYC1 (shared $12/mo) | Port 3006, ingress /legal | Built |
| Sales Agent (Sam) | DO App Platform NYC1 (dedicated $29/mo, auto-scales 1→3) | Port 3007, ingress /sales | Built |
| Redis | DO Droplet NYC1 (159.223.179.119) | Redis 8.6.1 + RediSearch + RedisJSON, VPC 10.116.0.6 | Live |
| n8n | DO Droplet NYC1 (134.209.67.70) | n8n.blockdrive.co, Docker + Caddy | Live |
| NextGenSwitch | DO Droplet NYC1 (146.190.66.228) | sales.agentcorp.work (was sales.blockdrive.co), SIP 5060/5061, WSS 8088-8089 | Live |

## DigitalOcean App Platform
- **App ID:** 2742c227-ee68-44a3-b157-0a991bd3a522 (NYC1, `agentcorp-ghgvq.ondigitalocean.app`)
- **Old App ID:** 854138bf (pending deletion)
- **EA health:** https://agentcorp-ghgvq.ondigitalocean.app/ea/health
- **Auto-deploy:** Enabled from GitHub (2Rds/agentcorp, branch main)
- **CLI:** doctl (installed and authenticated locally)
- **EA:** standalone Docker build from `source_dir: agents/ea` (no @waas/runtime access)
- **Dept agents:** monorepo root build context (for `packages/` COPY)
- **Monthly cost:** ~$118/mo

## Environment Variables

### Required (all agents)
- ANTHROPIC_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- REDIS_URL, COHERE_API_KEY

### CFO-specific optional
- CF_ACCOUNT_ID, CF_GATEWAY_ID, CF_API_TOKEN, CF_AIG_TOKEN
- GOOGLE_SERVICE_ACCOUNT_KEY_FILE (local dev) / GOOGLE_SERVICE_ACCOUNT_KEY_JSON (cloud)
- NOTION_API_KEY

### EA-specific optional
- TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
- SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_ID
- AGENT_MESSAGE_SECRET
- BLOCKDRIVE_ORG_ID (ab921bc2-91da-44e9-b0c6-a61576d3872c)
- NOTION_API_KEY

### Observability (all agents, optional)
- SENTRY_DSN
- POSTHOG_API_KEY, POSTHOG_HOST

## Supabase
- **Project:** eisiohgjfviwxgdyfnsd.supabase.co
- **Auth:** Native email+password with auth.uid() UUID-based RLS
- **Key functions:** is_org_member(), has_role() (SECURITY DEFINER)
- **RPC:** create_organization(_name) — atomic org creation

## NextGenSwitch (EasyPBX)
- **Droplet ID:** 558777334
- **IP:** 146.190.66.228, VPC 10.116.0.4
- **Size:** s-2vcpu-4gb ($24/mo)
- **Domain:** sales.agentcorp.work (was sales.blockdrive.co)
- **Firewall ID:** 03c942f1-7863-46b4-9282-e51437c6d27f
- **Admin:** sean@blockdrive.co
- **Ports:** SIP 5060/5061, RTP 10000-20000, HTTP/HTTPS, WSS 8088-8089
- **Telnyx trunk:** `telnyx` → sip.telnyx.com:5061 TLS, Peer + Recording, Call Limit 2
- **Outbound route:** `telnyx-outbound` → Priority 1, pattern `*`, Recording On

## Telnyx Carrier
- **Account:** Freemium tier
- **Phone:** +1 (954) 697-9694
- **SIP Connection:** blockdrive-nextgenswitch (ID: 2919701069141378528)
- **Outbound Profile:** blockdrive-sales (ID: 2919701281490601449, $50/day cap, 2 concurrent)

## Cloudflare AI Gateway
- **Gateway:** blockdrive-gateway
- **Account ID:** 0804701ffff5f5a40649e79e868ea832
- **Mode:** BYOK (Provider Keys) — 0% markup, direct provider routing
- **Providers:** Anthropic, Google AI Studio, xAI/Grok, Cohere, ElevenLabs (all with "default" alias)

## agentcorp.work Domain
- **Registrar:** GoDaddy
- **CF Zone ID:** bcb7c8a54f7fd3cde6e815e8f59a9dbb
- **Nameservers:** nova.ns.cloudflare.com, valentin.ns.cloudflare.com
- **DNS Records:**
  - `agentcorp.work` → cname.vercel-dns.com (not proxied)
  - `app.agentcorp.work` → cname.vercel-dns.com (not proxied)
  - `api.agentcorp.work` → agentcorp-ghgvq.ondigitalocean.app (not proxied)
  - `sales.agentcorp.work` → 146.190.66.228 (proxied)

## CF Tunnels
- **Redis tunnel:** a472d0ec-9d0d-40db-8b89-3d2e5e62e7c3 (redis.blockdrive.co → tcp://localhost:6379)
- **n8n tunnel:** d6e868cd-c834-422b-8626-846d3ca73748 (n8n.blockdrive.co → http://localhost:5678)
- cloudflared installed on Redis + n8n droplets (not yet on NextGenSwitch)
