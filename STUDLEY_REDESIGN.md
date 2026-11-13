# QuestLearn — Warm Editorial Redesign

Working plan for the frontend refresh inspired by <https://www.studley.ai/>.

The goal is a site that feels **commissioned, not generated**: a warm paper canvas,
one strong orange accent, confident editorial type, restrained borders, and product
screens that look like real software rather than a component demo.

This is a frontend-only change. Auth, routes, API contracts, quiz scoring, uploads,
and role permissions stay exactly as they are.

---

## 1. What we are taking from Studley

Only the visual language, never the brand or copy:

| Studley cue | QuestLearn translation |
|---|---|
| Cream page `#FAF6F0` | `--background` in light mode |
| Pure white cards on cream | `--card`, `.panel`, `.panel-raised` |
| Burnt orange accent | `--gold` / `--brand` for icons, active states, progress |
| Poppins display type | Hero and page titles only; system sans for UI |
| 80px / -0.045em hero | Fluid `clamp()` so it works at 375px and 1440px |
| 64px translucent header | 64px sticky app + marketing header |
| 12px buttons, 20px cards | Radius scale in `tokens.css` |
| Tactile orange button | 3px shade shadow + inset highlight, pressed state |
| Thin warm borders | `#E7E3DD` light / `#2C2C2C` dark |
| Generous whitespace | 80–128px section rhythm on marketing pages |

**Deliberate deviations**

- We keep light **and** dark themes. Studley only ships light; QuestLearn already
  has a persisted light/dark/system switch, so removing it would be a regression.
- Primary buttons use a deeper orange fill (`#D5340B → #C2300A`) so 15px white
  labels clear WCAG AA. Bright `#FA4614` stays for icons, dots, and large display
  accents.
- QuestLearn keeps its own name, mark, product language, and gamification.

---

## 2. Token map

`src/styles/tokens.css` becomes the single source of truth. Tokens remain HSL
channels because Tailwind consumes `hsl(var(--token) / <alpha-value>)`.

### Light (default)

| Token | Value | Hex |
|---|---|---|
| `--background` | `36 50% 96%` | `#FAF6F0` |
| `--foreground` | `30 7% 9%` | `#191817` |
| `--card` | `0 0% 100%` | `#FFFFFF` |
| `--muted` | `36 33% 94%` | `#F5F1EB` |
| `--muted-foreground` | `38 5% 38%` | `#66615B` |
| `--border` | `36 17% 89%` | `#E7E3DD` |
| `--border-strong` | `35 12% 81%` | `#D4CFC8` |
| `--gold` (brand) | `13 96% 53%` | `#FA4614` |
| `--gold-text` | `13 71% 42%` | `#C2300A` |
| `--btn-primary-from` | `12 90% 44%` | `#D5340B` |
| `--btn-primary-to` | `10 88% 37%` | `#B12A09` |
| `--success` | `152 52% 30%` | `#247348` |
| `--warning` | `30 88% 32%` | `#9A4F06` |
| `--danger` | `2 66% 44%` | `#BA3026` |

### Dark

Warm near-black, not blue-black:

| Token | Value | Hex |
|---|---|---|
| `--background` | `0 5% 7%` | `#141212` |
| `--foreground` | `9 50% 97%` | `#FCF6F5` |
| `--card` | `0 0% 10%` | `#1A1A1A` |
| `--muted` | `0 0% 13%` | `#212121` |
| `--border` | `0 0% 17%` | `#2C2C2C` |
| `--brand-tint` | `16 31% 14%` | `#2E1E18` |
| `--gold-text` | `17 100% 70%` | `#FF8F66` |

Dark mode keeps the same button fill so the brand reads consistently.

---

## 3. Type scale

Fonts: **Poppins 500/600** for display, system sans for everything else. Loaded
from Google Fonts with `display=swap`.

| Role | Desktop | Mobile | Weight | Tracking |
|---|---|---|---|---|
| Marketing H1 | 80px / 0.98 | 46px | 600 | -0.045em |
| Marketing H2 | 52px / 1.08 | 34px | 600 | -0.03em |
| Marketing lead | 18px / 28px | 16px | 400 | 0 |
| App page title | 44px / 1.05 | 30px | 600 | -0.04em |
| Card title | 17px / 25px | 16px | 600 | -0.015em |
| Body | 15px / 24px | 15px | 400 | 0 |
| Meta / label | 12–13px | 12px | 500–600 | 0.01em |

Rules:

- Never use 500-weight body text; it muddies at 15px.
- Poppins only for H1/H2 and the wordmark. Poppins everywhere is the fastest way
  to look generic.
- No all-caps headings. Small uppercase labels only.
- Line-height is never tighter than `0.98` on display text.

---

## 4. Page inventory and intent

### Public

1. **`/` landing** — new public page for signed-out visitors.
   - 64px header: logo, section links, Sign in, Get started.
   - Editorial hero: oversized headline, one warm paragraph, two CTAs, product
     mock built from real UI shapes (skill nodes, score card, streak chip).
   - Feature strip, tabbed product section, dark instructor panel, three-step
     "how it works", orange final CTA, footer.
   - Signed-in visitors still redirect by role, exactly as before.

2. **`/login`** — split screen. Editorial left panel, white form card right.
   Demo account shortcuts stay.

3. **`/register`** — same shell, longer form, role cards, invite-code help.

### App

4. **Dashboard** — greeting header, XP / streak / cleared-node stat row, course
   cards with progress, compact leaderboard, "how XP works" aside.
5. **Explore** — catalogue header, white filter bar, teacher groups, course cards,
   expandable skill tree, active filter chips.
6. **Skill tree** — course header, progress, jump chips, canvas, right-hand
   briefing panel with lesson, quiz, viva, history.
7. **Leaderboard** — top-three podium, remaining ranked rows, current-user accent.
8. **Performance** — stat cards, overall completion, focus-next list, subject
   accordions.
9. **NotFound** — plain, helpful, on-brand.
10. **Instructor / admin** — inherit the token system; hardcoded dark classes are
    bridged so they remain readable while their bespoke layouts are left intact.

---

## 5. Component primitives

Defined in `src/index.css`:

- `.panel` — white, 20px radius, 1px warm border, 1–2px shadow.
- `.panel-raised` — same with a stronger card shadow for auth and hero cards.
- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger` — 44–48px tall, 12px
  radius, tactile primary with a 3px shade edge.
- `.field` — white, 12px radius, warm border, 3px orange focus ring.
- `.chip` — warm tint, pill, 11px semibold, sentence-case.
- `.eyebrow` — 11px semibold, muted, wide tracking.
- `.page-title`, `.page-subtitle`, `.stat-value`, `.label`.
- `.grid-floor` — faint warm grid for the skill-tree canvas.

## 6. Navigation behaviour

Rebuild `Navbar.jsx` around a 64px bar:

- Text links with an orange active underline, not filled pills.
- XP and streak shown compactly; streak hides first on narrow screens.
- Account button opens a white menu with name, email, role home, and sign out.
- Mobile menu button opens a full-width drawer under the header.
- Both menus close on route change, Escape, and outside click.
- No `backdrop-filter` on dropdowns, so overlays cannot be clipped.
- Desktop links show from `md`; the bar never overflows at 1024px.

## 7. Implementation order

1. `tokens.css`, `tailwind.config.js`, `index.html`, `ThemeContext.jsx`.
2. Rewrite `index.css` primitives and the temporary hardcoded-class bridge.
3. `Logo.jsx`, `Navbar.jsx`, `ThemeToggle.jsx`.
4. `App.jsx` public landing route + `Landing.jsx`.
5. `Login.jsx`, `Register.jsx`.
6. `StudentDashboard.jsx`, `ExploreCourses.jsx`, `Leaderboard.jsx`,
   `StudentPerformance.jsx`.
7. `SkillTreePage.jsx`, `SkillNode.jsx`, `SkillTreeCanvas.jsx`,
   `XPBar.jsx`, `StreakCounter.jsx`, `LevelUpModal.jsx`,
   `GamificationContext.jsx`.
8. `ProtectedRoute.jsx`, `NotFound.jsx`, shared error banner.
9. Build, test, inspect 375px and 1440px in both themes.

## 9. Working checklist

Kept in sync as the build progresses. `[x]` means done and verified in the browser.

**Foundations**

- [x] Light-first warm tokens, warm dark tokens, HSL channels for Tailwind
- [x] Poppins 500/600 display font, system sans for UI
- [x] `index.html` theme colour, title, description, font preload
- [x] `.panel`, `.panel-raised`, `.btn-*`, `.field`, `.chip`, `.eyebrow`,
      `.page-title`, `.page-subtitle`, `.stat-value`, `.grid-floor`, `.shell`
- [x] Temporary bridge for remaining hardcoded dark utility classes

**Marketing**

- [x] 64px public header, anchor links, Sign in, Get started
- [x] Mobile drawer with anchors, theme switch, Sign in, Get started
- [x] Hero + product mock (skill nodes, score card, streak chip)
- [x] Capability strip, tabbed product section, feature grid
- [x] Dark instructor panel, three-step loop, role cards
- [x] Orange closing CTA with AA-safe text on `#FA4614`
- [x] Footer

**Auth**

- [x] Split shell with editorial panel on the left
- [x] Login with demo account shortcuts
- [x] Register with role cards and invite help
- [x] No duplicated wordmark on mobile; unique eyebrow on each column

**App**

- [x] Dashboard header, stat row, course cards, leaderboard, XP aside
- [x] Explore catalogue, filter bar, teacher groups, course cards, preview tree
- [x] Skill tree header, progress, jump chips, canvas, briefing panel, history
- [x] Leaderboard podium + ranked list
- [x] Performance stat cards, overall completion, focus-next, subject accordions
- [x] NotFound, ProtectedRoute, load-error banner
- [x] Level-up modal, XP burst, skill node states, canvas grid
- [x] Instructor studio, course library, admin overview in both themes
- [x] Admin accounts table becomes stacked cards below `md`
- [x] Studio step rail wraps instead of clipping on phones
- [x] XP/streak controls only render for students

**Verification**

- [x] `npm.cmd run build`
- [x] `npm.cmd test -- --run`
- [x] Landing: 1440px light, all sections
- [x] Landing: 375px light, all sections
- [x] Landing + app: dark theme
- [x] App pages: dashboard, explore, performance, leaderboard, skill tree
- [x] Auth pages: login, register, mobile and desktop
- [x] Studio and admin: 1440 and 375, light and dark
- [x] Mobile app drawer and account menu opened and inspected

### Design QA log

- Hero headline uses `clamp(2.45rem, 6.4vw, 5rem)`; at 375px it lands on three
  lines without hyphenation or overflow.
- The closing CTA keeps `#FA4614` as the surface and uses `#2A0F05` for its
  10–15px copy (5.1:1 contrast). Mid-brown copy looked warmer but failed AA.
- Landing header hides the theme switch below `sm` and moves it into the mobile
  drawer, so `Get started` never wraps at 375px.
- Product tabs collapse to a 2×2 grid below `sm` instead of a horizontal
  scroller that hid “Progress” off-screen.
- Grid children that hold the product tabs carry `min-w-0`, which removes the
  last 1–2px of horizontal overflow on phones.
- The dark instructor panel is intentionally its own colour field; it is not a
  theme-aware surface, so it stays dark in light mode like Studley’s product
  shots.
- The purple “arcane” accent read as generic AI-product UI, so it was retuned to
  a warm ink brown. It still separates AI and authoring actions from primary
  orange without breaking the palette.
- Auth pages carried the logo twice on phones and repeated the same eyebrow on
  both columns. The card logo is gone below `lg`; the left column now leads with
  “Your learning space” / “Getting started”.
- Admin account rows are cards on phones. The desktop table was technically
  scrollable, but clipping the role select looked broken.
- Studio step tabs wrap to two rows at 375px; the old rail hid “Videos” and
  “Publish” off-screen.
- Instructor and admin sessions no longer show student XP/streak. The admin
  header previously read `1 / 0 XP`.
- “War room” became “Admin overview”; the old label was the wrong register for
  a learning product.

## 10. Acceptance criteria

- `npm.cmd run build` passes.
- `npm.cmd test -- --run` passes.
- No page uses a fixed dark gradient or hardcoded dark-only text.
- Every page is readable in light and dark mode.
- Hero headline scales cleanly from 375px to 1440px.
- All interactive controls have visible focus states.
- Header/account/mobile menus open, close, and survive route changes.
- Primary button labels meet AA against their fill.
- No backend, API, auth, or route-behaviour changes.
