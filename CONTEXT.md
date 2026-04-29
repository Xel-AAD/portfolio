# Portfolio Website — Context Document

## Project Overview

Portfolio website for **Alexander Akhmetov**, portrait photographer from Yekaterinburg.

- **URL**: https://ekb.photographs.gs
- **VPS**: 45.90.216.126, nginx reverse proxy + certbot SSL
- **Tech stack**: Vite + vanilla JS/CSS frontend, FastAPI Python backend, Docker deployment
- **Language**: Russian (all UI text, SEO meta, structured data in Russian)

## Architecture

Single-page app with two "pages" and a lightbox overlay:

### Page: Main (`#pageMain`)
Sections in order: header → hero → divider → about → divider → featured → divider → services → divider → contact → footer

### Page: Gallery (`#pageGallery`)
Gallery justified grid → footer. Rendered as `position: fixed` overlay with `opacity`/`visibility`/`transform` transitions. History API (`pushState`/`popstate`) drives navigation between main and gallery.

### Lightbox (`#lightbox`)
Separate `div` at body level, z-index 200. Opens on photo click from either featured or gallery.

### Gallery Lines (`#galleryLines`)
`div` at body level (outside `#pageGallery`) containing 4 decorative side lines + back button. Must be at body level because `transform` on parent breaks `position: fixed` on children.

### Backend
FastAPI serves:
- `/api/portfolio` — JSON with featured, gallery, about photos
- `/photos/{path}` — original photos (with `unquote()` for special chars in filenames)
- `/thumbs/{path}` — auto-generated thumbnails
- `/{path}` — catch-all SPA route (serves `dist/index.html` for non-file paths)

## Design Decisions

### Theme & Typography
- Dark theme, gold accent `#c9a96e`
- Fonts: DM Serif Display (headings) + Inter (body)
- `--max-w: 1400px`, `--section-pad: 120px`
- Text selection: gold background on dark text
- Anti-aliased font rendering (`-webkit-font-smoothing: antialiased`)

### Color Variables
| Variable | Value | Purpose |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--bg-card` | `#131313` | Service cards |
| `--text` | `#e8e4de` | Primary text (warm white) |
| `--text-muted` | `#777` | Secondary text |
| `--accent` | `#c9a96e` | Gold accent |
| `--accent-soft` | `rgba(201,169,110,0.15)` | Soft shadow/glow |
| `--accent-glow` | `rgba(201,169,110,0.35)` | Bright glow |
| `--neon` | `rgba(201,169,110,0.3)` | Line pulse |
| `--neon-glow` | `rgba(201,169,110,0.12)` | Line halo |
| `--border` | `#1e1e1e` | Subtle borders |

### Gallery Side Lines
Real `<div>` elements at body level (z-index 160), not pseudo-elements on `.gallery__grid`. Reason: `transform` on `.page--gallery` parent converts `position: fixed` to `absolute`, breaking the lines. Also `overflow: hidden` on page--gallery would clip pseudo-elements.

Line positions:
- Outer left: `left: 24px`
- Outer right: `right: 24px`
- Inner left: `left: 32px`
- Inner right: `right: 32px`

Gallery back button: `left: 24px`, `right: 24px`, fixed at top.

### Contact Section
Full-screen cinematic with gold glow animation (`contactGlow` keyframe). CTA: "Написать в Telegram" with solid gold background. Secondary: Instagram, VK icons + email, all muted/transparent.

### Featured Section
Masonry layout (smart tile / shortest-column algorithm):
- 4 columns on desktop, 2 on mobile
- Each photo goes into the shortest column
- **Last photo in each column stretched** via `img.style.height` + `object-fit: cover` to fill rectangle and equalize column heights
- 10px gap between items

### Gallery Section
Justified layout (like Google Photos):
- `ROW_HEIGHT = 280` desktop, `ROW_HEIGHT_MOBILE = 180`
- 3px gaps between photos and rows
- Padding: `0 46px`
- Last row height capped at `targetRowHeight * 1.2`

### Lightbox
Blur-up pattern:
1. **Thumb layer** (`lightbox__img--thumb`): blurred at `blur(25px)`, appears first as loading placeholder
2. **Full layer** (`lightbox__img--full`): sharp original, fades in over 0.6s when loaded
3. Both layers use `translate(-50%, -50%)` centering (`_lbT` constant)

**Gold loading bar** at bottom:
- `lb-loading`: bar pulses (scales 0→0.45 and back, infinite)
- `lb-done`: bar fills to full (`scaleX(1)`) then fades out

### Animations
- `anim-fade-up`: opacity 0→1 + translateY 20px→0, triggered by IntersectionObserver (threshold 0.1, rootMargin bottom -40px)
- Delay classes: `.anim-delay-1` (0.1s) through `.anim-delay-4` (0.4s)
- Hero animations triggered after 200ms timeout (not scroll-based)

## Services Section

4 cards in a 2×2 grid (1 column on mobile ≤600px):

| Service | Duration | Price | Photos | Delivery |
|---|---|---|---|---|
| Портретная съёмка | 1 час | 1 500 ₽ | от 20 | 7 рабочих дней |
| Расширенная съёмка | 2 часа | 2 500 ₽ | от 40 | 10 рабочих дней |
| Контент-съёмка | 1,5 часа | 3 000 ₽ | от 30 | следующий день |
| Предметная съёмка | По договорённости | Договорная | — | — |

Common text above cards:
> Съёмка на улицах Екатеринбурга · Студия по договорённости
> Ретушь и цветокоррекция · Помощь с позами и подбором одежды

CTA links to Yandex Forms: `https://forms.yandex.ru/u/69f0e6f702848f49291ec1d6`

## Photo System

### Source Photos
| Directory | Count | Purpose |
|---|---|---|
| `public/photos/Favourites/` | 8 | Featured section |
| `public/photos/Gallery/` | 44 | Gallery section |
| `public/photos/About me/` | 1 | About section portrait |

### Thumbnails
- Auto-generated to `public/thumbs/` with **SHA256-hashed filenames** (first 16 chars of hash + `.jpg`)
- `THUMB_MAX_W = 1200`, `THUMB_QUALITY = 80`, progressive JPEG
- Directory structure preserved (e.g. `thumbs/Favourites/abc123.jpg`)
- Mtime-based staleness check: regenerates if original is newer

### Caching
- **Snapshot cache**: compares folder file names + mtimes per directory. Rebuilds portfolio only on change.
- **Dimensions cache**: `.dimensions.json` in thumbs dir, stores width/height/mtime per photo.
- **Portfolio cache**: in-memory `PortfolioData` object, invalidated by snapshot or `photos.json` mtime change.

### Filename Parsing (`prettify_filename`)
Parses filenames with pipe-delimited segments: `|DD-MM-YYYY| B&W |-N.jpg`

Example: `|19-04-2026| B&W |-1.jpg` → **"19 апреля 2026, Чёрно-белый портрет, №1"**

- Detects `B&W` / `BW` (case-insensitive) → "Чёрно-белый портрет", otherwise "Портрет"
- Parses `DD-MM-YYYY` date → Russian format "D месяца YYYY"
- Last segment → "№N" number
- Falls back to raw filename if nothing parses

### `photos.json` Override
Currently empty (`{"photos": []}`). Schema:
```json
{
  "photos": [
    {
      "file": "Gallery/|19-04-2026| B&W |-1.jpg",
      "title": "Custom Title",
      "description": "Custom description"
    }
  ]
}
```
Overrides `prettify_filename` titles for specific photos. Volume-mounted at `/app/backend/photos.json`.

### Photo Delivery
- **Thumbnails** (1200px wide, ~200KB): used everywhere — gallery, featured, about, lightbox thumb layer
- **Originals** (6-10MB): loaded only in lightbox full layer

### Randomization
`random.shuffle` applied to featured and gallery photo lists in backend for variety on each rebuild.

## Deploy Workflow

```bash
git pull
docker compose down
docker compose up -d --build
```

### Dockerfile (multi-stage)
1. **Build stage** (`node:20-alpine`): `npm ci` → `npm run build` → produces `dist/`
2. **Run stage** (`python:3.12-slim`): installs `requirements.txt`, copies `backend/`, `dist/`, `public/`
3. Runs: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`

### docker-compose.yml
- Port mapping: `8000:8000`
- Volumes: `./public/photos:/app/public/photos` (live photo updates without rebuild)
- Volumes: `./backend/photos.json:/app/backend/photos.json` (metadata overrides)
- Restart policy: `unless-stopped`

### Gotcha: Port 8000 Blocked
Old containers can block port 8000. Use `docker ps -a` to find and remove stale containers before starting.

### Vite Config
- `base: './'` — relative paths for SPA deployment
- Dev proxy: `/api` and `/photos` → `http://localhost:8000`

## JS Details

### Helpers
```js
const $ = (sel, ctx = document) => ctx.querySelector(sel)
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)]
```

### Constants
- `ROW_HEIGHT = 280` (desktop justified row height)
- `ROW_HEIGHT_MOBILE = 180`
- `_lbT = 'translate(-50%,-50%)'` (lightbox centering transform)

### Page Switching (`initPageSwitching`)
- `openGalleryPage()`: pushes `{ gallery: true }` state, adds `.gallery-open` on `<html>`, `.active` on `#pageGallery` and `#galleryLines`
- `closeGalleryPage()`: removes classes, no history push
- `popstate` handler: opens/closes gallery based on `e.state?.gallery`
- Logo click when gallery open: `history.back()` + scroll to hero
- Back button: `history.back()`
- On init: if `history.state?.gallery` → reopen gallery with `replaceState`

### Scroll Handling
- `history.scrollRestoration = 'manual'` — prevents browser restoring scroll position on back/forward
- `window.scrollTo(0, 0)` on init
- Header scroll: adds `.scrolled` class when `scrollY > 60`

### Lightbox Lifecycle

**Open** (`openLightbox`):
1. Set thumb src with `blur(25px)`, opacity 0, scale 0.92
2. Add `.open` to lightbox, set `body.overflow = hidden`
3. When thumb loads → double `requestAnimationFrame` → animate thumb to opacity 1, scale 1 (0.45s zoom-in)
4. Preload full original: `full.onload` assigned **BEFORE** `full.src` (handles cached images)
5. When full loads → add `.loaded` class (0.6s fade-in), set `lb-done`

**Navigate** (`navigateLightbox`):
1. 250ms fade-out (opacity→0, scale→0.98)
2. Swap thumb src, set `blur(25px)`
3. When new thumb loads → 0.35s fade-in
4. Preload new full original

**Close** (`closeLightbox`):
1. 0.3s zoom-out (opacity→0, scale→0.95)
2. After 300ms: remove `.open`, restore body overflow, clear src

### Resize Handler
Debounced at 200ms. Only re-renders if `window.innerWidth` actually changed — prevents iOS Safari address bar resize loop from triggering `renderGallery` repeatedly.

### Touch Gestures (Lightbox)
- Swipe horizontal >50px: navigate prev/next
- Swipe down >100px: close lightbox
- Nav buttons flash visible on `touchstart`, auto-hide after 1500ms

## CSS Details

### File Structure (1642 lines, 18 sections)
1. Global variables (`:root`)
2. Reset (`*, html, body`)
3. Base elements (`a, img, button, ::selection`)
4. Page switching (gallery overlay transitions)
5. Header (fixed nav, `.scrolled` state)
6. Mobile nav (burger menu, slide-in panel, overlay)
7. Hero (particles, glow bg, vignette, scroll hint)
8. Divider (gradient gold line)
9. Section title (h2 style, `--left` modifier)
10. About (photo+text grid, glow behind photo)
11. Featured (flex masonry columns)
12. Services (card grid, gold bottom line on hover)
13. Contact (full-screen, glow CTA)
14. Gallery (justified grid, side lines as real divs)
15. Footer
16. Lightbox (blur-up, loading bar)
17. Animations (`anim-fade-up`, delays)
18. Mobile (≤768px overrides)

### Key Measurements
| Element | Value |
|---|---|
| Gallery grid padding | `0 46px` |
| Gallery lines outer | `left/right: 24px` |
| Gallery lines inner | `left/right: 32px` |
| Gallery back button | `left: 24px, right: 24px` |
| Featured columns | 4 desktop / 2 mobile |
| Featured gap | 10px desktop / 6px mobile |
| Nav padding | `24px 40px` desktop / `16px 20px` mobile |
| Section padding | `120px 40px` desktop / `60px 24px` mobile |
| Lightbox img max | `90vw × 88vh` desktop / `100vw × 85vh` mobile |
| Page open duration | `0.7s` |
| Page close duration | `0.5s` |

### Button Styles
- Hero "Мои работы" and Featured "Открыть портфолио": outlined with gold `scaleX(0)` fill animation on hover
- Services "Записаться": solid gold background, lift + glow on hover
- Contact CTA: solid gold, lift + glow on hover

## HTML Structure

```
<body>
  <div class="page page--main" id="pageMain">
    <header class="header" id="header">
      <nav class="nav"> ... </nav>
    </header>
    <section class="hero" id="hero"> ... </section>
    <div class="divider"></div>
    <section class="about" id="about"> ... </section>
    <div class="divider"></div>
    <section class="featured" id="featured"> ... </section>
    <div class="divider"></div>
    <section class="services" id="services"> ... </section>
    <div class="divider"></div>
    <section class="contact" id="contact"> ... </section>
    <footer class="footer"> ... </footer>
  </div>

  <div class="page page--gallery" id="pageGallery">
    <section class="gallery" id="gallery"> ... </section>
    <footer class="footer"> ... </footer>
  </div>

  <div class="lightbox" id="lightbox"> ... </div>

  <div class="gallery-lines" id="galleryLines">
    <button class="gallery__back" id="navBackBtn"> ... </button>
    <div class="gallery-line gallery-line--outer-left"></div>
    <div class="gallery-line gallery-line--outer-right"></div>
    <div class="gallery-line gallery-line--inner-left"></div>
    <div class="gallery-line gallery-line--inner-right"></div>
  </div>
</body>
```

## SEO & Structured Data

- `<title>`: Портретный фотограф • Екатеринбург • Фотосессия | Александр Ахметов
- `<meta description>`: Russian, mentions price from 1500₽
- OpenGraph + Twitter Card meta tags
- JSON-LD `ProfessionalService` schema with:
  - Address: Екатеринбург, RU
  - Geo: 56.8389, 60.6057
  - `sameAs`: Telegram, Instagram, VK
  - `OfferCatalog`: two offers (1hr/1500₽ and 2hr/2500₽)

## Critical Gotchas

1. **Photo filenames contain special chars**: `|`, `&`, spaces — requires URL encoding in frontend and `unquote()` on backend to resolve paths correctly.

2. **`transform` on parent breaks `position: fixed`**: Gallery lines and back button must be at body level, outside `.page--gallery`, because `.page--gallery` has `transform: translateY()`.

3. **`renderGallery` only re-renders on actual width change**: The resize handler compares `window.innerWidth` before re-rendering. This prevents iOS Safari address bar resize (which changes `window.innerHeight` but not `innerWidth`) from triggering infinite re-render loops.

4. **Ctrl+Shift+R needed for hard refresh**: After CSS changes, normal refresh may serve cached styles. Use Ctrl+Shift+R (or Cmd+Shift+R on Mac) to bypass cache.

5. **`photos.json` volume path must be `/app/backend/photos.json`**: Not `/app/photos.json`. The Dockerfile copies `backend/` to `/app/backend/`, and the app resolves `METADATA_FILE` relative to `__file__`.

6. **Featured last photo stretched**: The masonry algorithm stretches the last photo in each column via inline `img.style.height` + `object-fit: cover` to equalize column heights.

7. **Full img has `visibility: hidden` by default**: Prevents broken image icon before `src` is set. CSS transition on `visibility` with delay handles the reveal.

8. **`full.onload` assigned BEFORE `full.src`**: Essential for handling cached images. If `src` is set first, the `load` event may fire before the handler is attached for cached resources.

9. **iOS scroll leak**: `html.gallery-open { overflow: hidden }` prevents touch events from "leaking" through the fixed overlay to the main page underneath. `overflow: hidden` on `<html>` is more reliable than on `<body>` for iOS Safari.

## Backend Dependencies

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
Pillow==11.0.0
```

Pillow is optional — if unavailable, thumbnails fall back to serving originals and dimensions return 0×0.

## Next Steps / TODO

- [ ] Add 2 more photos to Favourites (currently 8, user wanted 10)
- [ ] Populate `photos.json` with specific titles when user provides descriptions
- [ ] Register site in Yandex Webmaster + Google Search Console
- [ ] Fine-tune if any visual issues remain
