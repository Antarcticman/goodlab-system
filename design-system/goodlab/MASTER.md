# GOODLAB Design System — Scientific Operations

> Global source of truth. Page-level exceptions live in `pages/<page>.md` and may only override rules documented here.

**Version:** 1.0  
**Updated:** 2026-07-12  
**Product:** Academic laboratory operations and administration system  
**Design dials:** Variance 3/10 · Motion 3/10 · Density 8/10

## Product principles

1. **Operational clarity first.** Users should see the current state, next action, and consequence without decoding decoration.
2. **Dense, never cramped.** Desktop tables may be compact; touch controls, forms, and mobile cards remain comfortable.
3. **Permission is a product state.** Guest, User, Admin, loading, offline, empty, and denied states must be designed explicitly.
4. **Safety before speed.** Destructive, financial, inventory-import, and duty-submission actions need clear confirmation and recovery.
5. **Traditional Chinese first.** Typography and labels are optimized for Taiwan users; codes and numbers use tabular figures.

## Visual direction

**Style name:** Scientific Operations  
**Character:** precise, calm, trustworthy, practical, modern  
**Avoid:** glassmorphism, oversized editorial type, ornamental gradients, decorative motion, emoji as structural icons, color-only status.

Light mode is the first delivery target. All colors use semantic tokens so a separately tested dark theme can be added later.

## Color tokens

| Role | Token | Value | Use |
|---|---|---:|---|
| Primary | `--color-primary` | `#1D4ED8` | Primary action, active navigation, focus |
| Primary hover | `--color-primary-hover` | `#1E40AF` | Hover/pressed |
| On primary | `--color-on-primary` | `#FFFFFF` | Text/icon on primary |
| Accent | `--color-accent` | `#0F766E` | Scientific/operational accent |
| Canvas | `--color-canvas` | `#F4F7FB` | App background |
| Surface | `--color-surface` | `#FFFFFF` | Cards, tables, modal |
| Surface subtle | `--color-surface-subtle` | `#F8FAFC` | Table headers, grouped regions |
| Ink | `--color-ink` | `#0F172A` | Primary text |
| Ink muted | `--color-ink-muted` | `#526075` | Secondary text; verified AA on white |
| Border | `--color-border` | `#DCE3EC` | Dividers and component borders |
| Success | `--color-success` | `#047857` | Completed/healthy, always with text/icon |
| Warning | `--color-warning` | `#B45309` | Attention/due soon, always with text/icon |
| Danger | `--color-danger` | `#B91C1C` | Destructive/error, always with text/icon |
| Focus | `--color-focus` | `#2563EB` | 3px focus ring |
| Sidebar | `--color-sidebar` | `#172033` | Desktop navigation |

## Typography

- UI family: `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`.
- Codes/data: `"SFMono-Regular", Consolas, "Liberation Mono", monospace` only for IDs, property numbers, timestamps, and technical values.
- Body: 16px mobile and 15–16px desktop, line-height 1.5–1.65.
- Scale: 12 / 14 / 16 / 18 / 24 / 32px.
- Weights: body 400, labels 500, section headings 600, page heading 700.
- Long-form measure: 60–75 Traditional Chinese/Latin characters on desktop.
- Numeric columns use `font-variant-numeric: tabular-nums`.

## Spacing, radius, elevation

| Token | Value | Use |
|---|---:|---|
| `--space-1` | 4px | Icon/text micro gap |
| `--space-2` | 8px | Inline and control gap |
| `--space-3` | 12px | Compact component padding |
| `--space-4` | 16px | Standard component padding |
| `--space-6` | 24px | Section gap |
| `--space-8` | 32px | Page rhythm |
| `--radius-sm` | 6px | Chips, compact controls |
| `--radius-md` | 10px | Buttons, inputs, tables |
| `--radius-lg` | 14px | Cards, modal |
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,.06)` | Table/card |
| `--shadow-md` | `0 10px 30px rgba(15,23,42,.12)` | Drawer/modal |

## Interaction contract

- All touch targets are at least 44×44px; adjacent targets have at least 8px separation.
- Use semantic `button`, `a`, `input`, `select`, `textarea`, and dialog roles. Do not attach primary actions to `div`, `span`, `i`, `tr`, or `th` alone.
- Every form control has a visible associated label. Placeholder text is supplementary only.
- Focus uses a visible 3px ring and is never removed without replacement.
- Async buttons disable during submission and show a progress label/icon.
- Error messages state cause and recovery next to the field or failed region.
- Destructive actions are separated from primary actions and require a specific confirmation.
- Motion duration is 150–250ms using opacity/transform. Respect `prefers-reduced-motion`.

## Navigation and responsive rules

- Desktop ≥1024px: persistent grouped sidebar with Overview first.
- Mobile <1024px: maximum five top-level destinations, icon plus visible label. Secondary pages belong in More.
- Page state is represented in the URL (`#/overview`, `#/logs`, etc.) and back navigation preserves filters and scroll when implemented.
- Guest sees a dedicated sign-in surface, never an empty admin table.
- Fixed navigation reserves safe-area and content padding.
- Verify 375, 768, 1024, and 1440px plus mobile landscape.

## Component specifications

### App shell and page header

- Page header contains one `h1`, optional short description, contextual status, then one primary action.
- Sidebar uses labels and Phosphor outline icons; active state uses color, weight, and a shape indicator.

### Buttons

- Default height 44px; compact desktop-only button minimum 36px and never used as a mobile primary action.
- Primary is blue; secondary is neutral surface; danger is red and spatially separated.
- Hover/pressed states must not move surrounding layout.

### Forms

- Label → control → helper/error is the fixed order.
- Validate on blur or submit, not on every keystroke.
- Form controls are 44px high on mobile and at least 40px on desktop.
- Read-only and disabled states are visually and semantically distinct.

### Modal/dialog

- `role="dialog"`, `aria-modal="true"`, labelled title, initial focus, focus trap, Escape close, and focus restoration.
- Mobile modal becomes a bottom sheet or near-full-height surface when the form is long.
- Unsaved changes require confirmation before dismissal.

### Data table

- Real column headers and sortable buttons with `aria-sort`.
- Numeric/date columns use tabular figures and explicit alignment.
- Loading, empty, error, filtered-empty, and permission states are distinct.
- Desktop supports sticky header and bulk selection where useful.
- Mobile uses priority columns or cards; horizontal scrolling is reserved for truly comparative tables.

### Status and feedback

- Status badges combine icon/shape, label, and color.
- Toasts use `aria-live="polite"`, do not steal focus, and dismiss after 3–5 seconds.
- Region-level load failure includes Retry; never leave a blank table.

## Page priorities

1. Overview / authentication shell
2. Logs, instruments, inventory, duty
3. Members, routine, accounting, employment
4. Knowledge center and optional dark theme

## Delivery checklist

- [ ] No structural emoji; Phosphor icons use one weight per hierarchy.
- [ ] All text and UI contrast meets WCAG AA.
- [ ] Keyboard-only workflow passes for navigation, filters, tables, forms, and dialogs.
- [ ] Every visible control has a ≥44px touch target on mobile.
- [ ] Focus order follows visual order; no keyboard traps.
- [ ] Reduced motion is respected.
- [ ] Guest causes no unauthorized Firestore listener errors.
- [ ] Loading, empty, error, offline, denied, success, and destructive states are designed.
- [ ] No page-level horizontal overflow at required breakpoints.
- [ ] Essential content is not hidden behind sticky/fixed UI.
