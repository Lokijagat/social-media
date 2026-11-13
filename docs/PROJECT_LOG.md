# Project Log

Har session ke baad yahan update karo: date, kya bana, kya decide hua, next steps.

## 2026-11-10 — Requirements discussion (claude.ai chat)
- User requirements: post types (Festival/Product/Collection/Page), heading + description, FB/IG sizes, Content AI, Image AI, Image Verify AI
- Added: Ayurveda compliance check, Shopify data, content calendar, approval workflow, analytics + UTM, brand kit, users/roles, AI cost tracker
- Design canvas made: full requirements board + Create Post dashboard mockup
- Answers: all platforms; approve before every post; 7–14 posts/week; Hindi or English per post; image + video selectable; custom Node.js; Meta verification + IG Business ready; multi-store, budget per client; comments/DM auto-reply wanted

## 2026-11-12 — Stack & setup decisions (claude.ai chat)
- Stack: React + Node.js + MongoDB/Mongoose + AI APIs
- Shopify: only name + URL via Admin API, no Shopify CLI
- Develop locally in VS Code with Claude Code; code on GitHub
- CSS: Tailwind CSS + shadcn/ui
- Media in Cloudinary/S3 (public URL needed for Instagram)

## 2026-11-13 — Project scaffold (VS Code + Claude Code)
**Built**
- Local git repo (`main`), `.gitignore`, `.env.example`. GitHub push postponed (user: "abhi GitHub rehne do").
- Root `package.json`: `npm run dev` runs server + client together (concurrently), `npm run install:all`.
- `client/`: Vite 8 + React 19 + TS 7, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (Nova preset, Radix) with
  button/card/input/label/select/textarea/badge/table/tabs/dialog/dropdown-menu/separator/sonner/checkbox,
  TanStack Query, React Router, axios. `@` alias → `src`. Dev proxy `/api` → `localhost:4000`.
  App shell: sidebar + pages Dashboard (API/DB health card), Create Post, Approvals, Stores (placeholders).
- `server/`: Express 5 + TS + Mongoose 9 + Zod 4, helmet/cors/morgan. Env validated with Zod (`src/config/env.ts`),
  loaded by Node `--env-file` from root `.env`. Central error handler (Zod → 400, HttpError, CastError).
- Models (`server/src/models/`): Store, User, BrandKit, SourceItem, Post, PostVariant, VerifyReport, Schedule + shared enums in `constants.ts`.
- API: `GET /api/health`, `GET/POST /api/stores`, `GET/PATCH /api/stores/:id` (creating a store also creates its BrandKit).
- Smoke-tested against a temporary in-memory MongoDB: create/patch/validation/duplicate slug/404 OK, no `enc` in responses.

**Decisions**
- Per-store secrets (Shopify token, Meta token, AI keys) are stored AES-256-GCM encrypted (`ENCRYPTION_KEY` in `.env`)
  as `{ enc, mask, updatedAt }`. API returns only `mask`; every response goes through `stripSecrets()`.
  Losing `ENCRYPTION_KEY` = saved tokens unreadable.
- One `PostVariant` per size (platforms sharing a size reuse it); one `Schedule` job per variant × platform.
- Publish queue: plan is a Mongo-backed worker using `Schedule` (status + `lockedUntil`), no Redis needed for now.
- No auth yet: stores API is open (TODO in `routes/stores.ts`). Must add before deploying anywhere.

## 2026-11-13 — Design images reviewed
- User added `docs/Full-Requirements.png` + `docs/Dashboard–Create-Post.png`; referenced in CLAUDE.md.
- Client shell aligned with mockup: name "Jagat Social AI", dark green sidebar + green primary (shadcn CSS vars),
  all 9 mockup menu items + Stores (placeholder pages).
- Models: VerifyReport check `brand_colors` added; SourceItem `inStock` + `shopifyStatus` (skip out-of-stock).
- Spec items still to cover later: prompt templates per post type (editable), 3 content variations,
  auto-regenerate on low verify score, "Fix with AI" per failed check, AI cost tracker + activity log,
  media library + version history, background removal (Photoroom/remove.bg) + layout templates
  (Canva/Bannerbear/Placid), discount codes for Offer posts, weekly mix rule in calendar.
- Decision (user): language options are Hindi / English / Hinglish, one per post (enum `hi | en | hinglish`). No bilingual caption.

## 2026-11-13 — Stores UI + Brand Kit editor
**Built**
- Server: `GET/PUT /api/stores/:storeId/brand-kit` (creates kit if missing; hex color validation; hashtags get "#",
  banned words lowercased; partial colors/fonts update keeps siblings).
- Client: current-store context (selected store remembered in localStorage) + store switcher at top of sidebar.
- `/stores`: table (Shopify/Meta connected badges, language, budget, status). `/stores/new` + `/stores/:id`:
  one form (RHF + Zod) with Basic, Shopify, Meta, AI models, AI API keys, Budget. Secret inputs are write-only:
  show saved mask, blank = keep existing. Slug auto-filled from name on create.
- `/brand-kit`: logo URLs, 4 colors (picker + hex), fonts, tone, hashtags, CTA, disclaimer, extra banned words,
  image style notes, with a live 4:5 post preview.
- Tested: client build + typecheck; API smoke test on temp DB (create, edit/clear model, brand kit get/put, validation).
  UI not yet clicked through in a browser.

**Known limits**
- Logo is a URL field for now; real upload comes with Cloudinary.
- Non-secret store fields can be changed but not cleared back to empty via the form.

## 2026-11-13 — Login + roles
**Built**
- Server: `/api/auth` → `setup-status`, `setup` (first user only, becomes super admin), `login`, `logout`, `me`, `password`.
  Session = JWT in httpOnly + SameSite=Lax cookie `sid` (7 days; `secure` in production). Passwords: Node scrypt.
  Login/setup rate limit: 10 failed attempts / 15 min / IP. Same error + timing for unknown email vs wrong password.
  `User.tokenVersion` bumped on password change → other sessions logged out. User reloaded from DB per request,
  so role changes apply immediately.
- `JWT_SECRET` added to `.env` (generated) and `.env.example`.
- Permissions (`server/src/lib/permissions.ts`, mirrored in `client/src/lib/permissions.ts`):
  owner/admin = all; editor = view + post.create; approver = view + post.approve; viewer = view.
  Super admin (platform operator) = everything in every store; only super admin can create stores.
- Guards: all `/api/stores/**` need login; store view/manage checks; brand kit GET view, PUT manage.
- Members API `/api/stores/:storeId/members` (members.manage): list, add (existing user by email, or new user with
  name + temporary password), change role, remove. Only owner/super admin can grant/change/remove owner;
  last owner can't be demoted/removed.
- Client: login page (shows "create first admin" when DB has no users), auth gate, 401 → back to login,
  sidebar user box + logout, mobile top bar with menu, Settings page = Team (members) + Change password,
  store/brand-kit forms read-only ("View only") without store.manage, "Add store" only for super admin.
- Tested: 44-case API test on temp DB (setup, login, roles, owner rules, password change, logout) all pass;
  rate limit verified; client build passes. UI not yet clicked through in a browser.

**Decisions**
- No email sending yet: admin sets a temporary password for new users and shares it themselves.
  Later: invite link + forced password change on first login, "forgot password".

## 2026-11-13 — Shopify connection (Dev Dashboard client credentials)
**Context**: since 2026-01-01 Shopify no longer allows new legacy custom apps (shpat_ token) in store admin.
New apps are made in the Dev Dashboard; the server exchanges Client ID + Client Secret for a ~24h Admin API token
(`POST https://{shop}/admin/oauth/access_token`, `grant_type=client_credentials`).

**Built**
- Store.shopify: `clientId`, `clientSecret` (encrypted), `cachedToken` (encrypted) + `cachedTokenExpiresAt`,
  legacy `accessToken` still supported, `scopes` + `shopName` from last test.
- `server/src/lib/shopify.ts`: `getShopifyToken` (cache, refresh 5 min before expiry), `shopifyGraphql`
  (Admin GraphQL, API version `2026-10`, on 401 refreshes token and retries once), `testShopifyConnection`
  (shop name, domains, granted scopes, missing scopes vs `read_products` + `read_content`).
- `POST /api/stores/:storeId/shopify/test` (store.manage). Changing domain / client ID / secret / legacy token
  clears cached token + last test result.
- Client: store form Shopify section = domain, website URL, Client ID, Client Secret, collapsible legacy token,
  "Test connection" button with result (scopes / missing scopes / error). Stores list "Connected" = last test passed.
- Tested with mocked Shopify (13 cases: cache, refresh, 401 retry, scopes, bad secret, legacy token) all pass.
  Not yet tested against the real dev store.
- Real test PASSED on dev store `development-jiuye6mk.myshopify.com` (shop "Development"): token issued,
  scopes include read_products + read_content. First attempt failed because a 15-digit number (not the
  `shpss_...` secret) was saved as Client Secret. Secret was pasted in chat once: rotate it in Dev Dashboard later.
- User: dev (not live) Shopify store will be used for testing; app created in Dev Dashboard.

## 2026-11-13 — Shopify sync + Products & Pages screen
**Built**
- `server/src/lib/shopifySync.ts`: `syncShopify(storeId)` pulls products, collections, pages via Admin GraphQL
  (50 per page, cursor pagination, retry on THROTTLED) and upserts `SourceItem` by (store, kind, shopifyId).
  Product: title, handle, URL, description, up to 5 photo URLs (Shopify CDN), min price (₹ format), tags,
  inStock (`!tracksInventory || totalInventory > 0`), status active/draft/archived. Collection: title, URL,
  description, image. Page: title, URL, summary, published → active/draft.
  URL base = store `storefrontUrl` if set, else Shopify primary domain. Sets `shopify.lastSyncedAt`.
  Items deleted in Shopify: removed, unless a Post uses them (then marked archived + out of stock).
  One sync per store at a time (409 if already running). Manual items are never touched.
- API `/api/stores/:storeId/sources`: `GET` (store.view; kind, q search, filter all/usable/out_of_stock/draft/manual,
  pagination, counts per kind), `POST /sync`, `POST` manual item, `DELETE /:itemId` manual only (all post.create).
- Client: new sidebar item "Products & Pages" (`/sources`): tabs Products/Collections/Pages with counts, search,
  filter, table with photo/price/status badges/link, pagination, "Sync from Shopify", "Manual add" dialog.
- Tested: real dev store sync = 65 products, 5 collections, 2 pages in ~2.7s, re-run is idempotent;
  19-case API test on temp DB (filters, search, manual add/delete, viewer/other-store permissions) all pass;
  client build + server typecheck pass. UI not yet clicked through in a browser.

**Decisions**
- Sync is manual ("Sync from Shopify" button) for now. Editors may sync (post.create), not only admins.
- Auto-drafting will use only "usable" items: active + in stock.
- Later: scheduled auto-sync (daily) via the job worker; Shopify webhooks for new products (trigger "new product").

## 2026-11-13 — Create Post: setup + Content AI + compliance
**Built**
- Post model: `title`, `targets` (placement presets: ig_feed 1080×1350, ig_square 1080×1080, ig_story 1080×1920,
  fb_feed 1080×1080, fb_link 1200×630; platforms + sizes derived), `contentProvider`, `contentVariations` (3 options,
  each with its own compliance flags), `selectedVariation`.
- `server/src/lib/compliance.ts`: rule-based checker (English, Hinglish, Devanagari): block = cure, guarantee, 100%,
  miracle/magic, no side effects, instant results, ilaaj/rambaan/chamatkar, DMR Act schedule diseases, weight-loss
  numbers, Brand Kit banned words; warn = clinically proven, treats/heals/prevents, best/No.1. Same rules are given
  to the Content AI as instructions. 13 sample captions tested.
- `server/src/lib/ai/content.ts`: Claude (official SDK, `claude-opus-5-5`, structured output via Zod, effort medium,
  server-side refusal fallback `fallbacks: "default"`), GPT (OpenAI Responses API, JSON schema, default `gpt-5`),
  Gemini (`@google/genai`, JSON schema, default `gemini-2.5-flash`). Model name per store overrides the default.
  Returns 3 options (angle, heading ≤7 words, caption, hashtags, CTA). Brand hashtags + disclaimer added.
  Claude cost tracked in `aiCostUsd`; GPT/Gemini cost not yet priced (0).
- API `/api/stores/:storeId/posts`: list, get (source populated), create (validates source kind per post type,
  festival name), PATCH (setup, pick option, edit content → compliance re-run; only draft/needs_review/rejected),
  `POST /:postId/generate` (uses store's encrypted key for the chosen provider, pre-selects the option with fewest
  issues, UTM link `utm_source=social&utm_medium=organic&utm_campaign=<type>-<handle>&utm_content=<postId>`), delete draft.
- Client `/posts/new` + `/posts/:id` laid out like the mockup: 1 Post setup (type chips, festival name/date,
  Shopify item search, platform/size checkboxes, Content AI, language, format (video disabled), brief),
  2 AI output (rough size previews with the real product photo, Option 1/2/3 with compliance icon, editable
  heading/caption/hashtags/CTA, UTM link), 3 Verify (real Ayurveda compliance row + flags; image checks pending),
  4 Approve (disabled until Image/Verify AI exist), Recent posts table.
- Products & Pages table: long titles/descriptions now truncate (no overflow).
- Approval Queue / Calendar / Analytics placeholders now explain when they will be built.
- Tested: 20-case posts API test on temp DB (validation, compliance, permissions, cross-store) all pass;
  client build + server typecheck pass. Live AI generation NOT yet tested (needs the user's keys in the store form).

**Decisions**
- User has Claude, GPT and Gemini keys. Keys stay per store (Stores > AI API keys), never in `.env`.
- Content AI writes 3 options; the safest one is pre-selected; the user can switch or edit.
- Prices / URLs never invented: AI told to use only the given product details.

## 2026-11-13 — Pushed to GitHub
- User wants to continue at home: code pushed to https://github.com/Lokijagat/social-media (`main`), first commit.
- CLAUDE.md rewritten with current status, run-on-a-new-machine steps, code map, conventions, updated decisions.
- `.env` is not in git: user copies it to the home computer by hand (same `ENCRYPTION_KEY` required).

## Next steps
- DONE: Shopify dev store connected
- User: rotate Shopify Client Secret (it was shared in chat) and paste the new one in the store form
- DONE: Shopify sync + Products & Pages screen
- DONE: Create Post setup + Content AI + compliance
- User: add Anthropic / OpenAI / Google keys in store form, generate a test post with each provider
- Next: Image AI (real product photo + AI background, every size) → Cloudinary → Verify AI → approval → FB/IG publish
- DONE: Atlas Cluster0 (M0, AWS Mumbai), DB user `socialai`, db `social_ai`; `.env` filled; `npm run dev` verified (health: db connected)
- User: open the app → create first admin (super admin) account
- Before production: remove Atlas IP access entry `0.0.0.0/0` (dev only), allow only the server IP
- Later auth: invite links, force password change on first login, forgot password, activity log
- Then: Content AI → compliance check → Image AI → Cloudinary → Verify AI → approval → FB/IG publish
