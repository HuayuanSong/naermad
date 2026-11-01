# Verification — generated recipe prototype, 1 November 2026

Branch: `feat/generated-recipes`. These results apply to the local generation
prototype, not the public main deployment.

## Automated and visual checks

- **16 API/data/generation tests passed.** Coverage includes active markdown filtering,
  coordinates, deduplication, Salling request coalescing/cache/errors, bounded generation
  requests, removal of location/credential fields, product and pantry references,
  requested servings/time, invalid model output, both inference adapters, CORS,
  request size limits, burst throttling and sanitized upstream errors.
- **9 Chromium browser tests passed.** No automatic product selection or generation;
  an explicit click sends only the selected products/preferences. Tests cover generated
  result provenance, extras, portions, another-idea requests, downloads, cancellation,
  stale response invalidation, missing endpoints, malformed results and provider errors,
  real-location search behavior and Salling errors without demo fallback.
- Automated axe WCAG A/AA checks found no violations in the tested main view, generated
  recipe dialog and about dialog. This is not a complete accessibility certification.
- Desktop and 390-pixel mobile screenshots inspected. The browser suite also checks
  320-pixel viewport and dialog overflow. Map tiles/geocoding are intercepted in tests.
- Vite production build passed. Cloudflare Wrangler **deploy --dry-run** bundled the
  Worker and recognized the AI and Rate Limiting bindings. No Worker was deployed.
- `npm install` reported zero known dependency vulnerabilities at verification time.

All successful model responses in automated tests are **synthetic fixtures**. They
establish application behavior and adapter contracts, not recipe quality. No fixture
provider or static-recipe fallback is included in the application.

## Live model checks and remaining release gate

No authenticated HF or Workers AI production endpoint has been connected. Generation
is disabled when the public endpoint configuration is blank. There is no model token
in the browser or committed files. The new branch has not replaced the public site.

Two exploratory calls were made through Cloudflare's official public browser
playground, not an undocumented production integration:

- Qwen3-30B-A3B-fp8, broccoli and cooking cream, vegetarian, two servings: the displayed
  response incorrectly rejected ordinary cooking cream as containing meat. The
  streamed display also duplicated tokens. This was not a usable recipe.
- Qwen3.8-27B, the same ingredients after clarifying lacto-ovo vegetarian meaning:
  the playground invoked its developer-documentation tools and no usable recipe was
  captured. Its tool harness differs from this application's text-only API requests.

These trials are **inconclusive for production model selection**. Neither candidate
is quality-approved. Playground timing/display cannot be used as production latency
or structured-output evidence. The Worker still has an explicitly provisional default.
The prompt now clarifies that vegetarian food may include eggs and ordinary dairy.

Before release, connect the chosen inference account and test the actual Worker with
ordinary vegetarian dishes, raw chicken, prepared foods, dried legumes, unclear/nonfood
products and incompatible selections. Inspect natural Danish, quantities, timing,
selected-product use, pantry/extra references and appropriate refusals. Validation
only checks structure/references; it cannot establish culinary or food-safety accuracy.

## Live Salling connection

After the owner signed in to Salling's developer portal, the nearby food-waste read
operation was granted, a Frontend / Website application was created, and a production
key was issued with exactly one allowed origin: `https://huayuansong.github.io`.
Only `GET /v1/food-waste` in the production v1 environment is included in its scope.

A real browser request from the GitHub Pages origin on 1 November 2026 returned
HTTP 200 for a 3 km search around Rådhuspladsen, Copenhagen: **17 stores and 315 raw
clearance records**. The app displayed Netto Rådhuspladsen with 26 accepted offers
and recipe suggestions. Counts are observations at that time and will change.
The account's actual daily quota has not been load-tested; the app retains caching
and Retry-After handling rather than intentionally exhausting it.

## Scope of prior live-data verification

The Salling results above were verified before this feature branch. This turn's
browser tests mock upstream inventory and inference; they did not consume more of
Salling's live quota. Recipe templates referenced in the earlier release have been
removed from this branch.
