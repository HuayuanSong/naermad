# Nærmad

**Fra datovare til aftensmad.** A Danish grocery markdown finder: search for an
address or place, choose a nearby store, select discounted ingredients, and find
recipes that use them.

**Website:** https://huayuansong.github.io/naermad/

The initial public deployment is a **clearly labelled demo**. Its three stores,
inventory and prices are fictional examples around Aarhus. Address search and
the map use real OpenStreetMap data. A demo search outside Aarhus returns no demo
stores; example stores are never moved to a user's location.

## What works

- Address and place-name search, including landmarks; optional browser location.
- Freely pannable, smoothly zoomable Leaflet map and stores sorted by straight-line distance.
- Salling Anti Food Waste adapter, with a five-minute in-memory cache, request
  coalescing, timeouts, `Retry-After` handling and explicit authentication/quota errors.
- Active markdown filtering: excludes expired/future offers, sold-out offers,
  invalid prices and non-DKK entries. Does not pretend inventory is guaranteed.
- 18 original recipe templates with ingredient amounts, methods and adjustable servings.
- Conservative Danish product-name matching with a visible manual correction control.
- Ranking by distinct selected ingredients used, then ingredient coverage. Vegetarian
  and time filters; complete lists of discounted, missing and pantry ingredients.
- Copyable, downloadable and printable recipe/shopping lists.
- Mobile layout, keyboard controls, accessible native dialogs and self-hosted fonts.

This first version uses deterministic matching, not an LLM. The earlier recipe
fine-tuning dataset and model are not used or published here. Recipe templates were
written with AI assistance for this project, are editable and have not been kitchen-tested.

## Run locally

Requires Node.js 22.12+ (or a supported newer version).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4325/. With no key, the complete demo works automatically.

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

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

The connector has been checked against Salling's published response examples and
tested using fixtures. An authenticated production call remains **unverified until
the owner supplies the scoped frontend key**. The current OpenAPI download requires
portal login; no undocumented auth or demo-site credentials are used.

## Hosting

**GitHub Pages is the selected host.** The site is static: Vite builds HTML, CSS and
JavaScript, Leaflet renders the map, and recipe matching runs in the visitor's browser.
Salling explicitly documents frontend integrations, so a server is unnecessary when
the account provides a suitable food-waste frontend key.

The included workflow runs model/API tests and Chromium browser tests, builds `dist/`
and deploys it. Enable Pages with **GitHub Actions** as the source. Without a configured
key, deployment remains a demo. Add/change the repository variable and redeploy to connect.
Runtime configuration is in `dist/config.json`; no query parameters or private files
are embedded into the build. The source `public/config.json` always has an empty key.

A Hugging Face **static** Space could also serve `dist/`, but it would not make keys
private. A Docker Space/proxy is an option if private credentials or a central cache
become necessary. As checked on 1 November 2026, Hugging Face says creating Docker
Spaces requires a paid plan despite CPU Basic having no hourly cost; this project
does not create paid infrastructure or require a Hugging Face subscription.

## Data, matching and limits

- Product identity is inferred from Danish names. Prepared dishes, sauces, smoked
  fish and explicitly dried chickpeas are not treated as fresh recipe ingredients.
  Ambiguous chickpeas are left unmatched unless described as cooked/canned. A user
  can correct or remove a match using the ingredient dropdown; this is not an
  allergen certification or a comprehensive product ontology.
- Recipe rankings count distinct ingredient types, not duplicate offers for the same
  ingredient. If several selected offers match one ingredient, the lowest listed
  price is shown; this does not compare price per kg or required pack quantities.
- Prices are per API sales unit (or kg when provided). No total recipe price, savings
  per meal or number of packs is inferred from missing package sizes.
- Ingredients marked “from your kitchen” depend on an explicit checkbox for oil,
  salt, black pepper and water. Other missing ingredients remain visible.
- Recipe quantities scale from two servings; method times and temperatures do not
  scale linearly. Larger portions can need larger pans and extra cooking time.
- Demo time fields are generated for that demo session and labelled as examples.
  Live fetch times and API item timestamps are rendered in Europe/Copenhagen.
  A local timer removes expired offers; it makes no network requests.
- Distance is a great-circle distance, not a walking route or travel time. The 20-store
  API cap means the result may be incomplete, even after sorting by proximity.

## Privacy and shared services

There is no analytics, user account, server database or address persistence. The app
keeps searches in memory only. Searching explicitly sends the text to **Photon**;
choosing a result in live mode sends coordinates to **Salling**; viewing the map
requests tiles from **OpenStreetMap**. Hosts/providers may retain their own request logs.
Geolocation is used only after the user clicks the location button and the browser
permits access. Fonts are bundled locally.

Photon's public demo API permits reasonable project use without an API key but has
no availability guarantee. The app submits on user action, caches repeat queries
and throttles new requests in each tab. The provider can be changed in `config.json`;
use a dedicated provider if traffic grows. This app does not use the retired DAWA
service or the public Nominatim search API.

OSM tiles use the required HTTPS URL, visible attribution, browser caching and normal
Referer headers. There is no tile prefetch/offline download. Automated tests intercept
tile and search requests rather than loading shared services.

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

App code and original templates: MIT. External Salling data, map tiles, OpenStreetMap
data and dependencies retain their respective terms; the code licence does not relicense them.
