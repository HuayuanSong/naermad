import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/fraunces/latin-500.css";
import "leaflet/dist/leaflet.css";
import "./style.css";
import L from "leaflet";
import { createApi } from "./api.js";
import { DEMO_ORIGIN, demoData } from "./demo.js";
import { normalizeStores, formatMoney, formatTime } from "./model.js";
import { MAX_PRODUCTS, generationInput, requestRecipe } from "./generation.js";
import { validateRecipe } from "../generation/contract.js";

const $ = (selector) => document.querySelector(selector);
const esc = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  pin: "M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  search: "m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  arrow: "M4 12h16 m-6-6 6 6-6 6",
  leaf: "M20 3C9 2 3 8 5 15s17 6 15-12Z M5 21 16 10",
  clock: "M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  check: "m5 12 4 4L19 6",
  plus: "M12 5v14 M5 12h14",
  bag: "M5 7h14l2 15H3L5 7Z M8 8V6a4 4 0 0 1 8 0v2",
  locate:
    "M12 2v3 m0 14v3 M2 12h3 m14 0h3 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  close: "m6 6 12 12 M18 6 6 18",
};
const icon = (id, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[id] || paths.leaf}"/></svg>`;
const brandName = { netto: "Netto", foetex: "føtex", bilka: "Bilka" };
const state = {
  config: null,
  api: null,
  demo: true,
  origin: null,
  stores: [],
  store: null,
  selected: new Set(),
  radius: 3,
  vegetarian: false,
  maxMinutes: 30,
  servings: 2,
  pantry: true,
  extraPantry: "",
  variant: 0,
  generationId: 0,
  generating: false,
  generationMessage: "",
  generatedRecipe: null,
  recipeContext: null,
  expanded: false,
  fetchId: 0,
  searchId: 0,
  fetchedAt: null,
  capped: false,
  busy: false,
};
let map, markers, originMarker, dialogRecipe, generationController;

$("#app").innerHTML = `
  <header class="site-header wrap">
    <a href="./" class="brand" aria-label="Nærmad, forsiden"><img src="./icon.svg" alt="" width="36" height="36">nærmad<span class="brand-dot">.</span></a>
    <span class="header-caption">Gode råvarer. Nye muligheder.</span>
    <div class="header-actions"><span id="mode-badge" class="status-badge">Indlæser</span><button class="text-button" id="about-button">Om Nærmad ${icon("arrow")}</button></div>
  </header>
  <main class="wrap">
    <section class="hero compact-hero" aria-labelledby="hero-title"><div><div class="eyebrow">FRA BUTIKKENS DATOVARER TIL DIT KØKKEN</div><h1 id="hero-title">Dine varer. <em>En ny opskrift.</em></h1><p>Vælg en butik og nogle varer. Lad AI finde på aftensmaden.</p></div></section>
    <div id="demo-notice" class="demo-notice" hidden><span><strong>Du ser en demo.</strong> Butikker, varer og priser er fiktive eksempler i Aarhus. Live data kræver tilslutning til Salling.</span><button class="text-button" id="demo-reset">Prøv Aarhus-demoen ${icon("arrow")}</button></div>
    <section class="search-section" aria-label="Find butikker nær dig">
      <form id="search-form" class="search-form"><label class="address-field">${icon("pin")}<span class="sr-only">Adresse, by eller sted i Danmark</span><input id="address" type="search" placeholder="Din adresse, by eller et sted …" autocomplete="off" minlength="3" maxlength="160" required></label><label class="radius-field"><span>Inden for</span><select id="radius" aria-label="Søgeradius"><option value="1">1 km</option><option value="3" selected>3 km</option><option value="5">5 km</option><option value="10">10 km</option></select></label><button class="primary-button" id="search-button" type="submit">${icon("search")} Find butikker</button><button class="location-button" type="button" id="locate" aria-label="Brug min position" title="Brug min position">${icon("locate")}</button></form>
      <div class="search-help">Søg også efter steder som Aarhus H eller Fisketorvet. Adressesøgning via Photon / OpenStreetMap.</div>
      <div id="addresses" class="address-results" hidden></div>
    </section>
    <p id="message" class="message" role="status" aria-live="polite" hidden></p>
    <div class="workspace">
      <aside class="sidebar" aria-label="Butikker og kort"><div class="section-title"><h2>1. Vælg butik</h2><span id="store-count" class="count-badge">0</span></div><p id="origin-label" class="muted location-label">Søg efter et sted for at begynde.</p><details id="map-disclosure" class="map-disclosure"><summary>Vis butikkerne på kortet</summary><div id="map" role="region" aria-label="Kort over butikker i nærheden"></div><div class="distance-note">Afstande er i fugleflugtslinje.</div></details><div id="stores" class="store-list"></div><p id="coverage-note" class="coverage-note">Kun deltagende Netto, føtex og Bilka. En søgning kan vise højst 20 butikker.</p></aside>
      <div class="main-panel"><section id="offers" aria-labelledby="offers-title"></section><section id="recipes" aria-labelledby="recipes-title"><div class="recipe-heading"><div><h2 id="recipes-title">3. Lav en opskrift</h2><p class="generation-intro">En ny opskrift lavet med netop de varer, du vælger.</p></div></div><div id="selected-products" class="selected-products"></div><div class="filters"><label><span class="sr-only">Antal personer</span><select id="servings"><option value="1">1 person</option><option value="2" selected>2 personer</option><option value="4">4 personer</option><option value="6">6 personer</option></select></label><label><span class="sr-only">Maksimal tilberedningstid</span><select id="max-minutes"><option value="20">Højst 20 min.</option><option value="30" selected>Højst 30 min.</option><option value="45">Højst 45 min.</option><option value="60">Højst 60 min.</option></select></label><label class="check-label"><input id="vegetarian" type="checkbox">Vegetarisk</label></div><details class="pantry-details"><summary>Det har jeg hjemme</summary><label class="pantry check-label"><input type="checkbox" id="pantry" checked> Olie, salt, sort peber og vand</label><label class="extra-pantry-label" for="extra-pantry">Andre basisvarer (valgfrit)</label><input id="extra-pantry" maxlength="400" placeholder="Fx ris, hvidløg, citron"><p>Adskil med komma. Alt andet står som ekstra indkøb.</p></details><div class="generate-actions"><button id="generate" class="primary-button" disabled>Lav en opskrift ${icon("arrow")}</button><button id="cancel-generation" class="text-button" hidden>Annullér</button></div><p id="generation-status" class="generation-status" role="status" aria-live="polite"></p><div id="recipe-list" class="recipe-list generated-list"></div></section></div>
    </div>
    <section class="closing-note"><span class="little-leaf">${icon("leaf")}</span><div><h2>En god idé begynder med det, der er.</h2><p>Opskrifterne tager udgangspunkt i dine valgte varer. Resten står på indkøbslisten, så du ved præcis, hvad der mangler.</p></div></section>
  </main>
  <footer class="wrap site-footer"><span class="footer-brand">nærmad.</span><p>Et uafhængigt projekt. Data fra <a href="https://developer.sallinggroup.dev/apireference/food-waste" target="_blank" rel="noreferrer">Salling Group</a> · Kort og adresser © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></p><a href="https://github.com/HuayuanSong/naermad" target="_blank" rel="noreferrer">GitHub ↗</a></footer>
  <dialog id="recipe-dialog" class="recipe-dialog" aria-labelledby="recipe-dialog-title"><button class="dialog-close" aria-label="Luk opskrift">${icon("close")}</button><div id="recipe-detail"></div></dialog>
  <dialog id="about-dialog" class="about-dialog" aria-labelledby="about-title"><button class="dialog-close" aria-label="Luk information">${icon("close")}</button><div class="eyebrow">OM PROJEKTET</div><h2 id="about-title">Gør et godt fund<br>til et godt måltid.</h2><p>Nærmad lader en sprogmodel skrive en ny dansk opskrift med de varer, du selv vælger fra en butik. Ingen varer vælges automatisk, og der bruges ikke et fast opskriftskatalog.</p><h3>Hvilke tilbud?</h3><p>Sallings Anti Food Waste API viser varer sat ned på grund af kort holdbarhed i deltagende Netto, føtex og Bilka. Det er ikke de almindelige tilbudsaviser. Lagerstatus er vejledende, og varer kan være solgt, når du kommer frem.</p><h3>Opskrifter og ingredienser</h3><p>Tryk på “Lav en opskrift” for at sende de valgte varenavne, portionsantal, tidsramme og basisvarer til en sprogmodel. Vi kontrollerer svarformatet og at alle valgte varer er refereret. Det kontrollerer ikke smag eller tilberedningens korrekthed. AI-opskrifter er ikke køkkentestede. Tjek produktets ingredienser, allergener og holdbarhed på emballagen.</p><h3>Data og privatliv</h3><p>En adressesøgning sendes til Photons offentlige søgetjeneste. I live-tilstand sendes den valgte position til Salling. Kortvisninger hentes fra OpenStreetMap. Ved opskriftsgenerering sendes kun de valgte varenavne og dine madvalg til modeltjenesten, ikke din adresse eller position. Appen har ingen analyseværktøjer og gemmer ikke din adresse på en server; søgninger caches kun i hukommelsen, mens siden er åben.</p><p>Geokodning og kort er fælles tjenester uden garanteret oppetid. Salling dokumenterer aktuelt 100 madspildsforespørgsler pr. dag. Vi cacher søgninger i fem minutter og opdaterer kun ved dit valg.</p><div class="about-links"><a href="https://developer.sallinggroup.dev/apireference/food-waste" target="_blank" rel="noreferrer">Sallings API ↗</a><a href="https://github.com/HuayuanSong/naermad#connect-salling" target="_blank" rel="noreferrer">Tilslut live data ↗</a><a href="https://github.com/komoot/photon" target="_blank" rel="noreferrer">Photon ↗</a></div></dialog>
`;

function message(text = "", error = false) {
  const el = $("#message");
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle("error", error);
}
function busy(value) {
  state.busy = value;
  $("#search-button").disabled = value;
  $("#locate").disabled = value;
  $("#search-button").innerHTML = value
    ? "Søger …"
    : `${icon("search")} Find butikker`;
}
function initMap() {
  map = L.map("map", {
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    scrollWheelZoom: true,
    wheelPxPerZoomLevel: 120,
    attributionControl: true,
  }).setView([56.15, 10.205], 13.5);
  L.tileLayer(state.config.tileUrl, {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  markers = L.layerGroup().addTo(map);
}
function updateMap(fit = false) {
  markers.clearLayers();
  if (originMarker) map.removeLayer(originMarker);
  if (state.origin)
    originMarker = L.circleMarker([state.origin.lat, state.origin.lon], {
      radius: 7,
      color: "#fff",
      weight: 3,
      fillColor: "#314e74",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip("Dit søgepunkt");
  state.stores.forEach((store, index) => {
    const marker = L.marker([store.lat, store.lon], {
      title: store.name,
      keyboard: true,
      icon: L.divIcon({
        className: "store-pin",
        html: `<span class="${store.id === state.store?.id ? "active" : ""}">${index + 1}</span>`,
        iconSize: [32, 39],
        iconAnchor: [16, 39],
      }),
    }).addTo(markers);
    const tip = document.createElement("span");
    tip.textContent = store.name;
    marker.bindTooltip(tip);
    marker.on("click", () => selectStore(store.id));
  });
  if (fit && state.origin) {
    const points = [
      [state.origin.lat, state.origin.lon],
      ...state.stores.map((s) => [s.lat, s.lon]),
    ];
    if (points.length > 1)
      map.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
    else map.setView(points[0], 13.5);
  }
}
function renderStores() {
  $("#store-count").textContent = state.stores.length;
  $("#origin-label").textContent =
    state.origin?.label || "Søg efter et sted for at begynde.";
  $("#stores").innerHTML = state.stores.length
    ? state.stores
        .map(
          (s, index) =>
            `<button class="store-card ${state.store?.id === s.id ? "active" : ""}" data-store="${esc(s.id)}" aria-pressed="${state.store?.id === s.id}"><div class="store-top"><span class="brand-label ${esc(s.brand)}">${esc(brandName[s.brand])}${state.demo ? " · demo" : ""}</span><span>${s.distance < 1 ? `${Math.round(s.distance * 1000)} m` : `${s.distance.toLocaleString("da-DK", { maximumFractionDigits: 1 })} km`}</span></div><strong><span class="store-number">${index + 1}.</span> ${esc(s.name)}</strong><span class="store-address">${esc(s.address)}</span><span class="store-bottom">${s.offers.length} datovarer ${state.store?.id === s.id ? `${icon("check")} Valgt` : icon("arrow")}</span></button>`,
        )
        .join("")
    : `<div class="empty small">${state.origin ? "Ingen butikker at vise her." : "Din næste gode råvare er måske lige om hjørnet."}</div>`;
  $("#coverage-note").textContent = state.demo
    ? "Demobutikkerne er fiktive. De ligger kun i Aarhus; søgninger flytter dem ikke."
    : state.capped
      ? "API’et returnerede 20 butikker. Der kan være flere i området; prøv en mindre radius."
      : "Kun deltagende Netto, føtex og Bilka. Salling returnerer højst 20 butikker, så listen er ikke nødvendigvis komplet.";
}
function selectStore(id) {
  state.store = state.stores.find((s) => s.id === id) || null;
  state.selected = new Set();
  invalidateGeneration();
  state.expanded = false;
  renderStores();
  renderOffers();
  renderRecipes();
  updateMap();
}
function invalidateGeneration() {
  generationController?.abort();
  state.generationId++;
  state.generating = false;
  state.generatedRecipe = null;
  state.recipeContext = null;
  state.generationMessage = "";
  state.variant = 0;
  if ($("#recipe-dialog").open) $("#recipe-dialog").close();
}
function selectedOffers() {
  return (state.store?.offers || []).filter(
    (o) => state.selected.has(o.id) && Date.parse(o.endsAt) > Date.now(),
  );
}
function renderOffers() {
  const s = state.store;
  if (!s) {
    $("#offers").innerHTML =
      `<div class="empty start-state"><h2 id="offers-title">2. Vælg dine varer</h2><p>Vælg først en butik i listen.</p>${state.demo ? '<button class="primary-button" data-reset>Prøv Aarhus-demoen</button>' : ""}</div>`;
    return;
  }
  const offers = state.expanded ? s.offers : s.offers.slice(0, 9);
  $("#offers").innerHTML =
    `<div class="offer-header"><div><div class="eyebrow">${state.demo ? "DEMO · " : ""}${esc(s.name)}</div><h2 id="offers-title">2. Vælg dine varer</h2><p>Vælg 1–6 varer, du vil bruge sammen. Du bestemmer.</p></div>${!state.demo ? '<button id="refresh" class="text-button">Hent igen ↻</button>' : ""}</div><div class="selection-heading"><span><strong>${state.selected.size}</strong> varer valgt · ${s.offers.length} datovarer i butikken</span>${state.selected.size ? '<button id="clear-selection" class="text-button">Ryd valg</button>' : ""}</div><div class="offer-grid">${offers.map((o) => `<article class="offer-card ${state.selected.has(o.id) ? "selected" : ""}"><button class="offer-toggle" data-offer="${esc(o.id)}" aria-pressed="${state.selected.has(o.id)}" aria-label="${state.selected.has(o.id) ? "Fravælg" : "Vælg"} ${esc(o.name)}"><div class="offer-card-top"><span class="discount">−${o.discount}%</span><span class="selection-icon">${icon(state.selected.has(o.id) ? "check" : "plus")}</span></div><h3>${esc(o.name)}</h3><div class="prices"><strong>${formatMoney(o.price)}</strong><s>${formatMoney(o.originalPrice)}</s></div><div class="unit-note">${o.unit === "kg" ? "Pr. kg" : o.unit === "each" ? "Pr. salgsenhed" : "Prisenhed ikke oplyst"}</div></button><details class="offer-meta"><summary>Pris og gyldighed</summary><p>Tilbud til ${formatTime(o.endsAt)}. ${o.stock === null ? "Lager ukendt." : `Vejledende lager: ${o.stock} ${o.unit === "kg" ? "kg" : o.unit === "each" ? "stk." : "enheder"}.`} ${state.demo ? "Eksempeldata." : `Hentet ${formatTime(state.fetchedAt)}.`}</p></details></article>`).join("")}</div>${s.offers.length > 9 ? `<button class="show-more" id="show-more">${state.expanded ? "Vis færre varer" : `Se alle ${s.offers.length} varer`} ↓</button>` : ""}${!s.offers.length ? '<div class="empty">Ingen aktive datovarer i svaret. Prøv en anden butik.</div>' : ""}<p class="stock-note">Varer kan være udsolgt ved ankomst. Priserne gælder varerne, ikke hele opskriften.</p>`;
}
function renderRecipes() {
  const offers = selectedOffers();
  $("#selected-products").innerHTML = offers.length
    ? `<span class="selection-caption">OPSKRIFTEN SKAL BRUGE</span><div class="product-chips">${offers.map((o) => `<span>${esc(o.name)}</span>`).join("")}</div>`
    : '<p class="muted">Vælg varer ovenfor. Der laves først en opskrift, når du trykker på knappen.</p>';
  $("#generate").disabled =
    !offers.length || state.generating || !state.config?.recipeEndpoint;
  $("#generate").innerHTML = state.generating
    ? "Skriver din opskrift …"
    : `Lav en opskrift ${icon("arrow")}`;
  $("#cancel-generation").hidden = !state.generating;
  $("#generation-status").textContent = state.generating
    ? "Modellen finder på en ret med dine valgte varer."
    : state.generationMessage ||
      (!state.config?.recipeEndpoint
        ? "Modellen er endnu ikke tilsluttet i denne forhåndsvisning."
        : "AI-genereret på bestilling. Ekstra ingredienser bliver vist tydeligt.");
  const r = state.generatedRecipe;
  if (!r) {
    $("#recipe-list").innerHTML = "";
    return;
  }
  if (r.status === "cannot_create") {
    $("#recipe-list").innerHTML =
      `<div class="empty"><h3>Prøv et andet udvalg</h3><p>${esc(r.reason)}</p></div>`;
    return;
  }
  const extras = r.ingredients.filter(
    (i) => i.productId === null && i.pantryItem === null,
  );
  $("#recipe-list").innerHTML =
    `<article class="recipe-card generated-card"><div class="recipe-card-top"><span class="match-badge">Ny AI-opskrift · ${r.servings} ${r.servings === 1 ? "person" : "personer"}</span><span class="recipe-time">${icon("clock")}${r.minutes} min.</span></div><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><div class="recipe-provenance"><strong>Bruger dine valgte varer</strong><p>${state.recipeContext.products.map((p) => esc(p.name)).join(" · ")}</p></div><div class="recipe-extras"><strong>${extras.length ? "Køb også" : "Ingen ekstra indkøb"}</strong><p>${extras.length ? extras.map((i) => esc(i.name)).join(", ") : "Resten er på din liste over basisvarer."}</p></div><div class="recipe-card-bottom"><button data-recipe="generated" class="recipe-link">Se opskrift og indkøbsliste ${icon("arrow")}</button><button id="another-recipe" class="text-button" ${state.variant >= 20 ? "disabled" : ""}>Lav en anden idé</button></div></article>`;
}
async function generate() {
  if (state.generating) return;
  // Read the pantry input here too: clicking can happen before its change event fires.
  state.extraPantry = $("#extra-pantry").value;
  let input;
  try {
    input = generationInput(state.store?.offers || [], state.selected, state);
  } catch (e) {
    state.generationMessage = e.message;
    renderRecipes();
    return;
  }
  const id = ++state.generationId;
  generationController = new AbortController();
  state.generating = true;
  state.generatedRecipe = null;
  state.recipeContext = null;
  state.generationMessage = "";
  renderRecipes();
  const snapshot = selectedOffers().map((o) => ({ ...o }));
  try {
    const data = await requestRecipe(
      state.config.recipeEndpoint,
      input,
      AbortSignal.any([
        generationController.signal,
        AbortSignal.timeout(60000),
      ]),
    );
    if (id !== state.generationId) return;
    const recipe = validateRecipe(data, input);
    state.generatedRecipe = recipe;
    state.recipeContext = {
      ...input,
      offers: snapshot,
      storeName: state.store.name,
      model: data.model || "Sprogmodel",
      provider: data.provider || "",
      generatedAt: data.generatedAt || new Date().toISOString(),
    };
  } catch (e) {
    if (id === state.generationId)
      state.generationMessage =
        e.name === "AbortError" ? "Genereringen er annulleret." : e.message;
  } finally {
    if (id === state.generationId) {
      state.generating = false;
      renderRecipes();
    }
  }
}
function shoppingText(r) {
  const c = state.recipeContext;
  return `${r.title} — ${r.servings} ${r.servings === 1 ? "person" : "personer"}\nAI-genereret opskrift\nButik: ${c.storeName}\n\n${r.ingredients.map((i) => `${i.quantity} ${i.name} [${i.productId ? "valgt datovare" : i.pantryItem ? "har hjemme" : "køb også"}]`).join("\n")}\n\n${r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n\n")}\n\nAI-opskriften er ikke køkkentestet. Tjek mængder, tilberedning, allergener og holdbarhed.\nNærmad · https://huayuansong.github.io/naermad/`;
}
function showRecipe() {
  const r = state.generatedRecipe,
    c = state.recipeContext;
  if (!r || r.status !== "ok" || !c) return;
  dialogRecipe = r;
  const offerById = new Map(c.products.map((p, i) => [p.id, c.offers[i]]));
  const group = (title, items) =>
    items.length
      ? `<h4>${title}</h4><ul>${items.map((i) => `<li><label><input type="checkbox"><span><strong>${esc(i.quantity)}</strong> ${esc(i.name)}</span></label>${i.productId ? `<small class="detail-product">${esc(offerById.get(i.productId).name)} · ${formatMoney(offerById.get(i.productId).price)} ${offerById.get(i.productId).unit === "kg" ? "pr. kg" : "pr. salgsenhed"}</small>` : ""}</li>`).join("")}</ul>`
      : "";
  $("#recipe-detail").innerHTML =
    `<div class="eyebrow">AI-GENERERET · ${r.minutes} MINUTTER · ${r.servings} ${r.servings === 1 ? "PERSON" : "PERSONER"}</div><h2 id="recipe-dialog-title">${esc(r.title)}</h2><p class="recipe-intro">${esc(r.description)}</p><div class="recipe-detail-layout"><div class="shopping-list"><h3>Din indkøbsliste</h3>${group(
      "Valgte datovarer",
      r.ingredients.filter((i) => i.productId !== null),
    )}${group(
      "Køb også",
      r.ingredients.filter(
        (i) => i.productId === null && i.pantryItem === null,
      ),
    )}${group(
      "Fra dit køkken",
      r.ingredients.filter((i) => i.pantryItem !== null),
    )}<p class="list-note">Tjek pakkestørrelser. Mængderne er til ${r.servings} personer; én nedsat pakke dækker ikke nødvendigvis behovet.</p></div><div class="method"><h3>Sådan gør du</h3><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p class="recipe-caution">AI-opskriften er ikke køkkentestet. Tjek tilberedning, allergener og varernes holdbarhed.</p></div></div><div class="dialog-actions"><button id="copy-list" class="primary-button">Kopiér indkøbsliste</button><button id="download-list" class="secondary-button">Gem som tekst</button><button id="print-recipe" class="text-button">Udskriv</button><span id="copy-status" role="status"></span></div><p class="generation-credit">Lavet ${formatTime(c.generatedAt)} · ${esc(c.model)}</p>`;
  $("#recipe-dialog").showModal();
}

async function loadStores(origin) {
  const request = ++state.fetchId;
  state.origin = origin;
  state.stores = [];
  state.store = null;
  state.selected.clear();
  invalidateGeneration();
  renderStores();
  renderOffers();
  renderRecipes();
  updateMap(true);
  busy(true);
  message("Finder butikker …");
  try {
    if (state.demo) {
      state.stores = normalizeStores(demoData(), origin, state.radius);
      state.fetchedAt = Date.now();
      state.capped = false;
    } else {
      const result = await state.api.nearby(origin, state.radius);
      if (request !== state.fetchId) return;
      state.stores = result.stores;
      state.fetchedAt = result.fetchedAt;
      state.capped = result.capped;
    }
    if (request !== state.fetchId) return;
    selectStore(state.stores[0]?.id);
    updateMap(true);
    message(
      state.stores.length
        ? ""
        : state.demo
          ? "Der er ingen demobutikker tæt på dette sted. Prøv Aarhus-demoen. Live butikker kræver en Salling-tilslutning."
          : "Salling returnerede ingen deltagende butikker i området. Prøv en større radius eller et andet sted.",
    );
  } catch (e) {
    if (request === state.fetchId) message(e.message, true);
  } finally {
    if (request === state.fetchId) busy(false);
  }
}
function resetDemo() {
  ++state.searchId;
  state.demo = true;
  state.radius = 3;
  $("#radius").value = "3";
  $("#address").value = "";
  $("#addresses").hidden = true;
  $("#mode-badge").textContent = "Demo · eksempeldata";
  $("#mode-badge").classList.remove("live");
  $("#demo-notice").hidden = false;
  loadStores({ ...DEMO_ORIGIN });
}
$("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = ++state.searchId;
  $("#addresses").hidden = true;
  busy(true);
  message("Søger efter adressen …");
  try {
    const addresses = await state.api.search($("#address").value);
    if (id !== state.searchId) return;
    if (!addresses.length) {
      message(
        "Ingen adresser fundet. Prøv gadenavn og by, eller et kendt sted.",
      );
      return;
    }
    $("#addresses").innerHTML =
      `<p>Vælg det rigtige sted</p>${addresses.map((p, i) => `<button type="button" data-address="${i}">${icon("pin")}<span>${esc(p.label)}</span>${icon("arrow")}</button>`).join("")}`;
    $("#addresses").hidden = false;
    $("#addresses")._places = addresses;
    message("Vælg en adresse nedenfor.");
  } catch (e) {
    if (id === state.searchId) message(e.message, true);
  } finally {
    if (id === state.searchId) busy(false);
  }
});
$("#addresses").addEventListener("click", (e) => {
  const button = e.target.closest("[data-address]");
  if (!button) return;
  const place = $("#addresses")._places[Number(button.dataset.address)];
  ++state.searchId;
  $("#address").value = place.label;
  $("#addresses").hidden = true;
  loadStores(place);
});
$("#radius").addEventListener("change", () => {
  state.radius = Number($("#radius").value);
  if (state.origin) loadStores(state.origin);
});
$("#locate").addEventListener("click", () => {
  if (!navigator.geolocation) {
    message(
      "Denne browser understøtter ikke positionsdeling. Skriv en adresse i stedet.",
      true,
    );
    return;
  }
  const id = ++state.searchId;
  $("#addresses").hidden = true;
  busy(true);
  message("Venter på din position …");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      if (id !== state.searchId) return;
      loadStores({
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        label: "Din position",
      });
    },
    () => {
      if (id !== state.searchId) return;
      busy(false);
      message(
        "Positionen kunne ikke hentes. Du kan skrive din adresse i stedet.",
        true,
      );
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
  );
});
$("#stores").addEventListener("click", (e) => {
  const button = e.target.closest("[data-store]");
  if (button) selectStore(button.dataset.store);
});
$("#offers").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-reset")) return resetDemo();
  if (b.id === "refresh") return loadStores(state.origin);
  if (b.dataset.offer) {
    const id = b.dataset.offer;
    if (state.selected.has(id)) state.selected.delete(id);
    else if (state.selected.size < MAX_PRODUCTS) state.selected.add(id);
    else {
      message(`Vælg højst ${MAX_PRODUCTS} varer til én opskrift.`);
      return;
    }
    invalidateGeneration();
    renderOffers();
    renderRecipes();
    document
      .querySelector(`[data-offer="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });
  }
  if (b.id === "clear-selection") {
    state.selected.clear();
    invalidateGeneration();
    renderOffers();
    renderRecipes();
  }
  if (b.id === "show-more") {
    state.expanded = !state.expanded;
    renderOffers();
    $("#show-more")?.focus({ preventScroll: true });
  }
});
for (const [selector, key, convert] of [
  ["#vegetarian", "vegetarian", (el) => el.checked],
  ["#max-minutes", "maxMinutes", (el) => Number(el.value)],
  ["#servings", "servings", (el) => Number(el.value)],
  ["#pantry", "pantry", (el) => el.checked],
  ["#extra-pantry", "extraPantry", (el) => el.value],
])
  $(selector).addEventListener("change", (e) => {
    state[key] = convert(e.target);
    invalidateGeneration();
    renderRecipes();
  });
$("#generate").addEventListener("click", () => generate());
$("#cancel-generation").addEventListener("click", () => {
  invalidateGeneration();
  state.generationMessage = "Genereringen er annulleret.";
  renderRecipes();
});
$("#recipe-list").addEventListener("click", (e) => {
  if (e.target.closest("[data-recipe]")) showRecipe();
  if (e.target.closest("#another-recipe")) {
    state.variant++;
    generate();
  }
});
$("#map-disclosure").addEventListener("toggle", () => {
  if ($("#map-disclosure").open) {
    map.invalidateSize();
    updateMap(true);
  }
});
$("#demo-reset").addEventListener("click", resetDemo);
$("#about-button").addEventListener("click", () =>
  $("#about-dialog").showModal(),
);
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        dialog.close();
    }
  });
});
$("#recipe-detail").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || !dialogRecipe) return;
  if (b.id === "copy-list") {
    try {
      await navigator.clipboard.writeText(shoppingText(dialogRecipe));
      $("#copy-status").textContent = "Kopieret!";
    } catch {
      $("#copy-status").textContent =
        "Kopiering blev blokeret. Brug “Gem som tekst”.";
    }
  }
  if (b.id === "download-list") {
    const url = URL.createObjectURL(
      new Blob([shoppingText(dialogRecipe)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "naermad-opskrift.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (b.id === "print-recipe") window.print();
});

async function boot() {
  try {
    // Runtime connection settings can change independently of the bundled app.
    const response = await fetch("./config.json", { cache: "no-store" });
    if (!response.ok)
      throw new Error("Konfigurationen kunne ikke indlæses. Genindlæs siden.");
    state.config = await response.json();
    state.api = createApi(state.config);
    state.demo = !state.config.sallingFrontendKey;
    initMap();
    if (state.demo) resetDemo();
    else {
      $("#mode-badge").textContent = "Salling · tilsluttet";
      $("#mode-badge").classList.add("live");
      renderStores();
      renderOffers();
      renderRecipes();
    }
  } catch (e) {
    message(e.message, true);
    $("#mode-badge").textContent = "Ikke tilsluttet";
    $("#search-button").disabled = true;
    $("#locate").disabled = true;
  }
}
// Expiration is checked locally; no timer polls the API or consumes its quota.
setInterval(() => {
  if (state.busy) return;
  const now = Date.now();
  let changed = false;
  for (const s of state.stores) {
    const before = s.offers.length;
    s.offers = s.offers.filter((o) => Date.parse(o.endsAt) > now);
    changed ||= s.offers.length !== before;
  }
  if (changed) {
    const ids = new Set(state.store?.offers.map((o) => o.id) || []);
    state.selected = new Set([...state.selected].filter((id) => ids.has(id)));
    invalidateGeneration();
    renderStores();
    renderOffers();
    renderRecipes();
    if ($("#recipe-dialog").open) $("#recipe-dialog").close();
    message("Udløbne tilbud er fjernet. Vælg eventuelt en anden vare.");
  }
}, 60000);
boot();
