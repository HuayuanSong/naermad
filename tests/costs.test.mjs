import test from "node:test";
import assert from "node:assert/strict";
import { parseAmount, packAmount, recipeCost, ideaCost } from "../src/costs.js";
const product = (name, price, unit = "each", stock = 10) => ({
  name,
  price,
  unit,
  stock,
});
function calculate(offers, ingredients, overrides) {
  return recipeCost(
    { servings: 2, ingredients },
    {
      products: offers.map((o, i) => ({ id: `p${i + 1}`, name: o.name })),
      offers,
    },
    overrides,
  );
}
const ingredient = (quantity, productId = "p1") => ({
  name: "test",
  quantity,
  productId,
  pantryItem: null,
});

test("spaced numeric labels cannot silently lose a leading pack-size digit", () => {
  for (const separator of [" ", "\u00a0", "\u202f"]) {
    const name = `Kartofler 1${separator}500 g`;
    assert.equal(packAmount(name), null, name);
    const cost = calculate([product(name, 10)], [ingredient("600 g")]);
    assert.equal(cost.estimated, true);
    assert.equal(cost.lines[0].assumed, true);
  }
});

test("unsupported multipack labels stay estimated instead of using one inner container", () => {
  for (const name of [
    "Yoghurt 4-pak 125 g",
    "Yoghurt 4 pak 125 g",
    "Yoghurt 4-pack 125 g",
  ]) {
    assert.equal(packAmount(name), null, name);
    const cost = calculate([product(name, 10)], [ingredient("300 g")]);
    assert.equal(cost.estimated, true);
    assert.equal(cost.lines[0].assumed, true);
  }
  const explicit = calculate(
    [product("Yoghurt 4 x 125 g", 10)],
    [ingredient("300 g")],
  );
  assert.equal(explicit.lines[0].quantity, 1);
  assert.equal(explicit.estimated, false);
});

test("weight-priced purchases round exact half cents consistently, including edits", () => {
  for (const [grams, price] of [
    [350, 3.3],
    [700, 1.65],
  ]) {
    const offers = [product("Kartofler", price, "kg")];
    const ingredients = [ingredient(`${grams} g`)];
    assert.equal(calculate(offers, ingredients).cents, 116);
    assert.equal(
      calculate(offers, ingredients, { p1: grams / 1000 }).cents,
      116,
    );
  }
});

test("matches compatible mass, volume and count labels without inventing pack sizes", () => {
  for (const [text, dimension, value] of [
    ["0,6 kg", "mass", 600],
    ["600 g", "mass", 600],
    ["1/2 l", "volume", 500],
    ["1 1/2 dl", "volume", 150],
    ["½ liter", "volume", 500],
    ["3 eggs", "count", 3],
  ])
    assert.deepEqual(parseAmount(text), { dimension, value });
  assert.deepEqual(packAmount("Kyllingebryst 400G"), {
    dimension: "mass",
    value: 400,
  });
  assert.deepEqual(packAmount("Æg 6 stk."), { dimension: "count", value: 6 });
  assert.deepEqual(packAmount("Yoghurt 4 x 125 g"), {
    dimension: "mass",
    value: 500,
  });
  for (const text of [
    "Kyllingebryst",
    "400 g / 240 g",
    "200–300 g",
    "3 x 2 x 100 g",
    "1.000 g",
  ])
    assert.equal(packAmount(text), null, text);
  for (const text of [
    "200–300 g",
    "salt to taste",
    "100 g (drained)",
    "1.000 g",
    "-10 g",
    "1/0 g",
  ])
    assert.equal(parseAmount(text), null, text);
});
test("buying 600 g in 400 g packs counts two discounted packs; extras and pantry never add to the total", () => {
  const cost = calculate(
    [product("Kylling 400 g", 25), product("Fløde 250 ml", 7.5)],
    [
      ingredient("600 g"),
      ingredient("100 ml", "p2"),
      ingredient("300 g", null),
      { ...ingredient("1 tbsp", null), pantryItem: "oil" },
    ],
  );
  assert.deepEqual(
    cost.lines.map((l) => l.quantity),
    [2, 1],
  );
  assert.equal(cost.cents, 5750);
  assert.equal(cost.missing, 0);
  assert.equal(cost.estimated, false);
});
test("repeated recipe references share a purchase line; fractional packs round up once", () => {
  const cost = calculate(
    [product("Tomater 400 g", 10.05)],
    [ingredient("100 g"), ingredient("250 g")],
  );
  assert.equal(cost.lines.length, 1);
  assert.equal(cost.lines[0].quantity, 1);
  assert.equal(cost.cents, 1005);
  assert.equal(
    calculate([product("Æg 6 stk.", 15)], [ingredient("8 eggs")]).cents,
    3000,
  );
});
test("weight-priced products use kilograms and cent rounding, never one arbitrary pack", () => {
  const cost = calculate(
    [product("Kartofler", 9.95, "kg")],
    [ingredient("750 g")],
  );
  assert.equal(cost.lines[0].quantity, 0.75);
  assert.equal(cost.cents, 746);
  const unknown = calculate(
    [product("Kartofler", 9.95, "kg")],
    [ingredient("4 stk.")],
  );
  assert.equal(unknown.missing, 1);
  assert.equal(unknown.lines[0].cents, null);
});
test("unknown pack sizes are marked as assumptions, incompatible dimensions are not converted, and edits resolve quantities", () => {
  for (const [name, quantity] of [
    ["Kylling", "600 g"],
    ["Broccoli 1 stk.", "600 g"],
    ["Kikærter 400 g / 240 g", "100 g"],
  ]) {
    const cost = calculate([product(name, 12)], [ingredient(quantity)]);
    assert.equal(cost.lines[0].quantity, 1);
    assert.equal(cost.estimated, true);
    const edited = calculate([product(name, 12)], [ingredient(quantity)], {
      p1: 3,
    });
    assert.equal(edited.cents, 3600);
    assert.equal(edited.estimated, false);
    assert.equal(edited.lines[0].edited, true);
  }
});
test("missing or invalid quantities/units never masquerade as a complete zero cost; low stock is flagged", () => {
  for (const value of [null, 0, -1, 1.5, NaN, Infinity, 10001]) {
    const cost = calculate([product("Mel 1 kg", 8)], [ingredient("100 g")], {
      p1: value,
    });
    assert.equal(cost.missing, 1);
  }
  assert.equal(
    calculate([product("Løg", 8, "kg")], [ingredient("200 g")], { p1: 0.0001 })
      .missing,
    1,
  );
  assert.equal(
    calculate([product("Mel 1 kg", 8, null)], [ingredient("100 g")]).missing,
    1,
  );
  const scarce = calculate(
    [product("Kylling 400 g", 25, "each", 1)],
    [ingredient("600 g")],
  );
  assert.equal(scarce.lines[0].shortStock, true);
  assert.equal(scarce.estimated, true);
  assert.equal(
    calculate([product("Mel 1 kg", 0)], [ingredient("100 g")]).cents,
    0,
  );
});
test("idea prices are a labelled one-of-each preview; weight-based or unknown units wait for recipe quantities", () => {
  const context = {
    input: { products: [{ id: "p1" }, { id: "p2" }] },
    offers: [product("Broccoli", 8), product("Fløde", 7.5)],
  };
  assert.equal(ideaCost({ productIds: ["p1", "p2"] }, context), 1550);
  context.offers[0].unit = "kg";
  assert.equal(ideaCost({ productIds: ["p1", "p2"] }, context), null);
});
