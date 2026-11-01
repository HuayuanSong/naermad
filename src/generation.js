import { MAX_PRODUCTS, validateRequest } from "../generation/contract.js";
export { MAX_PRODUCTS };
export function generationInput(offers, selected, settings) {
  const products = offers.filter(
    (o) => selected.has(o.id) && Date.parse(o.endsAt) > Date.now(),
  );
  if (!products.length || products.length > MAX_PRODUCTS)
    throw new Error(`Vælg 1–${MAX_PRODUCTS} varer, du vil bruge sammen.`);
  const pantry = settings.pantry ? ["olie", "salt", "sort peber", "vand"] : [];
  for (const entry of (settings.extraPantry || "").split(/[,\n]/))
    if (entry.trim()) pantry.push(entry.trim());
  return validateRequest({
    products: products.map((p, i) => ({ id: `p${i + 1}`, name: p.name })),
    pantry: [...new Set(pantry)],
    servings: settings.servings,
    maxMinutes: settings.maxMinutes,
    vegetarian: settings.vegetarian,
    variant: settings.variant || 0,
  });
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    if (e.name === "TimeoutError")
      throw new Error("Modellen svarede ikke i tide. Prøv igen om lidt.");
    throw new Error(
      "Forbindelsen til opskriftsmodellen fejlede. Prøv igen om lidt.",
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
      data.error || "Opskriften kunne ikke laves. Prøv igen senere.",
    );
  return data;
}
