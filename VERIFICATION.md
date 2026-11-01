# Verification — generated recipes, 1 November 2026

## Automated and visual checks

- **39 API/data/generation/cost tests passed.** Coverage includes active markdown filtering,
  coordinates, deduplication, Salling request coalescing/cache/errors, bounded generation
  requests, removal of location/credential fields, product and pantry references,
  requested servings/time, invalid model output, both inference adapters, CORS,
  request size limits, burst throttling, sanitized upstream errors, free-quota errors,
  opaque product labels and the narrow raw-meat-washing instruction check.
- **19 Chromium browser tests passed.** No automatic product selection or generation;
  an explicit click sends only selected products/preferences. Tests cover generated
  result provenance, extras, portions, another-idea requests, downloads, cancellation,
  stale response invalidation, missing endpoints, malformed results and provider errors,
  location search and Salling errors without demo fallback.
- Automated axe WCAG A/AA checks found no violations in the tested main view, generated
  recipe dialog and about dialog. This is not a complete accessibility certification.
- Desktop and 390-pixel mobile screenshots inspected. The browser suite also checks
  320-pixel viewport and dialog overflow. Map tiles/geocoding are intercepted in tests.
- Vite production build and `git diff --check` passed. The GitHub Pages workflow
  repeated unit tests, browser tests and the production build successfully.

Successful model responses in automated tests are **synthetic fixtures**. They
establish application behavior and adapter contracts, not recipe quality. No fixture
provider or static-recipe fallback is included in the application.

## Store inspiration and theme update

The additional **Lad AI vælge** mode was checked alongside the original manual flow.
The new tests cover bounded/rotating stock selections, expired and opaque labels,
unknown product references, duplicate ideas, time limits, refusal and quota errors,
sharing the same IP burst limiter across both routes, and preserving a chosen dish's
identity when requesting its recipe. Browser checks cover two-stage generation,
manual selection preservation, store/preference/mode changes, stale response rejection,
three suggestion cards, 320-pixel overflow and accessibility in the new theme.

Real Cloudflare inference was checked with four small inventory scenarios:

| Input | Result | Latency | Neurons |
| --- | --- | ---: | ---: |
| 26 previously observed Salling product names | Three ideas using stock subsets | 7.8 s | 19.7 |
| Mixed meat, vegetarian and nonfood stock; vegetarian, 20 minutes | Three ideas choosing vegetarian products | 7.2 s | 16.5 |
| Detergent and batteries | Refused nonfood-only inventory | 1.2 s | 7.5 |
| Dry chickpeas and raw chicken; vegetarian, 20 minutes | Refused incompatible selection | 2.8 s | 8.4 |

A full recipe was generated from the first store suggestion in 12.3 seconds, using
its three selected products and the same title. This pilot exposed that expected
extras were not being passed into the full-recipe prompt; they are now included.
Expected extras are provisional, and the full recipe supplies the final shopping list.

[Actual pilot inputs and outputs](docs/inspiration-evaluation-2026-11-01.json) are
preserved for review. Inventory timestamps in that pilot were synthetic; it did not
verify current stock. These few manually reviewed samples are not a reliability or
food-safety benchmark. The existing limitations below still apply.

Desktop and mobile theme screenshots were inspected: tomato red, warm white and
plum accents, with bold sans-serif headings and a new plate/utensils icon. Screenshot
fixtures were used only for local visual testing and are not included in runtime data.

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

Initial recipe prompt (v3) observations; later prompt changes are recorded below:

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

[The deployment workflow](https://github.com/HuayuanSong/naermad/actions/runs/41344218851)
passed for application commit `1017246`. The published site's configuration contains
the live Salling frontend connection and the deployed Worker endpoint.

An end-to-end browser check used the **actual published assets, Photon, Salling and
Cloudflare Worker**, with no intercepted service responses:

- Rådhuspladsen, Copenhagen, 3 km: HTTP 200, **17 stores / 336 raw clearance records**.
  Netto Rådhuspladsen displayed 26 accepted offers, zero selected products and zero
  recipes before generation.
- Selected the store's `FANØ BRØD SIGNATURBRØD`, `XMATURE CHEDDAR CASTELLO` and
  `BURGUNDERSKINKE MINIMUM`. One explicit generation click returned HTTP 200 in
  **11.5 seconds**, producing “Luksuriøse Fanø-smørrebrød med moden cheddar og skinke”.
- The result used all three selected products with quantities for two people, plus
  confirmed pantry items. It contained 15-minute preparation instructions and separate
  product provenance. The request contained no address, coordinates, store or Salling key.
- Gemma reported 871 prompt and 573 completion tokens. No additional Salling request
  was made while selecting products or generating. The recipe dialog displayed on
  desktop and 390-pixel mobile without horizontal overflow; no page errors occurred.

This confirms the public integration at the time of testing. Store availability,
latency and future model responses vary; it does not establish general recipe accuracy.


## Public inspiration release verification

[Deployment checks](https://github.com/HuayuanSong/naermad/actions/runs/41345698996)
passed for application commit `e3bbeec`. The published theme and both recipe modes
were then checked with actual GitHub Pages assets, Photon, Salling and Workers AI;
no service responses were intercepted.

- Rådhuspladsen, Copenhagen, 3 km: 17 stores and 333 raw clearance records. The first
  store showed 26 accepted offers, with zero selected products and zero recipes.
- Switched to **Lad AI vælge**, enabled vegetarian, and explicitly requested suggestions.
  One call returned three ideas in **7.5 seconds** using subsets of the store's real
  products. No full recipe was generated before choosing a suggestion.
- Selected “Luksus ostebord på rugbrød”. Its full recipe returned in **12.2 seconds**,
  kept the exact title, used the three chosen products, and included its expected
  extra purchases (butter and grapes/jam). Both requests returned HTTP 200.
- Total network use: **one Salling inventory call, one idea call, one recipe call**.
  Changing mode and choosing a dish caused no additional inventory requests.
- The automatically opened recipe dialog was inspected at desktop and 390-pixel mobile
  widths. No page errors or horizontal overflow were observed. The request bodies
  contained no address, coordinates, store name, prices or Salling key.

These are time-specific integration observations, not guaranteed latency, stock or
recipe quality. The manual route remains covered by the regression browser suite.

## Danish / English selector

The top-right selector, saved preference, translated dialogs/downloads and English
AI request payloads are covered by browser tests. Switching languages preserves the
selected store/products/settings without another Salling or inference request. A
pending response cannot overwrite the new language. English also passes the tested
320-pixel overflow and automated WCAG A/AA checks. Desktop and 390-pixel mobile
screenshots were reviewed; original store/product names remain unchanged.

Request validation accepts only `da`/`en`, defaulting to Danish for older clients.
Both prompts specify the output language and retain metric units/Celsius and exact
product/pantry references. Error responses are localized per request, including
validation and rate/free-quota errors. The existing narrow meat-washing instruction
check was extended to English; it is still not a general food-safety verifier.

A small real Gemma 4 pilot used Danish labels for broccoli, carrots, cooking cream
and canned chickpeas. It returned three English ideas (6.8 s), followed by the chosen
**Creamy Broccoli and Carrot Soup** as a full English recipe (13.1 s), with translated
ingredients, metric quantities and valid references. A Danish regression request
returned Danish ideas (7.8 s). These are spot checks, not an accuracy benchmark or
proof of cooking quality. Prompt versions: `naermad-generated-v5`, `naermad-ideas-v2`.

Published as app commit `1d3d7eb` with successful Pages run
[41347417939](https://github.com/HuayuanSong/naermad/actions/runs/41347417939)
and Worker version `65eac757-1d46-4607-9c1b-e2e468404eef`.
A fresh public browser session searched Copenhagen and displayed 17 stores.
Switching languages preserved selections with only one stock request. The live
English inspiration-to-recipe flow completed with one request per stage (7.2 s / 9.4 s),
retained the selected title, and showed no page errors or mobile overflow. English
persisted after reload. No production service was mocked in that check.

## Discounted-products cost totals

The total covers only the discounted products to buy at the selected store. Pantry
items and extra ingredients do not contribute. Prices are taken from the fetched
inventory snapshot; no cost is requested from the language model or another service.

Seven cost tests cover unit/pack parsing, whole-pack rounding, multiple ingredient
references to one product, kilogram pricing and cent rounding, ambiguous/missing pack
sizes, edits and invalid quantities, unknown units, low stock and idea previews.
The browser checks exercise the 600 g / 400 g example (two 25 kr. packs = 50 kr.),
manual quantity edits without inference, partial totals, download/reopen behavior,
English assumption labels, 320-pixel layout, axe checks and printing closed details.
Desktop and mobile screenshots were reviewed. Test recipes are synthetic fixtures.

Only explicit compatible measurements are converted; no gram-per-piece, ingredient
density or cooked/drained-weight conversion is guessed. One pack/item is assumed
when an each-priced product cannot be matched, with an estimated label and editable
quantity. Unknown weight quantities or price units remain missing from a subtotal.
Prices beyond the indicated stock are marked uncertain. These calculations cannot
verify model quantities, actual pack labels or stock at arrival.

Published as `f46be81` via successful Pages run
[41348607943](https://github.com/HuayuanSong/naermad/actions/runs/41348607943).
A public browser check used actual Copenhagen inventory and a generated two-product
recipe. The displayed 22 kr. matched one 16 kr. Camembert plus one 6 kr. rye bread;
changing the Camembert quantity to two updated it to 38 kr. Both totals excluded
extras, and uncertain pack quantities were marked estimated. The successful flow
used one stock request and one model request; editing quantities used neither.
No page errors or mobile dialog overflow were observed. An earlier single-cheese
probe returned a normal model refusal, so a cheese-and-bread selection was used for
the completed cost check. No model or inference-service changes were deployed.

## Explicit ingredient units

A reported recipe displayed bare quantities (20 butter / 150 sauce). The previous
validator accepted any nonempty quantity string; neither number established its unit.
The original recipe is not retained server-side and cannot be reconstructed from logs.

Prompt `naermad-generated-v6` requires a structured quantity with a numeric amount
and an enumerated unit. The Worker normalizes it to a localized display string, keeping
the existing API compatible. Both Worker and browser reject bare numbers, missing or
unknown units, invalid amounts and contradictory special-unit values. They do not
infer grams from an ingredient name. Explicit counts, fractions and legitimate
“to taste” / packet-instruction quantities remain supported. No automatic retry or
additional inference request was added.

Regression checks cover both reported numbers, malformed structures, every supported
unit's round trip through server/browser validation in Danish and English, localized
errors, recipe-cost compatibility and the actual UI/download path. A rejected quantity
cannot produce a recipe card or cost panel. These are format checks, not proof that a
model chose appropriate quantities or correct cooking instructions.

A small live Gemma 4 pilot used butter, potatoes and onion béarnaise as test inputs
in English and Danish. Both responses supplied structured amount/unit objects for
all measured ingredients and normalized correctly, including `30 g` butter and
`150 g` sauce in the Danish sample. Both retained explicit “to taste” seasoning
instructions. This was a new generation, not a reconstruction of the reported recipe.
The two requests completed in 12.5 s and 15.1 s; the existing token cap was retained.

The English sample used 1,183 input and 615 output tokens; Danish used 1,168 input
and 681 output tokens. At the published Gemma rate of 9,091 neurons per million
input tokens and 27,273 per million output tokens, these correspond to approximately
27.5 and 29.2 neurons. A fresh 10,000-neuron allowance would cover about 340–360
similarly sized recipes. The [capacity guide](docs/architecture.md#capacity-and-limitations)
uses a rounded planning estimate of 300–350. This is an extrapolation from two
format checks, not a load test; other account usage and longer outputs reduce capacity.
Source: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Published as app commit `c1327ab`, Pages run
[41349630366](https://github.com/HuayuanSong/naermad/actions/runs/41349630366),
and Worker version `f3ce30c2-6348-4829-ae44-5d3d73d2ff37`. All 58 checks passed.
A published-frontend browser check against the real production Worker generated
an English egg/spinach recipe with `4 pcs`, `150 g`, `15 ml` and explicit seasoning
instructions. Units appeared in the shopping list and the discounted-products cost
calculated correctly. This check used the labelled fictional inventory via a config
fixture, made one real model request, and observed no page errors or retries.

## Correctness and code-simplifier review

A [two-pass review](docs/code-review-2026-11-01.md) fixed initialization, malformed
response and offer-expiry edge cases, then consolidated duplicated generation and
output-decoding logic. The six new regression tests failed before their fixes.
All **41 unit/API tests and 23 browser tests** pass after the changes. Four saved
synthetic inputs preserve exactly the same recipe/ideas prompts and JSON schemas.
The frontend build, Worker packaging dry-run, formatting and diff checks pass.
No additional live inference was used; these checks do not measure recipe quality.

## Release checks and CI linting

Oxlint now checks correctness, undefined names and unused variables before the
existing tests and Pages deployment. A temporary deliberate-error check confirmed
that undefined names and unused variables fail lint. Browser, Worker and Node
files have separate globals; generated files are excluded. Three narrow inline
exceptions preserve intentional control-character validation expressions.

A clean `npm ci`, lint, all 41 unit/API tests, all 23 browser tests, the frontend
build and Worker packaging dry-run pass. The four prompt/schema comparisons remain
unchanged, as do all existing locked dependency versions. `npm audit` reports zero
known vulnerabilities at the time of this release check.
