import { test, expect } from "@playwright/test";
import { demoData, DEMO_ORIGIN } from "../../src/demo.js";
import AxeBuilder from "@axe-core/playwright";
// No automated map tile downloading or geocoder load. Upstream APIs are fixture-backed here.
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X3GZAAAAAElFTkSuQmCC",
        "base64",
      ),
    }),
  );
  await page.route("https://photon.komoot.io/**", (r) =>
    r.fulfill({
      json: {
        features: [
          {
            properties: {
              countrycode: "DK",
              name: "Københavns Hovedbanegård",
              city: "København",
              postcode: "1570",
            },
            geometry: { coordinates: [12.564, 55.672] },
          },
        ],
      },
    }),
  );
});
// Synthetic model output is only used by automated tests; the app has no mock fallback.
const endpoint = "https://recipes.example.test/recipe";
const config = {
  sallingFrontendKey: "",
  recipeEndpoint: endpoint,
  geocoderUrl: "https://photon.komoot.io/api/",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};
const generated = (input) => ({
  status: "ok",
  title: "Testret med valgte varer",
  description: "Syntetisk svar til UI-test.",
  servings: input.servings,
  minutes: 20,
  ingredients: [
    ...input.products.map((p) => ({
      name: p.name,
      quantity: "600 g",
      productId: p.id,
      pantryItem: null,
    })),
    { name: "pasta", quantity: "300 g", productId: null, pantryItem: null },
    { name: "olie", quantity: "1 spsk.", productId: null, pantryItem: "olie" },
  ],
  steps: [
    "Klargør de valgte varer.",
    "Tilbered de valgte varer.",
    "Servér med pasta og olie.",
  ],
  model: "test-fixture-only",
  provider: "test",
  generatedAt: new Date().toISOString(),
});
async function connectFixture(page, respond) {
  await page.route("**/config.json", (r) => r.fulfill({ json: config }));
  await page.route(endpoint, async (r) => {
    const input = r.request().postDataJSON();
    if (respond) return respond(r, input);
    return r.fulfill({
      json: generated(input),
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
}
async function selectBroccoli(page) {
  await page.locator('[data-store="demo-1"]').click();
  await page
    .getByRole("button", { name: "Vælg Broccoli · 1 stk.", exact: true })
    .click();
}

async function connectInventory(page, inventory) {
  await page.route("**/config.json", (route) =>
    route.fulfill({
      json: { ...config, sallingFrontendKey: "fixture-only-public-key" },
    }),
  );
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      json: {
        features: [
          {
            properties: { countrycode: "DK", name: "Aarhus H" },
            geometry: { coordinates: [DEMO_ORIGIN.lon, DEMO_ORIGIN.lat] },
          },
        ],
      },
    }),
  );
  await page.route("https://api.sallinggroup.com/**", (route) =>
    route.fulfill({ json: inventory }),
  );
  await page.goto("/");
  await page.locator("#address").fill("Aarhus H");
  await page.locator("#search-button").click();
  await page.locator('[data-address="0"]').click();
  await selectBroccoli(page);
}

test("an offer expiring at another store does not discard the current recipe", async ({
  page,
}) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const inventory = demoData(now);
  inventory[1].clearances[0].offer.endTime = new Date(
    now + 30000,
  ).toISOString();
  await connectFixture(page);
  await connectInventory(page, inventory);
  await page.locator("#generate").click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.clock.fastForward(61000);
  await expect(page.locator('[data-store="demo-2"]')).toContainText(
    "7 datovarer",
  );
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await expect(page.locator(".selection-heading")).toContainText(
    "1 varer valgt",
  );
});

test("a recipe response cannot revive an offer that expired while the model was working", async ({
  page,
}) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const inventory = demoData(now);
  inventory[0].clearances[0].offer.endTime = new Date(
    now + 30000,
  ).toISOString();
  let release;
  await connectFixture(page, async (route, input) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: generated(input) });
  });
  await connectInventory(page, inventory);
  await page.locator("#generate").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  // The periodic expiry check has not run yet.
  await page.clock.fastForward(31000);
  release();
  await expect(page.locator("#cancel-generation")).toBeHidden();
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await expect(page.locator(".selection-heading")).toContainText(
    "0 varer valgt",
  );
  await expect(page.locator("#message")).toContainText(
    "Udløbne tilbud er fjernet",
  );
});

test("location controls wait for configuration and the map can open safely during startup", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release;
  const pendingConfig = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/config.json", async (route) => {
    await pendingConfig;
    await route.fulfill({ json: config });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#map-disclosure > summary").click();
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#search-button")).toBeDisabled();
  await expect(page.locator("#locate")).toBeDisabled();
  expect(errors).toEqual([]);
  release();
  await expect(page.locator(".store-card")).toHaveCount(3);
  await expect(page.locator("#search-button")).toBeEnabled();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a configuration failure keeps location controls disabled after changing language", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/config.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await expect(page.locator("#mode-badge")).toHaveText("Ikke tilsluttet");
  await page.locator("#language").selectOption("en");
  await page.locator("#map-disclosure > summary").click();
  await expect(page.locator("#search-button")).toBeDisabled();
  await expect(page.locator("#locate")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("recipe is generated only on request, with selected products, portions and explicit extras", async ({
  page,
}) => {
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await connectFixture(page, (r, input) => {
    requests.push(input);
    return r.fulfill({
      json: generated(input),
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/");
  await expect(page.locator(".store-card")).toHaveCount(3);
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await expect(page.locator("#generate")).toBeDisabled();
  await selectBroccoli(page);
  await page.locator("#vegetarian").check();
  await page.locator("#servings").selectOption("4");
  expect(requests).toHaveLength(0);
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await page.locator("#generate").click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].products).toEqual([
    { id: "p1", name: "Broccoli · 1 stk." },
  ]);
  expect(requests[0].servings).toBe(4);
  expect(requests[0].vegetarian).toBe(true);
  expect(requests[0]).not.toHaveProperty("address");
  await expect(page.locator(".recipe-provenance")).toContainText("Broccoli");
  await expect(page.locator(".recipe-extras")).toContainText("pasta");
  await page.locator("[data-recipe]").click();
  await expect(page.locator("#recipe-dialog")).toBeVisible();
  await expect(page.locator(".shopping-list")).toContainText("600 g");
  await expect(page.locator(".shopping-list")).toContainText("Fra dit køkken");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-list").click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "naermad-opskrift.txt",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#recipe-dialog")).not.toBeVisible();
  await page.locator("#another-recipe").click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  expect(requests).toHaveLength(2);
  expect(requests[1].variant).toBe(1);
  expect(errors).toEqual([]);
});
test("missing model connection is explicit and produces no recipe", async ({
  page,
}) => {
  await page.route("**/config.json", (r) =>
    r.fulfill({ json: { ...config, recipeEndpoint: "" } }),
  );
  await page.goto("/");
  await selectBroccoli(page);
  await expect(page.locator("#generate")).toBeDisabled();
  await expect(page.locator("#generation-status")).toContainText(
    "endnu ikke tilsluttet",
  );
  await expect(page.locator(".recipe-card")).toHaveCount(0);
});
test("changing selection or cancelling ignores a pending model result", async ({
  page,
}) => {
  let release, started;
  let pending = new Promise((resolve) => {
    started = resolve;
  });
  await connectFixture(page, async (r, input) => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    await r
      .fulfill({
        json: generated(input),
        headers: { "Access-Control-Allow-Origin": "*" },
      })
      .catch(() => {});
  });
  await page.goto("/");
  await selectBroccoli(page);
  await page.locator("#generate").click();
  await pending;
  await expect(page.locator("#cancel-generation")).toBeVisible();
  await page.locator('[data-store="demo-3"]').click();
  release();
  await expect(page.locator("#generate")).toBeDisabled();
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await expect(page.locator(".selection-heading")).toContainText(
    "0 varer valgt",
  );
  pending = new Promise((resolve) => {
    started = resolve;
  });
  await selectBroccoli(page);
  await page.locator("#generate").click();
  await pending;
  await page.locator("#cancel-generation").click();
  release();
  await expect(page.locator("#generation-status")).toContainText("annulleret");
  await expect(page.locator(".recipe-card")).toHaveCount(0);
});
test("invalid model output and inference errors never fall back to fixed recipes", async ({
  page,
}) => {
  let count = 0;
  await connectFixture(page, (r, input) => {
    count++;
    if (count === 1)
      return r.fulfill({
        json: { ...generated(input), ingredients: [] },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    return r.fulfill({
      status: 429,
      json: { error: "Prøv igen senere." },
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/");
  await selectBroccoli(page);
  await page.locator("#generate").click();
  await expect(page.locator("#generation-status")).toContainText(
    "kunne ikke bruges",
  );
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await page.locator("#generate").click();
  await expect(page.locator("#generation-status")).toContainText(
    "Prøv igen senere",
  );
  await expect(page.locator(".recipe-card")).toHaveCount(0);
});
test("address results work; demo stores are never invented near another city", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#address").fill("København H");
  await page.locator("#search-button").click();
  await page.locator('[data-address="0"]').click();
  await expect(page.locator(".store-card")).toHaveCount(0);
  await expect(page.locator("#message")).toContainText("ingen demobutikker");
  await page.locator("#demo-reset").click();
  await expect(page.locator(".store-card")).toHaveCount(3);
});
test("mobile has no horizontal overflow, working filters and accessible dialog", async ({
  page,
}) => {
  await connectFixture(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await expect(page.locator(".store-card")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await selectBroccoli(page);
  await page.locator("#generate").click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("[data-recipe]").click();
  await expect(page.locator("#recipe-dialog")).toBeVisible();
  expect(
    await page
      .locator("#recipe-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Om Nærmad" }).click();
  await expect(page.locator("#about-dialog")).toBeVisible();
  expect(
    await page
      .locator("#about-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#about-dialog")).not.toBeVisible();
});
test("configured live flow consumes one nearby request, filters expired offers and never uses demo fallback on errors", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/config.json", (r) =>
    r.fulfill({
      json: {
        sallingFrontendKey: "fixture-only-public-key",
        geocoderUrl: "https://photon.komoot.io/api/",
        tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      },
    }),
  );
  await page.route("https://photon.komoot.io/**", (r) =>
    r.fulfill({
      json: {
        features: [
          {
            properties: { countrycode: "DK", name: "Aarhus H" },
            geometry: { coordinates: [10.2039, 56.1532] },
          },
        ],
      },
    }),
  );
  await page.route("https://api.sallinggroup.com/**", (r) => {
    calls++;
    const data = demoData();
    data[0].clearances[0].offer.endTime = "2020-01-01T00:00:00Z";
    return r.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page.locator("#demo-notice")).not.toBeVisible();
  await page.locator("#address").fill("Aarhus H");
  await page.locator("#search-button").click();
  await page.locator('[data-address="0"]').click();
  await expect(page.locator(".store-card")).toHaveCount(3);
  expect(calls).toBe(1);
  await page.locator('[data-store="demo-1"]').click();
  await expect(page.locator(".selection-heading")).toContainText(
    "0 varer valgt · 7 datovarer",
  );
  await page.locator("#language").selectOption("en");
  await expect(page.locator(".selection-heading")).toContainText(
    "0 selected · 7 markdowns",
  );
  await expect(page.locator('[data-store="demo-1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#language").selectOption("da");
  expect(calls).toBe(1);
  await page.locator('[data-store="demo-2"]').click();
  await page.locator("#refresh").click();
  await expect(page.locator(".store-card")).toHaveCount(3);
  expect(calls).toBe(1);
});
test("live authentication error remains an error", async ({ page }) => {
  await page.route("**/config.json", (r) =>
    r.fulfill({
      json: {
        sallingFrontendKey: "fixture",
        geocoderUrl: "https://photon.komoot.io/api/",
        tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      },
    }),
  );
  await page.route("https://api.sallinggroup.com/**", (r) =>
    r.fulfill({ status: 403, json: { error: "Forbidden" } }),
  );
  await page.goto("/");
  await page.locator("#address").fill("København H");
  await page.locator("#search-button").click();
  await page.locator('[data-address="0"]').click();
  await expect(page.locator("#message")).toContainText(
    "Salling-adgangen virker ikke",
  );
  await expect(page.locator(".store-card")).toHaveCount(0);
  await expect(page.locator("#demo-notice")).not.toBeVisible();
});

test("main view and dialogs pass automated WCAG A/AA checks", async ({
  page,
}) => {
  await connectFixture(page);
  await page.goto("/");
  await expect(page.locator(".store-card")).toHaveCount(3);
  await selectBroccoli(page);
  await page.locator("#generate").click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  for (const screen of ["main", "recipe", "about"]) {
    if (screen === "recipe")
      await page.locator("[data-recipe]").first().click();
    if (screen === "about") {
      await page.keyboard.press("Escape");
      await page.locator("#about-button").click();
    }
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations, screen).toEqual([]);
  }
});

const suggested = (input) => ({
  status: "ok",
  ideas: [
    {
      title: "Cremet grøntsagspasta",
      description: "En pastaret med to af butikkens datovarer.",
      minutes: 20,
      productIds: input.products.slice(0, 2).map((p) => p.id),
      extraIngredients: ["pasta"],
    },
    {
      title: "Grøntsager på panden",
      description: "En anden idé med en af butikkens varer.",
      minutes: 15,
      productIds: [input.products[0].id],
      extraIngredients: ["hvidløg"],
    },
    {
      title: "En lun frokost",
      description: "Et tredje syntetisk forslag til UI-test.",
      minutes: 20,
      productIds: [input.products[1].id],
      extraIngredients: [],
    },
  ],
});
const ideasUrl = "https://recipes.example.test/ideas";

test("AI chooses products from the store; choosing a suggestion requests its full recipe and preserves manual choices", async ({
  page,
}) => {
  const recipeRequests = [],
    ideaRequests = [];
  await connectFixture(page, (r, input) => {
    recipeRequests.push(input);
    return r.fulfill({
      json: { ...generated(input), title: input.idea?.title || "Testret" },
    });
  });
  await page.route(ideasUrl, (r) => {
    const input = r.request().postDataJSON();
    ideaRequests.push(input);
    return r.fulfill({ json: suggested(input) });
  });
  await page.goto("/");
  await selectBroccoli(page);
  await page.getByRole("radio", { name: /Lad AI vælge/ }).check();
  await expect(page.locator("#offers")).toBeHidden();
  await expect(page.locator("#generate")).toBeEnabled();
  expect(ideaRequests).toHaveLength(0);
  expect(recipeRequests).toHaveLength(0);
  await page.locator("#generate").click();
  await expect(page.locator(".idea-card")).toHaveCount(3);
  expect(ideaRequests).toHaveLength(1);
  expect(ideaRequests[0].products.length).toBeGreaterThan(1);
  expect(ideaRequests[0]).not.toHaveProperty("address");
  expect(ideaRequests[0].products[0]).not.toHaveProperty("price");
  expect(recipeRequests).toHaveLength(0);
  await expect(page.locator(".idea-card").first()).toContainText("Køb også");
  await expect(page.locator(".idea-card .idea-cost").first()).toContainText(
    "For én pakke/stk. af hver nedsat vare",
  );
  await page.locator('[data-idea="0"]').click();
  await expect(page.locator("#recipe-dialog")).toBeVisible();
  await expect(page.locator("#recipe-dialog-title")).toHaveText(
    "Cremet grøntsagspasta",
  );
  expect(recipeRequests).toHaveLength(1);
  expect(recipeRequests[0].products).toHaveLength(2);
  expect(recipeRequests[0].idea.title).toBe("Cremet grøntsagspasta");
  await page.keyboard.press("Escape");
  await page.locator("#generate").click();
  await expect(page.locator(".idea-card")).toHaveCount(3);
  expect(ideaRequests[1].variant).toBe(1);
  await page.getByRole("radio", { name: /Jeg vælger varerne/ }).check();
  await expect(page.locator(".idea-card")).toHaveCount(0);
  await expect(page.locator(".selection-heading")).toContainText(
    "1 varer valgt",
  );
  await expect(page.locator("#selected-products")).toContainText("Broccoli");
});

test("inspiration handles refusal, invalid references and quota errors without a recipe fallback", async ({
  page,
}) => {
  await connectFixture(page);
  let reply = {
      status: "cannot_create",
      reason: "Ingen egnede varer til dine valg.",
      ideas: [],
    },
    status = 200;
  await page.route(ideasUrl, (r) => r.fulfill({ status, json: reply }));
  await page.goto("/");
  await page.getByRole("radio", { name: /Lad AI vælge/ }).check();
  await page.locator("#generate").click();
  await expect(page.locator("#ideas-list")).toContainText("Ingen egnede varer");
  reply = {
    status: "ok",
    ideas: [
      {
        title: "Opfundet",
        description: "Ukendt reference.",
        minutes: 10,
        productIds: ["p60"],
        extraIngredients: [],
      },
    ],
  };
  await page.locator("#generate").click();
  await expect(page.locator("#generation-status")).toContainText(
    "Forslagene kunne ikke bruges",
  );
  status = 429;
  reply = { error: "Dagens gratis opskriftskvote er brugt op." };
  await page.locator("#generate").click();
  await expect(page.locator("#generation-status")).toContainText(
    "gratis opskriftskvote",
  );
  await expect(page.locator(".idea-card")).toHaveCount(0);
  await expect(page.locator(".recipe-card")).toHaveCount(0);
});

test("changing store, preferences or mode discards stale inspiration and pending results", async ({
  page,
}) => {
  await connectFixture(page);
  let pending;
  await page.route(ideasUrl, async (r) => {
    const input = r.request().postDataJSON();
    await new Promise((resolve) => {
      pending = resolve;
    });
    await r.fulfill({ json: suggested(input) }).catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("radio", { name: /Lad AI vælge/ }).check();
  await page.locator("#generate").click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.locator('[data-store="demo-2"]').click();
  pending();
  await expect(page.locator(".idea-card")).toHaveCount(0);
  await expect(page.locator("#generate")).toBeEnabled();
  await page.unroute(ideasUrl);
  await page.route(ideasUrl, (r) =>
    r.fulfill({ json: suggested(r.request().postDataJSON()) }),
  );
  await page.locator("#generate").click();
  await expect(page.locator(".idea-card")).toHaveCount(3);
  await page.locator("#servings").selectOption("4");
  await expect(page.locator(".idea-card")).toHaveCount(0);
  await page.locator("#generate").click();
  await expect(page.locator(".idea-card")).toHaveCount(3);
  await page.getByRole("radio", { name: /Jeg vælger varerne/ }).check();
  await expect(page.locator(".idea-card")).toHaveCount(0);
  await expect(page.locator("#generate")).toBeDisabled();
});

test("inspiration and new theme pass accessibility checks and fit narrow screens", async ({
  page,
}) => {
  await connectFixture(page, (r, input) =>
    r.fulfill({
      json: { ...generated(input), title: input.idea?.title || "Testret" },
    }),
  );
  await page.route(ideasUrl, (r) =>
    r.fulfill({ json: suggested(r.request().postDataJSON()) }),
  );
  await page.goto("/");
  await page.getByRole("radio", { name: /Lad AI vælge/ }).check();
  await page.locator("#generate").click();
  await expect(page.locator(".idea-card")).toHaveCount(3);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator('[data-idea="0"]').click();
  await expect(page.locator("#recipe-dialog")).toBeVisible();
  expect(
    await page
      .locator("#recipe-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});

const generatedEnglish = (input) => ({
  ...generated(input),
  title: input.idea?.title || "Broccoli pasta",
  description: "An English fixture for the selected products.",
  ingredients: [
    ...input.products.map((p) => ({
      name: "broccoli",
      quantity: "200 g",
      productId: p.id,
      pantryItem: null,
    })),
    { name: "pasta", quantity: "150 g", productId: null, pantryItem: null },
    { name: "oil", quantity: "1 tbsp", productId: null, pantryItem: "oil" },
  ],
  steps: [
    "Prepare the broccoli.",
    "Cook the pasta as directed on the packet.",
    "Cook the broccoli in oil and serve with pasta.",
  ],
});

test("language switch preserves selections and preferences, translates dialogs and downloads, and persists", async ({
  page,
}) => {
  const requests = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await connectFixture(page, (r, input) => {
    requests.push(input);
    return r.fulfill({ json: generatedEnglish(input) });
  });
  await page.goto("/");
  await selectBroccoli(page);
  await page.locator("#servings").selectOption("4");
  await page.locator("#vegetarian").check();
  await page.locator(".pantry-details").evaluate((el) => (el.open = true));
  await page.locator("#extra-pantry").fill("hvidløg");
  await page
    .getByRole("combobox", { name: "Sprog", exact: true })
    .selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true }),
  ).toHaveValue("en");
  await expect(page.locator("#hero-title")).toHaveText("What shall we eat?");
  await expect(page.locator('[data-store="demo-1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", {
      name: "Deselect Broccoli · 1 stk.",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#servings")).toHaveValue("4");
  await expect(page.locator("#vegetarian")).toBeChecked();
  await expect(page.locator("#extra-pantry")).toHaveValue("hvidløg");
  await expect(page.locator(".offer-card.selected .prices")).toContainText(
    "DKK",
  );
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "About Nærmad" }).click();
  await expect(page.locator("#about-dialog")).toContainText(
    "Your language preference is saved only in this browser.",
  );
  await page.getByRole("button", { name: "Close information" }).click();
  await page.locator("#generate").click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  expect(requests[0].language).toBe("en");
  expect(requests[0].pantry).toEqual([
    "oil",
    "salt",
    "black pepper",
    "water",
    "hvidløg",
  ]);
  await page.locator("[data-recipe]").click();
  await expect(page.locator(".shopping-list")).toContainText(
    "From your pantry",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as text" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("naermad-recipe.txt");
  const stream = await download.createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain(
    "AI-generated recipe\nStore:",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator("#hero-title")).toHaveText("What shall we eat?");
  await page.locator("#language").selectOption("da");
  await expect(page.locator("#hero-title")).toHaveText("Hvad skal vi spise?");
  expect(errors).toEqual([]);
});

test("English inspiration requests English recipes and remains accessible on a narrow phone", async ({
  page,
}) => {
  const requests = [];
  await connectFixture(page, (r, input) => {
    requests.push(input);
    return r.fulfill({ json: generatedEnglish(input) });
  });
  await page.route(ideasUrl, (r) => {
    const input = r.request().postDataJSON();
    requests.push(input);
    return r.fulfill({
      json: {
        status: "ok",
        ideas: [
          {
            title: "Broccoli pasta",
            description: "A simple vegetable pasta.",
            minutes: 20,
            productIds: [input.products[0].id],
            extraIngredients: ["pasta"],
          },
        ],
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".store-card")).toHaveCount(3);
  await page.locator("#language").selectOption("en");
  await page.getByRole("radio", { name: /Let AI choose/ }).check();
  await page.getByRole("button", { name: "Suggest meals" }).click();
  await expect(page.locator(".idea-card")).toHaveCount(1);
  expect(requests[0].language).toBe("en");
  await page.locator("[data-idea]").click();
  await expect(page.locator("#recipe-dialog")).toBeVisible();
  expect(requests[1].language).toBe("en");
  expect(requests[1].idea.title).toBe("Broccoli pasta");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 800 });
  const language = await page.locator("#language").boundingBox();
  const brand = await page.locator(".brand").boundingBox();
  expect(language.x).toBeGreaterThan(brand.x + brand.width);
  expect(Math.abs(language.y - brand.y)).toBeLessThan(15);
  expect(language.x + language.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test("switching languages cancels pending generation without another AI request and ignores the stale reply", async ({
  page,
}) => {
  let release,
    calls = 0;
  await connectFixture(page, async (r, input) => {
    calls++;
    await new Promise((resolve) => (release = resolve));
    await r.fulfill({ json: generated(input) }).catch(() => {});
  });
  await page.goto("/");
  await selectBroccoli(page);
  await page.locator("#generate").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator("#generate .loading-spinner")).toBeVisible();
  await page.locator("#language").selectOption("en");
  release();
  await expect(page.locator("#generate")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#generation-status")).toContainText(
    "Language changed",
  );
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await expect(page.locator(".offer-card.selected")).toHaveCount(1);
  expect(calls).toBe(1);
});

test("discounted shopping total buys enough packs, excludes extras, updates without inference and survives downloads/reopening", async ({
  page,
}) => {
  let calls = 0;
  await connectFixture(page, (r, input) => {
    calls++;
    return r.fulfill({ json: generated(input) });
  });
  await page.goto("/");
  await page.locator('[data-store="demo-1"]').click();
  await page
    .getByRole("button", { name: "Vælg Kyllingebryst · 400 g", exact: true })
    .click();
  await page.locator("#generate").click();
  await expect(page.locator(".recipe-card .cost-total")).toContainText("50,00");
  await expect(page.locator(".recipe-card .cost-summary")).toContainText(
    "Ekstra indkøb og basisvarer er ikke medregnet",
  );
  await page.locator("[data-recipe]").click();
  await page.locator(".cost-breakdown > summary").click();
  await expect(page.locator(".cost-line")).toHaveCount(1);
  await expect(page.locator("#cost-p1")).toHaveValue("2");
  await expect(page.locator(".cost-equation")).toContainText(
    "2 pakker/stk. × 25,00",
  );
  await page.locator("#cost-p1").fill("3");
  await expect(page.locator("#recipe-cost-summary .cost-total")).toContainText(
    "75,00",
  );
  await expect(page.locator(".recipe-card .cost-total")).toContainText("75,00");
  await expect(page.locator(".cost-line-note")).toContainText(
    "Antal angivet af dig",
  );
  expect(calls).toBe(1);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-list").click();
  const stream = await (await downloadPromise).createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain(
    "Nedsatte varer i alt: 75,00",
  );
  await page.keyboard.press("Escape");
  await page.locator("[data-recipe]").click();
  await expect(page.locator("#cost-p1")).toHaveValue("3");
  await page.locator(".cost-breakdown > summary").click();
  await page.locator("#cost-p1").fill("");
  await expect(page.locator("#recipe-cost-summary")).toContainText("delsum");
  await expect(page.locator("#recipe-cost-summary .cost-total")).toContainText(
    "+ ?",
  );
  await expect(page.locator("#cost-p1")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.locator("#cost-p1").fill("2");
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page
      .locator("#recipe-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  // Closed details still print the purchase quantities and price calculation.
  await page.locator(".cost-breakdown > summary").click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".cost-equation")).toBeVisible();
});

test("English costs identify a one-pack assumption and accept a corrected quantity", async ({
  page,
}) => {
  await connectFixture(page, (r, input) =>
    r.fulfill({ json: generatedEnglish(input) }),
  );
  await page.goto("/");
  await selectBroccoli(page);
  await page.locator("#language").selectOption("en");
  await page.locator("#generate").click();
  await expect(page.locator(".recipe-card .cost-label")).toContainText(
    "estimated total",
  );
  await expect(page.locator(".recipe-card .cost-total")).toContainText("8.00");
  await page.locator("[data-recipe]").click();
  await page
    .getByText("View and adjust the cost breakdown", { exact: true })
    .click();
  await expect(page.locator(".cost-line-note")).toContainText(
    "One pack/item assumed",
  );
  await page
    .getByRole("spinbutton", {
      name: "Quantity to buy: Broccoli · 1 stk.",
      exact: true,
    })
    .fill("2");
  await expect(page.locator("#recipe-cost-summary .cost-total")).toContainText(
    "16.00",
  );
  await expect(page.locator("#recipe-cost-summary")).not.toContainText(
    "estimated total",
  );
  await expect(page.locator(".cost-line-note")).toContainText(
    "Quantity entered by you",
  );
});

test("unitless model amounts never reach the recipe or cost panel; structured amounts display units in the list and download", async ({
  page,
}) => {
  let quantity = "20",
    calls = 0;
  await connectFixture(page, (r, input) => {
    calls++;
    const value = generatedEnglish(input);
    value.ingredients[0].quantity = quantity;
    return r.fulfill({ json: value });
  });
  await page.goto("/");
  await selectBroccoli(page);
  await page.locator("#language").selectOption("en");
  for (const invalid of ["20", "150"]) {
    quantity = invalid;
    await page.locator("#generate").click();
    await expect(page.locator("#generation-status")).toContainText(
      "missing clear quantities or units",
    );
    await expect(page.locator("#generate")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.locator(".recipe-card")).toHaveCount(0);
    await expect(page.locator(".cost-summary")).toHaveCount(0);
  }
  expect(calls).toBe(2);
  quantity = { amount: 150, unit: "g" };
  await page.locator("#generate").click();
  await page.locator("[data-recipe]").click();
  await expect(page.locator(".shopping-list")).toContainText("150 g broccoli");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-list").click();
  const stream = await (await downloadPromise).createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain("150 g broccoli");
  expect(calls).toBe(3);
});
