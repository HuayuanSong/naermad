// Cost of the discounted products to BUY. Extras and pantry items are excluded.
// Quantities come from the recipe and explicit pack labels, never model-made prices.
const numberPattern = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾])`;
const unitPattern = String.raw`(?:kilograms?|kilogram|kg|grams?|gram|gr|g|millilit(?:re|er)s?|ml|cl|dl|lit(?:re|er)s?|liter|l|stk\.?|stykker|pieces?|pcs?\.?|heads?|(?:hoveder|hoved)|æg|eggs?)`;
const amountRegex = new RegExp(
  `^(${numberPattern})\\s*(${unitPattern})\\.?$`,
  "iu",
);
function number(value) {
  if ({ "½": 0.5, "¼": 0.25, "¾": 0.75 }[value])
    return { "½": 0.5, "¼": 0.25, "¾": 0.75 }[value];
  // A period followed by three digits may be a Danish thousands separator.
  if (/^[1-9]\d*\.\d{3}$/.test(value)) return null;
  const fraction = value.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  const result = fraction
    ? Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3])
    : Number(value.replace(",", "."));
  return Number.isFinite(result) && result > 0 ? result : null;
}
export function parseAmount(text) {
  const match = String(text).trim().match(amountRegex);
  if (!match) return null;
  const value = number(match[1]),
    unit = match[2].toLowerCase().replace(/\.$/, "");
  if (value === null) return null;
  if (/^(kg|kilogram)/.test(unit))
    return { dimension: "mass", value: value * 1000 };
  if (/^(g|gr|gram)/.test(unit)) return { dimension: "mass", value };
  if (/^(ml|millilit)/.test(unit)) return { dimension: "volume", value };
  if (unit === "cl") return { dimension: "volume", value: value * 10 };
  if (unit === "dl") return { dimension: "volume", value: value * 100 };
  if (/^(l|lit)/.test(unit))
    return { dimension: "volume", value: value * 1000 };
  return { dimension: "count", value };
}
export function packAmount(name) {
  // Ambiguous weights (e.g. gross and drained), ranges and mixed sizes need checking.
  const regex = new RegExp(
    `(?<![\\p{L}\\d.,/])(?:(${numberPattern})\\s*[x×]\\s*)?(${numberPattern})\\s*(${unitPattern})(?![\\p{L}\\d])`,
    "giu",
  );
  const matches = [...name.matchAll(regex)];
  if (matches.length !== 1 || /\d\s*[-–/]\s*\d/.test(name)) return null;
  const prefix = name.slice(0, matches[0].index);
  // Do not parse the tail of a spaced number or an unsupported nested multipack.
  if (/\d\s+$|\d\s*[x×]\s*$/i.test(prefix)) return null;
  // A weight beside "4-pak" may describe one container or the entire pack.
  if (/\b\d+\s*-?\s*(?:pak(?:ke|ker)?|packs?)\b/iu.test(name)) return null;
  const match = matches[0],
    amount = parseAmount(`${match[2]} ${match[3]}`);
  if (!amount) return null;
  if (match[1]) {
    const multiple = number(match[1]);
    if (!Number.isInteger(multiple)) return null;
    amount.value *= multiple;
  }
  return amount;
}
function requiredAmount(ingredients) {
  if (!ingredients.length) return null;
  const amounts = ingredients.map((i) => parseAmount(i.quantity));
  if (
    amounts.some((a) => !a) ||
    amounts.some((a) => a.dimension !== amounts[0].dimension)
  )
    return null;
  return {
    dimension: amounts[0].dimension,
    value: amounts.reduce((sum, a) => sum + a.value, 0),
  };
}
export function recipeCost(
  recipe,
  context,
  overrides = context.costQuantities || {},
) {
  const lines = context.products.map((product, index) => {
    const offer = context.offers[index];
    const ingredients = recipe.ingredients.filter(
      (i) => i.productId === product.id,
    );
    const required = requiredAmount(ingredients);
    const pack = packAmount(offer.name);
    let quantity = null,
      assumed = false;
    if (offer.unit === "each") {
      if (required && pack && required.dimension === pack.dimension)
        quantity = Math.ceil(Number((required.value / pack.value).toFixed(9)));
      else {
        quantity = 1;
        assumed = true;
      }
    } else if (offer.unit === "kg" && required?.dimension === "mass") {
      quantity = Math.ceil(Number(required.value.toFixed(6))) / 1000;
    }
    const edited = Object.hasOwn(overrides, product.id);
    if (edited) {
      quantity = overrides[product.id];
      assumed = false;
    }
    const validQuantity =
      Number.isFinite(quantity) &&
      quantity > 0 &&
      quantity <= 10000 &&
      (offer.unit === "each"
        ? Number.isInteger(quantity)
        : offer.unit === "kg" &&
          quantity >= 0.001 &&
          Number.isInteger(Number((quantity * 1000).toFixed(6))));
    if (!validQuantity) quantity = null;
    const validPrice = Number.isFinite(offer.price) && offer.price >= 0;
    const priceCents = Math.round(offer.price * 100);
    const cents =
      quantity !== null && validPrice
        ? Math.round(
            offer.unit === "kg"
              ? (Math.round(quantity * 1000) * priceCents) / 1000
              : quantity * priceCents,
          )
        : null;
    const shortStock =
      quantity !== null &&
      Number.isFinite(offer.stock) &&
      quantity > offer.stock;
    return {
      id: product.id,
      offer,
      ingredients,
      quantity,
      assumed,
      edited,
      cents,
      shortStock,
    };
  });
  const missing = lines.filter((l) => l.cents === null).length;
  return {
    lines,
    missing,
    cents: lines.reduce((sum, l) => sum + (l.cents ?? 0), 0),
    estimated: lines.some((l) => l.assumed || l.shortStock),
    servings: recipe.servings,
  };
}
export function ideaCost(idea, context) {
  const offers = idea.productIds.map(
    (id) =>
      context.offers[context.input.products.findIndex((p) => p.id === id)],
  );
  // Ideas have no quantities yet. Only quote the explicitly labelled one-of-each basket.
  if (offers.some((o) => !o || o.unit !== "each" || !Number.isFinite(o.price)))
    return null;
  return offers.reduce((sum, o) => sum + Math.round(o.price * 100), 0);
}
