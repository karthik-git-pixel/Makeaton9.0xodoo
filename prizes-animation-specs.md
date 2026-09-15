# Prizes Section Animation & Rotating Badge Technical Specifications

> **File:** `prizes-animation-specs.md`  
> **Source Components:** [`BountyVault.tsx`](file:///Users/kishanr/base/updated-2-ton/src/site/sections/BountyVault.tsx), [`BountyVault.css`](file:///Users/kishanr/base/updated-2-ton/src/site/sections/BountyVault.css)  
> **Animation Libraries:** Native CSS Keyframes, CSS Transforms & Gradients, Framer Motion (`motion.article`, `motion.span`, spring physics)

---

## 1. Overview & Architecture

The Prizes section (**The Bounty Vault // The Victory Loot**) uses an indie comic book visual theme. It blends **continuous CSS keyframe loops** (infinite conic spinning and jagged speech burst wobbling), **slanted static comic transforms**, and **Framer Motion spring physics** (radial arc fan-out podium entry and rank badge pop-ups).

```
+-------------------------------------------------------------------------+
| .bounty-section (Relative container, dots background, hidden overflow)  |
|                                                                         |
|   +-------------------------------------------------------------------+ |
|   | .bounty-header                                                    | |
|   |   .bounty-kicker-badge (rotate(-1.5deg) + .bounty-kicker-pulse)   | |
|   |   .bounty-title (rotate(-1.5deg), 3D text shadow & stroke)        | |
|   +-------------------------------------------------------------------+ |
|                                                                         |
|   +-------------------------------------------------------------------+ |
|   | .bounty-podium (3-Column Grid with Radial Arc Fan-Out)            | |
|   |                                                                   | |
|   |   [2ND PLACE CARD]        [1ST PLACE CARD]      [3RD PLACE CARD]  | |
|   |   - Rotate: -3.5deg       - Scale: 1.05, y: -22 - Rotate: +3.5deg | |
|   |   - Origin: btm-right     - Conic Sunburst Spin - Origin: btm-left| |
|   |                           - "JACKPOT!" Wobble                     | |
|   |                           - Trophy & Gold Aura                    | |
|   +-------------------------------------------------------------------+ |
+-------------------------------------------------------------------------+
```

---

## 2. CSS Keyframes, Classes & Rotation Loop Effects

### 2.1. Infinite Conic Sunburst Rotation (`bounty-spin-slow`)
Used behind the **1st Place Grand Champion Card** to create an authentic retro comic energy ray seal that spins continuously in the background.

#### CSS Keyframe Definition
```css
@keyframes bounty-spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

#### Sunburst Class & Styling
```css
.bounty-card__sunburst {
  position: absolute;
  inset: -50%;
  width: 200%;
  height: 200%;
  pointer-events: none;
  opacity: 0.18;
  background: repeating-conic-gradient(
    from 0deg,
    #000000 0deg 15deg,
    transparent 15deg 30deg
  );
  animation: bounty-spin-slow 40s linear infinite;
  z-index: 1;
}
```

#### Key Mechanics for Smoothness:
- **Geometry Compensation (`inset: -50%`, `width: 200%`, `height: 200%`):** Ensures that when the element rotates around its center, the diagonal corners never expose empty gaps inside the rectangular card bounds.
- **Parent Clipping:** Parent `.bounty-card` has `overflow: hidden; border-radius: 12px;` so the spinning oversized square is masked into a rounded card container.
- **`linear` Easing & 40s Period:** Constant angular velocity without acceleration bumps or pausing at the 360°/0° loop transition.
- **`pointer-events: none;`:** Ensures mouse interactions (hovering, selection) pass cleanly through to the card content.

---

### 2.2. Comic Speech Burst "JACKPOT!" Badge Wobble (`bounty-wobble`)
An explosive 16-point comic starburst badge floating over the top-right corner of the Grand Champion card that breathes and tilts.

#### CSS Keyframe Definition
```css
@keyframes bounty-wobble {
  0%, 100% {
    transform: rotate(12deg) scale(1);
  }
  50% {
    transform: rotate(8deg) scale(1.06);
  }
}
```

#### Jackpot Burst Class & Styling
```css
.bounty-jackpot-burst {
  position: absolute;
  top: -14px;
  right: -12px;
  z-index: 20;
  background: #FF0055;
  color: #FFFFFF;
  font-family: var(--font-comic, 'Bangers', cursive, sans-serif);
  font-size: 19px;
  letter-spacing: 0.08em;
  padding: 6px 16px;
  border: 3px solid #000000;
  box-shadow: 4px 4px 0px #000000;
  transform: rotate(12deg);
  clip-path: polygon(
    0% 20%, 15% 0%, 35% 15%, 50% 0%, 65% 18%, 85% 2%, 100% 25%,
    92% 50%, 100% 75%, 85% 95%, 65% 82%, 50% 100%, 35% 85%, 15% 98%,
    0% 80%, 10% 50%
  );
  animation: bounty-wobble 2.5s infinite ease-in-out;
}
```

#### Key Mechanics for Smoothness:
- **Zero Heavy Asset Overhead:** Uses a CSS `polygon()` clip-path to generate a sharp 16-point jagged starburst contour without requiring SVG rendering engines.
- **Layer Stacking (`z-index: 20`):** Higher than `.bounty-card__body` (`z-index: 3`) and card halftone overlay (`z-index: 1`), allowing it to break outside the card's top and right borders.
- **Subtle Angular Amplitude (8° to 12°):** 4-degree oscillation paired with a 6% scale change (`scale(1.06)`) simulates an organic, pulsing comic "shout" effect without causing visual motion sickness.

---

### 2.3. Pulsing Header Kicker Indicator (`bounty-pulse`)
A pulsing comic radar dot inside the tilted kicker badge.

#### CSS Keyframe & Class
```css
.bounty-kicker-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border: 2px solid #000000;
  border-radius: 999px;
  background: #FFE600;
  color: #000000;
  font-family: var(--font-mono, monospace);
  font-size: clamp(11px, 1vw, 12.5px);
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  transform: rotate(-1.5deg);
  box-shadow: 3px 3px 0px #000000;
  margin-bottom: 6px;
  white-space: nowrap;
}

.bounty-kicker-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #FF0055;
  box-shadow: 0 0 0 2px #000000;
  animation: bounty-pulse 1.4s infinite ease-in-out;
}

@keyframes bounty-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.4);
    opacity: 0.7;
  }
}
```

---

## 3. Framer Motion Spring Rotations & Podium Fan-Out Arc

The 3-card layout arranges cards in a **radial arc fan-out** formation (left card tilted outward left, right card tilted outward right, center card elevated and upright).

```
   [2nd Place]          [1st Place (Champion)]          [3rd Place]
  rotate(-3.5deg)             rotate(0deg)             rotate(+3.5deg)
  translateY(+30px)          translateY(-22px)         translateY(+30px)
        \                          |                          /
         \                         |                         /
          ` - - - - - - - - (Radial Fan-Out Arc) - - - - - -`
```

### 3.1. Motion Variants Configuration

```typescript
// 1. Left Card: 2nd Place (1st Runner-Up)
const leftCardVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 70, rotate: -7 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 30,
    rotate: -3.5,
    transition: {
      type: 'spring' as const,
      stiffness: 220,
      damping: 18,
      delay: 0.1,
    },
  },
};

// 2. Center Card: 1st Place (Grand Champion)
const centerCardVariants = {
  hidden: { opacity: 0, scale: 0.85, y: -60, rotate: 0 },
  visible: {
    opacity: 1,
    scale: 1.05,
    y: -22,
    rotate: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 220,
      damping: 18,
      delay: 0.2,
    },
  },
};

// 3. Right Card: 3rd Place (2nd Runner-Up)
const rightCardVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 70, rotate: 7 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 30,
    rotate: 3.5,
    transition: {
      type: 'spring' as const,
      stiffness: 220,
      damping: 18,
      delay: 0.3,
    },
  },
};

// 4. Staggered Rank Pill Badges Spring Pop
const createBadgePopVariants = (delay: number) => ({
  hidden: { opacity: 0, scale: 0.6, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 260,
      damping: 15,
      delay: delay + 0.12,
    },
  },
});

const leftBadgeVariants = createBadgePopVariants(0.1);
const centerBadgeVariants = createBadgePopVariants(0.2);
const rightBadgeVariants = createBadgePopVariants(0.3);
```

### 3.2. Transform Origins for Natural Arc Pivots

In `BountyVault.css`, specific `transform-origin` rules are assigned to each card so they fan out realistically like a hand of physical playing cards:

```css
/* 2nd Place: Tilts anchored to bottom right */
.bounty-card--second {
  transform-origin: bottom right;
}

/* 1st Place: Centers on the podium */
.bounty-card--first {
  transform-origin: center center;
}

/* 3rd Place: Tilts anchored to bottom left */
.bounty-card--third {
  transform-origin: bottom left;
}
```

---

## 4. Complete Component & JSX Hierarchy

```tsx
import { motion } from 'framer-motion';
import { Trophy, Zap, Award, Sparkles, Gift, Briefcase, Star } from 'lucide-react';
import './BountyVault.css';

export default function BountyVault() {
  return (
    <section className="bounty-section" id="bounty" aria-labelledby="bounty-title">
      {/* 1. Background Dot Grid Halftone */}
      <div className="bounty-section__dots" aria-hidden="true" />

      <div className="bounty-section__inner">
        {/* 2. Section Header */}
        <header className="bounty-header reveal">
          {/* Tilted Kicker Pill */}
          <div className="bounty-kicker-badge">
            <span className="bounty-kicker-pulse" aria-hidden="true" />
            REWARD POOL // ₹1,05,000+
          </div>

          {/* 3D Inked Comic Headline */}
          <h2 className="bounty-title" id="bounty-title">
            THE VICTORY LOOT
          </h2>

          <p className="bounty-subtitle">
            Ship the winning build. Claim the bag. Sponsored by Odoo &amp; CUSAT.
          </p>

          <div className="bounty-rule" aria-hidden="true" />
        </header>

        {/* 3. 3-Card Comic Podium */}
        <div className="bounty-podium">
          {/* ---------------- 2ND PLACE CARD ---------------- */}
          <motion.article
            className="bounty-card bounty-card--second"
            variants={leftCardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            whileHover={{ y: 16, scale: 1.025, rotate: -1.5 }}
          >
            <div className="bounty-card__halftone" aria-hidden="true" />

            <div className="bounty-card__body">
              <div className="bounty-card__header-top">
                <motion.span
                  className="bounty-badge bounty-badge--second"
                  variants={leftBadgeVariants}
                >
                  🥈 2ND PLACE // 1ST RUNNER-UP
                </motion.span>
                <Award className="bounty-trophy-icon" style={{ color: '#0284C7' }} />
              </div>

              <div className="bounty-amount-wrap">
                <span className="bounty-amount-label">Bounty Check</span>
                <h3 className="bounty-amount">₹35,000/-</h3>
              </div>

              <p className="bounty-card-desc">
                Silver Tier Build + Swag &amp; Sponsor Bounty
              </p>

              <div className="bounty-perks">
                <div className="bounty-perk-item">
                  <Briefcase className="bounty-perk-icon" />
                  <span>Odoo Direct Interview Slots</span>
                </div>
                <div className="bounty-perk-item">
                  <Gift className="bounty-perk-icon" />
                  <span>Exclusive Runner-Up Merch Kit</span>
                </div>
              </div>
            </div>
          </motion.article>

          {/* ---------------- 1ST PLACE (GRAND CHAMPION) ---------------- */}
          <motion.article
            className="bounty-card bounty-card--first"
            variants={centerCardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            whileHover={{ y: -32, scale: 1.08 }}
          >
            {/* Infinite Spinning Background Conic Seal */}
            <div className="bounty-card__sunburst" aria-hidden="true" />
            <div className="bounty-card__halftone" aria-hidden="true" />

            {/* Wobbling Speech Burst "JACKPOT!" Badge */}
            <div className="bounty-jackpot-burst" aria-hidden="true">
              JACKPOT!
            </div>

            <div className="bounty-card__body">
              <div className="bounty-card__header-top">
                <motion.span
                  className="bounty-badge bounty-badge--first"
                  variants={centerBadgeVariants}
                >
                  🏆 1ST PLACE // GRAND CHAMPION
                </motion.span>
                <Trophy className="bounty-trophy-icon" style={{ color: '#000000' }} />
              </div>

              <div className="bounty-amount-wrap">
                <span className="bounty-amount-label">Grand Prize Bag</span>
                <h3 className="bounty-amount bounty-amount--champion">₹45,000/-</h3>
              </div>

              <p className="bounty-card-desc">
                The Crown Jewel Build &bull; Winner Trophy &bull; Direct Job &amp; Internship Fast-Track
              </p>

              <div className="bounty-perks">
                <div className="bounty-perk-item bounty-perk-item--featured">
                  <Zap className="bounty-perk-icon" />
                  <span>Direct Fast-Track Interviews with Odoo</span>
                </div>
                <div className="bounty-perk-item">
                  <Sparkles className="bounty-perk-icon" />
                  <span>Grand Champion Trophy &amp; Winner Kits</span>
                </div>
                <div className="bounty-perk-item">
                  <Star className="bounty-perk-icon" />
                  <span>Incubation &amp; Cloud Credits Support</span>
                </div>
              </div>
            </div>
          </motion.article>

          {/* ---------------- 3RD PLACE CARD ---------------- */}
          <motion.article
            className="bounty-card bounty-card--third"
            variants={rightCardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            whileHover={{ y: 16, scale: 1.025, rotate: 1.5 }}
          >
            <div className="bounty-card__halftone" aria-hidden="true" />

            <div className="bounty-card__body">
              <div className="bounty-card__header-top">
                <motion.span
                  className="bounty-badge bounty-badge--third"
                  variants={rightBadgeVariants}
                >
                  🥉 3RD PLACE // 2ND RUNNER-UP
                </motion.span>
                <Award className="bounty-trophy-icon" style={{ color: '#16A34A' }} />
              </div>

              <div className="bounty-amount-wrap">
                <span className="bounty-amount-label">Bounty Check</span>
                <h3 className="bounty-amount">₹25,000/-</h3>
              </div>

              <p className="bounty-card-desc">
                Bronze Tier Build + Exclusive Goodies
              </p>

              <div className="bounty-perks">
                <div className="bounty-perk-item">
                  <Gift className="bounty-perk-icon" />
                  <span>Exclusive Goodies &amp; Swag Bag</span>
                </div>
                <div className="bounty-perk-item">
                  <Award className="bounty-perk-icon" />
                  <span>Certificate of Excellence &bull; CITTIC</span>
                </div>
              </div>
            </div>
          </motion.article>
        </div>
      </div>

      {/* Page Folio Corner Number */}
      <span className="bounty-section__folio" aria-hidden="true">
        04
      </span>
    </section>
  );
}
```

---

## 5. Wrapper Elements, Layering & Positioning Rules for Smoothness

To achieve 60fps rendering without jitter or edge tearing, the prizes cards adhere to four key structural principles:

### 5.1. Strict Z-Index Layer Stacking Hierarchy
```
z-index: 20  -->  .bounty-jackpot-burst (Breaks top-right border)
z-index: 10  -->  .bounty-card--first (Elevated above left & right sibling cards)
z-index: 3   -->  .bounty-card__body (Text, badges, amounts, perks)
z-index: 1   -->  .bounty-card__halftone & .bounty-card__sunburst
z-index: 0   -->  .bounty-section__dots background grid
```

### 5.2. Isolated Interaction & Paint Containment
- **`overflow: hidden;` on `.bounty-card`**: Ensures the $200\% \times 200\%$ spinning sunburst is clipped cleanly inside the 12px border-radius without leaking outside or causing horizontal page scroll.
- **`pointer-events: none;` on Graphic Layers**: Applied to `.bounty-card__sunburst`, `.bounty-card__halftone`, and `.bounty-section__dots` so they do not capture click/hover events intended for interactive elements.
- **Composite-Only Properties**: Keyframe animations use exclusively `transform` (`rotate()`, `scale()`) and `opacity`, allowing the GPU compositor thread to run animations smoothly without triggering DOM reflow/layout recalculations.

### 5.3. Mobile Responsive Adaptations (`< 900px`)
On mobile screens, cards stack vertically into a single column. The radial rotation angles are reset to $0^\circ$ to maintain readable text and prevent horizontal viewport overflow:

```css
@media (max-width: 899px) {
  .bounty-podium {
    grid-template-columns: 1fr;
    max-width: 480px;
    margin: 0 auto;
    padding: 10px 0;
  }

  .bounty-card--second {
    order: 2;
    transform: rotate(0deg) !important;
  }

  .bounty-card--first {
    order: 1;
    transform: rotate(0deg) !important;
  }

  .bounty-card--third {
    order: 3;
    transform: rotate(0deg) !important;
  }

  .bounty-jackpot-burst {
    top: -10px;
    right: 10px;
  }
}
```

---

## 6. Summary Matrix of Rotating & Animated Elements

| Element | Class / Component | Animation Type | Transform / Keyframe | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Conic Sunburst Seal** | `.bounty-card__sunburst` | Infinite CSS Spin | `@keyframes bounty-spin-slow`<br>`0deg -> 360deg` (40s linear) | Vintage spinning comic ray background for Grand Champion |
| **JACKPOT! Badge** | `.bounty-jackpot-burst` | Infinite CSS Wobble | `@keyframes bounty-wobble`<br>`rotate(12deg) scale(1)` $\leftrightarrow$ `rotate(8deg) scale(1.06)` (2.5s) | Explosive 16-point polygon speech burst |
| **Kicker Radar Dot** | `.bounty-kicker-pulse` | Infinite CSS Pulse | `@keyframes bounty-pulse`<br>`scale(1)` $\leftrightarrow$ `scale(1.4)` (1.4s) | Live radar dot in header pill |
| **Podium Left Card** | `.bounty-card--second` | Framer Motion Spring | `rotate: -7 -> -3.5deg`, `y: 70 -> 30px` | 2nd Place radial fan-out tilt |
| **Podium Center Card** | `.bounty-card--first` | Framer Motion Spring | `scale: 0.85 -> 1.05`, `y: -60 -> -22px` | 1st Place elevated center spotlight |
| **Podium Right Card** | `.bounty-card--third` | Framer Motion Spring | `rotate: 7 -> 3.5deg`, `y: 70 -> 30px` | 3rd Place radial fan-out tilt |
| **Header Badge Pill** | `.bounty-kicker-badge` | Static Transform | `transform: rotate(-1.5deg)` | Inked off-kilter comic title banner |
| **Section Title** | `.bounty-title` | Static Transform | `transform: rotate(-1.5deg)` | 3D comic display typography angle |
