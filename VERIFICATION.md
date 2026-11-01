# Verification — 1 November 2026

Initial release tested locally on macOS, Node 26.8.2 and Chromium. CI uses Node 22
and installs the Chromium version required by the locked Playwright dependency.

- **13 model/API tests passed:** Danish ingredient classification, prepared-product
  exclusions, offer validity, sold-out data, duplicate offers/stores, coordinate order,
  radius/country/brand filtering, matching/ranking, pantry assumptions, recipe schema,
  quantities, API auth headers, caching, coalescing, timeouts/errors and retry timing.
- **7 browser tests passed:** demo flow, selecting stores and products, vegetarian/time
  filters, scaled recipe quantities, shopping-list download, keyboard dialog dismissal,
  manual ingredient correction, searches outside the demo area, mobile overflow,
  mocked live data and an authentication failure without a demo fallback.
- Automated axe WCAG A/AA checks found **no violations** in the main demo screen,
  recipe dialog and about dialog. This is a scoped automated check, not an accessibility
  certification or a replacement for assistive-technology testing.
- Desktop and 390-pixel mobile screenshots inspected. No page JavaScript errors in
  the inspected flow. Key information remains text; map alternatives are available
  in the store list.
- A real browser request to Photon for **“Fisketorvet København”** returned the mall
  and other local places. API fixtures are used for automated tests; map tiles are
  intercepted so test runs do not burden community servers.
- Production build passed; `npm audit --omit=dev` reported zero known vulnerabilities
  at the time of verification. The build contains no configured Salling key.

## Not yet verified

An authenticated Salling production response, the owner's frontend operation scopes,
origin restrictions and account-specific quota remain unverified because no key is
configured. The public version must remain labelled **demo** until connected. The
adapter follows the official published examples and is tested against that schema.

Recipe templates have not been kitchen-tested. Matching is based on names, not full
ingredient labels; users can correct classifications. No nutritional, allergen-free,
total-meal-cost or guaranteed-stock claims are made.
