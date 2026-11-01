import {
  MAX_PRODUCTS,
  MAX_IDEA_PRODUCTS,
  hasDescriptiveName,
  validateRequest,
  validateIdeasRequest,
} from "../generation/contract.js";
export { MAX_PRODUCTS };
export function generationInput(offers, selected, settings) {
  const products = offers.filter(
    (o) => selected.has(o.id) && Date.parse(o.endsAt) > Date.now(),
  );
  if (!products.length || products.length > MAX_PRODUCTS)
    throw new Error(`Vælg 1–${MAX_PRODUCTS} varer, du vil bruge sammen.`);
  const language = settings.language || "da";
  const pantry = settings.pantry
    ? language === "en"
      ? ["oil", "salt", "black pepper", "water"]
      : ["olie", "salt", "sort peber", "vand"]
    : [];
  for (const entry of (settings.extraPantry || "").split(/[,\n]/))
    if (entry.trim()) pantry.push(entry.trim());
  return validateRequest({
    language,
    products: products.map((p, i) => ({ id: `p${i + 1}`, name: p.name })),
    pantry: [...new Set(pantry)],
    servings: settings.servings,
    maxMinutes: settings.maxMinutes,
    vegetarian: settings.vegetarian,
    variant: settings.variant || 0,
  });
}

export function ideaCandidates(offers, variant = 0) {
  const seen = new Set();
  const now = Date.now();
  const eligible = offers.filter((o) => {
    const key = o.name.trim().toLocaleLowerCase("da");
    if (
      !(Date.parse(o.endsAt) > now) ||
      o.name.length > 240 ||
      !hasDescriptiveName(o.name) ||
      seen.has(key)
    )
      return false;
    seen.add(key);
    return true;
  });
  const start =
    eligible.length > MAX_IDEA_PRODUCTS
      ? (variant * MAX_IDEA_PRODUCTS) % eligible.length
      : 0;
  return {
    total: eligible.length,
    offers: Array.from(
      { length: Math.min(eligible.length, MAX_IDEA_PRODUCTS) },
      (_, index) => eligible[(start + index) % eligible.length],
    ),
  };
}

export function ideasInput(offers, settings) {
  const candidates = ideaCandidates(offers, settings.variant);
  // Share preference normalization with the manual flow without sending a location,
  // price or API credential to inference.
  if (!candidates.offers.length)
    throw new Error(
      "Der er ingen varer med tydelige navne at foreslå retter fra. Prøv en anden butik.",
    );
  const preferences = generationInput(
    candidates.offers.slice(0, 1),
    new Set([candidates.offers[0].id]),
    settings,
  );
  return {
    input: validateIdeasRequest({
      ...preferences,
      products: candidates.offers.map((o, i) => ({
        id: `p${i + 1}`,
        name: o.name,
      })),
    }),
    offers: candidates.offers,
    total: candidates.total,
  };
}

export function recipeFromIdea(idea, context, currentOffers, settings) {
  const offers = idea.productIds.map((id) => {
    const index = context.input.products.findIndex((p) => p.id === id);
    const original = context.offers[index];
    const current = currentOffers.find((o) => o.id === original?.id);
    if (
      !current ||
      current.name !== original.name ||
      Date.parse(current.endsAt) <= Date.now()
    )
      throw new Error(
        "En vare i forslaget er udløbet eller ændret. Hent nye forslag.",
      );
    return current;
  });
  const input = validateRequest({
    ...generationInput(offers, new Set(offers.map((o) => o.id)), settings),
    idea: {
      title: idea.title,
      description: idea.description,
      extraIngredients: idea.extraIngredients,
    },
  });
  return { input, offers };
}

export function ideasEndpoint(recipeEndpoint) {
  const url = new URL(recipeEndpoint);
  url.pathname = url.pathname.replace(/\/recipe\/?$/, "/ideas");
  if (!url.pathname.endsWith("/ideas"))
    throw new Error("Forslagsmodellen er ikke tilsluttet.");
  return url.href;
}
export async function requestRecipe(endpoint, input, signal) {
  if (!endpoint)
    throw new Error(
      "Opskriftsmodellen er ikke tilsluttet endnu. Denne forhåndsvisning kan ikke generere en opskrift.",
    );
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": input.language || "da",
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    if (e.name === "TimeoutError")
      throw new Error("Modellen svarede ikke i tide. Prøv igen om lidt.", {
        cause: e,
      });
    throw new Error(
      "Forbindelsen til opskriftsmodellen fejlede. Prøv igen om lidt.",
      { cause: e },
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Opskriftsmodellen returnerede et ukendt svar.");
  }
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string" && data.error.trim()
        ? data.error
        : "Opskriften kunne ikke laves. Prøv igen senere.",
    );
  return data;
}
