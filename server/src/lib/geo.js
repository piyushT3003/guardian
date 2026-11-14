// Geographic helpers. Cities are used for reverse-geocoding coordinates to a readable place name.
export const CITIES = [
  ['Mumbai', 'Maharashtra', 19.076, 72.8777], ['New Delhi', 'Delhi', 28.6139, 77.209], ['Bengaluru', 'Karnataka', 12.9716, 77.5946],
  ['Pune', 'Maharashtra', 18.5204, 73.8567], ['Hyderabad', 'Telangana', 17.385, 78.4867], ['Chennai', 'Tamil Nadu', 13.0827, 80.2707],
  ['Kolkata', 'West Bengal', 22.5726, 88.3639], ['Ahmedabad', 'Gujarat', 23.0225, 72.5714], ['Jaipur', 'Rajasthan', 26.9124, 75.7873],
  ['Lucknow', 'Uttar Pradesh', 26.8467, 80.9462], ['Kochi', 'Kerala', 9.9312, 76.2673], ['Chandigarh', 'Chandigarh', 30.7333, 76.7794],
  ['Guwahati', 'Assam', 26.1445, 91.7362], ['Indore', 'Madhya Pradesh', 22.7196, 75.8577], ['Panaji', 'Goa', 15.4909, 73.8278],
  ['Patna', 'Bihar', 25.5941, 85.1376], ['Bhubaneswar', 'Odisha', 20.2961, 85.8245], ['Nagpur', 'Maharashtra', 21.1458, 79.0882],
  ['Mysuru', 'Karnataka', 12.2958, 76.6394], ['Noida', 'Uttar Pradesh', 28.5355, 77.391], ['Gurugram', 'Haryana', 28.4595, 77.0266],
  ['Dubai', 'UAE', 25.2048, 55.2708], ['Singapore', 'Singapore', 1.3521, 103.8198],
].map(([city, region, lat, lng]) => ({ city, region, lat, lng }));

export const cityByName = (n) => CITIES.find((c) => c.city === n);

export function haversineKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function reverseGeocode(lat, lng) {
  let best = null, bd = Infinity;
  for (const c of CITIES) { const d = haversineKm({ lat, lng }, c); if (d < bd) { bd = d; best = c; } }
  return bd < 80 ? { city: best.city, region: best.region } : { city: `Near ${best.city}`, region: best.region };
}
