# Release: Bump version, update docs, tag, and commit

**Argument:** `$ARGUMENTS` (required: `patch`, `minor`, or `major`)

You are performing a CFO platform release. Follow these steps exactly:

## 1. Validate argument

The argument must be one of: `patch`, `minor`, `major`. If missing or invalid, stop and tell the user:
```
Usage: /release <patch|minor|major>
  patch — bug fixes, small improvements (0.0.x)
  minor — new features, non-breaking changes (0.x.0)
  major — breaking changes, major milestones (x.0.0)
```

## 2. Determine new version

- Read root `package.json` to get the current `version` field
- Bump it according to the argument (semver)
- Also read `agent/package.json` version
- Store the new version string (e.g., `1.2.3`)

## 3. Gather changelog from git

- Find the last version tag: `git describe --tags --abbrev=0 2>/dev/null` (if none, use the initial commit)
- Get all commits since that tag: `git log <last-tag>..HEAD --oneline --no-merges`
- Group commits by their conventional commit prefix (feat:, fix:, refactor:, etc.)
- This becomes the changelog for the release

## 4. Update `package.json` version(s)

- Update `version` in the root `package.json`
- Update `version` in `agent/package.json` to match

## 5. Update documentation files

For each of these files, read the current content (if it exists), then rewrite/update it based on the **current state of the codebase** (read key files as needed to ensure accuracy). If a file doesn't exist yet, create it.

### `README.md`
- Project name, version badge, one-line description
- Quick start / setup instructions (frontend + agent server)
- Tech stack summary (React, Vite, Supabase, Claude Agent SDK, Redis, OpenRouter)
- Key features: AI chat, financial modeling, cap table, investor portal, knowledge base
- Link to other docs
- Keep it concise (under 150 lines)

### `CHANGELOG.md`
- Prepend a new section at the top: `## [vX.Y.Z] - YYYY-MM-DD`
- List the grouped commits from step 3 under categories: Added, Changed, Fixed, Removed
- Keep all previous changelog entries intact

### `ARCHITECTURE.md`
- High-level system architecture: React frontend, Express agent server, Supabase backend
- Key components: auth flow, financial engine, agent orchestration, knowledge system
- Multi-model strategy (Opus, Kimi K2.5, Gemini, DeepSeek, Sonar)
- Infrastructure: Redis (RediSearch vector search + Cohere embeddings), Cloudflare AI Gateway
- Data flow for chat, financial model, and investor data room
- Update based on actual current codebase structure

### `SECURITY.md`
- Auth flow (Supabase Auth with JWT + RLS)
- Row-Level Security policies and org-scoped data isolation
- Agent server auth middleware (token verification + org membership)
- SQL validator (injection prevention, table allowlisting)
- Data room security (rate limiting, scenario validation, link-level access)
- Service role key usage and API key management
- Update based on actual current implementation

### `IMPLEMENTATION_PLAN.md`
- Current implementation status (what's built, what's planned)
- Remaining work items
- Known limitations and technical debt
- Future roadmap items
- Update based on actual current state

## 6. Update CLAUDE.md

Run the `claude-md-improver` skill (via the Skill tool) to audit and update all CLAUDE.md files in the repo. This ensures project instructions stay accurate as the codebase evolves with each release.

- Invoke: `Skill("claude-md-management:claude-md-improver")`
- Review the changes it makes — only keep updates that reflect real codebase changes
- Stage any modified CLAUDE.md files for the release commit

## 7. Commit and tag

- Stage all changed files: the doc files + package.json files + CLAUDE.md files
- Create a single commit: `release: vX.Y.Z`
- Create an annotated git tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
- Do NOT push automatically — tell the user to review and push when ready

## 8. Summary

Print a summary:
```
Release vX.Y.Z prepared:
  - Version bumped: OLD -> NEW
  - X commits included
  - Docs updated: [list of files]
  - Tag created: vX.Y.Z

Review the changes, then push:
  git push && git push --tags
```

## Important rules

- DO NOT fabricate information. Read actual source files to determine current architecture/features.
- DO NOT include speculative features that aren't implemented yet in ARCHITECTURE.md or SECURITY.md.
- IMPLEMENTATION_PLAN.md is the place for future/planned work.
- Keep docs factual and tied to what exists in the codebase right now.
- If a doc file already exists, preserve its structure and update content — don't rewrite from scratch unless it's badly outdated.
- CHANGELOG.md is append-only (prepend new version, keep history).
