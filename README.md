# Make-A-Ton 9.0 · Odoo × Make-A-Ton Kochi Hackathon

> Official website for **Make-A-Ton 9.0**, South India's premier hackathon organized by **CITTIC, CUSAT** in collaboration with **Odoo India**. Featuring an 8-hour virtual round, a 24-hour in-person finale at CUSAT Kochi, and a ₹1,05,000 prize pool.

---

## 🎨 Theme & Aesthetic

Built with a bespoke **Pop-Art / Comic Book** visual identity:
- **Bold Inking & Hard Shadows**: Thick solid borders (`var(--line) solid var(--ink)`) with hard isometric drop shadows (`box-shadow: 8px 8px 0 var(--ink)`).
- **Custom Typography**: `Bangers` (display headings), `Titan One` (caution tapes & labels), `Space Grotesk` (body text), and `Space Mono` (milestones & metadata).
- **Vibrant Palette**: Curated brand colors including Electric Yellow (`#FFE23A`), Vivid Blue (`#437AEC`), Punch Pink (`#F57EB4`), Mint Green (`#22AC5F`), Cream Paper (`#FFF8EE`), and Solid Ink (`#0C0E0F`).
- **Zero Heavy Frameworks**: Pure semantic HTML5, modern CSS3 variables & animations, and Vanilla JavaScript.

---

## 🚀 Key Sections & Features

1. **Hero** (`#top`):
   - Comic-page grid: a red sunburst title panel (wordmark, tagline, Register CTA), a blue art panel, and a fact strip.
   - Art panel: a retro CRT whose terminal types itself (`idea.exe` → `opportunity.exe`), a sticky note, a burst sticker, a steaming mug and the interactive red mascot, all drifting with the pointer (parallax).
   - Fact strip: date and venue, a registration countdown that counts to opening day and then to the deadline, and the ₹1,05,000 prize pool.
   - Caution tape marquee along the bottom. On phones the panels stack: title and CTA, countdown, facts, then the art.
   - Register buttons open `data-register-url` in a new tab once it is filled in.

2. **About Make-A-Ton & CITTIC** (`#about`):
   - Blue halftone ground (continuing the hero's dot texture) with two ink-bordered comic panels: yellow Make-A-Ton and paper CITTIC, headings aligned on a shared dashed rule.
   - The green mascot peeks out of the CITTIC panel's corner.

3. **About Odoo Hackathon** (`#odoo`) and **HackForCUSAT** (`#hackforcusat`):
   - Odoo sits on purple (Odoo's own colour) with tone-on-tone squiggles; HackForCUSAT on the mascot green with tone-on-tone asterisks.
   - Paper story cards with hard ink shadows; yellow caution tapes stitch each section boundary.

4. **Interactive Storybook Timeline** (`#timeline`):
   - Scroll-driven 5-chapter interactive comic book interface.
   - Chapter progression across Registration, Deadline, Virtual Round (8h), Results & Kochi Final.
   - High-resolution comic artwork panels, speech dialogue bubbles, and official verification seals.

5. **The Victory Loot / Prizes** (`#prizes`):
   - Dynamic 3-tier fan-out podium (-3.5° 2nd Place Silver, 1.06x Gold Champion with spinning sunburst rays, +3.5° 3rd Place Bronze).
   - Animated count-up counters calculating prize pool amounts upon viewport intersection.

6. **Interactive Animated Mascots (Red & Green)**:
   - 10 total vectorized mascot characters in both **Red** (`#EF0808`) and **Green** (`#22AC5F`) themes across 5 distinct comic expressions: *Cheer, Excited, Star-Eyes, Cool, and Curious*.
   - **25% Peeking Placement**: Mascots peek in from section edges and corners (~25% concealed outside boundaries), springing fully into frame on hover.
   - **Rapid Expression Flipbook**: Hovering any mascot triggers rapid stop-motion cycling through all expressions; clicking triggers a cartoon burst, randomized comic quip ("POW!", "100K+ BAG!", "FAST-TRACK!"), and Red/Green color toggle.
   - **Subtle Idle Double-Take**: Background idle loop triggers occasional winks/double-takes across on-screen mascots.

6b. **Mascot Arcade** (easter egg):
   - Tap any mascot to open it. `js/games.js` and `css/games.css` load on first open only.
   - **Flap-a-Ton**: a hand-drawn winged star flaps through caution-tape pillars (tap, click or Space).
   - **Whack-a-Ton**: 30 seconds of tapping mascots as they pop up (cool ones +3, bombs −3, keys 1–9 work too).
   - Play as red or green; best scores stay in the browser (`localStorage`); synth sound effects with a mute toggle.

7. **Frequently Asked Questions** (`#faq`):
   - Accessible interactive accordion items with expandable answers.

8. **Site Navigation & Footer**:
   - Scroll-aware header that reveals as you scroll past the hero.
   - Fully responsive mobile drawer menu.

---

## 📁 Directory Structure

```
final-makeaton/
├── index.html              # Main website entry point
├── css/
│   ├── base.css            # Design tokens, reset, typography, cards, peeker mascots
│   ├── hero.css            # Hero comic-page grid, terminal art, countdown, marquee
│   ├── sections.css        # About, Odoo, Prizes, FAQ, Footer styles
│   └── timeline.css        # Interactive storybook timeline styles
├── js/
│   ├── main.js             # Nav observer, hero parallax & terminal, countdown, marquees, prize count-up, mascots
│   └── timeline.js         # Interactive book flip logic, chapter tabs & controls
├── assets/
│   ├── favicon.svg         # Favicon icon
│   ├── logo.svg            # Site navigation brand logo
│   ├── logo-hero.svg       # High-resolution hero title logo
│   ├── mascot/             # Red & Green mascot SVGs (Cheer, Cool, Curious, Excited, Star-Eyes)
│   ├── star_pattern.svg    # Hero SVG dense star tile
│   ├── shapes/             # Comic badges, bursts, stickers, and icons
│   └── timeline/           # Story panels (1–5) and timeline artwork
├── docs/                   # Design assets, markdown exports, and reference files
│   ├── design_ton/         # Reference design sandbox
│   ├── mascot-green/       # Raw green vector components
│   ├── mascot-red/         # Raw red vector components
│   ├── prizes-animation-specs.md
│   └── timeline-story-export.md
├── README.md               # Project documentation
└── .gitignore              # Git ignore rules
```

---

## 💻 Local Development

Run any static HTTP server from the project root:

```bash
# Python 3
python3 -m http.server 8181

# Node (npx)
npx serve .
```

Open [http://localhost:8181](http://localhost:8181) in your browser.

---

## 🌿 Git Branching

- **`main`**: Production release branch.
- **`updates`**: Active development and design iteration branch.

