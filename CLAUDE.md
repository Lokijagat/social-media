# Social Media AI Automation Dashboard ("Jagat Social AI")

Multi-store SaaS dashboard + AI agent that creates, verifies, approves and publishes
social media posts for Shopify stores (first client: Jagat Pharma, an Ayurvedic store).

**Talk to the user in Hindi/Hinglish.** Code, comments and commit messages in English.

## Session rules (important)
- At the start of every session, read `docs/PROJECT_LOG.md` to see what was done and decided.
- At the end of every session (or after any decision), append to `docs/PROJECT_LOG.md`:
  date, what was built, decisions taken, next steps. Keep this file the single source of truth.
- Never commit secrets. Server-level secrets live in `.env` (see `.env.example`); per-store secrets
  (Shopify, Meta, AI keys) are typed into the store form and saved encrypted in MongoDB, never in `.env` or git.
- Never ask the user to paste secrets in chat; they type them into the app's forms.
- Commit / push only when the user asks. Repo: https://github.com/Lokijagat/social-media (branch `main`).

## Current status (2026-11-13)
Done and tested (details per feature in `docs/PROJECT_LOG.md`):
- Project scaffold, MongoDB Atlas connected
- Login + roles (super admin, owner, admin, editor, approver, viewer), team members per store
- Stores (multi-store settings, encrypted secrets) + Brand Kit editor
- Shopify connection (Dev Dashboard client credentials) + sync of products / collections / pages
  (dev store `development-jiuye6mk.myshopify.com` connected: 65 products, 5 collections, 2 pages)
- Create Post: setup → Content AI (Claude / GPT / Gemini, 3 options) → Ayurveda compliance check → edit / pick option
  (live AI generation not yet tried with real keys)

Next, in order:
1. User: add AI keys in the store form, test generation with each provider
2. Image AI: real Shopify product photo + AI background/scene, every selected size (needs Cloudinary account)
3. Cloudinary upload (public URLs for Instagram)
4. Verify AI (vision): checks + score 0–100 + "Fix with AI"
5. Approval queue → schedule → publish to Facebook + Instagram (Mongo-backed job worker)

Pending user to-dos: rotate the Shopify Client Secret (it was once pasted in chat);
before production remove Atlas IP entry `0.0.0.0/0`.

## Run locally (any machine)
Requirements: Node.js 24+, npm, Git.
```bash
git clone https://github.com/Lokijagat/social-media.git
cd social-media
npm run install:all        # root + server + client
# create .env in the repo root (see below)
npm run dev                # server http://localhost:4000 + client http://localhost:5173
```
`.env` is NOT in git. Copy it from the other computer (USB / password manager, never chat or email in plain text).
Keys: `MONGODB_URI`, `ENCRYPTION_KEY`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`, `NODE_ENV`.
- `ENCRYPTION_KEY` must be exactly the same everywhere that uses the same database. A different key
  = saved Shopify / AI keys can't be decrypted ("unreadable") and must be re-entered.
- Atlas allows the current IP via `0.0.0.0/0` (dev only); if that entry is removed, add the home IP in Atlas.
- Login with the existing super-admin account (data is in Atlas, so the same users/stores appear at home).

Checks: `npm --prefix server run typecheck`, `npm --prefix client run build`.

## Code map
- `server/src/`
  - `index.ts` / `app.ts`: Express app; routes mounted in `app.ts` (all `/api/stores/**` need login)
  - `config/env.ts` (Zod-validated env), `config/db.ts`
  - `models/`: Store, User, BrandKit, SourceItem, Post, PostVariant, VerifyReport, Schedule; enums + `TARGETS`
    (platform/placement/size presets) in `models/constants.ts`
  - `lib/crypto.ts` (AES-256-GCM `encrypt`/`decrypt`, `maskSecret`, `stripSecrets` on every response),
    `lib/auth.ts` (JWT cookie `sid`, `requireAuth`, `requireStorePermission`), `lib/permissions.ts`,
    `lib/shopify.ts` (token + GraphQL, API `2026-10`), `lib/shopifySync.ts`, `lib/compliance.ts`,
    `lib/ai/content.ts` (Content AI providers + prompt)
  - `routes/`: auth, stores (+ `/shopify/test`), members, brandKit, sources (+ `/sync`), posts (+ `/generate`)
- `client/src/`
  - `App.tsx` (routes, auth gate), `components/layout/AppLayout.tsx` (sidebar)
  - `lib/api.ts` (all API calls), `lib/types.ts` (mirrors server enums/types, keep in sync),
    `lib/permissions.ts` (mirrors server), `lib/auth.tsx`, `lib/current-store.tsx`
  - `pages/`: Login, Dashboard, Stores, StoreForm, BrandKit, Sources (Products & Pages), CreatePost, Settings, Placeholder

## Conventions
- Per-store secrets: `{ enc, mask, updatedAt }`; API returns only `mask`; inputs are write-only (blank = keep).
- Every store route checks permission: `store.view`, `post.create`, `post.approve`, `store.manage`, `members.manage`.
  Server enforces; client hides buttons only as a hint.
- User-facing messages in Hinglish; code/comments in English.
- Client and server enums are duplicated (`client/src/lib/types.ts` ↔ `server/src/models/constants.ts`): change both.
- Testing so far: throwaway API scripts against an in-memory MongoDB (`mongodb-memory-server`); no test suite in repo yet.

## What the product does (agent flow)
1. Trigger: festival date, new product, schedule, or manual
2. Source data: product / collection / page name + URL (from Shopify Admin API, or entered manually)
3. Content AI: heading (for image), description/caption, hashtags, CTA, UTM link
4. Image AI: creatives in every selected platform size, using brand kit + real product photo
5. Verify AI (vision): product/label correct, logo, spelling, safe zone, size, caption-image match, score 0–100
6. Compliance check: block Ayurveda/health claims ("cure", "guaranteed", "100%"), per Drugs & Magic Remedies Act, AYUSH/ASCI and Meta health policy
7. Approval: user approves EVERY post before publish (no auto-publish for now)
8. Publish/schedule via platform APIs
9. Analytics: reach, engagement, clicks, Shopify sales via UTM
10. Comments/DM AI auto-reply (later phase)

## Decisions (agreed with user)
- Post types: Festival, Product, Collection, Page, Offer, Ayurveda tip (+ Blog later)
- Formats: image AND video, user selects per post (video is Phase 2; disabled in UI)
- Language: Hindi, English or Hinglish (one per post), selected before generation. No bilingual captions.
- Platforms: all — Facebook, Instagram, WhatsApp, Pinterest, YouTube Shorts, Google Business (Phase 1 = FB + IG)
- Sizes: 1080×1080, 1080×1350, 1080×1920, 1200×630, 1000×1500
- Volume: 7–14 posts per week per store
- Multi-store: every store has its own Shopify connection, Meta connection, brand kit, AI keys/limits, users. Budget per client.
  Only the super admin creates stores.
- Meta Business verification + IG Business account are ready
- Shopify: only product/collection/page name + URL (+ photos, price, stock) needed. Dev Dashboard app per store;
  server exchanges Client ID + Client Secret for a ~24h Admin API token (client credentials). Scopes
  `read_products`, `read_content`. Legacy `shpat_` token still accepted. No Shopify CLI, not a public Shopify app.
  Sync is manual ("Sync from Shopify"); editors may sync. Auto-drafting uses only active + in-stock items.
- Generated media must go to cloud storage (Cloudinary or S3): Instagram Graph API needs a public image URL.
- AI models selectable in UI: Content (Claude / GPT / Gemini), Image (Gemini Image / OpenAI Image / Flux / Ideogram),
  Verify (Claude / GPT vision). User has Claude, GPT and Gemini keys.
  Content defaults: `claude-opus-5-5` (with server-side refusal fallback), `gpt-5`, `gemini-2.5-flash`; per-store model override.
- Content AI writes 3 options; the one with fewest compliance issues is pre-selected; user can switch/edit.
  AI must never invent prices, offers or facts not in the product details.
- Use the real Shopify product photo; AI only for background/scene, never re-draw the product.
- No email sending yet: admin sets temporary passwords for new users.

## Tech stack
- Development: local, VS Code + Claude Code; code on a private GitHub repo
- Frontend (`client/`): Vite + React + TypeScript, Tailwind CSS v4 + shadcn/ui, TanStack Query, React Router,
  React Hook Form + Zod, axios, sonner, Lucide icons (TanStack Table / Recharts when needed)
- Backend (`server/`): Node.js + Express 5 + TypeScript (ESM), MongoDB Atlas + Mongoose, Zod,
  `@anthropic-ai/sdk`, `openai`, `@google/genai`; publish queue = Mongo-backed worker on `Schedule` (planned)
- Storage: Cloudinary (planned)

## Phases
- Phase 1 (MVP): multi-store setup, source data, Content AI, Image AI, Verify AI + compliance, approval, publish to FB + IG
- Phase 2: festival calendar auto-drafts, carousel/story/video, WhatsApp approval alerts, analytics + UTM sales
- Phase 3: comments/DM auto-reply, more platforms, learning loop

## Design reference
Local copies (source of truth for UI, check these before building a screen):
- `docs/Full-Requirements.png`: requirement spec v1: agent flow, 12 modules, phases.
  Note: its tech line (Next.js / Postgres / Supabase) is outdated; the stack above (Vite + Express + MongoDB) is final.
- `docs/Dashboard–Create-Post.png`: dashboard mockup: dark green sidebar (Overview, Create Post, Approval Queue,
  Content Calendar, Analytics, Brand Kit & Media, AI Models & Prompts, Integrations, Settings) and the Create Post
  screen (1 Post setup, 2 AI output preview, 3 Verify AI report with score + Pass/Fail per check + "Fix with AI",
  4 Approve & schedule / Post Now, Upcoming queue table). The app adds "Products & Pages" and "Stores" to the sidebar.

Online version: https://claude.ai/code/artifact/ce6c8f42-edd7-4264-b76a-0810bf9713b2
