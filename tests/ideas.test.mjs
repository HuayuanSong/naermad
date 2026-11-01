import test from "node:test";
import assert from "node:assert/strict";
import {
  validateIdeasRequest,
  validateRequest,
  validateRecipe,
} from "../generation/contract.js";
import { validateIdeas, buildIdeasMessages } from "../generation/ideas.js";
import {
  ideaCandidates,
  ideasInput,
  recipeFromIdea,
  ideasEndpoint,
} from "../src/generation.js";
import worker, { generateIdeas } from "../generation/worker.js";
const settings = {
  servings: 2,
  maxMinutes: 30,
  vegetarian: true,
  pantry: true,
  extraPantry: "pasta",
  variant: 0,
};
const offer = (id, name = "Broccoli") => ({
  id,
  name,
  endsAt: "2099-01-01",
  price: 12,
});
const offers = [offer("a"), offer("b", "Fløde"), offer("c", "Røget laks")];
const input = () => ideasInput(offers, settings).input;
const ideas = () => ({
  status: "ok",
  reason: "",
  ideas: [
    {
      title: "Pasta med broccoli",
      description: "Broccoli og fløde i en enkel pastaret.",
      minutes: 20,
      productIds: ["p1", "p2"],
      extraIngredients: [],
    },
    {
      title: "Stegt broccoli",
      description: "Broccoli stegt med hvidløg og serveret med pasta.",
      minutes: 15,
      productIds: ["p1"],
      extraIngredients: ["hvidløg"],
    },
  ],
});

test("store candidates skip expired, duplicate and opaque labels, rotate bounded inventories and omit location and prices", () => {
  const inventory = [
    ...offers,
    offer("duplicate", "BROCCOLI"),
    offer("opaque", "SF BP M. 250G"),
    { ...offer("expired", "Gulerod"), endsAt: "2020-01-01" },
    { ...offer("bad", "Kartoffel"), endsAt: "invalid" },
  ];
  const context = ideasInput(inventory, {
    ...settings,
    address: "private",
    key: "private",
  });
  assert.equal(context.total, 3);
  assert.equal(context.input.products.length, 3);
  assert.deepEqual(context.input.pantry, [
    "olie",
    "salt",
    "sort peber",
    "vand",
    "pasta",
  ]);
  assert.equal(JSON.stringify(context.input).includes("private"), false);
  assert.equal(JSON.stringify(context.input).includes("price"), false);
  const many = Array.from({ length: 75 }, (_, i) =>
    offer(String(i), "Grøntsag " + i),
  );
  assert.equal(ideaCandidates(many).offers.length, 60);
  assert.equal(ideaCandidates(many, 1).offers[0].id, "60");
  assert.equal(ideaCandidates(many).total, 75);
  assert.throws(
    () => ideasInput([offer("a", "SF BP M. 250G")], settings),
    /tydelige navne/,
  );
});

test("ideas permit a bounded store inventory while full recipes retain the six-product limit", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: `p${i + 1}`,
    name: "Grøntsag " + i,
  }));
  assert.equal(
    validateIdeasRequest({ ...input(), products: many }).products.length,
    60,
  );
  assert.throws(() =>
    validateIdeasRequest({
      ...input(),
      products: [...many, { id: "p61", name: "Pasta" }],
    }),
  );
  assert.throws(() =>
    validateIdeasRequest({
      ...input(),
      products: [{ id: "p61", name: "Pasta" }],
    }),
  );
  assert.throws(() =>
    validateIdeasRequest({ ...input(), products: [many[0], many[0]] }),
  );
  assert.throws(() => validateRequest({ ...input(), products: many }));
  assert.equal(
    validateIdeasRequest({ ...input(), address: "private" }).address,
    undefined,
  );
});

test("suggestions may choose subsets but reject invented references, duplicate dishes, excessive counts and impossible timing", () => {
  assert.equal(validateIdeas(ideas(), input()).ideas.length, 2);
  for (const change of [
    { productIds: ["p60"] },
    { productIds: [] },
    { productIds: ["p1", "p1"] },
    { minutes: 45 },
    { minutes: 0 },
    { title: "x".repeat(121) },
    { extraIngredients: Array(9).fill("hvidløg") },
  ])
    assert.throws(() =>
      validateIdeas(
        { ...ideas(), ideas: [{ ...ideas().ideas[0], ...change }] },
        input(),
      ),
    );
  assert.throws(() =>
    validateIdeas(
      { ...ideas(), ideas: Array(4).fill(ideas().ideas[0]) },
      input(),
    ),
  );
  assert.throws(() =>
    validateIdeas(
      { ...ideas(), ideas: [ideas().ideas[0], ideas().ideas[0]] },
      input(),
    ),
  );
  assert.throws(() => validateIdeas("bad", input()));
  assert.deepEqual(
    validateIdeas(
      { status: "cannot_create", reason: "Ingen egnede varer.", ideas: [] },
      input(),
    ),
    { status: "cannot_create", reason: "Ingen egnede varer.", ideas: [] },
  );
});

test("choosing an idea sends only its products, remaps references, preserves its title and rejects expired stock", () => {
  const context = ideasInput(offers, settings),
    idea = { ...ideas().ideas[0], productIds: ["p2", "p1"] };
  const result = recipeFromIdea(idea, context, offers, settings);
  assert.deepEqual(result.input.products, [
    { id: "p1", name: "Fløde" },
    { id: "p2", name: "Broccoli" },
  ]);
  assert.deepEqual(
    result.offers.map((o) => o.id),
    ["b", "a"],
  );
  assert.equal(result.input.idea.title, idea.title);
  assert.deepEqual(result.input.idea.extraIngredients, idea.extraIngredients);
  assert.equal(
    result.input.products.some((p) => p.name === "Røget laks"),
    false,
  );
  assert.throws(
    () => recipeFromIdea(idea, context, [offers[0]], settings),
    /udløbet/,
  );
  assert.throws(
    () =>
      recipeFromIdea(
        idea,
        context,
        [offers[0], { ...offers[1], endsAt: "2020-01-01" }],
        settings,
      ),
    /udløbet/,
  );
  const recipe = {
    status: "ok",
    title: idea.title,
    description: idea.description,
    servings: 2,
    minutes: 20,
    ingredients: result.input.products.map((p) => ({
      name: p.name,
      quantity: "100 g",
      productId: p.id,
      pantryItem: null,
    })),
    steps: [
      "Klargør grøntsagerne.",
      "Tilbered grøntsagerne.",
      "Servér retten.",
    ],
  };
  assert.equal(validateRecipe(recipe, result.input).title, idea.title);
  assert.throws(() =>
    validateRecipe({ ...recipe, title: "En helt anden ret" }, result.input),
  );
});

test("ideas use one bounded inference call and the same cooking constraints, without generating full recipes automatically", async () => {
  let calls = 0,
    payload;
  const result = await generateIdeas(input(), {
    AI: {
      run: async (m, p) => {
        calls++;
        payload = p;
        return { response: ideas() };
      },
    },
  });
  assert.equal(result.ideas.length, 2);
  assert.equal(calls, 1);
  assert.equal(payload.max_completion_tokens, 1600);
  assert.equal(payload.response_format.json_schema.name, "ideas");
  assert.equal(payload.chat_template_kwargs.enable_thinking, false);
  assert.ok(buildIdeasMessages(input())[0].content.includes("75 °C"));
  assert.ok(
    buildIdeasMessages(input())[0].content.includes(
      "VÆLGE vegetariske produkter",
    ),
  );
  assert.equal(
    ideasEndpoint("https://example.test/recipe"),
    "https://example.test/ideas",
  );
});

test("ideas route validates origin, catalog and shared rate limit before making any model call", async () => {
  let calls = 0;
  const keys = [];
  const env = {
    AI: {
      run: async () => {
        calls++;
        return { response: ideas() };
      },
    },
    RATE_LIMITER: {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    },
  };
  const request = (body = input(), origin = "https://huayuansong.github.io") =>
    new Request("https://example.test/ideas", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let res = await worker.fetch(request(), env);
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
  assert.ok(keys[0].startsWith("recipe:"));
  assert.equal(
    (await worker.fetch(request({}, "https://evil.example"), env)).status,
    403,
  );
  assert.equal(
    (await worker.fetch(request({ ...input(), products: [] }), env)).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(request(), {
        ...env,
        RATE_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
  assert.equal(calls, 1);
  const failed = await worker.fetch(request(), {
    AI: {
      run: async () => ({
        response: {
          ...ideas(),
          ideas: [{ ...ideas().ideas[0], productIds: ["p60"] }],
        },
      }),
    },
  });
  assert.equal(failed.status, 502);
  const quota = await worker.fetch(request(), {
    AI: {
      run: async () => {
        throw new Error("3036 daily quota");
      },
    },
  });
  assert.equal(quota.status, 429);
  assert.ok(Number(quota.headers.get("Retry-After")) > 0);
});
