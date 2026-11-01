// The model supplies amount and unit separately. The API still returns display strings
// so existing clients remain compatible; no missing unit is ever inferred from a food name.
const units = {
  g: ["g", "g"],
  kg: ["kg", "kg"],
  ml: ["ml", "ml"],
  cl: ["cl", "cl"],
  dl: ["dl", "dl"],
  l: ["l", "l"],
  tsp: ["tsk.", "tsp"],
  tbsp: ["spsk.", "tbsp"],
  piece: ["stk.", "pcs"],
  clove: ["fed", "cloves"],
  slice: ["skiver", "slices"],
  head: ["hoveder", "heads"],
  pinch: ["knivspidser", "pinches"],
  handful: ["håndfulde", "handfuls"],
  can: ["dåser", "cans"],
  pack: ["pakker", "packs"],
  bunch: ["bundter", "bunches"],
  sprig: ["kviste", "sprigs"],
  leaf: ["blade", "leaves"],
};
const singular = {
  piece: ["stk.", "pc"],
  clove: ["fed", "clove"],
  slice: ["skive", "slice"],
  head: ["hoved", "head"],
  pinch: ["knivspids", "pinch"],
  handful: ["håndfuld", "handful"],
  can: ["dåse", "can"],
  pack: ["pakke", "pack"],
  bunch: ["bundt", "bunch"],
  sprig: ["kvist", "sprig"],
  leaf: ["blad", "leaf"],
};
const specialUnits = {
  to_taste: ["efter smag", "to taste"],
  as_needed: ["efter behov", "as needed"],
  packet_instructions: ["efter pakkens anvisning", "as directed on the packet"],
};
export const quantitySchema = {
  type: "object",
  additionalProperties: false,
  description:
    "An explicit amount and unit; never a bare number or an ingredient name. For to_taste, as_needed or packet_instructions, amount must be null.",
  properties: {
    amount: { type: ["number", "null"], minimum: 0.001, maximum: 1000000 },
    unit: {
      type: "string",
      enum: [...Object.keys(units), ...Object.keys(specialUnits)],
    },
  },
  required: ["amount", "unit"],
};

// Check normalized API responses and older string responses as well as new model output.
// Ingredient names alone ("20 butter") are not measurement units. Fractions/ranges and
// common explicit count units remain readable without silently converting them.
const number = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[¼½¾])`;
const unit = String.raw`(?:kg|g|mg|grams?|kilograms?|ml|cl|dl|l|lit(?:re|er)s?|millilit(?:re|er)s?|tsp|tbsp|teaspoons?|tablespoons?|tsk\.?|spsk\.?|stk\.?|stykker|pcs?\.?|pieces?|cloves?|fed|slices?|skiver?|heads?|hoved(?:er)?|pinch(?:es)?|knivspids(?:er)?|handfuls?|håndfulde?|cans?|tins?|dåser?|packs?|packets?|pakker?|bags?|poser?|bottles?|flasker?|bunch(?:es)?|bundt(?:er)?|sprigs?|kviste?|leaves|leaf|blade?|cups?)`;
const explicitQuantity = new RegExp(
  `^(?:(?:ca\\.?|about|approx\\.?)\\s+)?(${number})(?:\\s*(?:[-–]|to|til)\\s*(${number}))?\\s*${unit}(?![\\p{L}\\d])(?:\\s+[^\\r\\n]*)?$`,
  "iu",
);
const specialPhrases = new Set(Object.values(specialUnits).flat());
function positiveNumber(value) {
  if (["¼", "½", "¾"].includes(value)) return true;
  const fraction = value.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  const n = fraction
    ? Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3])
    : Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 0;
}
export function normalizeQuantity(raw, language = "da") {
  if (typeof raw === "string") {
    const value = raw.trim();
    // eslint-disable-next-line no-control-regex -- Quantities must not contain control characters.
    if (!value || value.length > 80 || /[\u0000-\u001f]/.test(value))
      return null;
    if (specialPhrases.has(value.toLowerCase())) return value;
    const match = value.match(explicitQuantity);
    return match &&
      positiveNumber(match[1]) &&
      (!match[2] || positiveNumber(match[2]))
      ? value
      : null;
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== 2 ||
    !Object.hasOwn(raw, "amount") ||
    !Object.hasOwn(raw, "unit") ||
    typeof raw.unit !== "string"
  )
    return null;
  const localeIndex = language === "en" ? 1 : 0;
  if (Object.hasOwn(specialUnits, raw.unit))
    return raw.amount === null ? specialUnits[raw.unit][localeIndex] : null;
  if (
    !Object.hasOwn(units, raw.unit) ||
    !Number.isFinite(raw.amount) ||
    raw.amount < 0.001 ||
    raw.amount > 1000000
  )
    return null;
  const amount = new Intl.NumberFormat(language === "en" ? "en-GB" : "da-DK", {
    useGrouping: false,
    maximumFractionDigits: 10,
  }).format(raw.amount);
  return `${amount} ${(raw.amount === 1 && singular[raw.unit] ? singular[raw.unit] : units[raw.unit])[localeIndex]}`;
}
