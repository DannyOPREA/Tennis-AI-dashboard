# Tennis AI Playground — design notes

## Brief

An internal evaluation bench for two people: a French tennis entrepreneur and a
professional coach. They upload a short video of a junior player, send it through
several vision models (Gemini through the API, open-weight models through Ollama on
a local GPU), read the French coaching text each model wrote, rate it, and decide
which model wins on quality against cost and speed.

The primary job of the interface is **reading and judging text**. The coach will
spend most of their time inside the Compare view reading two to four paragraphs of
French side by side. Everything else (upload, run setup, dashboard) exists to feed
and summarise that moment. So the design optimises for long-form reading comfort,
honest metrics, and a quiet frame that never competes with the model output.

Single user, localhost, English copy in v1 (all strings live in `src/i18n/en.ts`).

## Colour scheme: light, deliberately

Light, not dark. The coach reads several hundred words of French per run, often in
daylight, and compares JPEG frames and video stills whose colours must not be
warped by a dark surround. A dark scheme reads as "developer console"; this is a
coaching tool that happens to run models. One scheme only in v1.

## Tokens

| Name | Hex | Role |
|---|---|---|
| Chalk | `#F6F7F5` | page ground, a cool off-white (the chalk line, not cream) |
| Card | `#FFFFFF` | reading surfaces, chart surfaces |
| Baseline | `#1F2421` | ink, deliberately green-grey black |
| Sideline | `#5F6662` | secondary ink (5.9:1 on white) |
| Net | `#DDE1DB` | hairline borders, gridlines |
| Terre battue | `#9E3B26` | the one accent: primary actions, focus ring, stars, "running" |

Terre battue is the red clay of Roland-Garros, darker and redder than the
generic terracotta (#D97757). It measures 6.8:1 on white so it can be used as text
and as a solid button ground; it is never used as a wash or gradient.

### Provider palette (categorical, validated)

Colour follows the provider entity everywhere: chips, scatter points, bars.
Validated with the dataviz validator, `--pairs all`, light surface `#ffffff`:
all five checks pass (worst pair ΔE 13.0 CVD, 16.3 normal, every mark ≥ 3:1).

| Provider | Hex |
|---|---|
| gemini | `#2A78D6` |
| ollama (local) | `#0D8F5F` |
| openai_compat | `#4A3AA7` |

Slot order is fixed; a provider keeps its hue when filters remove the others.

### Sequential (cost)

One hue, the accent's own ramp, light to dark: `#FBEDE8 → #F2CFC4 → #E3A08D →
#C86A4E → #9E3B26`. The timing split and token-breakdown bars use the darker
steps as fills; the cost cells in the summary table use only the three lightest
steps as a wash, because ink sits on top of them (the first build used the full
ramp and the darkest cells swallowed the numbers; fixed on the screenshot review).

### Status (reserved, always icon + label)

queued `#5F6662` · running `#9E3B26` (live dot) · done `#1F7A4D` · error `#B3261E`
· interrupted `#8A6100` · cancelled `#5F6662`. Status hues never appear on a
series.

## Typefaces

Two families, clearly distinct, both self-hosted through `@fontsource-variable`
so the tool works offline on the coach's laptop:

- **Bricolage Grotesque** (variable, 600) — page titles and the model name in a
  Compare column. Its wide, slightly irregular letterforms give the tool a
  personality without a serif.
- **Instrument Sans** (variable, 400/500/600) — everything else, including the
  markdown output. Metrics use `font-variant-numeric: tabular-nums` only in
  columns and metric strips, never on the large hero-ish numbers.

No monospace anywhere except the collapsible raw JSON panels (which really are
code).

### Type scale (rem, base 14px)

12 micro · 13 small · 14 body · 16 lead · 20 section · 26 title · 34 display.
Titles track `-0.01em`; body line-height 1.55; markdown output 15px / 1.65 with a
measure capped at 68ch.

## Layout

Left navigation rail (208px) with six destinations, health at the bottom. Below
860px the rail becomes a top bar with a sheet menu. Content is left-aligned on a
1280px max measure with 24px page padding (16px on phones).

```
┌──────────┬────────────────────────────────────────────────────┐
│ Tennis AI│  Page title                          [primary act] │
│          │  one-line description                              │
│ Library  │────────────────────────────────────────────────────│
│ New run  │                                                    │
│ Prompts  │   content                                          │
│ Dashboard│                                                    │
│          │                                                    │
│          │                                                    │
│ ● Gemini │                                                    │
│ ● Ollama │                                                    │
│ ● GPU    │                                                    │
└──────────┴────────────────────────────────────────────────────┘
```

Run detail:

```
┌────────────────────────────────┬──────────────────────────────┐
│ ← Batch 12   gemini-2.5-flash  │ Rating   ★★★★☆              │
│ frames · balanced · done        │ notes …                      │
├────────────────────────────────┤──────────────────────────────│
│ [ video player  ]              │ Timing  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮      │
│                                │         upload extract load  │
│ filmstrip  ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢     │ Tokens  text 1.2k  image 8k  │
├────────────────────────────────┤ Cost    $0.0042              │
│ Output (markdown, 68ch)        │ GPU     6.1 GB peak          │
│ …                              ├──────────────────────────────│
│                                │ ▸ raw usage  ▸ request       │
└────────────────────────────────┴──────────────────────────────┘
```

Compare (the one memorable element): the runs of a batch as full-height columns.
Each column has a pinned head (model chip, status, metrics strip) and a scrolling
body with the French output; the rating widget sits at the bottom of the head so
the coach rates while reading. In blind mode the head shows "Model A/B/C" in the
neutral ink and the provider colour is withheld; rating a run reveals it in place.

## Principles

1. The output text is the hero; chrome stays at or below 13px and grey.
2. Structure encodes information: borders separate columns of different runs,
   the only colour blocks are provider chips and status chips.
3. Numbers are honest: ms shown as s with one decimal above 1s, cost with four
   decimals under a cent, tokens with thousands separators, nulls as "—".
4. No motion except the running-status dot and user-triggered transitions;
   `prefers-reduced-motion` stops even that.
5. Empty states say what to do next; errors say what failed and how to fix it.

## Generic-AI tells avoided (review pass)

First-pass plan was reviewed against the frontend-design checklist and revised:

- Started with a warm cream ground and a terracotta accent — exactly tell #1.
  Changed the ground to cool chalk (`#F6F7F5`) and pushed the accent to a
  darker, redder clay that passes text contrast.
- Had Geist (shadcn default) as the only face. Replaced with Instrument Sans plus
  Bricolage Grotesque for titles so the tool is not visually interchangeable with
  every shadcn dashboard.
- Removed ALL-CAPS eyebrow labels from metric strips; metric labels are sentence
  case at 12px in Sideline grey.
- Meta lines never join with middle dots; they use a 12px gap and separate spans.
- No monospace for metric values; tabular figures of the sans instead.
- Not every surface is a card. Library uses cards (it is a grid of things); Compare
  uses hairline-separated columns; Run detail uses two plain panels; the dashboard
  table is a table.
- One radius per role: cards 10px, inputs 6px, chips full round.
- No shadow except on popovers/sheets; no gradient anywhere; no hover lift on cards.
- Charts: thin marks, hairline solid grid, legend always present for provider,
  a table view under every chart (the summary table is that view), hover tooltips
  with the value leading and the model name following, empty state with guidance.
