export const INGREDIENTS = {
  broccoli: ["broccoli", "broccoli"],
  spinach: ["spinat", "spinat|babyspinat"],
  courgette: ["squash", "squash|courgette"],
  mushroom: ["champignon", "champignon(?:er)?|svampe"],
  carrot: ["gulerod", "gulerod(?:der)?|gulerødder"],
  potato: ["kartofler", "kartof(?:fel|ler)"],
  tomato: ["friske tomater", "(?:cherry|blomme|cocktail)?tomat(?:er)?"],
  pepper: ["peberfrugt", "peberfrugt(?:er)?|snackpeber"],
  leek: ["porre", "porre(?:r)?"],
  onion: ["løg", "løg|rødløg|salatløg"],
  garlic: ["hvidløg", "hvidløg"],
  lemon: ["citron", "citron(?:er)?"],
  cucumber: ["agurk", "agurk(?:er)?"],
  cabbage: ["spidskål", "spidskål"],
  aubergine: ["aubergine", "aubergine(?:r)?"],
  chicken: [
    "kyllingebryst",
    "kyllingebryst(?:filet(?:er)?)?|kyllingefilet(?:er)?",
  ],
  salmon: ["laksefilet", "laksefilet(?:er)?|fersk laks"],
  beef: ["hakket oksekød", "hakket okse(?:kød)?|oksefars"],
  eggs: ["æg", "æg|frilandsæg|skrabeæg"],
  milk: ["mælk", "mælk|letmælk|minimælk|sødmælk|skummetmælk"],
  cream: ["madlavningsfløde", "madlavningsfløde|piskefløde|fløde"],
  feta: ["salatost / feta", "feta|salatost"],
  mozzarella: ["mozzarella", "mozzarella"],
  yogurt: [
    "naturel yoghurt",
    "yoghurt naturel|yogurt naturel|græsk yoghurt|græsk inspireret yoghurt",
  ],
  bread: ["brød", "surdejsbrød|franskbrød|fuldkornsbrød|rugbrød"],
  pasta: ["tør pasta", "pasta|spaghetti|penne|fusilli"],
  rice: ["ris", "ris|basmatiris|jasminris"],
  chickpea: ["kogte kikærter", "kikærter"],
  lentil: ["røde linser", "røde linser"],
  cannedTomato: [
    "hakkede tomater på dåse",
    "hakkede tomater|flåede tomater|passata",
  ],
  oats: ["havregryn", "havregryn"],
  banana: ["banan", "banan(?:er)?"],
  apple: ["æble", "æble(?:r)?"],
  flour: ["hvedemel", "hvedemel"],
  curry: ["karry", "karry"],
  stock: ["grøntsagsbouillon", "grøntsagsbouillon"],
  oil: ["olie", "olivenolie|rapsolie"],
  salt: ["salt", "salt"],
  blackPepper: ["sort peber", "sort peber"],
  water: ["vand", "vand"],
};

export const PANTRY = ["oil", "salt", "blackPepper", "water"];
export const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .trim();
const boundary = (pattern) =>
  new RegExp(`(?:^|[^\\p{L}])(?:${pattern})(?=$|[^\\p{L}])`, "u");
const prepared =
  /pizza|lasagne|færdigret|babymad|hundemad|kattemad|suppe|salatblanding|tærte|sandwich|wrap|marineret|paneret|røget|røgede|koncentrat|juice|smoothie|chips|kage|dessert|yoghurtdrik|proteinshake/;
export function classify(description) {
  const text = normalize(description);
  if (prepared.test(text)) return null;
  if (/kyllingesalat|hønsesalat|kyllingepålæg|pesto|bouillon|fond/.test(text)) {
    return boundary(INGREDIENTS.stock[1]).test(text) ? "stock" : null;
  }
  // The more specific ingredient wins: a can of tomatoes is not a fresh tomato.
  if (boundary(INGREDIENTS.cannedTomato[1]).test(text)) return "cannedTomato";
  if (/kikærter/.test(text) && !/kogte|dåse|drænede|ready to eat/.test(text))
    return null;
  if (/frisk(?:e)? pasta/.test(text)) return null;
  if (/fyldt|tortellini|ravioli|pastasalat|pastasauce/.test(text)) return null;
  if (
    /chokolade|vanilje|jordbær|sukker/.test(text) &&
    /mælk|yoghurt|yogurt/.test(text)
  )
    return null;
  for (const [id, [, pattern]] of Object.entries(INGREDIENTS)) {
    if (boundary(pattern).test(text)) return id;
  }
  return null;
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad;
  const dlon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return (
    6371.0088 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(Math.max(0, 1 - s)))
  );
}

const numeric = (v) => typeof v === "number" && Number.isFinite(v);
export function normalizeOffer(raw, storeId, index, now = Date.now()) {
  const o = raw?.offer,
    p = raw?.product;
  if (!o || !p || typeof p.description !== "string" || !p.description.trim())
    return null;
  if (
    o.currency !== "DKK" ||
    !numeric(o.newPrice) ||
    o.newPrice < 0 ||
    !numeric(o.originalPrice) ||
    o.originalPrice <= o.newPrice
  )
    return null;
  if (numeric(o.stock) && o.stock <= 0) return null;
  const start = Date.parse(o.startTime),
    end = Date.parse(o.endTime);
  // Unknown validity is not sufficient evidence for an active offer.
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > now ||
    end <= now
  )
    return null;
  return {
    id: `${storeId}:${o.ean || p.ean || index}:${index}`,
    name: p.description.trim().slice(0, 240),
    ingredient: classify(p.description),
    price: o.newPrice,
    originalPrice: o.originalPrice,
    discount: Math.round((1 - o.newPrice / o.originalPrice) * 100),
    stock: numeric(o.stock) ? o.stock : null,
    unit: ["each", "kg"].includes(o.stockUnit) ? o.stockUnit : null,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    updatedAt: Number.isFinite(Date.parse(o.lastUpdate))
      ? new Date(o.lastUpdate).toISOString()
      : null,
  };
}

export function normalizeStores(raw, origin, radius, now = Date.now()) {
  if (!Array.isArray(raw))
    throw new Error(
      "Salling returnerede et ukendt dataformat. Prøv igen senere.",
    );
  const seen = new Set();
  return raw
    .flatMap((row) => {
      const s = row?.store;
      if (
        !s ||
        !s.id ||
        seen.has(s.id) ||
        !Array.isArray(s.coordinates) ||
        s.coordinates.length < 2 ||
        !s.coordinates.every(numeric)
      )
        return [];
      if (
        String(s.address?.country).toUpperCase() !== "DK" ||
        !["netto", "foetex", "bilka"].includes(s.brand)
      )
        return [];
      const [lon, lat] = s.coordinates;
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return [];
      const distance = distanceKm(origin, { lat, lon });
      if (distance > radius) return [];
      seen.add(s.id);
      const ids = new Set();
      const offers = (
        Array.isArray(row.clearances) ? row.clearances : []
      ).flatMap((item, i) => {
        const offer = normalizeOffer(item, s.id, i, now);
        if (!offer) return [];
        const identity = `${item.offer?.ean || offer.name}|${offer.price}|${offer.endsAt}`;
        if (ids.has(identity)) return [];
        ids.add(identity);
        return [offer];
      });
      return [
        {
          id: String(s.id),
          name: String(s.name || "Butik"),
          brand: s.brand,
          lat,
          lon,
          distance,
          address: [s.address?.street, s.address?.zip, s.address?.city]
            .filter(Boolean)
            .join(", "),
          offers,
          hours: Array.isArray(s.hours)
            ? s.hours.filter((h) => h?.type === "store")
            : [],
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance);
}

export function recommend(
  recipes,
  offers,
  {
    selectedIds,
    vegetarian = false,
    maxMinutes = 120,
    pantry = true,
    now = Date.now(),
  } = {},
) {
  const byIngredient = new Map();
  for (const offer of offers) {
    if (
      !offer.ingredient ||
      (selectedIds && !selectedIds.has(offer.id)) ||
      Date.parse(offer.endsAt) <= now
    )
      continue;
    if (
      !byIngredient.has(offer.ingredient) ||
      byIngredient.get(offer.ingredient).price > offer.price
    )
      byIngredient.set(offer.ingredient, offer);
  }
  return recipes
    .filter((r) => (!vegetarian || r.vegetarian) && r.minutes <= maxMinutes)
    .flatMap((recipe) => {
      const matched = recipe.ingredients
        .filter((i) => byIngredient.has(i.id))
        .map((i) => ({ ...i, offer: byIngredient.get(i.id) }));
      if (!matched.length) return [];
      const missing = recipe.ingredients.filter(
        (i) => !byIngredient.has(i.id) && !(pantry && PANTRY.includes(i.id)),
      );
      const pantryItems = recipe.ingredients.filter(
        (i) => !byIngredient.has(i.id) && pantry && PANTRY.includes(i.id),
      );
      const substantive = recipe.ingredients.filter(
        (i) => !PANTRY.includes(i.id),
      );
      const relevantMatched = matched.filter((i) => !PANTRY.includes(i.id));
      if (!relevantMatched.length) return [];
      return [
        {
          ...recipe,
          matched,
          missing,
          pantryItems,
          matchedCount: relevantMatched.length,
          coverage: relevantMatched.length / substantive.length,
          selectedCoverage: relevantMatched.length / byIngredient.size,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.matchedCount - a.matchedCount ||
        b.coverage - a.coverage ||
        a.missing.length - b.missing.length ||
        a.minutes - b.minutes,
    );
}

export const formatMoney = (value) =>
  new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 2,
  }).format(value);
export const formatAmount = (quantity, servings) =>
  new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(
    (quantity * servings) / 2,
  );
export function formatTime(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (value == null || !Number.isFinite(timestamp)) return "ukendt";
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
