# Travel Collection Mobile Design System

`travel-collection/mobile.css` is the source of truth for the current approved mobile visual language. New pages must extend this system instead of introducing new colors, radii, shadows, font sizes, or bottom navigation styles.

## Visual Baseline

The current approved homepage baseline is saved at:

- `output/playwright/home-visual-baseline.png`
- `output/playwright/home-visual-baseline-side-by-side.png`

Every visual change should capture a new Playwright screenshot at `275 x 515` and compare it with `home-visual-baseline.png`.

## Tokens

Colors:

- Page background: `--color-page-bg: #fffefe`
- Card background: `--color-card: #ffffff`
- Stat card background: `--color-stat-card: #d7ebe7`
- Primary green: `--color-primary-green: #4d8426`
- Chip background: `--color-chip-bg: #f4f7f1`
- Main text: `--color-text-main: #11140f`
- Secondary text: `--color-text-secondary: #4f574e`
- Subtle line: `--color-line: #edf0ec`
- Tabbar line: `--color-tabbar-line: rgba(24, 32, 24, 0.045)`
- Muted icons: `--color-icon-muted: #313832`

Radius:

- Card radius: `--radius-card: 13px`
- Image radius: `--radius-image: 8px`
- Phone shell radius: `--radius-phone: 22px`
- Active tab icon radius: `--radius-tab-active: 0`

Shadow:

- Card shadow: `--shadow-card: 0 7px 18px rgba(43, 55, 44, 0.09)`
- Soft card shadow: `--shadow-soft: 0 2px 10px rgba(37, 48, 43, 0.08)`
- Phone shell shadow: `--shadow-phone: 0 8px 22px rgba(25, 35, 31, 0.08)`

Spacing:

- Page x spacing: `--space-page-x: 15px`
- Section spacing: `--space-section: 18px`
- Card x padding: `--space-card-x: 12px`
- Card y padding: `--space-card-y: 11px`

Typography:

- H1: `--font-h1`
- Body: `--font-body`
- Caption: `--font-caption`
- Stat number: `--font-number`
- Section title: `--font-section-title`
- Card title: `--font-card-title`
- Small card title: `--font-card-title-sm`
- Metadata: `--font-meta`
- Bottom tab: `--font-tab`

Font weights:

- Regular: `--weight-regular`
- Body: `--weight-body`
- Label: `--weight-label`
- Title: `--weight-title`
- Strong: `--weight-strong`
- Number: `--weight-number`
- Section: `--weight-section`

Assets:

- Map asset: `--asset-map`
- Mascot asset: `--asset-mascot`
- Next trip cover: `--asset-next-cover`
- Recent trip cover: `--asset-recent-cover`

## Components

The current homepage is composed from lightweight Web Components in `travel-collection/home-components.js`:

- `StatusBar` via `<status-bar>`
- `GreetingHeader` via `<greeting-header>`
- `StatCard` via `<stat-card>`
- `TripPreviewCard` via `<trip-preview-card>`
- `RecentTripCard` via `<recent-trip-card>`
- `BottomTabBar` via `<bottom-tab-bar>`

These component tags use `display: contents` so they do not alter the approved layout. Their internal class names remain the stable styling hooks:

- `.home-statusbar`
- `.home-greeting`
- `.home-stat-card`
- `.home-next-card`
- `.home-recent-section`
- `.home-recent-card`
- `.home-tabbar`

## Extension Rules

- New pages must reuse `mobile.css` tokens and shared components first.
- Do not add new color values, radii, shadows, font sizes, or font weights for the next page.
- Bottom navigation must be the same `BottomTabBar` component and token set.
- Card, image, chip, and text treatments must follow the homepage values.
- The 图鉴 page should feel like a direct extension of this homepage, not a redesigned screen.
