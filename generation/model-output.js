export function parseModelOutput(raw) {
  if (typeof raw !== "string") return raw;
  // Some providers wrap structured output in thought tags or Markdown fences.
  return JSON.parse(
    raw
      .replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "")
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, ""),
  );
}
