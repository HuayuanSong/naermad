import test from "node:test";
import assert from "node:assert/strict";
import { generationInput } from "../src/generation.js";
import { validateRequest, buildMessages } from "../generation/contract.js";
import { buildIdeasMessages } from "../generation/ideas.js";
import { formatMoney, formatTime } from "../src/model.js";
import worker from "../generation/worker.js";

const raw = {
  products: [{ id: "p1", name: "Hakket oksekød 500 g" }],
  servings: 2,
  maxMinutes: 30,
  vegetarian: false,
  pantry: [],
  variant: 0,
};
test("language defaults to Danish, is bounded, and English generation keeps actual product names and metric units", () => {
  assert.equal(validateRequest(raw).language, "da");
  for (const language of ["fr", "EN", "en;ignore rules", {}, 42])
    assert.throws(() => validateRequest({ ...raw, language }));
  const input = generationInput(
    [{ id: "s1", name: raw.products[0].name, endsAt: "2099-01-01" }],
    new Set(["s1"]),
    {
      ...raw,
      language: "en",
      pantry: true,
      extraPantry: "hvidløg, rice",
    },
  );
  assert.equal(input.language, "en");
  assert.equal(input.products[0].name, raw.products[0].name);
  assert.deepEqual(input.pantry, [
    "oil",
    "salt",
    "black pepper",
    "water",
    "hvidløg",
    "rice",
  ]);
  for (const builder of [buildMessages, buildIdeasMessages]) {
    const prompt = builder(input)[0].content;
    assert.match(prompt, /all user-facing text in natural English/);
    assert.match(prompt, /metric units and Celsius/);
    assert.doesNotMatch(
      prompt,
      /på naturligt dansk|kort dansk reason|forklar kort på dansk/,
    );
    assert.match(builder(validateRequest(raw))[0].content, /naturligt dansk/);
  }
  assert.match(formatMoney(12.5, "en"), /DKK.*12\.50/);
  assert.match(formatTime("2026-01-01T12:00:00Z", "en"), /1 Jan.*13:00/);
  assert.equal(formatTime(null, "en"), "unknown");
});
test("Worker localizes validation, burst and provider errors without extra inference or leaking provider details", async () => {
  const request = (body, type = "application/json") =>
    new Request("https://test.example/recipe", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        Origin: "https://huayuansong.github.io",
        "Content-Type": type,
        "Accept-Language": "en",
      },
    });
  let calls = 0;
  const env = {
    AI: {
      run: async () => {
        calls++;
        throw new Error("3036: secret provider details");
      },
    },
  };
  let response = await worker.fetch(request(raw, "text/plain"), env);
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error, "Send JSON.");
  response = await worker.fetch(
    request({ ...raw, language: "en", products: [] }),
    env,
  );
  assert.match((await response.json()).error, /^Choose 1–6 products/);
  assert.equal(calls, 0);
  response = await worker.fetch(request({ ...raw, language: "en" }), {
    ...env,
    RATE_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.match((await response.json()).error, /Try again in a minute/);
  assert.equal(calls, 0);
  response = await worker.fetch(request({ ...raw, language: "en" }), env);
  assert.equal(response.status, 429);
  assert.equal(
    (await response.json()).error,
    "Today’s free recipe allowance is exhausted. Try again later.",
  );
  assert.equal(calls, 1);
  // Body language wins over the browser's header; one request cannot affect another.
  response = await worker.fetch(
    request({ ...raw, language: "da", products: [] }),
    env,
  );
  assert.match((await response.json()).error, /^Angiv/);
});
