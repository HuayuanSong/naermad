import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMessages,
  validateRequest,
  validateRecipe,
} from "../generation/contract.js";
import { buildIdeasMessages, validateIdeas } from "../generation/ideas.js";
import { generateIdeas } from "../generation/worker.js";
import {
  generationInput,
  ideasInput,
  recipeFromIdea,
} from "../src/generation.js";

const offers = [
  {
    id: "lot-a",
    name: "HAKKET GRØNT 300G NATURLI",
    category: "Meat Fish>Meat Alternatives",
    endsAt: "2099-01-01",
  },
  {
    id: "lot-b",
    name: "TOMAT BRUSCHETT VORES TAPAS",
    category: "Dairy And Cold Storage>Tapas Specialities>Pesto Hummus",
    endsAt: "2099-01-01",
  },
];
const options = {
  servings: 2,
  vegetarian: true,
  maxMinutes: 30,
  pantry: false,
};
const ingredient = (name, productId = null) => ({
  name,
  productId,
  pantryItem: null,
  quantity: "100 g",
});
const recipe = (ingredients, steps = ["Prepare.", "Cook.", "Serve."]) => ({
  status: "ok",
  title: "Dinner",
  description: "Dinner for two.",
  servings: 2,
  minutes: 15,
  ingredients,
  steps,
});
const idea = (description, extras = []) => ({
  title: "Dinner",
  description,
  minutes: 10,
  productIds: ["p1"],
  extraIngredients: extras,
});

const meatballs = {
  id: "lot-meat",
  name: "ASIATISKE MINIDELLER DET SØNDERJYSKE KØK.",
  category: "Dairy And Cold Storage>Lunch Meats>Meat Balls",
  endsAt: "2099-01-01",
};
const salad = {
  ...meatballs,
  id: "lot-salad",
  name: "PEBERRODSSALAT K-SALAT",
  category: "Dairy And Cold Storage>Lunch Meats>Mayo Salads>Other Mayo Salads",
};
test("vegetarian inspiration filters meat before the 60-product cap and preserves alternatives in the same aisle", () => {
  const meatShelf = Array.from({ length: 60 }, (_, i) => ({
    ...meatballs,
    id: "meat-" + i,
    name: meatballs.name + i,
  }));
  const eligible = [
    offers[0],
    salad,
    { ...meatballs, id: "plant", name: "Plantebaserede frikadeller" },
  ];
  const store = [
    ...meatShelf,
    ...eligible,
    { ...meatballs, id: "mixed", name: "Bacon med vegansk ost" },
  ];
  const context = ideasInput(store, options);
  assert.deepEqual(context.offers, eligible);
  assert.equal(context.total, 3);
  assert.equal(ideasInput(store, { ...options, vegetarian: false }).total, 64);
});

test("a mixed catalog sent directly to the Worker keeps the original IDs of suitable products in both prompt and schema", async () => {
  const catalog = [meatballs, offers[0], salad].map((p, i) => ({
    id: "p" + (i + 1),
    name: p.name,
    category: p.category,
  }));
  const input = { ...ideasInput(offers, options).input, products: catalog };
  const good = { ...idea("Plantefars og peberrod."), productIds: ["p2", "p3"] };
  const bad = { ...idea("Minideller."), title: "Minideller" };
  assert.deepEqual(
    validateIdeas({ status: "ok", ideas: [bad, good] }, input).ideas,
    [good],
  );
  assert.throws(
    () =>
      validateRecipe(recipe([ingredient("Minideller", "p1")]), {
        ...input,
        products: [catalog[0]],
      }),
    /vegetarisk/,
  );
  let calls = 0;
  const result = await generateIdeas(input, {
    AI: {
      run: async (_, payload) => {
        calls++;
        assert.deepEqual(
          JSON.parse(payload.messages[1].content).products,
          catalog.slice(1),
        );
        const ref =
          payload.response_format.json_schema.schema.properties.ideas.items
            .properties.productIds;
        assert.deepEqual(ref.items.enum, ["p2", "p3"]);
        return { response: { status: "ok", ideas: [good] } };
      },
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.ideas, [good]);
});

test("an all-meat store gives a localized vegetarian result without invoking inference", async () => {
  const env = {
    AI: { run: () => assert.fail("No suitable products for inference") },
  };
  for (const [language, reason] of [
    ["da", /vegetariske forslag/],
    ["en", /vegetarian suggestions/],
  ]) {
    const result = await generateIdeas(
      {
        ...ideasInput(offers, options).input,
        language,
        products: [
          { id: "p1", name: meatballs.name, category: meatballs.category },
        ],
      },
      env,
    );
    assert.equal(result.status, "cannot_create");
    assert.match(result.reason, reason);
    assert.deepEqual(result.ideas, []);
    assert.equal(result.model, null);
  }
});

test("both prompts and the expanded recipe receive only shelf labels, optional categories and local references", () => {
  const manual = generationInput(offers, new Set(["lot-a"]), options);
  const context = ideasInput(offers, options);
  const expanded = recipeFromIdea(
    idea("Dinner for two."),
    context,
    offers,
    options,
  ).input;
  for (const [input, messages] of [
    [manual, buildMessages],
    [context.input, buildIdeasMessages],
    [expanded, buildMessages],
  ]) {
    const product = JSON.parse(messages(input)[1].content).products[0];
    assert.deepEqual(product, {
      id: "p1",
      name: offers[0].name,
      category: offers[0].category,
    });
  }
  const legacy = { ...manual, products: [{ id: "p1", name: "Broccoli" }] };
  assert.deepEqual(validateRequest(legacy).products, legacy.products);
  assert.throws(() =>
    validateRequest({
      ...manual,
      products: [{ ...manual.products[0], category: "x".repeat(201) }],
    }),
  );
});

for (const [
  language,
  mince,
  vegetables,
  meat,
  alternative,
  dairy,
  breadText,
  bread,
] of [
  [
    "da",
    "Plantefars",
    "Hakkede grøntsager",
    "Bacon",
    "Vegansk bacon",
    "Æg og fløde",
    "Ristet brød med tomat.",
    "surdejsbrød",
  ],
  [
    "en",
    "Plant-based mince",
    "Chopped vegetables",
    "Bacon",
    "Plant-based bacon",
    "Eggs and cream",
    "Toasted bread topped with tomato.",
    "sourdough bread",
  ],
]) {
  test(`retailer identity and vegetarian extras in ${language}`, () => {
    const input = generationInput(offers, new Set(["lot-a"]), {
      ...options,
      language,
    });
    const base = ingredient(mince, "p1");
    assert.throws(() =>
      validateRecipe(recipe([ingredient(vegetables, "p1")]), input),
    );
    assert.throws(
      () => validateRecipe(recipe([base, ingredient(meat)]), input),
      /vegetarisk/,
    );
    assert.equal(
      validateRecipe(
        recipe([base, ingredient(alternative), ingredient(dairy)]),
        input,
      ).status,
      "ok",
    );
    const response = (extras) => ({
      status: "ok",
      ideas: [idea(mince, extras)],
    });
    assert.throws(() => validateIdeas(response([meat]), input));
    assert.equal(
      validateIdeas(response([alternative, dairy]), input).ideas.length,
      1,
    );
    assert.throws(() =>
      validateIdeas(response([]), {
        ...input,
        products: [
          { id: "p1", name: "HK GRIS", category: "Meat Fish>Pork>Minced Pork" },
        ],
      }),
    );
  });
  test(`a dish built on toasted bread accounts for its base in ${language}`, () => {
    const input = generationInput(offers, new Set(["lot-b"]), {
      ...options,
      language,
    });
    const bad = idea(breadText);
    const good = { ...bad, title: "With bread", extraIngredients: [bread] };
    assert.deepEqual(
      validateIdeas({ status: "ok", ideas: [bad, good] }, input).ideas,
      [good],
    );
    assert.equal(
      validateIdeas(
        { status: "ok", ideas: [bad] },
        { ...input, pantry: [bread] },
      ).ideas.length,
      1,
    );
    const topping = ingredient("Tomato spread", "p1");
    const steps = ["Prepare.", breadText, "Serve."];
    assert.throws(() => validateRecipe(recipe([topping], steps), input));
    assert.equal(
      validateRecipe(recipe([topping, ingredient(bread)], steps), input).status,
      "ok",
    );
  });
}
