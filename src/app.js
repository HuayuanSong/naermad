import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/fraunces/latin-500.css';
import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
import {createApi} from './api.js';
import {DEMO_ORIGIN,demoData} from './demo.js';
import {INGREDIENTS,normalizeStores,recommend,formatMoney,formatAmount,formatTime} from './model.js';
import {RECIPES} from './recipes.js';

const $ = selector => document.querySelector(selector);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
  pin:'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  search:'m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow:'M4 12h16 m-6-6 6 6-6 6',
  leaf:'M20 3C9 2 3 8 5 15s17 6 15-12Z M5 21 16 10',
  clock:'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check:'m5 12 4 4L19 6',
  plus:'M12 5v14 M5 12h14',
  bag:'M5 7h14l2 15H3L5 7Z M8 8V6a4 4 0 0 1 8 0v2',
  locate:'M12 2v3 m0 14v3 M2 12h3 m14 0h3 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  close:'m6 6 12 12 M18 6 6 18',
};
const icon=(id,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[id] || paths.leaf}"/></svg>`;
const brandName={netto:'Netto',foetex:'føtex',bilka:'Bilka'};
const state={config:null,api:null,demo:true,origin:null,stores:[],store:null,selected:new Set(),radius:3,vegetarian:false,maxMinutes:120,servings:2,pantry:true,sort:'match',expanded:false,recipesExpanded:false,results:[],fetchId:0,searchId:0,fetchedAt:null,capped:false,busy:false};
let map, markers, originMarker, dialogRecipe;

$('#app').innerHTML=`
  <header class="site-header wrap">
    <a href="./" class="brand" aria-label="Nærmad, forsiden"><img src="./icon.svg" alt="" width="36" height="36">nærmad<span class="brand-dot">.</span></a>
    <span class="header-caption">Gode råvarer. Nye muligheder.</span>
    <div class="header-actions"><span id="mode-badge" class="status-badge">Indlæser</span><button class="text-button" id="about-button">Om Nærmad ${icon('arrow')}</button></div>
  </header>
  <main class="wrap">
    <section class="hero" aria-labelledby="hero-title">
      <div><div class="eyebrow">MINDRE MADSPILD · MERE AFTENSMAD</div><h1 id="hero-title">Fra datovare<br>til <em>aftensmad.</em></h1><p>Se hvad der er sat ned i nærheden.<br>Find noget godt at lave med det.</p></div>
      <div class="hero-note"><span class="note-kicker">DET STARTER I DIT NÆROMRÅDE</span><ol><li><span>01</span> Find en butik tæt på dig</li><li><span>02</span> Vælg de råvarer, du har lyst til</li><li><span>03</span> Lad aftensmaden tage form</li></ol><div class="note-bottom">${icon('leaf')} Små fund. Gode måltider.</div></div>
    </section>
    <div id="demo-notice" class="demo-notice" hidden><span><strong>Du ser en demo.</strong> Butikker, varer og priser er fiktive eksempler i Aarhus. Live data kræver tilslutning til Salling.</span><button class="text-button" id="demo-reset">Prøv Aarhus-demoen ${icon('arrow')}</button></div>
    <section class="search-section" aria-label="Find butikker nær dig">
      <form id="search-form" class="search-form"><label class="address-field">${icon('pin')}<span class="sr-only">Adresse, by eller sted i Danmark</span><input id="address" type="search" placeholder="Din adresse, by eller et sted …" autocomplete="off" minlength="3" maxlength="160" required></label><label class="radius-field"><span>Inden for</span><select id="radius" aria-label="Søgeradius"><option value="1">1 km</option><option value="3" selected>3 km</option><option value="5">5 km</option><option value="10">10 km</option></select></label><button class="primary-button" id="search-button" type="submit">${icon('search')} Find butikker</button><button class="location-button" type="button" id="locate" aria-label="Brug min position" title="Brug min position">${icon('locate')}</button></form>
      <div class="search-help">Søg også efter steder som Aarhus H eller Fisketorvet. Adressesøgning via Photon / OpenStreetMap.</div>
      <div id="addresses" class="address-results" hidden></div>
    </section>
    <p id="message" class="message" role="status" aria-live="polite" hidden></p>
    <div class="workspace">
      <aside class="sidebar" aria-label="Butikker og kort"><div class="section-title"><h2>I nærheden</h2><span id="store-count" class="count-badge">0</span></div><p id="origin-label" class="muted location-label">Søg efter et sted for at begynde.</p><div id="map" role="region" aria-label="Kort over butikker i nærheden"></div><div class="distance-note">Afstande er i fugleflugtslinje.</div><div id="stores" class="store-list"></div><p id="coverage-note" class="coverage-note">Kun deltagende Netto, føtex og Bilka. En søgning kan vise højst 20 butikker.</p></aside>
      <div class="main-panel"><section id="offers" aria-labelledby="offers-title"></section><section id="recipes" aria-labelledby="recipes-title"><div class="recipe-heading"><div><div class="eyebrow">FRA KURVEN TIL KØKKENET</div><h2 id="recipes-title">Hvad skal vi spise?</h2></div><span id="recipe-count" class="muted"></span></div><div class="filters"><label class="check-label"><input id="vegetarian" type="checkbox">${icon('leaf')} Vegetarisk</label><label><span class="sr-only">Maksimal tilberedningstid</span><select id="max-minutes"><option value="120">Alle tider</option><option value="30">Højst 30 min.</option><option value="20">Højst 20 min.</option></select></label><label><span class="sr-only">Antal personer</span><select id="servings"><option value="1">1 person</option><option value="2" selected>2 personer</option><option value="4">4 personer</option><option value="6">6 personer</option></select></label><label class="sort-label"><span class="sr-only">Sortering</span><select id="sort"><option value="match">Flest datovarer</option><option value="time">Hurtigst først</option></select></label></div><label class="pantry check-label"><input type="checkbox" id="pantry" checked> Jeg har olie, salt, peber og vand</label><div id="recipe-list" class="recipe-list"></div></section></div>
    </div>
    <section class="closing-note"><span class="little-leaf">${icon('leaf')}</span><div><h2>En god idé begynder med det, der er.</h2><p>Opskrifterne tager udgangspunkt i dine valgte varer. Resten står på indkøbslisten, så du ved præcis, hvad der mangler.</p></div></section>
  </main>
  <footer class="wrap site-footer"><span class="footer-brand">nærmad.</span><p>Et uafhængigt projekt. Data fra <a href="https://developer.sallinggroup.dev/apireference/food-waste" target="_blank" rel="noreferrer">Salling Group</a> · Kort og adresser © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></p><a href="https://github.com/HuayuanSong/naermad" target="_blank" rel="noreferrer">GitHub ↗</a></footer>
  <dialog id="recipe-dialog" class="recipe-dialog" aria-labelledby="recipe-dialog-title"><button class="dialog-close" aria-label="Luk opskrift">${icon('close')}</button><div id="recipe-detail"></div></dialog>
  <dialog id="about-dialog" class="about-dialog" aria-labelledby="about-title"><button class="dialog-close" aria-label="Luk information">${icon('close')}</button><div class="eyebrow">OM PROJEKTET</div><h2 id="about-title">Gør et godt fund<br>til et godt måltid.</h2><p>Nærmad forbinder lokale datovarer med en lille samling danske opskrifter. Vælg en butik og de råvarer, du vil bruge. Forslagene rangeres efter, hvor mange af dine valgte råvarer de bruger.</p><h3>Hvilke tilbud?</h3><p>Sallings Anti Food Waste API viser varer sat ned på grund af kort holdbarhed i deltagende Netto, føtex og Bilka. Det er ikke de almindelige tilbudsaviser. Lagerstatus er vejledende, og varer kan være solgt, når du kommer frem.</p><h3>Opskrifter og ingredienser</h3><p>De 18 opskriftsskabeloner er skrevet til dette projekt. Der genereres ikke opskrifter med AI under brug. Varenavne matches med råvarer via regler; du kan rette en matchning under varen. Opskrifterne er ikke køkkentestede. Tjek altid produktets ingredienser, allergener, opbevaring og holdbarhed på emballagen.</p><h3>Data og privatliv</h3><p>En adressesøgning sendes til Photons offentlige søgetjeneste. I live-tilstand sendes den valgte position til Salling. Kortvisninger hentes fra OpenStreetMap. Appen har ingen analyseværktøjer og gemmer ikke din adresse på en server; søgninger caches kun i hukommelsen, mens siden er åben.</p><p>Geokodning og kort er fælles tjenester uden garanteret oppetid. Salling dokumenterer aktuelt 100 madspildsforespørgsler pr. dag. Vi cacher søgninger i fem minutter og opdaterer kun ved dit valg.</p><div class="about-links"><a href="https://developer.sallinggroup.dev/apireference/food-waste" target="_blank" rel="noreferrer">Sallings API ↗</a><a href="https://github.com/HuayuanSong/naermad#connect-salling" target="_blank" rel="noreferrer">Tilslut live data ↗</a><a href="https://github.com/komoot/photon" target="_blank" rel="noreferrer">Photon ↗</a></div></dialog>
`;

function message(text='',error=false) {const el=$('#message');el.textContent=text;el.hidden=!text;el.classList.toggle('error',error);}
function busy(value) {state.busy=value;$('#search-button').disabled=value;$('#locate').disabled=value;$('#search-button').innerHTML=value?'Søger …':`${icon('search')} Find butikker`;}
function initMap() {
  map=L.map('map',{zoomSnap:0.1,zoomDelta:0.5,scrollWheelZoom:true,wheelPxPerZoomLevel:120,attributionControl:true}).setView([56.15,10.205],13.5);
  L.tileLayer(state.config.tileUrl,{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  markers=L.layerGroup().addTo(map);
}
function updateMap(fit=false) {
  markers.clearLayers();
  if(originMarker) map.removeLayer(originMarker);
  if(state.origin) originMarker=L.circleMarker([state.origin.lat,state.origin.lon],{radius:7,color:'#fff',weight:3,fillColor:'#314e74',fillOpacity:1}).addTo(map).bindTooltip('Dit søgepunkt');
  state.stores.forEach((store,index)=>{
    const marker=L.marker([store.lat,store.lon],{title:store.name,keyboard:true,icon:L.divIcon({className:'store-pin',html:`<span class="${store.id===state.store?.id?'active':''}">${index+1}</span>`,iconSize:[32,39],iconAnchor:[16,39]})}).addTo(markers);
    const tip=document.createElement('span'); tip.textContent=store.name;marker.bindTooltip(tip);
    marker.on('click',()=>selectStore(store.id));
  });
  if(fit&&state.origin) {
    const points=[[state.origin.lat,state.origin.lon],...state.stores.map(s=>[s.lat,s.lon])];
    if(points.length>1) map.fitBounds(points,{padding:[35,35],maxZoom:15}); else map.setView(points[0],13.5);
  }
}
function renderStores() {
  $('#store-count').textContent=state.stores.length;
  $('#origin-label').textContent=state.origin?.label || 'Søg efter et sted for at begynde.';
  $('#stores').innerHTML=state.stores.length?state.stores.map((s,index)=>`<button class="store-card ${state.store?.id===s.id?'active':''}" data-store="${esc(s.id)}" aria-pressed="${state.store?.id===s.id}"><div class="store-top"><span class="brand-label ${esc(s.brand)}">${esc(brandName[s.brand])}${state.demo?' · demo':''}</span><span>${s.distance<1?`${Math.round(s.distance*1000)} m`:`${s.distance.toLocaleString('da-DK',{maximumFractionDigits:1})} km`}</span></div><strong><span class="store-number">${index+1}.</span> ${esc(s.name)}</strong><span class="store-address">${esc(s.address)}</span><span class="store-bottom">${s.offers.length} datovarer ${state.store?.id===s.id?`${icon('check')} Valgt`:icon('arrow')}</span></button>`).join(''):`<div class="empty small">${state.origin?'Ingen butikker at vise her.':'Din næste gode råvare er måske lige om hjørnet.'}</div>`;
  $('#coverage-note').textContent=state.demo?'Demobutikkerne er fiktive. De ligger kun i Aarhus; søgninger flytter dem ikke.':state.capped?'API’et returnerede 20 butikker. Der kan være flere i området; prøv en mindre radius.':'Kun deltagende Netto, føtex og Bilka. Salling returnerer højst 20 butikker, så listen er ikke nødvendigvis komplet.';
}
function selectStore(id) {
  state.store=state.stores.find(s=>s.id===id)||null;
  state.selected=new Set((state.store?.offers||[]).filter(o=>o.ingredient).map(o=>o.id));
  state.expanded=false;state.recipesExpanded=false;renderStores();renderOffers();renderRecipes();updateMap();
}
function renderOffers() {
  const s=state.store;
  if(!s) {$('#offers').innerHTML=`<div class="empty start-state">${icon('bag')}<h2>Først en butik. Så en god idé.</h2><p>Søg efter din adresse, og vælg en butik på kortet eller i listen.</p>${state.demo?'<button class="primary-button" data-reset>Åbn Aarhus-demoen</button>':''}</div>`;return;}
  const offers=state.expanded?s.offers:s.offers.slice(0,6);
  $('#offers').innerHTML=`<div class="offer-header"><div><div class="eyebrow">${state.demo?'EKSEMPELVARER FRA':'DATOVARER FRA'}</div><h2 id="offers-title">${esc(s.name)}</h2><p>${state.demo?'Fiktive priser og varer · klik på de råvarer, du vil bruge.':`Hentet ${formatTime(state.fetchedAt)} · vælg råvarer til dine opskrifter.`}</p></div>${!state.demo?`<button id="refresh" class="text-button">Hent igen ↻</button>`:''}</div><div class="selection-heading"><span><strong>${state.selected.size}</strong> af ${s.offers.length} varer valgt</span><button class="text-button" id="toggle-all">${state.selected.size?'Fravælg alle':'Vælg genkendte råvarer'}</button></div><div class="offer-grid">${offers.map(o=>`<article class="offer-card ${state.selected.has(o.id)?'selected':''}"><button class="offer-toggle" data-offer="${esc(o.id)}" ${o.ingredient?'':'disabled'} aria-pressed="${state.selected.has(o.id)}" aria-label="${state.selected.has(o.id)?'Fravælg':'Vælg'} ${esc(o.name)}"><div class="offer-card-top"><span class="discount">−${o.discount}%</span><span class="selection-icon">${icon(state.selected.has(o.id)?'check':'plus')}</span></div><h3>${esc(o.name)}</h3><div class="prices"><strong>${formatMoney(o.price)}</strong><s>${formatMoney(o.originalPrice)}</s></div><div class="unit-note">${o.unit==='kg'?'Pr. kg':o.unit==='each'?'Pr. salgsenhed':'Prisenhed ikke oplyst'}</div></button><label class="ingredient-select"><span class="sr-only">Brug ${esc(o.name)} som råvare</span><select data-ingredient="${esc(o.id)}" aria-label="Råvare for ${esc(o.name)}"><option value="">${o.ingredient?'Ingen matchning':'Vælg råvare …'}</option>${Object.entries(INGREDIENTS).filter(([k])=>!['oil','water','salt','blackPepper'].includes(k)).map(([k,[label]])=>`<option value="${k}" ${o.ingredient===k?'selected':''}>${esc(label)}</option>`).join('')}</select></label><details class="offer-meta"><summary>Tilbuddets detaljer</summary><p>${o.stock===null?'Lager ukendt':`Vejledende lager: ${o.stock} ${o.unit==='kg'?'kg':o.unit==='each'?'stk.':'enheder'}`}.<br>${state.demo?'Demoens gyldighed':'Tilbud til'}: ${formatTime(o.endsAt)}.<br>Vare opdateret: ${state.demo?'eksempel':formatTime(o.updatedAt)}.</p></details></article>`).join('')}</div>${s.offers.length>6?`<button class="show-more" id="show-more">${state.expanded?'Vis færre varer':`Se alle ${s.offers.length} datovarer`} <span>↓</span></button>`:''}${!s.offers.length?'<div class="empty">Ingen gyldige datovarer i svaret for denne butik. Vælg en anden butik eller prøv senere.</div>':''}<p class="stock-note">${icon('clock')} Varer kan være udsolgt ved ankomst. Priserne gælder varerne, ikke hele opskriften.</p>`;
}
function renderRecipes() {
  state.results=recommend(RECIPES,state.store?.offers||[],{selectedIds:state.selected,vegetarian:state.vegetarian,maxMinutes:state.maxMinutes,pantry:state.pantry});
  if(state.sort==='time')state.results.sort((a,b)=>a.minutes-b.minutes||b.matchedCount-a.matchedCount);
  $('#recipe-count').textContent=`${state.results.length} ${state.results.length===1?'idé':'idéer'}`;
  $('#recipe-list').innerHTML=state.results.length?(state.recipesExpanded?state.results:state.results.slice(0,6)).map(r=>`<article class="recipe-card ${r.accent}"><div class="recipe-card-top"><span class="match-badge">${icon('leaf')} Bruger ${r.matchedCount} ${r.matchedCount===1?'datovare':'datovarer'}</span><span class="recipe-time">${icon('clock')}${r.minutes} min.</span></div><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><div class="matched-ingredients">${r.matched.filter(i=>!['oil','water','salt','blackPepper'].includes(i.id)).map(i=>`<span>${icon('check')}${esc(INGREDIENTS[i.id][0])}</span>`).join('')}</div><div class="recipe-card-bottom"><span>${r.missing.length?`+ ${r.missing.length} andre råvarer`:'Alle råvarer er dækket'}${r.vegetarian?' · vegetarisk':''}</span><button data-recipe="${r.id}" class="recipe-link" aria-label="Se opskrift: ${esc(r.title)}">Se opskrift ${icon('arrow')}</button></div></article>`).join('')+(state.results.length>6?`<button id="more-recipes" class="show-more more-recipes">${state.recipesExpanded?'Vis færre idéer':`Se alle ${state.results.length} opskrifter`} ↓</button>`:''):`<div class="empty recipe-empty">${icon('leaf')}<h3>${!state.store?'Opskrifterne begynder med dine råvarer':!state.selected.size?'Vælg en råvare for at finde inspiration':'Ingen opskrifter passer til dine valg endnu'}</h3><p>${!state.store?'Vælg en butik for at se idéerne her.':!state.selected.size?'Tryk på en vare ovenfor. Ukendte varer kan tildeles en råvare manuelt.':'Prøv flere råvarer eller færre filtre. Samlingen har 18 opskrifter og dækker endnu ikke alle varer.'}</p></div>`;
}
function shoppingText(r) {
  return `${r.title} — ${state.servings} ${state.servings===1?'person':'personer'}\n${state.demo?'DEMO — fiktive tilbud\n':''}Butik: ${state.store.name}\n\n${r.ingredients.map(i=>`${formatAmount(i.amount,state.servings)} ${i.unit} ${INGREDIENTS[i.id][0]}${i.note?` (${i.note})`:''}${r.matched.some(m=>m.id===i.id)?' [datovare]':r.pantryItems.some(p=>p.id===i.id)?' [basisvare hjemme]':' [køb også]'}`).join('\n')}\n\nTjek pakkestørrelser og holdbarhed. Datovarepriser er pr. salgsenhed eller kg, ikke pris for hele retten.\n\n${r.steps.map((s,i)=>`${i+1}. ${s}`).join('\n\n')}\n\nNærmad · https://huayuansong.github.io/naermad/`;
}
function showRecipe(id) {
  const r=state.results.find(r=>r.id===id);if(!r)return;dialogRecipe=r;
  const row=(i,type)=>`<li><label><input type="checkbox"><span><strong>${formatAmount(i.amount,state.servings)} ${esc(i.unit)}</strong> ${esc(INGREDIENTS[i.id][0])}${i.note?` <small>(${esc(i.note)})</small>`:''}</span></label>${type==='matched'?`<small class="detail-product">${esc(i.offer.name)} · ${formatMoney(i.offer.price)} ${i.offer.unit==='kg'?'pr. kg':'pr. salgsenhed'}</small>`:''}</li>`;
  $('#recipe-detail').innerHTML=`<div class="eyebrow">${state.demo?'DEMOOPSKRIFT':'DIN AFTENSMAD'} · ${r.minutes} MINUTTER · ${state.servings} ${state.servings===1?'PERSON':'PERSONER'}</div><h2 id="recipe-dialog-title">${esc(r.title)}</h2><p class="recipe-intro">${esc(r.description)}</p><div class="recipe-detail-layout"><div class="shopping-list"><h3>${icon('bag')} Din indkøbsliste</h3><h4>Valgte datovarer</h4><ul>${r.matched.map(i=>row(i,'matched')).join('')}</ul>${r.missing.length?`<h4>Køb også</h4><ul>${r.missing.map(i=>row(i,'missing')).join('')}</ul>`:''}${r.pantryItems.length?`<h4>Fra dit køkken</h4><ul>${r.pantryItems.map(i=>row(i,'pantry')).join('')}</ul>`:''}<p class="list-note">Mængderne er til ${state.servings} ${state.servings===1?'person':'personer'}. Tjek pakkestørrelser: én nedsat vare dækker ikke nødvendigvis hele mængden.</p></div><div class="method"><h3>Sådan gør du</h3><ol>${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><div class="recipe-caution">Følg altid varens opbevaring og sidste anvendelsesdato. Tjek ingredienslisten ved allergi. Opskriften er ikke køkkentestet.</div></div></div><div class="dialog-actions"><button id="copy-list" class="primary-button">Kopiér indkøbsliste</button><button id="download-list" class="secondary-button">Gem som tekst</button><button id="print-recipe" class="text-button">Udskriv</button><span id="copy-status" role="status"></span></div>`;
  $('#recipe-dialog').showModal();
}
async function loadStores(origin) {
  const request=++state.fetchId;state.origin=origin;state.stores=[];state.store=null;state.selected.clear();
  renderStores();renderOffers();renderRecipes();updateMap(true);busy(true);message('Finder butikker …');
  try {
    if(state.demo) {
      state.stores=normalizeStores(demoData(),origin,state.radius);state.fetchedAt=Date.now();state.capped=false;
    } else {
      const result=await state.api.nearby(origin,state.radius);if(request!==state.fetchId)return;
      state.stores=result.stores;state.fetchedAt=result.fetchedAt;state.capped=result.capped;
    }
    if(request!==state.fetchId)return;
    selectStore(state.stores[0]?.id);updateMap(true);
    message(state.stores.length?'':state.demo?'Der er ingen demobutikker tæt på dette sted. Prøv Aarhus-demoen. Live butikker kræver en Salling-tilslutning.':'Salling returnerede ingen deltagende butikker i området. Prøv en større radius eller et andet sted.');
  } catch(e) {if(request===state.fetchId) message(e.message,true);} finally {if(request===state.fetchId)busy(false);}
}
function resetDemo() {
  ++state.searchId;state.demo=true;state.radius=3;$('#radius').value='3';$('#address').value='';$('#addresses').hidden=true;
  $('#mode-badge').textContent='Demo · eksempeldata';$('#mode-badge').classList.remove('live');$('#demo-notice').hidden=false;
  loadStores({...DEMO_ORIGIN});
}
$('#search-form').addEventListener('submit',async event=>{
  event.preventDefault();const id=++state.searchId;$('#addresses').hidden=true;busy(true);message('Søger efter adressen …');
  try {
    const addresses=await state.api.search($('#address').value);if(id!==state.searchId)return;
    if(!addresses.length) {message('Ingen adresser fundet. Prøv gadenavn og by, eller et kendt sted.');return;}
    $('#addresses').innerHTML=`<p>Vælg det rigtige sted</p>${addresses.map((p,i)=>`<button type="button" data-address="${i}">${icon('pin')}<span>${esc(p.label)}</span>${icon('arrow')}</button>`).join('')}`;
    $('#addresses').hidden=false;$('#addresses')._places=addresses;message('Vælg en adresse nedenfor.');
  } catch(e) {if(id===state.searchId)message(e.message,true);} finally {if(id===state.searchId)busy(false);}
});
$('#addresses').addEventListener('click',e=>{
  const button=e.target.closest('[data-address]');if(!button)return;
  const place=$('#addresses')._places[Number(button.dataset.address)];++state.searchId;
  $('#address').value=place.label;$('#addresses').hidden=true;loadStores(place);
});
$('#radius').addEventListener('change',()=>{state.radius=Number($('#radius').value);if(state.origin)loadStores(state.origin);});
$('#locate').addEventListener('click',()=>{
  if(!navigator.geolocation){message('Denne browser understøtter ikke positionsdeling. Skriv en adresse i stedet.',true);return;}
  const id=++state.searchId;$('#addresses').hidden=true;busy(true);message('Venter på din position …');
  navigator.geolocation.getCurrentPosition(p=>{if(id!==state.searchId)return;loadStores({lat:p.coords.latitude,lon:p.coords.longitude,label:'Din position'});},()=>{if(id!==state.searchId)return;busy(false);message('Positionen kunne ikke hentes. Du kan skrive din adresse i stedet.',true);},{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
});
$('#stores').addEventListener('click',e=>{const button=e.target.closest('[data-store]');if(button)selectStore(button.dataset.store);});
$('#offers').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-reset'))return resetDemo();
  if(b.id==='refresh')return loadStores(state.origin);
  if(b.dataset.offer){const id=b.dataset.offer;state.selected.has(id)?state.selected.delete(id):state.selected.add(id);renderOffers();renderRecipes();document.querySelector(`[data-offer="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
  if(b.id==='toggle-all'){state.selected=state.selected.size?new Set():new Set(state.store.offers.filter(o=>o.ingredient).map(o=>o.id));renderOffers();renderRecipes();$('#toggle-all')?.focus({preventScroll:true});}
  if(b.id==='show-more'){state.expanded=!state.expanded;renderOffers();$('#show-more')?.focus({preventScroll:true});}
});
$('#offers').addEventListener('change',e=>{
  const id=e.target.dataset.ingredient;if(!id)return;
  const o=state.store.offers.find(o=>o.id===id);if(!o)return;o.ingredient=e.target.value||null;
  o.ingredient?state.selected.add(id):state.selected.delete(id);renderOffers();renderRecipes();document.querySelector(`[data-ingredient="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
});
for(const [selector,key,convert] of [['#vegetarian','vegetarian',el=>el.checked],['#max-minutes','maxMinutes',el=>Number(el.value)],['#servings','servings',el=>Number(el.value)],['#pantry','pantry',el=>el.checked],['#sort','sort',el=>el.value]]) {
  $(selector).addEventListener('change',e=>{state[key]=convert(e.target);renderRecipes();});
}
$('#recipe-list').addEventListener('click',e=>{const more=e.target.closest('#more-recipes');if(more){state.recipesExpanded=!state.recipesExpanded;renderRecipes();$('#more-recipes')?.focus({preventScroll:true});return;}const b=e.target.closest('[data-recipe]');if(b)showRecipe(b.dataset.recipe);});
$('#demo-reset').addEventListener('click',resetDemo);
$('#about-button').addEventListener('click',()=>$('#about-dialog').showModal());
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
});
$('#recipe-detail').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||!dialogRecipe)return;
  if(b.id==='copy-list'){
    try{await navigator.clipboard.writeText(shoppingText(dialogRecipe));$('#copy-status').textContent='Kopieret!';}
    catch{$('#copy-status').textContent='Kopiering blev blokeret. Brug “Gem som tekst”.';}
  }
  if(b.id==='download-list'){
    const url=URL.createObjectURL(new Blob([shoppingText(dialogRecipe)],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`naermad-${dialogRecipe.id}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(b.id==='print-recipe')window.print();
});

async function boot() {
  try {
    const response=await fetch('./config.json');if(!response.ok)throw new Error('Konfigurationen kunne ikke indlæses. Genindlæs siden.');
    state.config=await response.json();state.api=createApi(state.config);state.demo=!state.config.sallingFrontendKey;initMap();
    if(state.demo)resetDemo();else {$('#mode-badge').textContent='Salling · tilsluttet';$('#mode-badge').classList.add('live');renderStores();renderOffers();renderRecipes();}
  } catch(e){message(e.message,true);$('#mode-badge').textContent='Ikke tilsluttet';$('#search-button').disabled=true;$('#locate').disabled=true;}
}
// Expiration is checked locally; no timer polls the API or consumes its quota.
setInterval(()=>{
  if(state.busy)return;
  const now=Date.now();let changed=false;
  for(const s of state.stores){const before=s.offers.length;s.offers=s.offers.filter(o=>Date.parse(o.endsAt)>now);changed ||= s.offers.length!==before;}
  if(changed){const ids=new Set(state.store?.offers.map(o=>o.id)||[]);state.selected=new Set([...state.selected].filter(id=>ids.has(id)));renderStores();renderOffers();renderRecipes();if($('#recipe-dialog').open)$('#recipe-dialog').close();message('Udløbne tilbud er fjernet. Vælg eventuelt en anden vare.');}
},60000);
boot();
