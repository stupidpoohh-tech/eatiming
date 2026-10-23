# EATIMING visual system (October 2026)

## Creative direction
Bright, calm, editorial food-tech. White, not beige. Refined mandarin orange, not neon coral. Strong navy typography and quiet gray neutrals. Keep information readable; do not add playful decorative emoji, glossy gradients, large illustrations, or ubiquitous rounded pastel containers.

## CSS color tokens (`src/index.css`)
- Canvas: `white` / `--color-ivory: #ffffff`
- Secondary surface: `--color-ivory-deep: #f6f7f9`
- Border: `--color-line: #e4e8ee`
- Primary text: `--color-ink: #19263b`
- Secondary text: `--color-ink-soft: #566477`
- Quiet text: `--color-ink-mute: #788496`
- Primary CTA: `--color-brand-600: #d86424` with white label
- Primary hover / prominent text: `--color-brand-700: #aa4519`
- Light selected: `--color-brand-50: #fff6f0`
- Subtle orange timeline panel: `--color-accent-50: #fff7f2`
- Time and progress highlights: `--color-accent-500: #e87537`

Use `brand-*` for actionable/selected UI and `accent-*` for the timeline and contextual highlights. Keep `honey-*` for conditional/warning information and `clay-*` for heavy/destructive/error signals; never remove semantic differences in the name of an all-orange palette.

## Components
- Mobile-first app shell, white header and fixed bottom navigation.
- Cards: white, subtle neutral border, very light shadow and 20px corners.
- Buttons: 12px corners, orange only for the primary action, neutral outline for secondary.
- Food chips: compact two-column mobile grid; label + status icon, no large photo cards.
- Medication timeline: quiet light-orange field, thin connecting rules, one highlighted current day; never depict drug concentration from elapsed time.
- Forms: visible labels, 44px minimum tap areas, orange focus ring, restrained use of badges.
- Type: Pretendard, dark navy; strong headings and legible slate secondary copy.
- Responsive widths and safe-area bottom padding.

## Information hierarchy
1. Main menu screen: current condition and medicine context support the **food search and filters**; search should remain accessible while scrolling.
2. Medication screen: drug identity and elapsed-time timeline first, then explicit record/confirm action, personal pattern and history.
3. Companion screen: prominently clarify what is shared and with whom; private medication details are opt-in.
4. No visual restyling should modify access permissions, data writes, dosing calculation, or medical claims.

## QA checklist
- At mobile widths 320–430px, no clipped controls or overlapping bottom navigation.
- Check contrast for orange on white and light-orange surfaces.
- Confirm all screens including auth, empty, error, modal, shared view, and food detail sheet.
- Verify keyboard focus, disabled buttons, reduced-motion behavior, and responsive layout.
- Run `npm run typecheck`, `npm test`, `npm run build`, and the existing E2E suite before release.
