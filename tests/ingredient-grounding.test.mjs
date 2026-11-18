import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMessages,
  validateRequest,
  validateRecipe,
} from "../generation/contract.js";
import { buildIdeasMessages, validateIdeas } from "../generation/ideas.js";
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
