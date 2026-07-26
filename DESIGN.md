# Design

<!-- impeccable:design-schema 1 -->

## The world: the schematic sheet

Atlas is **drafted, not decorated**. The interface is a working engineering
drawing of a company: a paper ground, ink hairlines, condensed uppercase edge
lettering for anything that describes rather than says, corner registration
ticks on the panels that anchor a screen, and leader lines connecting labels to
what they label.

The Organization Map is not a feature bolted onto a dashboard — it is the native
artifact, and every other screen is another sheet from the same drawing set.
That is why the schematic language starts on the landing page (a leader line and
a node introduce the vocabulary before you have signed up) and why the sign-in
sheet carries a real title block with a drawing number.

**Why this world.** An owner opening Atlas is asking structural questions: who
reports to whom, what is late, where does this process live. A schematic is the
one artifact whose entire job is to make structure legible without ornament. It
also earns the black-and-white brief as a *reason* rather than a taste: a
drawing has no colour because colour would compete with the information.

**Ruled out before selection**, and now the anti-references:

- **The rounded-card SaaS dashboard** — 12px radii, soft drop shadows, a
  three-column grid of icon-plus-heading-plus-text tiles, Inter, Lucide icons,
  one indigo accent on the primary button. This is what the first build of this
  brief produced and what a generic build of it always produces. Everything
  about the current system is a deliberate move away from it.
- **The dark "futuristic" console** — glass panels, glow, a neon accent. Wrong
  for the use scene and wrong for the content.

## Colour

**Strategy: restrained.** Paper, ink, and one annotation blue.

The Tailwind palette is **replaced, not extended** (`tailwind.config.js`), so
there is no way to reach for a stock `neutral-500` by accident.

| Token | Value | Role |
| --- | --- | --- |
| `paper` | `#f4f3f1` | The page ground. Drafting paper — sits *below* the sheets on it. |
| `paper-deep` | `#eceae7` | Recessed fills: meter tracks, hover surfaces. |
| `sheet` | `#ffffff` | Panels resting on the ground. |
| `rule` | `#e6e4e0` | Hairlines inside a panel. |
| `edge` | `#cecbc5` | Outer borders, control borders. |
| `edgeStrong` | `#b4b0a8` | Registration ticks, emphasised borders. |
| `ink` | `#121211` | Primary text and primary fills. |
| `ink-2` | `#54524d` | Body text. 7.4:1 on sheet. |
| `ink-3` | `#8a877f` | Edge register, metadata. 4.6:1 on sheet. |
| `ink-4` | `#a8a49c` | Drawing numbers and other non-essential marks only. |
| `mark` | `#1b4dff` | The annotation blue. 7.0:1 on sheet. |
| `alert` | `#b3261e` | Overdue, blocked. |
| `pending` | `#8a6a00` | Awaiting review, expiring. |
| `done` | `#2f6b4f` | Complete, acknowledged, available. |

**The ground sits down so sheets can rest on it.** `paper` is the lowest light
value and `sheet` sits above it. A real value ladder gives the page depth
without a single shadow — which is what lets the interface drop drop-shadows
entirely and still read as layered.

**The neutrals are a hair warm, not blue-grey.** A cool grey reads as generic
screen chrome; fully warm lands on the cream editorial page this world exists to
refuse. A whisper off neutral is the whole allowance.

**`mark` is a mark, not a mood.** It is used only where a draughtsman would
actually annotate: the focus ring, the selected node's leader lines, the live
result count, the required-field asterisk, a single primary action. It is never
a decorative accent, never a hover state that means nothing, and never a tinted
card background.

**Only three states earn a colour**, because only three mean "act now": blocked
or overdue (`alert`), waiting on someone (`pending`), finished (`done`).
Not-started and in-progress are ink, because they are the normal condition of
work and colouring them would leave nothing for the exceptions. Semantic colours
appear as **ink** — a small square mark plus edge-register text — never as a
tinted card.

**Light, not dark**, chosen from the use scene: an owner at a desk in daylight,
and a worker holding a phone outdoors on a job site.

## Type

**Archivo** (variable, `wght 400..800`, `wdth 62..125`) plus **Spline Sans
Mono** (`wght 300..600`). Archivo's width axis is the reason it was chosen over
a second family — it lets one typeface do both the condensed technical lettering
and the reading text.

| Register | Spec | Used for |
| --- | --- | --- |
| Edge | `wdth 78%`, 600, uppercase, 10–11px, tracking `.11–.13em` | Every label, column head, field name, section head, metadata string |
| Body | `wdth 100%`, 400–500, 13–14px | Sentences only |
| Title | `wdth 100%`, 600, tracking `-.015em` | Panel and record titles |
| Display | `wdth 88%`, 700, tracking `-.035em`, up to 4.2rem | Page headlines. The width axis carries the character so the weight does not have to shout |

Spline Sans Mono is used **only** where character alignment or comparison is the
point: figures, drawing numbers, invitation codes, timestamps, the map's scale
readout. Never as a costume for "technical".

**Banned:** Inter (the previous build used it — it is the single loudest tell of
an unconsidered interface), plus Roboto, DM Sans, Plus Jakarta, Space Grotesk,
Poppins, JetBrains Mono and the rest of the training-default set.

## Composition

- **No uniform card grid.** Panels are hairline-ruled rectangles. Radii never
  exceed 3px — nothing in this product is a pill, including the avatars, which
  are stamped squares.
- **Registration ticks** (`.ticked`) mark the panels that anchor a screen — the
  four corner L-marks of a plate. They are not applied to every card; that would
  make them wallpaper rather than punctuation.
- **Section heads sit on the rule** (`RuledHead`), the way a title block sits on
  a drawing border. This is the *only* eyebrow in the system, which is what
  stops it becoming grammar nobody chose.
- **Figures are numbers on a rule**, not numbers in a floating tile: an
  edge-register label above, a large light monospace figure below, a 2px ink
  rule on top. Zero-padded, because a column of drawing figures aligns.
- **The sidebar has no pill.** Active is a 3px ink bar that draws in, ink text,
  and a mono index. Nav items carry `01`–`08` because the reading order of the
  sheet set is real information.
- **Empty states are unassigned regions on a plan** — a hatched, dashed panel
  with the reason edge-printed on it. Never an icon in a grey circle.
- **The map is a drafting canvas**: a two-level cross-hatch grid, orthogonal
  edge routing, nodes as hairline rectangles with corner ticks and a `P01`/`T01`
  reference number, and a live `SCALE 1:n` readout in the corner.

## Motion

One authored moment: **ink drawing in**. The active nav bar, the tab underline
and every meter draw from zero along a single exponential ease-out
(`cubic-bezier(.16,1,.3,1)`, exported as `DRAFT_EASE`). That curve is the only
one the interface uses.

Everything else is 140–320ms of opacity or position, from an already-visible
default. Specifically:

- **Sheets do not levitate.** No card lifts, scales or gains a shadow on hover.
  Hover changes ink: a border darkens, a rule fills. An earlier build had
  `hover:-translate-y-0.5 hover:shadow-card` on every card and it was removed
  everywhere.
- **Only the selected person's edges animate** on the map. A map where every
  line crawls is decoration; one lit path is information.
- **One pulse, one meaning.** The ring-out animation fires on exactly one thing:
  a person node whose owner has overdue work. It is the only pulse in the
  product, which is what makes it mean something.
- Page transitions fade. They never slide — pages are sheets being laid down.
- Everything respects `prefers-reduced-motion`.

## Icons

**Phosphor Light** only, inlined in `src/client/components/icons.tsx`. One
collection, one weight, 256 viewBox, always `currentColor`, no runtime icon
dependency. The light weight matches the hairline rules the interface is drawn
with — an icon should read as another pencil stroke on the sheet, never as a
heavier element sitting on top of it.

Lucide was removed. Mixing icon families, or hand-rolling a stroke icon to fill
a gap, is a defect: pull the missing glyph from Phosphor Light instead.

Exports are named for **intent**, not for the glyph (`CheckSquare` for work,
`TreeStructure` for the map), so changing which glyph represents a concept never
means touching a call site. Icons must earn their place by aiding scanning or
naming an affordance — a control that already reads does not get one.

## Standing rules

1. **Separation is a hairline rule or a value step, never a shadow.** Shadows
   exist only for things that genuinely float: modals, drawers, menus, toasts.
2. **Anything that describes goes in the edge register.** If a label is
   *describing* rather than *saying*, it is condensed uppercase at 10–11px.
3. **Any number a person compares or reads aloud is monospace**, tabular.
4. **One primary action per view.** If two things look primary, neither is.
5. **The interface owns no colour but `mark` and the three state inks.** Every
   other coloured pixel belongs to content — a team colour, an uploaded image.
6. **Team colours are content, not theme.** They tint a dot or a 10px square.
   They never become a background, a button, or a large field.
7. **WCAG AA is the floor** for every text role, and full keyboard operability
   is not negotiable. One focus treatment everywhere: a square `mark` ring.

## Where the system lives

Three files, on purpose:

| File | Owns |
| --- | --- |
| `tailwind.config.js` | The palette, type stack, radii, shadows, motion tokens |
| `src/client/index.css` | Base styles and the component classes (`.edge`, `.sheet`, `.ticked`, `.field`, `.drafting-grid`, `.hatched`, `.prose-sheet`) |
| `src/client/components/ui/index.tsx` | Every primitive |

Changing how something looks everywhere should be an edit to one of these three,
not a search across the pages.
