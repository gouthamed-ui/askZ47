# AskUs — Layout Breakdown
> **Source:** https://askus.dixonbaxi.com/
> **Date captured:** 2026-06-03

---

## Overview

Single-page, full-viewport AI chat interface built by DixonBaxi.  
Two primary visual states (Landing and Active) with a minimal, high-contrast aesthetic and animated transitions.

---

## STATE 1 — Landing / Idle

**Background:** White `#ffffff`

### Header
- Top-right corner: hamburger menu button (`=` two-line icon)
- Position: `top: ~16px; right: ~24px`
- No logo or wordmark visible in the header

### Hero (vertically + horizontally centered in viewport)
- Large heading: **"Ask us anything."**
  - `"Ask"` — semibold weight, dark charcoal (`~#2d2d2d`)
  - `"us"` — regular weight, same color (slightly lighter visually)
  - `"anything."` — light gray (`~#999999`), lighter weight
  - Font: geometric sans-serif with a monospaced character feel (likely GT America or a custom DixonBaxi typeface)
  - Size: ~60–80px
- Below heading: a **rotating subtitle** in small dark text (animates through phrases):
  - "Anything that comes to mind."
  - "Even a random thought."
  - (likely more — cycling ticker animation)
- A small `→` arrow below the subtitle, low opacity, acts as a visual CTA hint

**The entire landing area is a single `<button>`** — clicking anywhere triggers the Active state.

### Footer
- Bottom-center, small gray caption text (~12px, `~#aaaaaa`):
  > *"Responses are shaped by our published content, so they may not always be fully accurate."*
- Inline **"Terms"** hyperlink (`href="/terms"`)

---

## STATE 2 — Active / Input Mode

**Background:** Mint / light green (`~#b8f0b0` / approx `hsl(120, 70%, 84%)`)  
Full-viewport background color transition from white → green on activation.

### Layout (centered)
- Small label text at top-center: *"Anything that comes to mind."* — small, dark, sans-serif
- A **centered text input** — borderless, fully transparent background, blends into green
  - Only a blinking cursor is visible until the user types
  - Appears to be a growing/multi-line `<textarea>` or auto-expanding `<input>`
  - Width: ~300px, horizontally centered
- A `→` **submit button** below the input, minimal arrow style

### Input Field Behaviour
- No visible border or box shadow
- Background: transparent (inherits green from page)
- Cursor: text cursor only
- Placeholder: `"Ask a question"`
- Submit via: `→` button or Enter key

---

## STATE 3 — Menu Open (Dropdown)

A small **white card/popover** appears top-right near the hamburger icon:
- Background: white, subtle elevation (shadow or border)
- Padding: ~16–20px
- Links stacked vertically, uppercase, small font (~13–14px):
  - **PRIVACY** → `/privacy`
  - **TERMS** → `/terms`
  - **DIXONBAXI ↗** → `https://dixonbaxi.com` (external)
- Closes on: Escape key or clicking outside

---

## DOM / Component Structure

```html
<body>
  <!-- Accessibility -->
  <a href="#main-content">Skip to main content</a>

  <!-- Top-right hamburger -->
  <button aria-label="Open menu">≡</button>

  <!-- Menu dropdown (conditionally rendered) -->
  <nav>
    <a href="/privacy">PRIVACY</a>
    <a href="/terms">TERMS</a>
    <a href="https://dixonbaxi.com" target="_blank">DIXONBAXI ↗</a>
  </nav>

  <main id="main-content">

    <!-- ACTIVE STATE: input form -->
    <p class="subtitle">Anything that comes to mind.</p>
    <form>
      <textarea placeholder="Ask a question"></textarea>
    </form>
    <button type="button" aria-label="Submit message">→</button>

    <!-- LANDING STATE: full-screen CTA button -->
    <button aria-label="Start a conversation - click or press Enter to type your question">
      <h1>
        <span class="word-ask">Ask</span>
        <span class="word-us">us</span>
        <span class="word-anything">anything.</span>
      </h1>
      <p class="rotating-subtitle">Even a random thought.</p>
      <p class="disclaimer">
        Responses are shaped by our published content, so they may not always be fully accurate.
        <a href="/terms">Terms</a>
      </p>
    </button>

    <!-- Stop button: shown during AI streaming response -->
    <button aria-label="Stop Claude">Stop</button>

  </main>
</body>
```

---

## Design Tokens

| Token | Value |
|---|---|
| Background — idle | `#ffffff` |
| Background — active | `~#b8f0b0` (mint green) |
| Heading "Ask / us" color | `~#2d2d2d` |
| Heading "anything." color | `~#999999` |
| Footer caption color | `~#aaaaaa` |
| Input border | none (transparent) |
| Submit button | Small `→` arrow, low opacity |
| Menu card bg | `#ffffff` |
| Menu link style | Uppercase, ~13px, dark |
| Font family | Geometric sans-serif (GT America or custom) |
| Heading size | ~60–80px |
| Subtitle size | ~13–14px |
| Footer size | ~12px |
| Transition | Full-bg color fade: white → mint green |
| Viewport | Full screen, centered content |

---

## Interaction Notes

- **Click anywhere** on the landing screen → triggers transition to active/input state
- **Background animates** from white to mint green (CSS transition likely on `background-color`)
- **Subtitle rotates** through multiple prompts (JS ticker / CSS animation)
- **Input is auto-focused** after the transition
- **"Stop Claude"** button appears during streaming AI response generation
- **Pressing Escape** or clicking outside the menu closes the dropdown
- **Enter key** submits the question (same as clicking `→`)

---

## Pages / Routes

| Route | Description |
|---|---|
| `/` | Main chat interface |
| `/privacy` | Privacy policy |
| `/terms` | Terms of use |
| `https://dixonbaxi.com` | Parent brand site (external) |

---

*Layout documented by Claude — askus.dixonbaxi.com — 2026-06-03*
