export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad;
  const dlon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return (
    6371.0088 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(Math.max(0, 1 - s)))
  );
}

const numeric = (v) => typeof v === "number" && Number.isFinite(v);
export function normalizeOffer(raw, storeId, index, now = Date.now()) {
  const o = raw?.offer,
    p = raw?.product;
  if (!o || !p || typeof p.description !== "string" || !p.description.trim())
    return null;
  if (
    o.currency !== "DKK" ||
    !numeric(o.newPrice) ||
    o.newPrice < 0 ||
    !numeric(o.originalPrice) ||
    o.originalPrice <= o.newPrice
  )
    return null;
  if (numeric(o.stock) && o.stock <= 0) return null;
  const start = Date.parse(o.startTime),
    end = Date.parse(o.endTime);
  // Unknown validity is not sufficient evidence for an active offer.
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > now ||
    end <= now
  )
    return null;
  return {
    id: `${storeId}:${o.ean || p.ean || index}:${index}`,
    name: p.description.trim().slice(0, 240),
    price: o.newPrice,
    originalPrice: o.originalPrice,
    discount: Math.round((1 - o.newPrice / o.originalPrice) * 100),
    stock: numeric(o.stock) ? o.stock : null,
    unit: ["each", "kg"].includes(o.stockUnit) ? o.stockUnit : null,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    updatedAt: Number.isFinite(Date.parse(o.lastUpdate))
      ? new Date(o.lastUpdate).toISOString()
      : null,
  };
}

export function normalizeStores(raw, origin, radius, now = Date.now()) {
  if (!Array.isArray(raw))
    throw new Error(
      "Salling returnerede et ukendt dataformat. Prøv igen senere.",
    );
  const seen = new Set();
  return raw
    .flatMap((row) => {
      const s = row?.store;
      if (
        !s ||
        !s.id ||
        seen.has(s.id) ||
        !Array.isArray(s.coordinates) ||
        s.coordinates.length < 2 ||
        !s.coordinates.every(numeric)
      )
        return [];
      if (
        String(s.address?.country).toUpperCase() !== "DK" ||
        !["netto", "foetex", "bilka"].includes(s.brand)
      )
        return [];
      const [lon, lat] = s.coordinates;
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return [];
      const distance = distanceKm(origin, { lat, lon });
      if (distance > radius) return [];
      seen.add(s.id);
      const ids = new Set();
      const offers = (
        Array.isArray(row.clearances) ? row.clearances : []
      ).flatMap((item, i) => {
        const offer = normalizeOffer(item, s.id, i, now);
        if (!offer) return [];
        const identity = `${item.offer?.ean || offer.name}|${offer.price}|${offer.endsAt}`;
        if (ids.has(identity)) return [];
        ids.add(identity);
        return [offer];
      });
      return [
        {
          id: String(s.id),
          name: String(s.name || "Butik"),
          brand: s.brand,
          lat,
          lon,
          distance,
          address: [s.address?.street, s.address?.zip, s.address?.city]
            .filter(Boolean)
            .join(", "),
          offers,
          hours: Array.isArray(s.hours)
            ? s.hours.filter((h) => h?.type === "store")
            : [],
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance);
}

export const formatMoney = (value) =>
  new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 2,
  }).format(value);
export function formatTime(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (value == null || !Number.isFinite(timestamp)) return "ukendt";
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
