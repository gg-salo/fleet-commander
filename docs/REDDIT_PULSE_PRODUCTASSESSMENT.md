# Reddit Pulse — Product Assessment & Roadmap

**Date:** February 26, 2026
**Branch:** feature/insights-overhaul

---

## Executive Summary

Reddit Pulse is a fully functional social listening SaaS with a sophisticated 3-tier AI classification pipeline, multi-tenant architecture, and self-service onboarding. The monitoring foundation (Phase 1) is production-ready. The critical gap is the **action layer** — the product detects opportunities but can't act on them automatically. The response generator exists but the posting loop is incomplete, making the product a monitoring tool in a market full of monitoring tools. Closing this gap transforms it into an automation engine — and that's the real wedge.

---

## Current State: What's Built

### Phase 1: Social Listener MVP — ~95% Complete

| Component | Maturity | Notes |
|-----------|----------|-------|
| 3-tier classification pipeline | Production-ready | Keyword → Relevance (GPT-4o-mini) → Deep analysis |
| 7 opportunity types | Production-ready | buying_intent, recommendation_request, problem_to_solve, competitor_complaint, comparison_shopping, help_request, general_mention |
| Priority scoring system | Production-ready | Composite score (AI 40%, Engagement 25%, Recency 20%, Sentiment 15%) with type boosts |
| Per-brand sensitivity controls | Production-ready | 1-10 slider, configurable weights, threshold adjustment |
| AI reasoning | Production-ready | "Why flagged" explanations on every opportunity |
| Self-service onboarding | Polished | 6-step wizard with AI brand enrichment + subreddit suggestions |
| Dashboard (Home, Feed, Opportunities) | Polished | Filtering, sorting, priority badges, status tracking, empty states |
| Alerts (Slack, Discord, Email) | Production-ready | Rich formatting (Block Kit, embeds, HTML templates), per-brand config |
| Multi-brand switching | Production-ready | Brand switcher, all pages brand-aware |
| Keyword/subreddit config | Production-ready | Full CRUD in Settings with live validation |
| Multi-tenant architecture | Production-ready | Org → Brand isolation, RLS, service role for elevated ops |
| Team management & invites | Production-ready | Token-based invites, RBAC (owner/admin/member), brand-level access control |

**Remaining ~5%:**
- Telegram alerts (stub only — returns "not yet implemented")
- No post survival verification (can't confirm if comments were removed by mods)

### Phase 2: Response Generation — ~40% Complete

| Sub-feature | Status | Notes |
|-------------|--------|-------|
| Response generation (brand + ambassador modes) | Built | Excellent prompt engineering, brand-context-aware, subreddit-culture-aware |
| Shill detection & scoring | Built | 1-10 scale, red/green flags, banned phrases, action recommendations |
| Subreddit profile generation | Built | Tone, culture, self-promo rules, how-to-sound-native — but only created on-demand |
| Response modal UI | Built | Generate, view shill score, copy text, regenerate |
| Follow-up response generator | Built (dead code) | Detects promising replies, generates follow-ups — never called from cron |
| Supervised flow (approve → post) | Not built | "Mark as Posted" is honor-system only, no actual Reddit posting |
| Response variation (structure rotation) | Partially built | Strategy selection exists, but no explicit template rotation system |

### Phase 3: Account Management — 0% Complete

None started. No Reddit account management UI, no account health tracking, no account selector in response modal.

### Phase 4: Autopilot Mode — 0% Complete

None started. No auto-posting, no safety rails, no rate limiting, no autopilot dashboard.

### Phase 5: Competitor Intelligence — ~10% Complete

| Sub-feature | Status | Notes |
|-------------|--------|-------|
| Competitor data collection | Built | competitor_theme field (pricing, support, reliability, etc.) collected in Tier 3 |
| Competitor keyword tracking | Built | Competitor keywords stored per brand, matched in Tier 1 |
| Dedicated Competitive page | Not built | No navigation entry, no UI |
| Competitive opportunity feed | Not built | Data exists, no filtered view |
| Pain point aggregation by competitor | Not built | competitor_theme in DB, no aggregation UI |
| Competitor filter in Opportunities | Not built | No toggle exists |
| Competitor alerts (spikes, launches) | Not built | No detection logic |

### Phase 6: Insights Dashboard — ~35% Complete

| Sub-feature | Status | Notes |
|-------------|--------|-------|
| Summary cards | Built | Brand mentions, competitor weakness, survival rate, top question |
| Engagement funnel | Built | 7-step: Detected → Opportunities → Generated → Posted → Tracked → Replies → OP Replies |
| Subreddit verdicts | Built | keep_going / review_tone / consider_stop based on shill scores |
| Strategy breakdown | Built | Counts by strategy, posted count, avg shill |
| Landscape: Brand perception (good/bad) | Partial | Sentiment % exists, no theme-level good/bad breakdown |
| Landscape: Competitor pain points & strengths | Not built | Data exists (competitor_theme), no aggregated view |
| Landscape: Topic cloud | Not built | |
| Performance: Real survival tracking | Not built | "Survival" = tracked not expired, not actual removal check |
| Content: FAQs with frequency | Not built or stub | |
| Content: Topic clusters | Not built | |
| Content: Rising/falling topics | Not built | |

### Phase 7: Monetization — 0% Complete

No Stripe integration, no plan limits, no usage tracking, no email digests.

---

## Architecture Overview

### Tech Stack
- **Frontend:** Next.js (App Router) on Vercel
- **Database:** Supabase (Postgres + Row Level Security + Auth)
- **AI:** OpenAI GPT-4o-mini (classification, response generation, shill detection)
- **Alerts:** Slack webhooks, Discord webhooks, Resend (email)
- **Reddit:** OAuth 2.0 application-only auth (read-only currently)

### Database Schema (14 tables)
```
organizations ──┬── users ──── notification_preferences
                │             └── brand_access (junction)
                ├── brands ──┬── posts
                │            ├── generated_responses ── tracked_comments ── comment_replies
                │            ├── brand_settings
                │            └── alert_configs
                ├── org_invites
                └── subreddit_profiles (shared, public read)
```

### Processing Pipeline
```
Vercel Cron (every N minutes)
    ↓
processAllBrands()
    ├── Fetch all active brands + org Reddit credentials
    └── For each brand:
        ├── fetchMultipleSubreddits() — 25 newest posts per subreddit
        ├── Deduplication (skip posts already in DB)
        ├── Tier 1: Keyword matching (instant, no AI)
        ├── Tier 2: AI relevance scoring (GPT-4o-mini, 300 tokens)
        │   └── 6 opportunity signals detected
        ├── Tier 3: Deep analysis (GPT-4o-mini, 500 tokens) — if relevance ≥ 5
        │   └── Full classification: type, confidence, intents, suggested approach
        ├── Priority scoring (weighted composite + sensitivity adjustment)
        ├── Save to DB
        └── Dispatch alerts (if opportunity flagged)
```

### User Flow
```
Landing page → Signup/Login → Onboarding (6 steps) → Dashboard (auto-scan)
    ↓
Daily use:
├── Home — Stats, recent mentions, trending keywords
├── Feed — All posts with search, filter, sort
├── Opportunities — Priority-ranked engagement chances
├── Engagement — Tracked comments and replies
├── Insights — Performance, landscape, content analytics
└── Settings — Brand config, team, alerts, detection tuning
```

---

## Competitive Advantages & USPs

### 1. Intent Classification (Not Just Mention Detection)

Most Reddit monitoring tools flag "your brand was mentioned." Reddit Pulse classifies **why** it was mentioned and **what the user wants** — buying intent, recommendation request, competitor complaint, etc. This turns noise into actionable signals.

**Why it matters:** A brand mention in a complaint thread requires a completely different response than a mention in a "what should I buy?" thread. Knowing the intent determines the action.

### 2. Shill Detection as a Safety Net

The shill scoring system (1-10 scale) with:
- 22 banned marketing phrases (instant red flags)
- Green flags for authentic signals (typos, casual grammar, strong opinions)
- Enforced rules: 50% of responses should NOT mention the product
- Post-processing to strip AI tells (em dashes, perfect punctuation)

**Why it matters:** The #1 risk of Reddit marketing is getting called out. This is the only tool that actively protects brands from looking like shills. Sellable as "reputation protection" alongside engagement.

### 3. Brand-Context-Aware AI Responses

Response generation factors in:
- Brand description, value props, target audience, pain points, product type
- Subreddit tone, culture, self-promo rules, how to sound native
- Opportunity type → strategy selection (different approach for complaints vs recommendations)
- Response mode (official brand voice vs authentic ambassador voice)

**Why it matters:** Generic responses get downvoted. Context-aware responses that match subreddit culture pass as genuine participation.

### 4. Configurable Detection Intelligence

Per-brand sensitivity (1-10), configurable priority weights, enabled/disabled opportunity types, and adjustable thresholds. Power users get precision tuning; new users get smart defaults.

**Why it matters:** Different brands need different sensitivity. A startup wanting maximum visibility needs aggressive detection. An enterprise protecting reputation needs conservative, high-confidence-only alerts.

### 5. Multi-Tenant Agency Architecture

Organization → Brand hierarchy with:
- Role-based access (owner/admin/member)
- Brand-level access control (members see only granted brands)
- Token-based invites with atomic claim (race-condition safe)
- Agency accounts can manage multiple client brands

**Why it matters:** Agencies managing multiple brands is a higher ACV market ($449/mo vs $49/mo). The architecture supports this out of the box.

### 6. Full-Pipeline Transparency

AI reasoning on every opportunity ("why this was flagged"), detected intent phrases, suggested engagement approach, and shill score reasoning. Users understand and trust the system's decisions.

**Why it matters:** Black-box AI tools lose trust quickly. Showing the reasoning builds confidence and helps users learn when to engage.

---

## What's Missing & What Could Be Better

### Critical Gaps

#### 1. No Automated Posting (Action Loop Is Broken)

**Current state:**
```
Detect → Classify → Score → Alert → Generate Response → User copies to Reddit manually
```

**Needed:**
```
Detect → Classify → Score → Generate → Shill Check → Approve/Auto-post → Track Outcome
```

**What's missing:**
- Reddit write API integration (currently read-only)
- Supervised approval queue (response modal exists, but posting is manual copy-paste)
- Autopilot mode with safety rails (rate limiting, delay between posts, pause-on-removal)
- Account management (add/configure Reddit accounts, track account health)
- Tracked comment creation from automated posts (currently manual seeding only)

**Impact:** Without this, the product is a sophisticated alert system. Users still do 100% of the actual engagement work. The automation promise — the core value prop — is unfulfilled.

#### 2. No Telegram Alerts

`sendTelegramAlert()` returns "not yet implemented." For brands in crypto, DeFi, and tech communities, Telegram is often the primary communication channel. This is a quick win with high impact for the target market.

#### 3. No Billing/Monetization

No Stripe integration, no plan enforcement, no usage tracking. Can't charge users or enforce plan limits.

#### 4. No Email Digests

Notification preference toggles exist in the UI (daily digest, weekly report) but don't trigger any actual emails. Users set preferences that do nothing.

### Significant Gaps

#### 5. Competitive Intelligence View

Competitor data IS being collected (competitor_theme, negative sentiment, matched competitor keywords) but there's no dedicated UI to surface it. The strategy doc describes a full Competitive section with:
- Competitive opportunity feed
- Pain point aggregation by competitor (weaknesses vs strengths)
- Competitor alerts (spikes, launches, comparisons)
- Competitor filter toggle on Opportunities

All data is in the DB. The UI just needs to be built.

#### 6. Insights Data Is Thin

The Insights page has the right structure (3 tabs, summary cards, funnel) but most metrics depend on data that doesn't exist yet:
- **Response survival rate** is estimated (tracked not expired ≠ actually verified not removed)
- **Performance tab** has limited value without real posting data
- **Content tab** (FAQs, topic clusters, rising topics) is mostly stub or missing
- **Landscape tab** competitor breakdown isn't aggregating competitor_theme data

#### 7. Follow-Up Generation Is Dead Code

`follow-up-generator.ts` has solid logic:
- Detects promising replies (OP asking for recommendations, users showing interest)
- Generates contextual follow-ups that naturally introduce the brand
- But it's **never called** from the `check-replies` cron job

This is free engagement value sitting unused.

### Quality Improvements

#### 8. Subreddit Profiles Are Under-Utilized
- Currently created on-demand (only when generating a response)
- Should be pre-generated for all configured subreddits
- Should be surfaced in the UI (show users the community insights)
- Should factor into opportunity scoring (hostile subreddits → lower priority)

#### 9. No Pipeline Resilience
- No retry logic for failed AI classifications
- No request timeouts on OpenAI or Reddit API calls
- No exponential backoff on 429 rate limit errors
- Vercel cron could timeout on large brands with many subreddits

#### 10. Response Regeneration Is Naive
Currently generates a fresh response with no memory. Should feed previous attempt's shill score + reasoning back to the prompt: "The previous response scored 6/10 because it was too promotional. Generate a more authentic version."

#### 11. No Post Survival Verification
"Survival rate" is guesswork. Need to periodically re-check posted comments via Reddit API to confirm they weren't removed by mods. This is cheap to implement and provides real performance data.

#### 12. Engagement Page Has Minimal Utility
The Engagement tab is a simple tracked comments list. Without automated posting feeding it data, users have to manually seed comments. This page needs the autopilot workflow to become useful.

---

## Proposed Next Steps

### Priority Order

The sequencing is designed to maximize value delivery while building on dependencies:

---

### Step 1: Response Agent MVP — Supervised Mode

**Goal:** Complete the action loop so users can generate, approve, and post responses from within the platform.

**What to build:**
1. **Reddit write API integration** — Authenticate with user-provided Reddit accounts, post comments
2. **Account management UI** — Add Reddit account credentials, view connected accounts
3. **Supervised approval flow:**
   - Generate response → Review in modal → Edit if needed → Click "Post to Reddit"
   - Actually posts via Reddit API (not copy-paste)
   - Auto-creates tracked_comment entry
   - Updates post status to 'handled'
4. **Response history per post** — Show all generated/posted responses
5. **Account selector in response modal** — Choose which Reddit account to post from

**Dependencies:** None — can start immediately.

**Value delivered:** Users can go from detection to engagement in 3 clicks without leaving the platform. This is the minimum viable automation.

---

### Step 2: Survival Tracking & Follow-Up Activation

**Goal:** Close the feedback loop — know if posted responses survive and respond to promising replies.

**What to build:**
1. **Post survival verification** — Cron job that re-checks posted comments via Reddit API to confirm they weren't removed
2. **Activate follow-up generator** — Wire `follow-up-generator.ts` into the `check-replies` cron:
   - When a reply is detected on a tracked comment, evaluate if it's promising
   - If promising (especially OP replies), auto-generate a follow-up suggestion
   - Surface in the Engagement page for user approval
3. **Engagement page overhaul** — Show tracked comments with:
   - Survival status (live / removed / expired)
   - Replies received with follow-up suggestions
   - One-click follow-up posting

**Dependencies:** Step 1 (need actual posted comments to track).

**Value delivered:** Real performance data for Insights. Users can ride conversation threads for maximum engagement. The engagement page becomes genuinely useful.

---

### Step 3: Telegram Alerts

**Goal:** Complete the alert channel lineup for the crypto/DeFi target market.

**What to build:**
1. **Telegram Bot API integration** — Send alerts via bot token + chat ID
2. **Setup wizard in Settings** — Guide users through BotFather setup, chat ID retrieval
3. **Rich message formatting** — Opportunity cards with inline keyboards (View Thread, Generate Response)

**Dependencies:** None — can run in parallel with Steps 1-2.

**Value delivered:** Unblocks the primary alert channel for crypto-native users.

---

### Step 4: Competitive Intelligence View

**Goal:** Surface the competitor data that's already being collected.

**What to build:**
1. **Competitive page** (new nav item or sub-tab of Opportunities):
   - Filtered opportunity feed (competitor-related only)
   - Pain point aggregation by competitor (weaknesses from competitor_theme + negative sentiment)
   - Competitor strengths (positive mentions)
   - "Active threads" links for each pain point
2. **Competitor filter toggle** on Opportunities page — "Show competitor-related only" checkbox
3. **Competitor alerts** — Detect spikes in negative/positive competitor mentions, send alerts

**Dependencies:** None for the UI (data already in DB). Alerts need alert infrastructure (already built).

**Value delivered:** Turns passive monitoring into competitive intelligence. Users see exactly where competitors are weak and can act on it.

---

### Step 5: Insights Data Enrichment

**Goal:** Make the Insights page data-rich and actionable with real performance data.

**What to build:**
1. **Real survival data** — Feed from Step 2 into Insights metrics
2. **Landscape tab completion:**
   - Brand perception: good/bad theme breakdown (not just sentiment %)
   - Competitor pain points & strengths aggregated from competitor_theme data
   - Topic cloud from post titles/keywords
3. **Content tab completion:**
   - FAQs: Cluster similar question-format posts, rank by frequency
   - Topic clusters: Group posts by theme using AI
   - Rising/falling topics: Compare current period vs previous period
4. **Configuration feedback in Settings:**
   - Show keyword performance (opportunities generated per keyword)
   - Flag noisy keywords ("80% of posts from this keyword are irrelevant")

**Dependencies:** Step 2 (real survival data for performance metrics).

**Value delivered:** The Insights page becomes the strategic command center. Users understand what's working and what to do about it.

---

### Step 6: Autopilot Mode

**Goal:** Fully automated engagement for ambassador accounts with safety rails.

**What to build:**
1. **Autopilot toggle per account** — Enable/disable automated posting
2. **Safety rails:**
   - Max posts per day (default: 3)
   - Min delay between posts (default: 2 hours)
   - Shill score threshold (≤4 for auto-post, 5+ queued for review)
   - Pause on removal (auto-stop if a post gets removed)
3. **Autopilot queue** — View pending auto-posts, approve/reject manually
4. **Autopilot dashboard** — Status, accounts, recent activity, queued items
5. **Account health monitoring:**
   - Track removal rate per account
   - Health status: Healthy (<5%), Caution (5-15%), At Risk (>15%)
   - Auto-pause at-risk accounts

**Dependencies:** Steps 1 + 2 (need supervised posting + survival tracking working first).

**Value delivered:** True hands-off automation. This is the scale play — brands can run Reddit engagement on autopilot while sleeping.

---

### Step 7: Billing & Monetization

**Goal:** Charge users. Enforce plan limits.

**What to build:**
1. **Stripe integration** — Subscriptions with plan tiers
2. **Plan enforcement:**
   - Brand limits (1 / 3 / 10 / unlimited)
   - Subreddit limits (5 / 15 / 50 / unlimited)
   - Competitor limits (3 / 10 / 25 / unlimited)
   - Autopilot access (Pro+ only)
   - Competitive Intel access (Pro+ only)
3. **Usage tracking dashboard** — Posts processed, responses generated, auto-posts used
4. **Email digests** — Wire up daily/weekly email summaries (notification preferences already exist)
5. **Upgrade prompts** — Contextual upsell when users hit limits

**Dependencies:** Steps 1-5 ideally (more features = more pricing leverage). Minimum: Steps 1-3.

**Proposed pricing:**

| Plan | Brands | Subreddits | Competitors | Autopilot | Competitive Intel | Price |
|------|--------|------------|-------------|-----------|-------------------|-------|
| Starter | 1 | 5 | 3 | Supervised only | Basic filter | $49/mo |
| Pro | 3 | 15 | 10 | Included | Full | $149/mo |
| Agency | 10 | 50 | 25 | Included | Full | $449/mo |
| Enterprise | Unlimited | Unlimited | Unlimited | Included + API | Full + Custom | Custom |

---

## Quick Wins (Low Effort, High Impact)

These can be done anytime, independent of the main sequence:

| Quick Win | Effort | Impact |
|-----------|--------|--------|
| Implement Telegram alerts | 1-2 days | Unblocks key user segment |
| Pre-generate subreddit profiles on brand creation | Hours | Better onboarding UX, surface community insights |
| Wire follow-up generator into check-replies cron | Hours | Free engagement value from existing code |
| Add retry logic to AI classification | Hours | Pipeline resilience |
| Fix email footer link (currently `href="#"`) | Minutes | Polish |
| Add request timeouts to OpenAI/Reddit API calls | Hours | Prevent hung cron jobs |
| Feed previous shill score into regeneration prompt | Hours | Smarter regeneration |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Reddit API rate limiting on write operations | High | Could block autopilot | Conservative defaults, account rotation, respect rate limits |
| Reddit ToS enforcement on automated posting | Medium | Could shut down core feature | Ambassador mode (user accounts), human-in-loop option, shill detection |
| Account bans from detected shill posts | Medium | Destroys user trust | Shill detection threshold, pause-on-removal, account health monitoring |
| Vercel cron timeout on large brands | Medium | Missed opportunities | Max execution guard, batch processing, queue-based architecture |
| GPT-4o-mini quality degradation | Low | Classification accuracy drops | Monitor precision, fallback to GPT-4o, A/B test models |
| Competitor tool catches up on intent classification | Low | Reduced differentiation | Speed to market on response agent, double down on shill detection USP |

---

## Summary

**Where we are:** Production-ready social listener with sophisticated AI classification, solid multi-tenant architecture, and polished UX.

**What's missing:** The action layer. The product detects and classifies opportunities but can't act on them automatically. This is the gap between "monitoring tool" and "automation engine."

**The unlock:** Response Agent (supervised → autopilot) transforms the product from "alerts you should do something" to "does it for you." Every subsequent feature (insights, competitive intelligence, billing) becomes more valuable once the action loop is closed.

**Estimated timeline to revenue-ready:** 6-8 weeks executing Steps 1-5, then Step 7 for billing.
