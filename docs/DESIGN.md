# Design: Lintora File Desk

Lintora is a fictional product brand used only in this example. The fictional lender using it is
Halvaren Home Lending. Both names are coined; neither is meant to refer to a real company.

## Brand

- **Name:** Lintora File Desk. A coined name from *lintel*, the beam over a doorway: the last piece
  that goes in before a house is ready to walk into. The product is where a loan file gets checked
  before the borrower gets the keys.
- **Audience:** loan processors, closers and pre-funding QC reviewers at a mortgage lender. They
  work a queue of 40-60 files, and their day is spent comparing a number on the application with the
  same number on a pay stub, a bank statement or an appraisal.
- **Voice:** a careful senior processor. Plain, specific and numeric, never cute. "Pay stub supports
  $8,000.01 a month; the application states $9,440 (18% higher)." Verbs on buttons say exactly what
  happens: *Clear condition*, *Draft borrower request*, *Escalate to underwriter*.
- **Logo mark** (inline SVG in `components/Brand.tsx`, repeated on the landing page): a cobalt
  rounded square holding a doorway (two posts and a lintel) with a highlighter-yellow tick inside it.

```svg
<svg viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="#1F3FBF"/>
  <path d="M8 9h16" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M10.5 10v14M21.5 10v14" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M13 18.2l2.3 2.3 4.4-4.8" fill="none" stroke="#FFD43B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

## Design direction: "the blueprint and the highlighter"

A loan file is checked the way a drawing is checked: against a spec, line by line, with a
highlighter for anything that doesn't match. The app is cool, precise drafting-paper blue with one
loud color, highlighter yellow, reserved for *mismatches between the application and a document*.
If something is yellow, a person needs to look at it.

### Palette (tokens in `app/globals.css`, exposed to Tailwind via `@theme`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#F4F6FB` | `#0A1226` | Page background (drafting paper / blueprint night) |
| `surface` | `#FFFFFF` | `#101B36` | Panels, tables, drawers |
| `surface-2` | `#EBEFF8` | `#16244A` | Table headers, wells, skeletons |
| `line` | `#D7DDEC` | `#25345C` | Hairlines, chart grid |
| `ink` | `#0E1733` | `#E7ECF8` | Primary text |
| `ink-2` | `#46506B` | `#AEB8D3` | Secondary text |
| `muted` | `#5F6987` | `#8C97B6` | Captions, axes (AA on canvas and surface) |
| `cobalt` | `#1F3FBF` | `#7D9BFF` | Brand, rail, primary actions, active nav, focus ring, series 1 |
| `cobalt-soft` | `#E4E9FB` | `#1B2A5C` | Selected rows, active chips |
| `highlight` | `#FFD43B` | `#FFD43B` | Mismatch highlight fill (with `ink` text) |
| `highlight-ink` | `#7A5600` | `#FFE27A` | Mismatch text on surfaces |
| `fail` | `#B42318` | `#FF8A80` | Failed checks, overdue |
| `pass` | `#0E7A4F` | `#5BD7A0` | Passed checks, cleared, ready to close |
| `wait` | `#8A5300` | `#F5B85C` | Pending documents, requested |
| `ai` | `#0F6E8C` | `#5CD0F0` | AI panels, "Sample AI response" label, citations |
| `rail` | `#0F1F66` | `#060C1C` | Navigation rail background (both themes) |

Chart series: cobalt `#1F3FBF`, sky `#4F8EF7`, teal `#0F9DB0`, slate `#8A94B0`; the highlighter and
`fail` are never chart series, so color in a chart never reads as a finding.

### Typography (self-hosted with `next/font`, no CDN)

- **Bricolage Grotesque** 600/700 for page titles, KPI numbers and the landing headline. Its
  slightly condensed, ink-trap feel reads as "drafted", not as a dashboard template.
- **Public Sans** 400/500/600 for UI and body text (designed for public-service forms; dense and very
  legible at 12-13 px).
- **Geist Mono** for loan numbers, dollar figures in comparisons, document IDs and parsed text.
- Scale: 28 / 20 / 15 / 13 / 12 / 11 px. Tabular figures everywhere numbers line up.

### Layout model

- **A 76 px icon rail**, not a sidebar or a tab bar: deep cobalt, logo at the top, four stacked
  icon-over-label buttons (Pipeline, Loan file, QC, Ask), and the disclaimer as an info button at the
  bottom. On phones the rail becomes a bottom tab bar.
- **A 56 px work bar** on the canvas: page title and breadcrumb (`Pipeline / LN-260101`), a
  loan jump box (type a loan number or borrower), the environment badge (Sample or Live, with a
  pulsing dot in Live), and the user/role chip ("R. Okafor · Processor").
- **Pipeline:** the hero is a **stage line**: six stations on a horizontal track, like a transit
  map, each station sized by loan count with open conditions hanging under it. Clicking a station
  filters the queue. Below it, KPI tiles with sparkline trends, then the work queue table with
  attention pills, sort and filters, and a right-hand "Needs a human" list of the files with failed
  checks.
- **Loan file:** a **three-pane workspace**. Left: document checklist with extraction progress rings.
  Centre: the application-vs-documents comparison, one row per check, the document value
  highlighted yellow when it disagrees. Right: a **document drawer** that slides in with the parsed
  page and the extracted fields; hovering a field highlights it on the page. Conditions sit under
  the comparison with inline actions. On phones the panes stack and the drawer is a bottom sheet.
- **QC sampling:** a findings chart, the monthly finding-rate trend, and the sample list with an AI
  QC narrative panel.
- **Ask the file:** a chat column with suggested questions and a citations rail that links each
  `[n]` to the document and page it came from.
- Density: comfortable-compact. 12-13 px table text, 40 px rows, 16 px card padding.

### Charts

Recharts with thin 2 px lines, rounded bar ends, dashed `line` grid, axis labels in `muted`, custom
tooltips in a `surface` card with a cobalt left rule, and a legend under every multi-series chart.
KPI tiles carry a 48 px sparkline.

### Motion

- Page content fades up 8 px (160 ms). Drawer slides 24 px with a fade (200 ms).
- Skeleton loaders (shimmer on `surface-2`) for every first load; never a blank panel.
- KPI numbers count up once on first paint (600 ms).
- Mismatch highlights "draw" left to right once, like a highlighter stroke (400 ms).
- AI: staged reasoning steps with a progress track, then a word-by-word streaming reveal.
- Everything honours `prefers-reduced-motion`.

### Dark mode

Follows the OS, with a toggle in the work bar. Dark mode is "blueprint night": navy surfaces and
lighter cobalt. The highlighter stays the same yellow in both themes because it is the brand's
one constant.

## How this pack differs from the existing catalog

I looked at the landing pages and hosted Try apps of Odometer (auto finance), Workforce
Intelligence, Dispute Intelligence, the KYC and card-fraud consoles, and the v2 design docs for
Quillstone, Tallyward, Veritome, Calvessa, Tallowmark, Veltrona, Ferrovane, Cadrel and Quorvane.

| They use | Lintora avoids it by |
| --- | --- |
| 248 px dark sidebars with labelled links (Odometer, Workforce, Veltrona) | A 76 px icon rail with labels under icons, bottom tabs on phones |
| Top tab bars (Quillstone, Veritome, Tallowmark, Cadrel) | No top tabs; the work bar holds search, badge and user only |
| Gradient hero banners with big headline and KPI glass tiles (Odometer, Workforce) | A transit-map stage line as the hero, no gradient banner |
| Graphite/amber, graphite/lime, vermilion paper, dusk violet, burgundy, spruce, marine/saffron, harbor navy | Cobalt on cool drafting-paper blue, with highlighter yellow as the single loud accent |
| Serif display headings (Workforce, Odometer) and IBM Plex / Space Grotesk / Inter | Bricolage Grotesque + Public Sans + Geist Mono |
| Violet or purple as the AI color (Ferrovane, Cadrel, Workforce) | Teal-cyan for AI |

The landing page (`docs/index.html`) uses the same brand: a cobalt blueprint hero with a fine grid,
the stage line drawn in SVG, and a highlighter stroke under the key phrase of the headline.

## Accessibility

- Contrast checked with `scripts/check-contrast.mjs` against WCAG AA (4.5:1 text, 3:1 large text
  and UI). Highlighter fills always carry `ink` text, never white.
- Status is never color alone: every pill has a word and an icon.
- Focus ring: 2 px cobalt with 2 px offset. Drawer and dialogs trap focus and close on Escape.
