import { t, getLanguage, getLocale } from "./i18n.js";
import { formatMoney } from "./model.js";
import { ideaCost } from "./costs.js";
import { escapeHtml } from "./html.js";
const money = (cents) => formatMoney(cents / 100, getLanguage());
const count = (value) =>
  value.toLocaleString(getLocale(), { maximumFractionDigits: 3 });
const costLabel = (cost) =>
  cost.missing
    ? t("Nedsatte varer · delsum")
    : cost.estimated
      ? t("Nedsatte varer · anslået total")
      : t("Nedsatte varer i alt");
export const offerPrice = (offer) =>
  offer.unavailable
    ? t("Tilbuddet er ikke længere tilgængeligt.")
    : `${formatMoney(offer.price, getLanguage())} ${offer.unit === "kg" ? t("pr. kg") : offer.unit === "each" ? t("pr. salgsenhed") : t("Prisenhed ikke oplyst")}`;
export const costLineTotal = (line) =>
  line.offer.unavailable
    ? t("Tilbud ikke tilgængeligt")
    : line.cents === null
      ? t("Mængde eller prisenhed mangler")
      : money(line.cents);
export function costLineNote(line) {
  if (line.offer.unavailable) return t("Varen er ikke med i delsummen.");
  if (line.offer.unit !== "each" && line.offer.unit !== "kg")
    return t(
      "Butikken har ikke oplyst prisenheden. Denne vare er ikke med i delsummen.",
    );
  if (line.quantity === null)
    return t("Angiv hvor meget du skal købe, så varen kommer med i totalen.");
  if (line.edited) return t("Antal angivet af dig.");
  if (line.assumed)
    return t(
      "Én pakke/stk. antaget. Tjek størrelsen og ret antallet efter behov.",
    );
  return t("Beregnet ud fra opskriftens mængde og varens enhed.");
}
export function costLineEquation(line) {
  if (line.quantity === null || line.offer.unavailable) return "";
  return `${count(line.quantity)} ${line.offer.unit === "kg" ? "kg" : t("pakker/stk.")} × ${formatMoney(line.offer.price, getLanguage())}`;
}
export function costSummary(cost) {
  const unavailable = cost.lines
    .filter((line) => line.offer.unavailable)
    .map((line) => line.offer.name);

  return `<div class="cost-summary"><span class="cost-label">${costLabel(cost)}</span><strong class="cost-total">${money(cost.cents)}${cost.missing ? " + ?" : ""}</strong><p>${t("Kun de nedsatte varer, du skal købe. Ekstra indkøb og basisvarer er ikke medregnet.")}</p>${unavailable.length ? `<p class="cost-attention">${escapeHtml(t("Tilbud ikke længere tilgængeligt: {names}", { names: unavailable.join(", ") }))}</p>` : ""}${cost.missing ? `<p class="cost-attention">${t("{count} varer mangler en beregnet pris. Se prisberegningen.", { count: cost.missing })}</p>` : cost.estimated ? `<p class="cost-attention">${t("Tjek antal og lager i prisberegningen.")}</p>` : ""}</div>`;
}
export function ideaCostSummary(idea, context, available) {
  if (!available)
    return `<p class="cost-attention">${t("En vare i forslaget er ikke længere tilgængelig.")}</p>`;
  const cents = ideaCost(idea, context);
  return `<div class="idea-cost"><strong>${cents === null ? t("Prisen beregnes med den fulde opskrift") : money(cents)}</strong><p>${cents === null ? t("Forslaget har endnu ingen indkøbsmængder.") : t("For én pakke/stk. af hver nedsat vare. Opskriften kan kræve flere.")} ${t("Ekstra ingredienser er ikke medregnet.")}</p></div>`;
}
export function costBreakdown(cost) {
  return `<details class="cost-breakdown"><summary>${t("Se og ret prisberegning")}</summary><p>${t("Antallet er det, du skal købe i butikken. Hele pakker rundes op, også når opskriften kun bruger en del. Ret antallet, hvis pakkestørrelsen er en anden.")}</p><div class="cost-lines">${cost.lines.map((line) => `<div class="cost-line" data-cost-row="${line.id}"><div class="cost-product"><strong>${escapeHtml(line.offer.name)}</strong><span>${t("Opskriften bruger:")} ${line.ingredients.map((i) => escapeHtml(i.quantity)).join(" + ")}</span><span>${offerPrice(line.offer)}</span></div><div class="cost-controls">${!line.offer.unavailable && ["each", "kg"].includes(line.offer.unit) ? `<label for="cost-${line.id}">${line.offer.unit === "kg" ? t("Kg at købe") : t("Pakker/stk. at købe")}<input id="cost-${line.id}" data-cost-quantity="${line.id}" type="number" inputmode="decimal" min="${line.offer.unit === "kg" ? "0.001" : "1"}" max="10000" step="${line.offer.unit === "kg" ? "0.001" : "1"}" value="${line.quantity ?? ""}" aria-label="${escapeHtml(t("Mængde at købe: {name}", { name: line.offer.name }))}" aria-describedby="cost-note-${line.id}"></label>` : ""}<strong class="cost-line-total">${costLineTotal(line)}</strong></div><div class="cost-explanation"><span class="cost-equation">${costLineEquation(line)}</span><p id="cost-note-${line.id}" class="cost-line-note">${costLineNote(line)}</p><p class="cost-stock-warning" ${line.shortStock ? "" : "hidden"}>${t("Det vejledende lager er mindre end dit behov. Nedsat pris er ikke sikret for hele mængden.")}</p></div></div>`).join("")}</div><p class="cost-footnote">${t("Priserne er fra butikkens hentede tilbud. Lager og pris kan ændre sig, inden du kommer frem.")}</p></details>`;
}
export function costText(cost) {
  const lines = cost.lines.map((line) => {
    const equation = costLineEquation(line);
    const amount = equation
      ? `${equation} = ${costLineTotal(line)}`
      : costLineTotal(line);
    const warning = line.shortStock
      ? "\n" +
        t(
          "Det vejledende lager er mindre end dit behov. Nedsat pris er ikke sikret for hele mængden.",
        )
      : "";
    return `${line.offer.name}: ${amount}\n${costLineNote(line)}${warning}`;
  });
  return `${costLabel(cost)}: ${money(cost.cents)}${cost.missing ? " + ?" : ""}\n${t("Kun de nedsatte varer, du skal købe. Ekstra indkøb og basisvarer er ikke medregnet.")}\n${lines.join("\n")}\n${t("Priserne er fra butikkens hentede tilbud. Lager og pris kan ændre sig, inden du kommer frem.")}`;
}
