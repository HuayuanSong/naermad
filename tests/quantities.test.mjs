import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQuantity, quantitySchema } from "../generation/quantities.js";
import { validateRecipe, recipeSchema } from "../generation/contract.js";
import worker from "../generation/worker.js";
import { recipeCost } from "../src/costs.js";
const input = {
  language: "en",
  products: [{ id: "p1", name: "Butter 250 g" }],
  servings: 2,
  maxMinutes: 30,
  vegetarian: false,
  pantry: [],
  variant: 0,
};
const recipe = (quantity) => ({
  status: "ok",
  title: "Test recipe",
  description: "A synthetic validation fixture.",
  servings: 2,
  minutes: 20,
  ingredients: [
    { name: "Butter", quantity, productId: "p1", pantryItem: null },
  ],
  steps: ["Step one.", "Step two.", "Step three."],
});
test("every model ingredient requires a separate amount and enumerated unit", () => {
  assert.deepEqual(
    recipeSchema(input).properties.ingredients.items.properties.quantity,
    quantitySchema,
  );
  assert.deepEqual(quantitySchema.required, ["amount", "unit"]);
  assert.equal(quantitySchema.additionalProperties, false);
  assert.ok(quantitySchema.properties.unit.enum.includes("g"));
  assert.ok(quantitySchema.properties.unit.enum.includes("ml"));
});
test("unitless quantities reported for butter and sauce are rejected without guessing, including malformed structured output", () => {
  for (const raw of [
    "20",
    "150",
    "20 butter",
    "150 Onion béarnaise sauce",
    "ca. 20",
    "about 150",
    "20–30",
    "1/2",
    "½",
    "two",
    "plenty",
    "0 g",
    "-20 g",
    "1/0 g",
    { amount: 20 },
    { amount: 150, unit: "" },
    { amount: "20", unit: "g" },
    { amount: 20, unit: ["g"] },
    { amount: null, unit: "g" },
    { amount: 20, unit: "butter" },
    { amount: 20, unit: "to_taste" },
    { amount: 0.00001, unit: "kg" },
    { amount: Infinity, unit: "g" },
    { amount: -20, unit: "g" },
    { amount: 20, unit: "g", extra: "data" },
  ]) {
    assert.equal(normalizeQuantity(raw, "en"), null, JSON.stringify(raw));
    assert.throws(
      () => validateRecipe(recipe(raw), input),
      (e) => e.status === 502 && /enheder/.test(e.message),
    );
  }
});
test("explicit units, counts, fractions and cooking instructions survive validation in both languages", () => {
  for (const raw of [
    "20 g",
    "150 ml",
    "1 tsp",
    "1 spsk.",
    "2 stk.",
    "1 pc",
    "2 cloves",
    "1/2 kg",
    "1 1/2 dl",
    "½ l",
    "0,5 kg",
    "100–150 g",
    "200 g (drained)",
    "to taste",
    "efter smag",
    "as needed",
    "efter behov",
    "as directed on the packet",
    "efter pakkens anvisning",
  ])
    assert.equal(normalizeQuantity(raw), raw);
  assert.equal(normalizeQuantity({ amount: 20, unit: "g" }, "en"), "20 g");
  assert.equal(normalizeQuantity({ amount: 150, unit: "ml" }, "en"), "150 ml");
  assert.equal(normalizeQuantity({ amount: 0.5, unit: "kg" }, "en"), "0.5 kg");
  assert.equal(normalizeQuantity({ amount: 0.5, unit: "kg" }, "da"), "0,5 kg");
  assert.equal(normalizeQuantity({ amount: 1, unit: "tbsp" }, "da"), "1 spsk.");
  assert.equal(
    normalizeQuantity({ amount: 1, unit: "clove" }, "en"),
    "1 clove",
  );
  for (const language of ["da", "en"]) {
    for (const unit of quantitySchema.properties.unit.enum) {
      const amounts = ["to_taste", "as_needed", "packet_instructions"].includes(
        unit,
      )
        ? [null]
        : [1, 2, 0.5];
      for (const amount of amounts) {
        const display = normalizeQuantity({ amount, unit }, language);
        assert.ok(display);
        assert.equal(normalizeQuantity(display, language), display, display);
      }
    }
  }
  const normalized = validateRecipe(recipe({ amount: 20, unit: "g" }), input);
  assert.equal(normalized.ingredients[0].quantity, "20 g");
  assert.deepEqual(validateRecipe(normalized, input), normalized); // Worker -> browser double validation.
  assert.equal(
    recipeCost(normalized, {
      ...input,
      offers: [{ name: "Butter 250 g", price: 10, unit: "each", stock: 2 }],
    }).lines[0].quantity,
    1,
  );
});
test("worker returns a localized unit error without retries or exposing ambiguous ingredients", async () => {
  for (const language of ["da", "en"]) {
    let calls = 0;
    const request = new Request("https://example.test/recipe", {
      method: "POST",
      headers: {
        Origin: "https://huayuansong.github.io",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...input, language }),
    });
    const response = await worker.fetch(request, {
      AI: {
        run: async () => {
          calls++;
          return { response: recipe("20") };
        },
      },
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(
      body.error,
      language === "en"
        ? /missing clear quantities or units/
        : /mængder eller enheder/,
    );
    assert.equal(body.ingredients, undefined);
    assert.equal(calls, 1);
  }
});
