import { translate, translateError } from "../shared/translations.js";
const storageKey = "naermad-language";
let language = "da";
try {
  if (globalThis.localStorage?.getItem(storageKey) === "en") language = "en";
} catch {
  /* Storage may be disabled. */
}
export const getLanguage = () => language;
export const getLocale = () => (language === "en" ? "en-GB" : "da-DK");
export const t = (source, values) => translate(source, language, values);
export const errorText = (message) => translateError(message, language);
export function setLanguage(value) {
  if (!["da", "en"].includes(value)) return;
  language = value;
  try {
    globalThis.localStorage?.setItem(storageKey, language);
  } catch {
    /* Keep the in-memory preference. */
  }
}

// Capture only the initial, trusted app shell before any store or model data arrives.
// Keep bindings to these nodes; never scan dynamic product names or generated recipes.
export function bindStaticTranslations(root) {
  const texts = [],
    attributes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (
      node.textContent.trim() &&
      !["SCRIPT", "STYLE"].includes(node.parentElement?.tagName)
    )
      texts.push([node, node.textContent]);
  }
  for (const el of root.querySelectorAll(
    "[aria-label], [placeholder], [title]",
  )) {
    for (const attr of ["aria-label", "placeholder", "title"])
      if (el.hasAttribute(attr))
        attributes.push([el, attr, el.getAttribute(attr)]);
  }
  return () => {
    for (const [node, source] of texts)
      if (node.isConnected)
        node.textContent = source.replace(/\S(?:[\s\S]*\S)?/, (value) =>
          t(value),
        );
    for (const [el, attr, source] of attributes)
      if (el.isConnected) el.setAttribute(attr, t(source));
    document.documentElement.lang = language;
    document.title = t("Nærmad — fra datovare til aftensmad");
  };
}
