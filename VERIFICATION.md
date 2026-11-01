# Verification — generated recipes, 1 November 2026

## Automated and visual checks

- **20 API/data/generation tests passed.** Coverage includes active markdown filtering,
  coordinates, deduplication, Salling request coalescing/cache/errors, bounded generation
  requests, removal of location/credential fields, product and pantry references,
  requested servings/time, invalid model output, both inference adapters, CORS,
  request size limits, burst throttling, sanitized upstream errors, free-quota errors,
  opaque product labels and the narrow raw-meat-washing instruction check.
- **9 Chromium browser tests passed.** No automatic product selection or generation;
  an explicit click sends only selected products/preferences. Tests cover generated
  result provenance, extras, portions, another-idea requests, downloads, cancellation,
  stale response invalidation, missing endpoints, malformed results and provider errors,
  location search and Salling errors without demo fallback.
- Automated axe WCAG A/AA checks found no violations in the tested main view, generated
  recipe dialog and about dialog. This is not a complete accessibility certification.
- Desktop and 390-pixel mobile screenshots inspected. The browser suite also checks
  320-pixel viewport and dialog overflow. Map tiles/geocoding are intercepted in tests.

Successful model responses in automated tests are **synthetic fixtures**. They
establish application behavior and adapter contracts, not recipe quality. No fixture
provider or static-recipe fallback is included in the application.

## Real model evaluation

Workers AI calls used the owner's authenticated account. The Cloudflare dashboard
showed **Workers Free, $0, Current plan**. No upgrade or paid inference was enabled.
The selected model is `@cf/google/gemma-4-26b-a4b-it`, prompt version
`naermad-generated-v3`, with thinking explicitly disabled and structured JSON output.

Exploratory Qwen3-30B trials were fast but produced unsuitable cooking instructions
and failed ingredient/diet constraints. Qwen3.8-27B was more expensive and slower in
these samples, with a poor rice/water quantity in one recipe. An earlier Gemma prompt
also produced an instruction to wash raw chicken. That observation led to stronger
prompt instructions and a narrow output rejection rule. These are small exploratory
comparisons, not a controlled ranking of the models' general abilities.

Final-prompt observations:

| Input / constraint | Expected | Observed | Seconds | Neurons |
| --- | --- | --- | ---: | ---: |
| Broccoli, cream, pasta in pantry; vegetarian | Recipe | Pasta recipe | 14.9 | 25.0 |
| Raw chicken, peppers, rice in pantry | Recipe | Recipe; 75 °C and package cooking instructions | 7.1 | 26.7 |
| Smoked salmon, rye bread | Recipe | Cold recipe with appropriate product form | 9.3 | 19.6 |
| Dry chickpeas, spinach; 20 minutes | Refusal | Refused due to preparation time | 1.4 | 10.5 |
| Detergent | Refusal | Refused nonfood | 2.2 | 9.9 |
| Raw chicken; vegetarian | Refusal | Refused conflicting selection | 2.6 | 10.1 |
| Mushrooms, cream; basic pantry | Recipe | Mushroom sauce; not a complete meal | 9.4 | 21.9 |
| Prepared chicken salad, cucumber, rye bread in pantry | Recipe | Cold recipe using prepared salad | 9.1 | 19.7 |
| `SF BP M. 250G` | Refusal | **Failed: invented beef** | 17.1 | 18.4 |

The first six cases and the additional two descriptive-food cases returned the
expected status. The opaque-label case failed. Request validation now rejects obvious
all-abbreviation labels before inference; the deployed Worker returned HTTP 400 for
this exact label. This is a narrow heuristic, not a general ingredient classifier.
It cannot catch every ambiguous name, dietary error or unsafe cooking instruction.

[Inputs, actual model outputs and usage](docs/model-evaluation-2026-11-01.json) are
preserved as reviewable evidence. They are never loaded by the app. One response per
case is insufficient to estimate reliability, and the cases informed implementation
changes; this is not an independent held-out benchmark. No recipes were kitchen-tested.

The three initial successful recipes used roughly 20–27 neurons each. A fresh
10,000-neuron allowance could therefore cover around 370–500 similarly short requests,
before other account usage. Longer outputs and retries reduce that figure. Earlier
latency included an outlier over 50 seconds; 7–15 seconds is an observation, not an SLA.

## Deployed Worker and browser integration

The Worker is deployed at `https://naermad-recipes.naermad.workers.dev` with AI and
Rate Limiting bindings. `GET /health` returned 200 with the Cloudflare binding present.
The opaque-label POST returned 400 with the expected Danish error and allowed-origin
CORS header. No model invocation is required for either check.

A browser loaded the built frontend at the GitHub Pages origin using local asset
interception, with clearly labelled fictional inventory and a **real, unmocked Worker
request**. Selecting broccoli and cream generated “Cremet broccoli i flødesovs” in
11.4 seconds (855 prompt / 575 completion tokens). The recipe dialog opened, every
selected product appeared, and no page errors or mobile dialog overflow were found.
This verifies browser-to-Worker integration; it is separate from the public release
smoke test below.

Application logs contain only provider, model, status and token counts. Prompts,
product names and generated recipe text are not logged by application code. CORS and
per-location IP burst limiting are not authentication. The Free plan's shared daily
quota is the hard limit; the app never retries or changes provider automatically.

## Live Salling connection

The nearby food-waste read operation is granted to a Frontend / Website application,
with a production key restricted to `https://huayuansong.github.io`.
Only `GET /v1/food-waste` in the production v1 environment is included in its scope.
The intentionally public frontend key is injected at build time; private inference
credentials are not published in the browser.

A real browser request from the GitHub Pages origin on 1 November 2026 returned
HTTP 200 for a 3 km search around Rådhuspladsen, Copenhagen: **17 stores and 315 raw
clearance records**. This earlier inventory check preceded the generation release.
Counts are time-specific observations. The account's daily quota was not load-tested.

## Public release verification

Pending the GitHub Pages workflow and an end-to-end check of the newly published build.
