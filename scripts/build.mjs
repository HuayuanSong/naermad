import { build } from "vite";
import { writeFile } from "node:fs/promises";
import { config } from "./config.mjs";
const settings = await config();
await build();
await writeFile(
  new URL("../dist/config.json", import.meta.url),
  JSON.stringify(settings),
);
await writeFile(new URL("../dist/.nojekyll", import.meta.url), "");
console.log(
  settings.sallingFrontendKey
    ? "Built with a public frontend key."
    : "Built in clearly labelled demo mode; no Salling key configured.",
);
