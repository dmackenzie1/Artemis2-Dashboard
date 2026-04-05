# Artemis 2 Dashboard — Shared UI Design Guidance (Single Source of Truth)

This artifact is the canonical UI guidance for the Artemis 2 mission intelligence client. It centralizes:

1. **Design Intent / Visual North Star**
2. **Implementation Intent / Execution Guidance**
3. **Shared Loading / Waiting / Alerting System**

Use this document as the primary in-repo reference when making any dashboard UI change.

---

## Part 1 — Design Intent / Visual North Star

### 1) Product character

The Artemis 2 dashboard UI is an **operator-facing mission intelligence console**.

It must feel like a **premium mission-control system**:
- cinematic
- technical
- dense
- readable

It is explicitly **not**:
- a marketing page
- a generic admin dashboard
- a playful sci-fi demo

### 2) Visual goal (reference fidelity)

The target look should closely follow the primary reference:
- `reference/dashboard-idea-dashboard.png`

Supporting visual references:
- all other images in `reference/`

Aesthetic target:
- deep navy / near-black space backdrop
- Earth/globe curvature in background composition
- subtle starfield/atmosphere/texture overlays
- translucent dark panel surfaces
- thin luminous cyan-blue borders
- soft glow and layered glass depth
- elegant technical typography
- high information density in a compact layout

### 3) Unified panel language

All panes/cards/windows share one visual language:
- translucent dark surface
- slightly blurred, glass-like feel
- thin cool-blue border
- restrained outer glow
- restrained corner radius
- technical header styling
- luminous dividers/separator lines

No pane should invent a disconnected visual style.

### 4) Typography intent

- Primary UI typography: clean, modern sans-serif for headings and interface chrome.
- Secondary/system typography: monospace for logs, console output, and loading/system microcopy where useful.
- Strong hierarchy with clear size/weight contrast.
- Optional uppercase micro-labels for compact section chrome.
- Text color should be off-white (not pure #FFF).

### 5) Layout intent

The dashboard should remain a fixed mission console layout:
- avoid large full-page scrolling
- major panes scroll internally
- left/center area = primary intelligence content
- right rail = compact supporting system panes
- bottom strip = mission-wide histogram/long-range activity

### 6) Experience goals

- fast operator scanning under pressure
- premium visual quality without gimmicks
- trust through clarity and consistency
- readability under dense information conditions
- polished, restrained motion and effects

---

## Part 2 — Implementation Intent / Execution Guidance

This section defines how to apply the visual direction safely to the existing application.

### Guardrails (must keep)

- UI-only transformation
- preserve existing functionality
- preserve current data flow
- preserve routes and behavior
- avoid risky large rewrites
- make incremental, testable changes

### 1) Use reference images before styling changes

Before implementing visual changes:
1. inspect `reference/`
2. align first to `reference/dashboard-idea-dashboard.png`
3. use other reference images for spacing/layout/hierarchy variations

### 2) Establish global visual tokens first

Introduce or standardize shared tokens (or equivalents) before pane-specific tweaks:
- color palette
- panel surfaces
- border styles
- glow/shadow recipes
- typography roles
- spacing scale
- divider styles
- scroll styling
- loading/alert state styling

Implementation preference:
- central token source first
- pane-level overrides only when necessary

### 3) Unify panel styling through shared primitives

All major panes should inherit from shared panel primitives/utilities instead of custom one-off CSS.

Expected outcome:
- cohesive appearance
- lower regression risk
- faster visual iteration

### 4) Keep Overview behavior functionally the same

Restyle the existing Overview experience without changing behavior contracts:
- same data lifecycle
- same interactions
- same route behavior

### 5) Preserve the main structure

Maintain current mission-operator layout logic:
- Mission Summary = hero intelligence panel
- Last 24 Hours = major supporting panel
- Stats = narrow support rail pane
- Mission Query Console = compact right-side console
- Bottom histogram = mission-wide activity strip

### 6) Reduce visual noise

Prefer polished, signal-forward UI:
- remove non-essential helper copy
- remove duplicate/redundant panels
- remove unnecessary bottom clutter
- integrate connectivity state subtly into top chrome

### 7) Enforce internal scrolling

Each large pane should handle overflow internally to preserve fixed-console composition.

### 8) Stay close to the reference spirit

Even when exact DOM/layout differs, preserve:
- atmosphere
- density
- panel styling language
- glow treatment
- background treatment
- hierarchy clarity
- overall elegance

### Delivery strategy for implementers

Recommended order:
1. tokens/foundation
2. shared panel primitives
3. shell/background/chrome
4. pane-by-pane restyle
5. loading/alert unification
6. pass for visual noise cleanup and spacing polish

Validate at each step with small, testable commits.

---

## Part 3 — Shared Loading / Waiting / Alerting System

Create a shared client-side loading and status language used across all panes.

### System goals

- loading feels intentional and premium
- waiting states match mission-control styling
- no awkward blank pane regions
- readiness/alerts feel integrated with the same UI language

### 1) Shared waiting indicator component

Create a reusable loading indicator component family usable in any pane.

Preferred implementation:
- lightweight SVG-based animation (or equivalent scalable approach)
- subtle, technical motion language
- dark-background compatible
- compact enough for cards/panels
- communicates “processing/acquiring signal”

Good directions:
- orbital ring motion
- radar sweep pulse
- scanning grid
- waveform activity trace
- concentric signal circles
- beacon sweep or tiny satellite-style motion
- compact activity bars with cyan glow

Avoid:
- default browser spinner
- consumer app throbbers
- cartoon/novelty animations
- oversized animation blocks
- high-frequency/noisy motion

### 2) Loading variants (single shared API)

Support at least:
- **pane loading**: full-pane waiting state
- **inline loading**: small inline updates
- **console thinking**: query/LLM generation state
- **pipeline/building**: ingestion/indexing/build state
- **refreshing**: minor background refresh without pane takeover

### 3) Loading text treatment

Allow optional companion messages, e.g.:
- Loading mission summary…
- Building daily snapshot…
- Querying relevant utterances…
- Updating mission histogram…
- Waiting for pipeline readiness…

Text style requirements:
- understated
- compact
- technical
- optional monospace variant for system messaging

### 4) Shared readiness/alert badges

Standardize status indicators for:
- ready
- loading
- partial
- building
- degraded
- error
- connected
- disconnected

Badge style:
- subtle dot+label or icon+label
- low-noise but clearly readable
- restrained, meaningful color semantics
- consistent shape/spacing across panes

### 5) Empty / partial / waiting / error pane states

Every pane must gracefully represent:
- initial empty
- waiting for data
- partial data
- fully ready
- error/unavailable

No pane should collapse into an unstyled blank area.

### 6) Panel-level skeleton language

Where useful, provide matching skeletons for:
- text lines
- metric rows/cards
- chart placeholders
- console response rows

Skeleton style:
- dark navy base
- subtle cyan-blue shimmer
- gentle pulse (not aggressive)

### 7) Motion guidelines

Animation should be:
- smooth
- subtle
- low-frequency
- premium
- restrained

Do not over-animate, distract, or gamify the interface.

### 8) Implementation goal (cross-client consistency)

Adopt the shared loading/alert system as common client infrastructure so pane behavior is consistent during:
- startup
- polling
- incremental refresh
- query execution
- pipeline catch-up
- partial readiness

---

## Acceptance checklist for future UI changes

A UI update is aligned only if all are true:
- It preserves the mission-control visual character.
- It remains functionally equivalent unless an explicit product change was requested.
- It uses shared tokens/primitives instead of one-off styles.
- It includes consistent loading/empty/error/readiness behavior.
- It keeps layout density and readability aligned with reference intent.
- It avoids introducing playful/non-technical motion patterns.

