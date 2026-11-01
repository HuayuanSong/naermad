import { readFile } from "node:fs/promises";
export async function config() {
  const value = JSON.parse(
    await readFile(new URL("../public/config.json", import.meta.url), "utf8"),
  );
  const key = process.env.SALLING_FRONTEND_KEY?.trim();
  if (key && process.env.SALLING_KEY_KIND !== "frontend") {
    throw new Error(
      "Only an explicitly designated frontend key can be published. Read .env.example.",
    );
  }
  if (key) value.sallingFrontendKey = key;
  const endpoint = process.env.RECIPE_ENDPOINT?.trim();
  if (endpoint) {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )
    ) {
      throw new Error(
        "Recipe endpoint must use HTTPS (or localhost for development).",
      );
    }
    value.recipeEndpoint = endpoint;
  }
  return value;
}
