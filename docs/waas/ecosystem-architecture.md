# Block Drive Ecosystem Architecture

## Overview

The Block Drive ecosystem consists of three interconnected products that together form a complete enterprise intelligence and data management platform.

| Product | Analog | Description |
|---------|--------|-------------|
| **Block Drive Vault** | Dropbox | Web3 storage with on-chain records and verifiable provenance |
| **Data Room** | DocSend | Document sharing with NFT-gated access control and engagement analytics |
| **AgentCorp** | Category-defining | AI workforce platform — content curation and intelligence layer |

## Product Positioning

### Block Drive Vault
Core storage infrastructure. Provides encrypted, decentralized file storage with on-chain audit trails. Every document upload, modification, and access event is recorded immutably. Phase 1 complete.

### Data Room
Presentation and access control layer built on top of Vault storage. Enables:
- **NFT-based programmatic access control** — mint access tokens with configurable tiers (view-only, download, comment, full access)
- **On-chain activity tracking** — every view, download, and interaction logged immutably
- **Verifiable engagement metrics** — trustless analytics that both parties can audit
- **Composable permissions** — access rights can be combined, delegated, and transferred
- **Transferable access rights** — NFT holders can reassign access without issuer intervention

Data Room is intentionally separate from AgentCorp — it serves a broader market (fundraising, legal, M&A, partnerships) and has standalone value independent of AI workforce management.

### AgentCorp (WaaS)
The intelligence layer. Deploys namespace-isolated, memory-enriched AI agents that:
- Curate and analyze content across the ecosystem
- Provide department-specific intelligence (finance, legal, marketing, sales, operations, compliance)
- Communicate across departments via inter-agent messaging
- Maintain persistent organizational memory via Mem0

## The Flywheel

```
Block Drive Vault (storage)
    ↓ stores documents
Data Room (presentation + access)
    ↓ surfaces content to
AgentCorp (intelligence)
    ↓ enriches understanding of
Block Drive Vault (better organization, tagging, search)
```

1. **Vault** provides the storage substrate — all documents have provenance and integrity guarantees
2. **Data Room** provides controlled access — stakeholders see exactly what they should, with verifiable engagement
3. **AgentCorp** provides intelligence — agents analyze documents, extract insights, generate reports, and curate content across all three products

## Integration Model

Separate apps with native, seamless integrations (Dropbox/DocSend model). Not monolithic.

- Each product has its own frontend, backend, and deployment
- Shared Supabase project (`eisiohgjfviwxgdyfnsd`) for auth and core data
- Shared Mem0 instance for organizational memory
- API-level integration between products
- Single sign-on via Supabase Auth

## Web3 Differentiation

| Feature | Traditional | Block Drive |
|---------|-------------|-------------|
| Audit trails | Server logs (mutable) | On-chain records (immutable) |
| Access control | ACLs (admin-revocable) | NFT tokens (programmatic, transferable) |
| Engagement metrics | Platform-reported (trust required) | On-chain verified (trustless) |
| Permissions | Centralized admin | Composable, delegatable, on-chain |
| Data provenance | Metadata (spoofable) | Cryptographic proofs |

## Connection to v4.0.0 On-Chain Delegate Authority

The v4.0.0 initiative (currently paused) establishes on-chain delegate authority — the ability for AI agents to act on behalf of humans with verifiable, auditable, and revocable permissions. This infrastructure becomes the foundation for Data Room's programmatic access control:

- Agents can be delegated authority to manage Data Room access
- Access grants/revocations are recorded on-chain
- Delegation chains are transparent and auditable
- v4.0.0 Phase 1 (smart contract framework) is complete

## Current State

| Product | Status | Priority |
|---------|--------|----------|
| AgentCorp | Active development — 7 agents deployed, frontend migration in progress | P0 |
| Block Drive Vault | Phase 1 complete — core storage + on-chain records | Maintenance |
| Data Room | Planned — architecture designed, depends on AgentCorp maturity | P2 |
