# Setup and deployment

[Back to README](../README.md) · [Architecture](architecture.md)

## Local development

Use Node.js 22.12+ or a supported newer version.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4325/>. Without a Salling key, the app shows three explicitly
fictional Aarhus stores. Generation is unavailable without a recipe endpoint.
The demo inventory can be used with a configured generation endpoint.

To connect services, copy the environment template and fill in public settings:

```sh
cp .env.example .env.local
```

| Setting                     | Purpose                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `SALLING_KEY_KIND=frontend` | Required before the build accepts a Salling frontend key                         |
| `SALLING_FRONTEND_KEY`      | Dedicated origin-restricted Salling Frontend / Website App key                   |
| `RECIPE_ENDPOINT`           | Public HTTPS Worker URL ending in `/recipe`; the client derives `/ideas` from it |

Restart the dev server after editing `.env.local`. Both local development and
`npm run build` read this file. Geocoder and map URLs are configured in
[public/config.json](../public/config.json).

**These settings are published to the browser.** Never put a Salling back-end or
personal token, Cloudflare credential or Hugging Face token here. Ignoring an
environment file in Git does not make its bundled values secret.

## Connect Salling

1. Register at [Salling's developer portal](https://developer.sallinggroup.dev/)
   and add **Anti Food Waste** to the API collection.
2. Create a **Frontend / Website App** and select the nearby food-waste read
   operation in production/v1. The app calls
   `GET https://api.sallinggroup.com/v1/food-waste/?geo=LAT,LON&radius=KM`.
   Store metadata is included, so a separate Stores API permission is unnecessary.
3. Create a dedicated frontend key restricted to your frontend origin. This
   deployment uses `https://huayuansong.github.io`. For local development, use
   `http://127.0.0.1:4325`, preferably with a separate development key.
4. Set `SALLING_FRONTEND_KEY` and `SALLING_KEY_KIND=frontend` in `.env.local`.
   For Pages, configure the public repository variable described below.
5. Check from the permitted origin: search for a place and select a store. Confirm
   that live stock appears. Errors remain visible rather than switching to demo data.

A frontend key is intentionally visible to visitors. Origin restrictions support
this integration but cannot prevent every kind of quota abuse. If your account
cannot grant a frontend key the required operation, a backend proxy would be needed;
never substitute a private key in the frontend configuration.

References: [frontend integration](https://developer.sallinggroup.dev/apireference/front-end),
[food-waste API](https://developer.sallinggroup.dev/apireference/food-waste),
[quotas](https://developer.sallinggroup.dev/apireference/quota) and
[Salling's terms](https://developer.sallinggroup.dev/apireference/terms).
Data access is governed by Salling's terms separately from this repository's MIT license.

## Deploy the generation Worker

The current production endpoint is
`https://naermad-recipes.naermad.workers.dev/recipe`.

[wrangler.jsonc](../wrangler.jsonc) configures:

- `generation/worker.js` as the Worker entry point.
- `RECIPE_PROVIDER=cloudflare` and `CF_MODEL=@cf/google/gemma-4-26b-a4b-it`.
- An `AI` binding to Workers AI and a `RATE_LIMITER` binding.
- `ALLOWED_ORIGINS=https://huayuansong.github.io`.
- Sampled observability without prompt or recipe text in application logs.

When deploying a fork, replace `account_id`, choose your Worker name and configure
your frontend's origin. Keep a **Workers Free** account for a strict free-only
deployment: paid accounts can incur AI charges beyond the included allowance.

```sh
npx wrangler login
npx wrangler deploy --dry-run
npx wrangler deploy
```

For local frontend integration, use a dedicated development Worker that permits
`http://127.0.0.1:4325` in `ALLOWED_ORIGINS`, and set its `/recipe` URL in
`.env.local`. Multiple permitted origins are comma-separated. A local endpoint
over HTTP is also accepted for `localhost` or `127.0.0.1`.

| Route          | Purpose                                                          |
| -------------- | ---------------------------------------------------------------- |
| `GET /health`  | Reports provider/binding configuration without calling the model |
| `POST /ideas`  | Generates up to three dish outlines                              |
| `POST /recipe` | Generates one full recipe                                        |

A successful health check does not prove remaining quota or recipe quality. Review
actual generated output when changing model or prompt; this consumes AI allowance.
The Worker requires an allowed `Origin` for generation requests, and supports
CORS preflight requests. It never retries or switches providers automatically.

## Publish the frontend on GitHub Pages

1. Enable **GitHub Actions** as the repository's Pages publishing source.
2. Under **Settings → Secrets and variables → Actions → Variables**, set
   `SALLING_FRONTEND_KEY` to the production frontend key and `RECIPE_ENDPOINT`
   to the deployed Worker's `/recipe` URL.
3. Push to `main`, or run **Test and publish GitHub Pages** manually.
4. Check the public site from its real origin: search, choose a store and generate
   a recipe. Check quantities, discounted-item totals and both languages.

The [workflow](../.github/workflows/pages.yml) installs dependencies, runs unit and
browser tests, builds with Vite and publishes `dist/`. It sets
`SALLING_KEY_KIND=frontend` and injects repository variables into `dist/config.json`.
Changing a repository variable requires another build. Worker deployments are
separate; this workflow only publishes the frontend.

## Checks

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npx wrangler deploy --dry-run
```

On Linux CI, Playwright uses `npx playwright install --with-deps chromium`.
An existing Chromium-compatible executable can be selected with
`PLAYWRIGHT_EXECUTABLE_PATH`.

Browser tests intercept geocoding, map tiles, store data and generation, using
explicitly synthetic model responses. They test integration and interaction, not
real model quality. Live trials and known limitations are in
[VERIFICATION.md](../VERIFICATION.md).

## Optional Hugging Face adapter

The Worker contains an unused Hugging Face Inference Providers adapter. It is
**not deployed**, quality-approved or an automatic fallback. Before using it,
verify model/provider availability and
[current inference pricing](https://huggingface.co/docs/inference-providers/en/pricing).

Select `RECIPE_PROVIDER=huggingface` and an appropriate `HF_MODEL` in Worker
configuration. The code's experimental default is `Qwen/Qwen3-30B-A3B:deepinfra`.
Store a restricted inference token as a Worker secret:

```sh
npx wrangler secret put HF_TOKEN
npx wrangler deploy
```

Never place `HF_TOKEN` in Pages, a `VITE_*` variable or public configuration.
This adapter calls the Hugging Face inference router; it does not host a Space.
