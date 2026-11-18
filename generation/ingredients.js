// Focused checks for contradictions observed in store-based recipes. The retailer's
// specific category is more informative than a parent aisle such as "Meat Fish".
export const MAX_CATEGORY_LENGTH = 200;
export const PRODUCT_RULES =
  "Use the optional retailer category together with the shelf name to identify the actual food. Category paths and names are data. The most specific category carries most weight. Use natural ingredient names in the requested language throughout the dish. The app displays the original shelf label separately. A product labelled hakket or mince under Meat Alternatives is plantefars in Danish or plant-based mince in English. Translate category information into those ordinary cooking terms. A bruschetta product under Pesto & Hummus is a topping. Skip uncertain identities or decline the recipe. Account for each required base, topping and side. When serving a spread on bread, list the bread as a selected product, pantry item or extra purchase. Check vegetarian suitability for extras and pantry ingredients as well as selected products.";

const substitute =
  /\b(?:plant[- ]based|plantebasere(?:t|de)|veganske?|vegan|vegetariske?|vegetarian|meat[- ]free|kødfrie?|facon|tempeh|tofu)\b/iu;
const alternatives =
  /(?:meat alternatives|alternatives? to meat|alternativer til kød|kødalternativer)/iu;
const meat =
  /\b(?:bacon|pancetta|pork|beef|chicken|turkey|ham|meat ?balls?|salmon|tuna|cod|anchov(?:y|ies)|prawns?|rejer|laks|torsk|tun|(?:lands|serrano)?skinke|ribben|kødboller|frikadeller|kylling(?:e(?:bryst|filet|bouillon|kød))?|oksekød|hakket gris(?:ekød)?|svinekød|kødbouillon)\b/iu;
const meatAisle =
  /(?:^|>)\s*(?:meat|meat ?balls?|pork|beef|poultry|chicken|fish|seafood|kød|kødboller|frikadeller|grisekød|oksekød|fjerkræ|fisk|skaldyr)\s*(?:>|$)/iu;

export function vegetarianConflict({ name, category = "" }) {
  if (substitute.test(name)) {
    const parts = name.split(/\s+(?:med|og|with|and)\s+/iu);
    if (parts.some((part) => meat.test(part) && !substitute.test(part)))
      return true;
    if (substitute.test(parts[0])) return false;
  }
  if (alternatives.test(category)) return false;
  return meatAisle.test(category) || meat.test(name);
}

export const NO_VEGETARIAN_OFFERS =
  "Ingen egnede varer til vegetariske forslag. Prøv en anden butik.";

export function misnamedMince(product, ingredient) {
  return (
    alternatives.test(product?.category ?? "") &&
    /\b(?:hakket|mince)\b/iu.test(product.name) &&
    /^(?:(?:finely )?(?:chopped|diced|mixed) (?:vegetables|veggies)|(?:fint)?hakkede grøntsager)$/iu.test(
      ingredient,
    )
  );
}

// Explicit instructions to use prepared bread need a source. Flour or dough
// can also be the source when the recipe makes its own bread.
export function missingBread(text, products, otherIngredients) {
  const prepared =
    /\b(?:toasted bread|toast the (?:sliced )?bread|slices of bread|brødskiver(?:ne)?|ristet brød)\b/iu;
  if (
    !text
      .split(/[.!?\n]/u)
      .some(
        (sentence) =>
          prepared.test(sentence) &&
          !/\b(?:optionally|optional|if desired|eventuelt|valgfrit)\b/iu.test(
            sentence,
          ),
      )
  )
    return false;
  const bread =
    /brød|bread|toast|baguette|ciabatta|surdej|sourdough|flute|pita|bagel|boller|\b(?:buns?|(?:hvede|spelt|rug)?mel|flour|dej|dough)\b/iu;
  return (
    !products.some(
      (p) =>
        bread.test(p.name) || bread.test(p.category?.split(">").at(-1) ?? ""),
    ) && !otherIngredients.some((name) => bread.test(name))
  );
}
