# Nærmad

**Dine varer. En ny opskrift.** Search for a place, choose a nearby store, select
1–6 discounted products, then ask a language model to create a Danish recipe for them.

**Public site:** https://huayuansong.github.io/naermad/

## Branch status

This branch replaces the fixed recipe catalogue with **on-demand generation**.
The UI, Hugging Face/Cloudflare adapters and tests are implemented. An authenticated
inference account has **not** been connected or deployed. `recipeEndpoint` is empty,
so the local app explicitly disables generation. Test fixtures are never served as
actual generated recipes. The public main deployment still runs the previous version
with live Salling inventory and the fixed catalogue until this branch is validated.

## How it works

1. Search for an address or place (landmarks work too), or use browser geolocation.
2. Choose a participating Netto, føtex or Bilka store. Open the map if useful.
3. Select the actual products to use. Nothing is automatically selected.
4. Choose portions, maximum preparation time and optionally vegetarian food. Confirm
   basic pantry items or add a few of your own.
5. Click **Lav en opskrift**. One fresh recipe is requested, with quantities and steps.
   Selected products, pantry ingredients and extra purchases are listed separately.
   **Lav en anden idé** makes another model request. No catalogue fallback exists.

Changing products, store or preferences invalidates pending/previous results. The app
also removes locally expired offers. Lists can be copied, downloaded and printed.

GitHub Pages serves the Vite frontend; a small Cloudflare Worker handles inference.
A shared contract bounds requests, validates structured output and verifies that every
selected product has an ingredient reference. It cannot verify the culinary meaning
of those references, food safety or whether a recipe will taste good. The earlier
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

The same frontend works with either provider. Candidate models require real Danish
recipe evaluation through the deployed endpoint before release. The public Cloudflare
playground is useful for initial testing but is not a production API for this app.

### Cloudflare Workers AI (free quota candidate)

`wrangler.jsonc` binds `AI` and selects `@cf/qwen/qwen3-30b-a3b-fp8` by default.
Cloudflare currently provides 10,000 neurons/day. A **Workers Free** account stops
accepting AI requests after its allowance; a **Workers Paid** account can incur
charges beyond it. Existing account usage shares the allowance. Do not upgrade
or enable billable usage as part of a strictly-free deployment.

After signing into the intended account and checking its plan:

```sh
npx wrangler login
npx wrangler deploy
```

Use the resulting Worker URL with `/recipe` appended as the public `RECIPE_ENDPOINT`.
Set the GitHub Actions repository variable of that name and rebuild the Pages site.
`GET /health` reports whether a provider binding is present; it does not make a model
call or prove the account has quota. Smoke-test actual generation separately.

For local integration, add `http://127.0.0.1:4325` to `ALLOWED_ORIGINS` for a dedicated
development Worker, then put its public URL in the ignored `.env.local`. This allows
local browser requests without broadening Salling's production credential origins.

### Hugging Face Inference Providers

Set `RECIPE_PROVIDER` to `huggingface` in the Worker variables. The candidate default
is `Qwen/Qwen3-30B-A3B:deepinfra`; model/provider availability can change. Use an HF
access token restricted to inference and store it as a **Worker secret**:

```sh
npx wrangler secret put HF_TOKEN
npx wrangler deploy
```

The CLI prompts for the token. Never place it in public configuration, a `VITE_*`
variable, GitHub Pages, source code or a static Space. Optional `HF_MODEL` overrides
the routed model. Hugging Face currently requires inference credits: free accounts
receive no monthly allowance; paid plans include small allowances. Account access
and a budget decision are still required before this option can be made live.

### Request limits and error behavior

- JSON request bodies are limited to 12 KB; at most six products and six servings.
- Generation is user-triggered, capped at 2,400 output tokens, with no automatic retries.
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
store inventory and recipe matches. No undocumented auth or borrowed credentials are used.

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
Prices remain the API's price per sales unit; pack counts and total meal costs are
not inferred from missing package sizes. Stock is not guaranteed at arrival.

There is no analytics, app database, account requirement for visitors or saved address
history. Photon receives an explicitly submitted search; Salling receives the chosen
coordinates; OpenStreetMap serves visible map tiles. The generation Worker receives
selected product names, pantry items, portions, time, diet preference and variant.
**Address, coordinates, store name, prices and the Salling key are not sent to the
language model.** Hosting/inference providers still receive network metadata and may
retain their own logs. The Worker disables optional observability and does not log
prompts, responses or tokens. IP addresses are used for burst limiting.

Photon's public demo API permits reasonable project use without an API key but has
no availability guarantee. Search is explicit, cached and throttled per tab. Providers
can be changed in config. OSM tiles use attribution, caching and normal Referer headers;
there is no bulk/offline download. Automated tests intercept both services. Fonts are
bundled locally. There is no model training or dataset collection in this app.

## Deployment

The Pages workflow tests and builds only pushes to `main`; feature branches do not
publish. `SALLING_FRONTEND_KEY` and `RECIPE_ENDPOINT` are public repository variables
injected into `dist/config.json`. Private model tokens belong only in Worker secrets.
Frontend and Worker deploy independently. Validate the Worker and recipe quality
before replacing the public frontend with this generation-only branch.

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
- [Cloudflare Qwen3 model](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Rate limiting scope](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

App code: MIT. External data, map tiles, models and dependencies retain their own
terms; the code licence does not relicense them.
