import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest, validateRecipe } from "../generation/contract.js";
import worker, { generateRecipe } from "../generation/worker.js";
import { generationInput } from "../src/generation.js";

const input = () => ({
  products: [{ id: "p1", name: "Broccoli · 1 stk." }],
  servings: 2,
  maxMinutes: 30,
  vegetarian: true,
  pantry: ["olie"],
  variant: 0,
});
const recipe = () => ({
  status: "ok",
  reason: "",
  title: "Testopskrift",
  description: "Kun en testfixture, ikke et modelsvar.",
  servings: 2,
  minutes: 20,
  ingredients: [
    { name: "broccoli", quantity: "1 stk.", productId: "p1", pantryItem: null },
    { name: "olie", quantity: "1 spsk.", productId: null, pantryItem: "olie" },
    { name: "ris", quantity: "150 g", productId: null, pantryItem: null },
  ],
  steps: [
    "Klargør grøntsagen.",
    "Kog risene.",
    "Tilbered grøntsagen og servér.",
  ],
});
const origin = "https://huayuansong.github.io";
const req = (body = input(), options = {}) =>
  new Request("https://example.test/recipe", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...options,
  });

test("request validation bounds inputs and excludes location, prices and credentials", () => {
  const value = validateRequest({
    ...input(),
    address: "not sent",
    key: "not sent",
    products: [{ id: "p1", name: "Broccoli", price: 8 }],
  });
  assert.deepEqual(value, {
    ...input(),
    products: [{ id: "p1", name: "Broccoli" }],
  });
  for (const change of [
    { products: [] },
    { products: Array(7).fill({ id: "p1", name: "a" }) },
    {
      products: [
        { id: "p1", name: "a" },
        { id: "p1", name: "b" },
      ],
    },
    { servings: 7 },
    { maxMinutes: 4 },
    { vegetarian: "true" },
    { pantry: Array(17).fill("ris") },
    { variant: 21 },
  ])
    assert.throws(() => validateRequest({ ...input(), ...change }));
  assert.deepEqual(
    validateRequest({ ...input(), pantry: [" Ris ", "ris"] }).pantry,
    ["ris"],
  );
});
test("browser sends selected non-expired product names and explicit pantry only", () => {
  const offers = [
    {
      id: "a",
      name: "Broccoli",
      endsAt: new Date(Date.now() + 60000).toISOString(),
      price: 8,
      key: "private",
    },
    { id: "b", name: "Expired", endsAt: "2020-01-01" },
    { id: "c", name: "Unselected", endsAt: "2099-01-01" },
  ];
  const data = generationInput(offers, new Set(["a", "b"]), {
    ...input(),
    pantry: false,
    extraPantry: " Ris,ris, citron",
  });
  assert.deepEqual(data.products, [{ id: "p1", name: "Broccoli" }]);
  assert.deepEqual(data.pantry, ["ris", "citron"]);
  assert.equal(JSON.stringify(data).includes("private"), false);
});
test("recipe validation preserves provenance and rejects missing or invented product links", () => {
  const valid = validateRecipe(recipe(), input());
  assert.equal(valid.ingredients.length, 3);
  assert.equal(
    validateRecipe(
      "<think></think>```json\n" + JSON.stringify(recipe()) + "\n```",
      input(),
    ).title,
    "Testopskrift",
  );
  for (const change of [
    { servings: 4 },
    { minutes: 45 },
    { ingredients: recipe().ingredients.slice(1) },
    { steps: [] },
    { ingredients: [{ ...recipe().ingredients[0], productId: "p2" }] },
    { ingredients: [{ ...recipe().ingredients[0], pantryItem: "olie" }] },
    {
      ingredients: [
        recipe().ingredients[0],
        { name: "smør", quantity: "10 g", productId: null, pantryItem: "smør" },
      ],
    },
  ])
    assert.throws(() => validateRecipe({ ...recipe(), ...change }, input()));
  assert.throws(() => validateRecipe("invalid json", input()));
  assert.deepEqual(
    validateRecipe(
      { status: "cannot_create", reason: "Vælg spiselige varer." },
      input(),
    ),
    { status: "cannot_create", reason: "Vælg spiselige varer." },
  );
});
test("HF adapter uses private authorization upstream and validates output", async () => {
  let call;
  const output = await generateRecipe(
    input(),
    { RECIPE_PROVIDER: "huggingface", HF_TOKEN: "test-secret" },
    async (url, options) => {
      call = { url, options };
      return Response.json({
        choices: [{ message: { content: JSON.stringify(recipe()) } }],
      });
    },
  );
  assert.equal(call.url, "https://router.huggingface.co/v1/chat/completions");
  assert.equal(call.options.headers.Authorization, "Bearer test-secret");
  assert.equal(JSON.stringify(output).includes("test-secret"), false);
  const body = JSON.parse(call.options.body);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.max_tokens, 2400);
  assert.equal(output.provider, "huggingface");
  await assert.rejects(
    generateRecipe(
      input(),
      { RECIPE_PROVIDER: "huggingface", HF_TOKEN: "test-secret" },
      async () => Response.json({ secret: "not exposed" }, { status: 402 }),
    ),
    (e) => e.status === 503 && !e.message.includes("not exposed"),
  );
});
test("Cloudflare adapter accepts native and chat completion outputs, without template fallback", async () => {
  for (const result of [
    { response: JSON.stringify(recipe()) },
    { response: recipe() },
    { choices: [{ message: { content: JSON.stringify(recipe()) } }] },
  ]) {
    const output = await generateRecipe(input(), {
      AI: { run: async () => result },
    });
    assert.equal(output.status, "ok");
    assert.equal(output.provider, "cloudflare");
  }
  await assert.rejects(
    generateRecipe(input(), { AI: { run: async () => ({ response: "bad" }) } }),
  );
  await assert.rejects(generateRecipe(input(), {}));
});
test("worker enforces request validation, CORS, bounded body and burst limiter before inference", async () => {
  let calls = 0;
  const env = {
    AI: {
      run: async () => {
        calls++;
        return { response: recipe() };
      },
    },
    RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  let res = await worker.fetch(req(), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(calls, 1);
  res = await worker.fetch(
    req(input(), {
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
    }),
    env,
  );
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(
    (await worker.fetch(req(input(), { method: "GET", body: undefined }), env))
      .status,
    405,
  );
  assert.equal(
    (
      await worker.fetch(
        req({}, { headers: { Origin: origin, "Content-Type": "text/plain" } }),
        env,
      )
    ).status,
    415,
  );
  assert.equal(
    (await worker.fetch(req({ payload: "x".repeat(13000) }), env)).status,
    413,
  );
  assert.equal(
    (await worker.fetch(req({ ...input(), products: [] }), env)).status,
    400,
  );
  res = await worker.fetch(req(), {
    ...env,
    RATE_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "60");
  assert.equal(calls, 1);
  res = await worker.fetch(
    req(input(), { method: "OPTIONS", body: undefined }),
    env,
  );
  assert.equal(res.status, 204);
  res = await worker.fetch(req(), {
    AI: {
      run: async () => {
        throw new Error("secret upstream details");
      },
    },
  });
  assert.equal(res.status, 503);
  assert.equal((await res.text()).includes("secret upstream details"), false);
});

test("free quota and capacity exhaustion return useful errors without retrying or switching providers", async () => {
  for (const [code, status, expected] of [
    [3036, 429, "gratis opskriftskvote"],
    [3040, 429, "optaget"],
    [5035, 503, "gratis plan"],
  ]) {
    let calls = 0;
    const response = await worker.fetch(req(), {
      AI: {
        run: async () => {
          calls++;
          throw new Error(
            `${code}: provider suggests an upgrade with confidential details`,
          );
        },
      },
    });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.ok(body.error.includes(expected));
    assert.equal(body.error.includes("confidential"), false);
    assert.equal(calls, 1);
    if (code === 3036) {
      const wait = Number(response.headers.get("Retry-After"));
      assert.ok(wait >= 1 && wait <= 86400);
    }
    if (code === 3040) assert.equal(response.headers.get("Retry-After"), "60");
  }
});

test("rejects instructions to wash meat while allowing washing vegetables and explicit prohibitions", () => {
  for (const step of [
    "Skyl kyllingebrystfileterne under koldt vand.",
    "Vask det rå kød og dup det tørt.",
  ]) {
    assert.throws(() =>
      validateRecipe(
        { ...recipe(), steps: [step, ...recipe().steps] },
        input(),
      ),
    );
  }
  for (const step of [
    "Skyl aldrig rå kylling.",
    "Du må ikke skylle kyllingebrystet.",
    "Skyl peberfrugterne og skær kyllingen i tern.",
    "Vask hænder efter håndtering af kylling.",
  ]) {
    assert.equal(
      validateRecipe({ ...recipe(), steps: [step, ...recipe().steps] }, input())
        .status,
      "ok",
    );
  }
});
test("selected Cloudflare model uses its documented structured output format and disables thinking", async () => {
  let payload, model;
  await generateRecipe(input(), {
    AI: {
      run: async (m, p) => {
        model = m;
        payload = p;
        return { response: recipe() };
      },
    },
  });
  assert.equal(model, "@cf/google/gemma-4-26b-a4b-it");
  assert.equal(payload.max_completion_tokens, 2400);
  assert.equal(payload.chat_template_kwargs.enable_thinking, false);
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.equal(payload.response_format.json_schema.schema.type, "object");
});

test("obvious abbreviated product codes are rejected before inference; short real food names remain usable", async () => {
  for (const name of ["SF BP M. 250G", "SF 221B", "Salling BP M 250 g"])
    assert.throws(
      () => validateRequest({ ...input(), products: [{ id: "p1", name }] }),
      /uklart navn/,
    );
  for (const name of [
    "ØKO ÆG 6 STK",
    "RIS 1 KG",
    "TOFU 200G",
    "Hakket oksekød 500 g",
    "Røget laks",
  ])
    assert.equal(
      validateRequest({ ...input(), products: [{ id: "p1", name }] })
        .products[0].name,
      name,
    );
  let calls = 0;
  const response = await worker.fetch(
    req({ ...input(), products: [{ id: "p1", name: "SF BP M. 250G" }] }),
    {
      AI: {
        run: async () => {
          calls++;
          return { response: recipe() };
        },
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
