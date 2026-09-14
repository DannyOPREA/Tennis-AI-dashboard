---
name: playground-design
description: Design brief and design system for the Tennis AI playground frontend: colour tokens, typography, spacing, chart palette, component conventions, page inventory and the screenshot review checklist. Load before writing or reviewing anything under frontend/src.
---

# Playground design brief

## Who and what
Two people use this: a French tennis entrepreneur (the client) and a professional coach. They
upload clips of junior players, run them through models, read French coaching text side by side,
rate it, and look at cost/latency charts. It is an internal evaluation tool, not a product
landing page: restraint beats spectacle. It should feel premium, calm and trustworthy, like a
well-made lab notebook. Density is welcome; decoration is not.

## One colour scheme: light
Light only in v1. Reasons: the coach reads long French paragraphs and compares two to four
columns of text, which is easier on a light ground; video thumbnails and frame strips read
better against a neutral light surface; one scheme halves the review surface. Dark mode is a
later toggle, not a v1 requirement.

## Tokens (source of truth: `frontend/DESIGN.md`, mapped onto shadcn variables in `frontend/src/index.css`)

| Name | Hex | Role |
|---|---|---|
| Chalk | `#F6F7F5` | page ground (cool off-white, the chalk line, not cream) |
| Card | `#FFFFFF` | reading and chart surfaces |
| Baseline | `#1F2421` | ink, green-grey black |
| Sideline | `#5F6662` | secondary ink |
| Net | `#DDE1DB` | hairline borders, gridlines |
| Terre battue | `#9E3B26` | the single accent: primary actions, focus ring, stars, "running" |

Never use the accent as a wash or gradient. Never introduce a second accent.

## Typography

- **Bricolage Grotesque** (variable) for page titles and model names; **Instrument Sans** (variable) for everything else. Both self-hosted through `@fontsource-variable` so the client PC works offline.
- Tabular figures only in metric columns. No all-caps labels, no single-word colour accents in headlines.

## Spacing and layout
- 4 px base grid; component paddings 12/16/24; page gutter 24 px desktop, 16 px at phone width.
- Content max width 1360 px, left aligned. A slim left navigation rail (Library, New run,
  Compare, Dashboard, Prompts) that collapses to a top bar under 900 px.
- Panels are separated by hairlines and background steps, not by identical rounded cards with
  drop shadows. Radius 6 px on controls, 10 px on media (thumbnails, video). No shadows except
  the open dialog/sheet.
- Motion: only in response to user action (sheet open, stars fill, row expand). No entrance
  animations. Respect `prefers-reduced-motion`.

## Charts (follow the `dataviz` skill)
- Categorical palette by provider (validated with the dataviz validator, keep slot order): Gemini `#2A78D6`, Ollama/local `#0D8F5F`, openai_compat `#4A3AA7`; mock/dev uses the neutral Sideline.
  `#6C5B9C`. Same colours in table chips and charts so a model is recognisable everywhere.
- Sequential (cost) ramp is the accent's own hue: `#FBEDE8 → #F2CFC4 → #E3A08D → #C86A4E → #9E3B26`; table cell washes use only the three lightest steps.
- Scatter (cost vs stars, latency vs stars): one dot per (model, input_mode, preset), size by
  run count, label on hover and for the top three by stars. Axes with units (`$ per run`, `s`).
- Bars: horizontal, sorted, values at the bar end. Median with a min-max whisker for latency.
- No 3D, no gradients, no gridlines heavier than `--line`. Tooltips show exact numbers and n.

## Components
- shadcn/ui primitives only (`frontend/src/components/ui`). Compose, do not restyle per page.
- Status chips for run states: queued (muted), running (clay outline + subtle pulse),
  done (court), error / interrupted / cancelled (fault). Same chip component everywhere.
- Model chip: provider colour dot + display name + input-mode tag (`video` / `frames`) + preset.
- Stars widget: five stars, keyboard operable (arrow keys, 1-5 keys), clay fill, notes textarea
  below, autosave on blur, saved indicator. Blind mode hides model chips until a rating is saved.
- Metrics panel: a definition-list grid (label muted, value ink, tabular numbers), grouped as
  Timing / Tokens / Cost / GPU. Nulls render as an en dash with a tooltip explaining why.
- Output panel: `react-markdown`, French text, max 72 ch, generous line height; streams in.
- Filmstrip: contact-sheet image with frame count and fps caption; click opens the frame in a dialog.
- Empty states say what to do next in one sentence with the action button. Loading uses skeletons
  that match the final layout.
- All copy from `frontend/src/i18n/en.ts`.

## Pages and their primary job
| Route | Page | Primary job |
|---|---|---|
| `/` | Library | see clips at a glance, upload a new one, start a run from a clip |
| `/runs/new` | New run | choose video, prompt version, models x input modes, preset, repeats; see the estimate; launch |
| `/runs/:id` | Run detail | read one output next to the video and its metrics; rate it |
| `/batches/:id` | Compare | read 2-4 outputs side by side, blind if enabled; rate each |
| `/dashboard` | Dashboard | decide which model wins: table + two scatters + filters + export |
| `/prompts` | Prompts | edit prompt text; every edit creates a new version |

## Responsive
Usable at 400 px: navigation becomes a top bar, Compare stacks outputs vertically with a sticky
model chip, tables scroll horizontally inside their own container, video keeps `max-width:100%`.
Never horizontal page scroll.

## Generic-AI tells to avoid (from the frontend-design skill)
- Warm cream ground with a high-contrast serif and a `#D97757`-style terracotta accent.
- Near-black ground with a single acid-green or vermilion accent.
- Broadsheet layouts: hairline-only, zero radius, newspaper columns.
- The SaaS card kit: identical rounded cards, same radius on everything, one soft grey shadow
  under each, gradient washes.
- Template chrome: all-caps tracked eyebrows, middle-dot meta strings, `WORD — fragment` labels,
  tinted near-black `#0B0B0B`, monospace data labels, arrows appended to buttons.
- Accenting one word of a headline, numbered markers on content that is not a sequence,
  fade-and-slide entrances on every section, hover transitions on every card.

## Screenshot review checklist (for the `ui-reviewer` agent)
1. Page title in Bricolage Grotesque, everything else Instrument Sans; no all-caps labels.
2. Only clay as accent; court/signal/fault appear only as status.
3. Tables: tabular numbers, right-aligned numeric columns, units in headers.
4. Charts: provider colours match chips; axes labelled with units; tooltips show n.
5. Status chips consistent across Library, Run detail, Compare, Dashboard.
6. Empty, loading and error states present on every data view.
7. 400 px: no horizontal page scroll, navigation collapses, Compare stacks.
8. Keyboard: visible focus rings, stars operable by keys, dialogs trap focus.
9. Console: zero errors, zero failed requests.
10. None of the generic-AI tells above.
