// Location analysis: familiar places (home + frequently-used cities), distance, impossible travel.
import { haversineKm } from '../lib/geo.js';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function familiarLocations(customer, history) {
  const places = [{ city: customer.home_city, lat: customer.home_lat, lng: customer.home_lng, kind: 'home', count: null }];
  const byCity = new Map();
  for (const h of history) {
    if (h.lat == null || !h.city || h.risk_level !== 'low') continue; // only trusted behaviour defines familiar places
    const e = byCity.get(h.city) || { city: h.city, lat: 0, lng: 0, count: 0 };
    e.lat += h.lat; e.lng += h.lng; e.count++;
    byCity.set(h.city, e);
  }
  for (const e of byCity.values()) {
    if (e.count >= 4 && e.city !== customer.home_city) places.push({ city: e.city, lat: e.lat / e.count, lng: e.lng / e.count, kind: 'frequent', count: e.count });
  }
  return places;
}

export function analyseLocation(t, customer, history, S) {
  if (t.lat == null || t.lng == null) return { score: 0, distanceKm: null, familiar: null, impossibleTravel: false };
  const places = familiarLocations(customer, history);
  let familiar = places[0], distanceKm = Infinity;
  for (const p of places) { const d = haversineKm(t, p); if (d < distanceKm) { distanceKm = d; familiar = p; } }
  const prev = history.find((h) => h.lat != null);
  let speedKmh = 0, prevDistanceKm = null, impossibleTravel = false;
  if (prev) {
    prevDistanceKm = haversineKm(t, prev);
    const hrs = Math.max((t.created_at - prev.created_at) / 3.6e6, 1 / 60);
    speedKmh = prevDistanceKm / hrs;
    impossibleTravel = prevDistanceKm > 150 && speedKmh > S.policies.impossibleTravelKmh;
  }
  const r = S.location.familiarRadiusKm;
  let score = distanceKm <= r ? 0 : distanceKm <= 300 ? 0.15 + 0.25 * ((distanceKm - r) / (300 - r)) : distanceKm <= 1000 ? 0.4 + 0.4 * ((distanceKm - 300) / 700) : 0.9;
  if (impossibleTravel) score += 0.25;
  return { score: clamp(score), distanceKm, familiar, prev: prev ? { id: prev.id, city: prev.city, lat: prev.lat, lng: prev.lng, at: prev.created_at } : null, prevDistanceKm, speedKmh, impossibleTravel };
}
