import { normalizeStores } from "./model.js";
export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - now) || 0;
}

export function createApi(
  config,
  { fetcher = globalThis.fetch, now = Date.now } = {},
) {
  const storeCache = new Map(),
    searchCache = new Map(),
    inflight = new Map();
  let nextSallingRequest = 0,
    nextSearch = 0;
  const put = (cache, key, value) => {
    if (cache.size >= 50) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  };
  async function fetchResponse(url, options) {
    try {
      return await fetcher(url, {
        ...options,
        signal: AbortSignal.timeout(15000),
        referrerPolicy: "strict-origin-when-cross-origin",
      });
    } catch {
      throw new ApiError(
        "Forbindelsen kunne ikke oprettes. Tjek dit netværk, eller prøv igen om lidt.",
      );
    }
  }
  return {
    async search(query) {
      const queryText = String(query).trim();
      if (queryText.length < 3 || queryText.length > 160)
        throw new ApiError("Skriv en adresse eller et sted på 3–160 tegn.");
      const cacheKey = queryText.toLocaleLowerCase("da");
      if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
      if (now() < nextSearch)
        throw new ApiError("Vent et øjeblik, før du søger igen.");
      nextSearch = now() + 1200;
      const url = new URL(config.geocoderUrl);
      url.search = new URLSearchParams({
        q: queryText,
        limit: "6",
        countrycode: "DK",
      }).toString();
      const response = await fetchResponse(url);
      if (!response.ok)
        throw new ApiError(
          "Adressesøgningen er midlertidigt utilgængelig. Prøv igen senere.",
          response.status,
        );
      let data;
      try {
        data = await response.json();
      } catch {
        throw new ApiError("Adressesøgningen returnerede et ukendt svar.");
      }
      if (!Array.isArray(data?.features))
        throw new ApiError("Adressesøgningen returnerede et ukendt svar.");
      const seen = new Set();
      const places = data.features.flatMap((f) => {
        const p = f?.properties,
          coords = f?.geometry?.coordinates;
        if (
          !p ||
          String(p.countrycode).toUpperCase() !== "DK" ||
          !Array.isArray(coords) ||
          coords.length < 2 ||
          !coords.every((v) => typeof v === "number" && Number.isFinite(v))
        )
          return [];
        const street = [p.street, p.housenumber].filter(Boolean).join(" ");
        const parts = [
          p.name !== p.street ? p.name : "",
          street,
          [p.postcode, p.city || p.locality].filter(Boolean).join(" "),
        ].filter(Boolean);
        const label = [...new Set(parts)].join(", ") || "Sted i Danmark";
        const [lon, lat] = coords;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
        const identity = `${label}:${lat}:${lon}`;
        if (seen.has(identity)) return [];
        seen.add(identity);
        return [{ label, lat, lon }];
      });
      put(searchCache, cacheKey, places);
      return places;
    },
    async nearby(origin, radius) {
      if (!config.sallingFrontendKey)
        throw new ApiError(
          "Salling er ikke tilsluttet endnu. Du kan prøve demoen i mellemtiden.",
        );
      if (
        !Number.isFinite(origin?.lat) ||
        !Number.isFinite(origin?.lon) ||
        Math.abs(origin.lat) > 90 ||
        Math.abs(origin.lon) > 180 ||
        ![1, 3, 5, 10].includes(radius)
      )
        throw new ApiError("Ugyldig position eller søgeradius.");
      const key = `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}:${radius}`;
      const cached = storeCache.get(key);
      if (cached && now() - cached.fetchedAt < 5 * 60000) {
        return {
          ...cached,
          stores: normalizeStores(cached.raw, origin, radius, now()),
          cached: true,
        };
      }
      if (inflight.has(key)) return inflight.get(key);
      if (now() < nextSallingRequest) {
        const seconds = Math.ceil((nextSallingRequest - now()) / 1000);
        throw new ApiError(
          `Salling beder os vente. Prøv igen om ${seconds < 60 ? `${seconds} sekunder` : `cirka ${Math.ceil(seconds / 60)} minutter`}.`,
          429,
          seconds * 1000,
        );
      }
      nextSallingRequest = now() + 2000;
      const pending = (async () => {
        const url = new URL("https://api.sallinggroup.com/v1/food-waste/");
        url.search = new URLSearchParams({
          geo: `${origin.lat},${origin.lon}`,
          radius: String(radius),
        }).toString();
        const response = await fetchResponse(url, {
          headers: { Authorization: `Bearer ${config.sallingFrontendKey}` },
        });
        const wait = parseRetryAfter(
          response.headers.get("Retry-After"),
          now(),
        );
        nextSallingRequest = Math.max(nextSallingRequest, now() + wait);
        if (!response.ok) {
          if (response.status === 429) {
            nextSallingRequest = Math.max(nextSallingRequest, now() + 60000);
            throw new ApiError(
              "Sallings forespørgselsgrænse er nået. Prøv igen senere; dagskvoten kan være brugt.",
              429,
              nextSallingRequest - now(),
            );
          }
          if (response.status === 401 || response.status === 403)
            throw new ApiError(
              "Salling-adgangen virker ikke. Webstedets nøgle, tilladelser eller tilladte domæne skal kontrolleres.",
              response.status,
            );
          throw new ApiError(
            "Tilbuddene kunne ikke hentes fra Salling lige nu. Prøv igen senere.",
            response.status,
          );
        }
        let raw;
        try {
          raw = await response.json();
        } catch {
          throw new ApiError("Salling returnerede et ukendt svar.");
        }
        const result = {
          raw,
          stores: normalizeStores(raw, origin, radius, now()),
          fetchedAt: now(),
          capped: raw.length >= 20,
          cached: false,
        };
        put(storeCache, key, result);
        return result;
      })();
      inflight.set(key, pending);
      try {
        return await pending;
      } finally {
        inflight.delete(key);
      }
    },
  };
}
