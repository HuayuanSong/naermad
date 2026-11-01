import test from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  normalizeOffer,
  normalizeStores,
  distanceKm,
  recommend,
  INGREDIENTS,
  formatAmount,
  formatTime,
} from "../src/model.js";
import { RECIPES } from "../src/recipes.js";
import { demoData, DEMO_ORIGIN } from "../src/demo.js";
const now = Date.parse("2026-11-01T12:00:00Z");
const offer = () => demoData(now)[0].clearances[0];

test("recognises Danish raw ingredients without treating prepared dishes as raw products", () => {
  for (const [name, expected] of [
    ["ØKO BROCCOLI 500G", "broccoli"],
    ["SALLING BABYSPINAT 150G", "spinach"],
    ["HVIDLØG 3 STK", "garlic"],
    ["HAKKEDE TOMATER 400G", "cannedTomato"],
    ["CHERRYTOMATER 250G", "tomato"],
    ["GULERØDDER 1KG", "carrot"],
    ["KYLLINGEBRYSTFILET 400G", "chicken"],
    ["SF HØNSESALAT 250G", null],
    ["KYLLINGESALAT", null],
    ["TOMATSUPPE", null],
    ["PIZZA MED BROCCOLI", null],
    ["RØGET LAKSEFILET", null],
    ["SPINATPESTO", null],
    ["TØRREDE KIKÆRTER", null],
    ["KIKÆRTER 500G", null],
    ["KOGTE KIKÆRTER PÅ DÅSE", "chickpea"],
    ["FRISK PASTA", null],
    ["VANILJEYOGHURT", null],
    ["CHOKOLADEMÆLK", null],
    ["KYLLINGEBOUILLON", null],
  ])
    assert.equal(classify(name), expected, name);
});
test("rejects stale, future, sold-out, malformed or non-discounted offers", () => {
  assert.ok(normalizeOffer(offer(), "s", 0, now));
  for (const change of [
    { stock: 0 },
    { stock: -1 },
    { endTime: new Date(now).toISOString() },
    { startTime: new Date(now + 1000).toISOString() },
    { endTime: null },
    { newPrice: null },
    { newPrice: "8" },
    { newPrice: -1 },
    { newPrice: NaN },
    { originalPrice: 8 },
    { currency: "EUR" },
  ])
    assert.equal(
      normalizeOffer(
        { ...offer(), offer: { ...offer().offer, ...change } },
        "s",
        0,
        now,
      ),
      null,
      JSON.stringify(change),
    );
  assert.equal(
    normalizeOffer(
      { ...offer(), offer: { ...offer().offer, stock: null } },
      "s",
      0,
      now,
    ).stock,
    null,
  );
});
test("coordinates use longitude first; actual search radius, country, brands and duplicate records are respected", () => {
  const raw = demoData(now);
  const stores = normalizeStores([...raw, raw[0]], DEMO_ORIGIN, 3, now);
  assert.equal(stores.length, 3);
  assert.ok(stores[0].distance <= stores[1].distance);
  assert.equal(stores.find((s) => s.id === "demo-1").lat, 56.148);
  assert.equal(stores.find((s) => s.id === "demo-1").lon, 10.2008);
  assert.equal(
    normalizeStores(raw, { lat: 55.676, lon: 12.568 }, 3, now).length,
    0,
  );
  assert.equal(
    normalizeStores(
      [{ ...raw[0], store: { ...raw[0].store, brand: "br" } }],
      DEMO_ORIGIN,
      3,
      now,
    ).length,
    0,
  );
  assert.equal(
    normalizeStores(
      [{ ...raw[0], store: { ...raw[0].store, address: { country: "DE" } } }],
      DEMO_ORIGIN,
      3,
      now,
    ).length,
    0,
  );
  assert.throws(() => normalizeStores({ error: "x" }, DEMO_ORIGIN, 3, now));
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.195) <
      0.01,
  );
});
test("deduplicates clearances but preserves distinct prices", () => {
  const raw = demoData(now);
  raw[0].clearances = [
    offer(),
    offer(),
    { ...offer(), offer: { ...offer().offer, newPrice: 5 } },
  ];
  assert.equal(
    normalizeStores(raw, DEMO_ORIGIN, 3, now).find((s) => s.id === "demo-1")
      .offers.length,
    2,
  );
});
test("recipe suggestions have real ingredient overlap, respect selection, diet, time and expiry", () => {
  const offers = normalizeStores(demoData(now), DEMO_ORIGIN, 3, now).find(
    (s) => s.id === "demo-1",
  ).offers;
  const broccoli = offers.find((o) => o.ingredient === "broccoli");
  const results = recommend(RECIPES, offers, {
    selectedIds: new Set([broccoli.id]),
    vegetarian: true,
    maxMinutes: 30,
    now,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "broccoli-pasta");
  assert.equal(results[0].matchedCount, 1);
  assert.ok(results[0].missing.some((i) => i.id === "cream"));
  assert.equal(
    recommend(RECIPES, offers, { selectedIds: new Set(), now }).length,
    0,
  );
  assert.equal(
    recommend(RECIPES, offers, { now: now + 9 * 3600000 }).length,
    0,
  );
  assert.equal(
    recommend(RECIPES, [{ ...broccoli, ingredient: null }], { now }).length,
    0,
  );
});
test("duplicate ingredient offers do not inflate matching; chooses cheaper offer and pantry is explicit", () => {
  const offers = normalizeStores(demoData(now), DEMO_ORIGIN, 3, now).find(
    (s) => s.id === "demo-1",
  ).offers;
  const broccoli = offers.find((o) => o.ingredient === "broccoli");
  const a = recommend(
    RECIPES,
    [broccoli, { ...broccoli, id: "cheaper", price: 3 }],
    { now },
  ).find((r) => r.id === "broccoli-pasta");
  assert.equal(a.matchedCount, 1);
  assert.equal(a.matched[0].offer.price, 3);
  assert.ok(a.pantryItems.length > 0);
  const b = recommend(RECIPES, [broccoli], { pantry: false, now }).find(
    (r) => r.id === "broccoli-pasta",
  );
  assert.equal(b.pantryItems.length, 0);
  assert.ok(b.missing.some((i) => i.id === "oil"));
});
test("every published template has complete structured ingredients, amounts and instructions", () => {
  assert.equal(RECIPES.length, 18);
  assert.equal(new Set(RECIPES.map((r) => r.id)).size, 18);
  for (const r of RECIPES) {
    assert.ok(r.steps.length >= 4);
    assert.ok(r.minutes > 0);
    assert.equal(
      new Set(r.ingredients.map((i) => i.id)).size,
      r.ingredients.length,
    );
    for (const i of r.ingredients) {
      assert.ok(INGREDIENTS[i.id]);
      assert.ok(i.amount > 0);
      assert.ok(i.unit);
    }
    if (r.vegetarian)
      assert.ok(
        !r.ingredients.some((i) =>
          ["chicken", "beef", "salmon"].includes(i.id),
        ),
      );
  }
  assert.equal(formatAmount(300, 4), "600");
  assert.equal(formatAmount(1, 1), "0,5");
  assert.match(formatTime(now), /13[.:]00/);
  assert.equal(formatTime(now), formatTime("2026-11-01T12:00:00Z"));
  assert.equal(formatTime(null), "ukendt");
});
