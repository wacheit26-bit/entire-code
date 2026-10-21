# Wache responsive styles

## What’s included

- **`responsive.css`** — Production responsive system (used by the app).
  - Breakpoints, container max-width and padding, base font size, grid gutters.
  - Fluid typography (`clamp()`), spacing scale, touch targets (44px min).
  - Safe area insets, dark mode, reduced motion.
  - Imported from `index.css`.

- **`_variables.scss`** — Same breakpoints, containers, grid, typography, spacing as SCSS variables.
  - Use with: `@use 'styles/variables' as *;`

- **`_mixins.scss`** — Breakpoint and layout mixins.
  - `@include respond-to('tablet') { ... }`
  - `@include container;` `@include touch-target;` etc.
  - Use with: `@use 'styles/mixins';` (mixins use variables).

## Tailwind

- **`tailwind.config.js`** (project root) — Same breakpoints and theme tokens.
  - To use Tailwind: `npm i -D tailwindcss postcss autoprefixer`, then add Tailwind directives to your CSS.

## Testing

See **`TESTING-RESPONSIVE.md`** in the project root for the checklist (readability, touch targets, reflow, safe area, dark mode, reduced motion).
