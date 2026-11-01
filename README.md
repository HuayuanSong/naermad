# Nærmad

**Hvad skal vi spise?** Search for a place and choose a nearby store. Let AI suggest
dishes from its discounted products, or select ingredients for a recipe yourself.

**Public site:** https://huayuansong.github.io/naermad/

GitHub Pages hosts the interface. A Cloudflare Worker generates recipes using
**Gemma 4 26B A4B**, with live Salling clearance products supplied by the browser.
The Worker runs on a verified **Workers Free** account: generation stops when the
shared daily allowance is exhausted. No paid fallback or visitor login is required.
See [verification and model evaluation](VERIFICATION.md) for the checks and limits.

The top-right **Dansk / English** selector translates the interface and selects the
language for new AI ideas, recipes and shopping lists. The choice is stored only in
this browser. Store/product labels remain as supplied by Salling; prices stay in DKK
and times use Copenhagen time. Switching languages preserves the selected store,
products and food preferences, clears previous results and cancels pending generation
without automatically requesting stock or another model response.

## How it works

1. Search for an address or place (landmarks work too), or use browser geolocation.
2. Choose a participating Netto, føtex or Bilka store. Open the map if useful.
3. Choose **Jeg vælger varerne** to select 1–6 products yourself, or **Lad AI vælge**
   to get up to three dish ideas from the store's stock without selecting ingredients.
4. Choose portions, maximum preparation time and optionally vegetarian food. Confirm
   basic pantry items or add a few of your own.
5. In manual mode, click **Lav en opskrift**. In inspiration mode, click **Foreslå
   retter**, then **Lav denne opskrift** on a suggestion you like. Suggestions show
   the actual discounted products they use and expected extra ingredients. The full
   recipe is generated only after you pick a dish, with quantities and steps.
   Selected products, pantry ingredients and extra purchases are listed separately.
   **Lav en anden idé** or **Få nye forslag** makes another model request. No catalogue
   fallback exists. Switching modes preserves manual selections but clears old results.

Changing products, store or preferences invalidates pending/previous results. The app
also removes locally expired offers. Lists can be copied, downloaded and printed.

Each full recipe shows the **total for the discounted products you need to buy**
from the selected store. This excludes extra ingredients and pantry items. Expand
**Se og ret prisberegning / View and adjust the cost breakdown** to see the store
prices and change purchase quantities. Costs are also included in copied/downloaded
lists and printouts. Changing quantities does not make an API or model request.

When recipe quantities match an explicit pack size, whole packs round up: 600 g from
400 g packs at 25 kr. means two packs and 50 kr. Multiple ingredient references to
the same product are combined before rounding. Weight-priced products use kilograms.
If pack size or quantity cannot be matched, one pack/item is explicitly assumed and
the total is marked estimated. Unknown weight quantities or price units remain
unpriced and the displayed figure is a subtotal. Low indicated stock is flagged.
Suggestion cards show a clearly labelled one-of-each basket, since they have no
recipe quantities yet; the full recipe may require more.

The interface uses a tomato-red, warm-white and plum palette, bold DM Sans headings,
and a plate/utensils icon. The map and pantry options remain collapsible.

Inspiration considers up to 60 different, unexpired product names per request. Exact
name duplicates and obviously opaque labels are skipped. Larger inventories rotate
through another bounded selection when asking for new suggestions. This is not an
exhaustive search or a food classifier. One model call produces up to three outlines;
choosing one makes a second call for its full recipe. Suggested product references,
time limits and output structure are checked server-side and again in the browser.
The full recipe must use the chosen idea's title and every product it selected.

GitHub Pages serves the Vite frontend; a small Cloudflare Worker handles inference.
A shared contract bounds requests, validates structured output and verifies that every
selected product has an ingredient reference. It rejects obvious all-abbreviation
product labels and a known unsafe instruction to wash raw meat. These narrow checks
cannot verify culinary meaning, general food safety or whether a recipe will taste good. The earlier
fine-tuning dataset and rejected experimental adapter are not used.

## Run locally

Requires Node.js 22.12+ (or a supported newer version).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4325/. Without a Salling key, three clearly labelled fictional
Aarhus stores are shown. Without `RECIPE_ENDPOINT`, generation is unavailable.

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npx wrangler deploy --dry-run
```

Browser tests intercept upstream services and use explicitly synthetic model responses.
They verify interaction and integration contracts, not model quality.

## Connect generation

The deployed provider is Cloudflare Workers AI. The alternative Hugging Face adapter
is unused; the app never switches providers automatically.

### Cloudflare Workers AI (deployed)

`wrangler.jsonc` binds `AI` and selects `@cf/google/gemma-4-26b-a4b-it`.
Requests use the model's OpenAI-compatible JSON schema wrapper and explicitly disable
thinking with `chat_template_kwargs.enable_thinking: false`. Output is validated again
by the Worker and browser. A small manual comparison favoured Gemma over Qwen3-30B
and Qwen3.8-27B for this task; it is not a comprehensive model benchmark.

Cloudflare currently provides 10,000 neurons/day. A **Workers Free** account stops
accepting AI requests after its allowance; a **Workers Paid** account can incur
charges beyond it. Existing account usage shares the allowance. Do not upgrade
or enable billable usage as part of a strictly-free deployment.

Three initial manual-recipe trials took about 7–15 seconds and used 20–27 neurons each.
That suggests roughly 370–500 similarly short recipes from a fresh daily allowance,
shared by all visitors, before other account usage. This is an estimate, not guaranteed
capacity or latency. Longer outputs cost more; an earlier trial took over 50 seconds.
Quota errors are displayed without automatic retries. The allowance resets at 00:00 UTC.
Inspiration uses extra allowance for the suggestion call: two initial batches of three
ideas took 7–8 seconds and used about 17–20 neurons each, before generating a recipe.
The manual-recipe capacity estimate above therefore does not apply to complete
suggestion-plus-recipe sessions.

To redeploy after signing into the intended account and checking its plan:

```sh
npx wrangler login
npx wrangler deploy
```

The public `RECIPE_ENDPOINT` is
`https://naermad-recipes.naermad.workers.dev/recipe`. Set the GitHub Actions repository
variable of that name and rebuild the Pages site when changing this address.
Inspiration uses the same Worker at `/ideas`, derived from the configured `/recipe`
URL; there is no additional key or account setup.
`GET /health` reports whether a provider binding is present; it does not make a model
call or prove the account has quota. Smoke-test actual generation separately.

For local integration, add `http://127.0.0.1:4325` to `ALLOWED_ORIGINS` for a dedicated
development Worker, then put its public URL in the ignored `.env.local`. This allows
local browser requests without broadening Salling's production credential origins.

### Alternative Hugging Face adapter (not deployed)

The adapter accepts `RECIPE_PROVIDER=huggingface` and `HF_MODEL`. Its experimental
default, `Qwen/Qwen3-30B-A3B:deepinfra`, is not quality-approved for this application.
Model/provider availability can change. Any future HF access token must be restricted
to inference and stored as a **Worker secret**:

```sh
npx wrangler secret put HF_TOKEN
npx wrangler deploy
```

The CLI prompts for the token. Never place it in public configuration, a `VITE_*`
variable, GitHub Pages, source code or a static Space. Optional `HF_MODEL` overrides
the routed model. Hugging Face currently requires inference credits: free accounts
receive no monthly allowance; paid plans include small allowances. This paid inference
route is not enabled for the strictly-free deployment.

Hugging Face ZeroGPU is a different option: eligible free personal accounts can host
two Gradio Spaces, with visitor quotas and queues. Those quotas cannot be compared
directly with Cloudflare's account-wide allowance. Cloudflare was selected for its
anonymous API integration with the existing GitHub Pages interface, not because it
necessarily offers more aggregate compute than every ZeroGPU deployment.

### Request limits and error behavior

- Recipe request bodies are limited to 12 KB, with at most six products and six servings.
  Suggestion requests allow up to 60 names and 64 KB; suggestions choose at most six
  products per dish. Both routes strip location, prices, credentials and unknown fields.
- Generation is user-triggered, capped at 1,600 output tokens for a suggestion batch
  and 2,400 for a full recipe, with no automatic retries or speculative recipe calls.
- A Cloudflare Rate Limiting binding limits each client IP to approximately three
  requests per minute **per location**. It is not a global budget or authentication.
- CORS restricts allowed browser origins; it does not stop a caller spoofing Origin.
- Provider failures, quota errors, invalid output and incompatible ingredients remain
  explicit errors. There is no fixed-recipe fallback or hidden regeneration loop.
- Cancellation discards results in the browser. It cannot guarantee that an upstream
  provider has stopped computing or charging for an already submitted request.

## Connect Salling

Salling's public **Anti Food Waste** API covers short-dated markdowns in participating
Netto, føtex and Bilka stores. It is **not a feed of every weekly promotional offer**,
and does not cover all Danish supermarket chains. The API documents stock as an
indicator rather than real-time certainty, and serves clearances created or changed
yesterday or today. Nearby searches return at most 20 stores.

The portal currently documents **100 Anti Food Waste requests per day**. Confirm the
actual quota and permitted operations on your account. This is enough to try a small
prototype, not an assumption of capacity for a busy public service. Browser caches
are per tab and do not pool the quota across visitors. There is no background polling
or automated retry storm; changing a store uses the nearby response already fetched.

1. Sign up at [Salling's developer portal](https://developer.sallinggroup.dev/).
2. Add **Anti Food Waste** to your API collection.
3. Create an application of type **Frontend / Website App**. Select only the food-waste
   nearby read operation in the production/v1 environment. The app currently uses
   `GET https://api.sallinggroup.com/v1/food-waste/?geo=LAT,LON&radius=KM`.
   A separate Stores API request is unnecessary: the response includes store metadata.
4. Create a dedicated **frontend key** and restrict its allowed origins to:
   - `https://huayuansong.github.io`
   - `http://127.0.0.1:4325` for local development, preferably on a separate development key.
5. Locally, copy `.env.example` to `.env.local` and populate `SALLING_FRONTEND_KEY`.
   Keep `SALLING_KEY_KIND=frontend`. Restart the dev server.
6. For the public deployment, set the GitHub Actions **repository variable**
   `SALLING_FRONTEND_KEY` to the dedicated production frontend key, then run the
   **Test and publish GitHub Pages** workflow again.
7. Smoke-test from the published origin: search for a place, pick it, inspect the
   returned stores and select ingredients. The status badge changes to “Salling ·
   tilsluttet”; errors remain errors and do not silently switch to fictional data.

**A frontend key is intentionally visible to website visitors.** Origin restrictions
are part of Salling's supported frontend integration; they are not a way to hide a
secret or prevent all quota abuse. Never supply a personal/back-end, GitHub or Hugging
Face token. Do not put a confidential token in a `VITE_*` variable or the public config.
If your account cannot grant the food-waste operation to a frontend application, stop
here and use a server-side proxy with a secret instead; do not publish a backend key.

The connector has been checked against Salling's published response examples, tested
using fixtures, and verified with an authenticated production call from the site's
GitHub Pages origin. On 1 November 2026 a search around Rådhuspladsen, Copenhagen,
returned 17 stores and 315 raw clearance records; these are time-specific observations,
not guaranteed availability. The app filtered the response and displayed actual
store inventory. No undocumented auth or borrowed credentials are used.

The owner's production key is backed up in the ignored `.env.production.local` file
and configured as the GitHub Actions repository variable. It is deliberately absent
from tracked source. `.env.local` remains independent, so local development can use
its own origin-restricted key without broadening the production key's allowed origins.

## Data, privacy and limits

Salling supplies short-dated clearance products, not all weekly promotions. The
frontend filters prices, validity, sold-out records, country and brands; nearby
responses are cached in memory for five minutes and concurrent requests are pooled.
Selecting a different store uses inventory already fetched. The API's at-most-20-store
response may be incomplete. Distance is straight-line distance, not a walking route.

Product names are sent to the model exactly as returned, with bounded lengths.
There is no regex-based conversion of prepared dishes into raw ingredients. Prompts
ask the model to respect the actual product form, decline unclear/incompatible inputs
and distinguish pantry items from extras. These are instructions, not quality guarantees.
Recipe quantities are generated for the requested servings, not multiplied locally.
The model must supply separate numeric amounts and explicit units. Both server and
browser validate quantities; a bare number such as “20” is rejected rather than
silently interpreted as grams. Common instructions such as “to taste” remain valid.
The API formats the structured values as Danish/English strings for display and
existing clients. These checks establish quantity format, not culinary correctness.
Prices come from the fetched offers, not the language model. Cost calculations use
explicit quantities where available and disclose assumptions otherwise; they never
price the additional ingredients or pantry items. Stock is not guaranteed at arrival.

There is no analytics, app database, account requirement for visitors or saved address
history. Photon receives an explicitly submitted search; Salling receives the chosen
coordinates; OpenStreetMap serves visible map tiles. The generation Worker receives
product names (up to 60 for suggestions, up to six for a recipe), pantry items, portions,
time, diet preference, language and variant. Developing a suggestion also sends its title,
description and expected extras.
**Address, coordinates, store name, prices and the Salling key are not sent to the
language model.** Hosting/inference providers still receive network metadata and may
retain their own logs. Worker observability samples application logs at 10% and
traces at 1%; invocation logs are disabled. Application logs contain only provider,
model, result status and token counts, never prompts, product names, generated recipe
text or credentials. IP addresses are used for burst limiting.

Photon's public demo API permits reasonable project use without an API key but has
no availability guarantee. Search is explicit, cached and throttled per tab. Providers
can be changed in config. OSM tiles use attribution, caching and normal Referer headers;
there is no bulk/offline download. Automated tests intercept both services. Fonts are
bundled locally. There is no model training or dataset collection in this app.

## Deployment

The Pages workflow tests and builds only pushes to `main`; feature branches do not
publish. `SALLING_FRONTEND_KEY` and `RECIPE_ENDPOINT` are public repository variables
injected into `dist/config.json`. Private model tokens belong only in Worker secrets.
Frontend and Worker deploy independently. Validate Worker changes and actual recipe
quality before publishing a new model or prompt; fixture tests cannot establish that.

## Sources checked 1 November 2026

- [Anti Food Waste and response schema](https://developer.sallinggroup.dev/apireference/food-waste)
- [Supported frontend keys and origin configuration](https://developer.sallinggroup.dev/apireference/front-end)
- [Quotas](https://developer.sallinggroup.dev/apireference/quota)
- [Spike protection / Retry-After](https://developer.sallinggroup.dev/apireference/spike-protection)
- [Salling developer terms](https://developer.sallinggroup.dev/apireference/terms)
- [Photon API and demo-server fair use](https://github.com/komoot/photon)
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Hugging Face Spaces requirements](https://huggingface.co/docs/hub/spaces-overview)

- [Hugging Face inference pricing](https://huggingface.co/docs/inference-providers/en/pricing)
- [Hugging Face chat-completion API](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare Gemma 4 model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
- [Workers AI error codes](https://developers.cloudflare.com/workers-ai/platform/errors/)
- [Hugging Face ZeroGPU eligibility and quotas](https://huggingface.co/docs/hub/spaces-zerogpu)
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Rate limiting scope](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

App code: MIT. External data, map tiles, models and dependencies retain their own
terms; the code licence does not relicense them.
