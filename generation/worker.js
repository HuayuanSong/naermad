import {
  RecipeError,
  validateRequest,
  validateRecipe,
  recipeSchema,
  buildMessages,
  DEFAULT_CF_MODEL,
  DEFAULT_HF_MODEL,
  PROMPT_VERSION,
} from "./contract.js";

const MAX_BODY = 12000;
async function readJson(request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new RecipeError("Send JSON.", 415);
  if (Number(request.headers.get("Content-Length")) > MAX_BODY)
    throw new RecipeError("Forespørgslen er for stor.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RecipeError("Forespørgslen er tom.");
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) {
        await reader.cancel();
        throw new RecipeError("Forespørgslen er for stor.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new RecipeError("Ugyldig JSON.");
  }
}

export async function generateRecipe(input, env, fetcher = fetch) {
  const provider = env.RECIPE_PROVIDER || "cloudflare";
  const messages = buildMessages(input),
    schema = recipeSchema(input);
  let output, model;
  if (provider === "huggingface") {
    if (!env.HF_TOKEN)
      throw new RecipeError("Opskriftsmodellen er ikke tilsluttet endnu.", 503);
    model = env.HF_MODEL || DEFAULT_HF_MODEL;
    const response = await fetcher(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 2400,
          temperature: 0.7,
          top_p: 0.8,
          response_format: {
            type: "json_schema",
            json_schema: { name: "recipe", strict: true, schema },
          },
        }),
        signal: AbortSignal.timeout(55000),
      },
    );
    if (!response.ok)
      throw new RecipeError(
        response.status === 402
          ? "Opskriftsmodellens kredit er brugt op. Prøv igen senere."
          : "Opskriftsmodellen er midlertidigt utilgængelig.",
        response.status === 429 ? 429 : 503,
      );
    const data = await response.json();
    output = data.choices?.[0]?.message?.content;
  } else if (provider === "cloudflare") {
    if (!env.AI)
      throw new RecipeError("Opskriftsmodellen er ikke tilsluttet endnu.", 503);
    model = env.CF_MODEL || DEFAULT_CF_MODEL;
    const response = await env.AI.run(model, {
      messages,
      max_tokens: 2400,
      temperature: 0.7,
      top_p: 0.8,
      response_format: { type: "json_schema", json_schema: schema },
    });
    // Workers AI models can return either the native or OpenAI-compatible shape.
    output = response.response ?? response.choices?.[0]?.message?.content;
  } else throw new RecipeError("Ukendt modeludbyder.", 503);
  const recipe = validateRecipe(output, input);
  return {
    ...recipe,
    model,
    provider,
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "https://huayuansong.github.io")
      .split(",")
      .map((s) => s.trim());
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (origin && allowed.includes(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    const json = (data, status = 200) =>
      Response.json(data, { status, headers });
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET")
      return json({
        configured:
          env.RECIPE_PROVIDER === "huggingface"
            ? Boolean(env.HF_TOKEN)
            : Boolean(env.AI),
        provider: env.RECIPE_PROVIDER || "cloudflare",
      });
    if (!origin || !allowed.includes(origin))
      return json({ error: "Denne oprindelse har ikke adgang." }, 403);
    if (path !== "/recipe") return json({ error: "Ukendt endpoint." }, 404);
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        },
      });
    if (request.method !== "POST") return json({ error: "Brug POST." }, 405);
    try {
      const input = validateRequest(await readJson(request));
      // These are approximate per-location burst limits, not a global budget.
      // Workers Free's provider quota is the hard, non-billable daily ceiling.
      if (env.RATE_LIMITER) {
        const ip = request.headers.get("CF-Connecting-IP") || "local";
        const result = await env.RATE_LIMITER.limit({ key: `recipe:${ip}` });
        if (!result.success)
          return new Response(
            JSON.stringify({
              error:
                "Du har lavet flere opskrifter på kort tid. Prøv igen om et minut.",
            }),
            { status: 429, headers: { ...headers, "Retry-After": "60" } },
          );
      }
      const result = await generateRecipe(input, env);
      return json(result);
    } catch (e) {
      if (e instanceof RecipeError) return json({ error: e.message }, e.status);
      // Never disclose model-provider responses, tokens or internal exception text.
      return json(
        { error: "Opskriften kunne ikke laves lige nu. Prøv igen om lidt." },
        503,
      );
    }
  },
};
