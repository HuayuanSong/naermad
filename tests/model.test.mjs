import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOffer,
  normalizeStores,
  distanceKm,
  formatTime,
} from "../src/model.js";
import { demoData, DEMO_ORIGIN } from "../src/demo.js";
const now = Date.parse("2026-11-01T12:00:00Z");
const offer = () => demoData(now)[0].clearances[0];

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
test("formats timestamps in Denmark for both numeric and ISO inputs", () => {
  assert.match(formatTime(now), /13[.:]00/);
  assert.equal(formatTime(now), formatTime("2026-11-01T12:00:00Z"));
  assert.equal(formatTime(null), "ukendt");
});
