// Builds a small vector basemap (countries around South Asia) used beneath raster tiles.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
const require = createRequire(import.meta.url);
const topo = require('world-atlas/countries-50m.json');
const fc = feature(topo, topo.objects.countries);
const [W, S, E, N] = [40, -12, 115, 45];
const inBox = (f) => JSON.stringify(f.geometry.coordinates).match(/-?\d+\.?\d*,-?\d+\.?\d*/g).some((p) => { const [x, y] = p.split(',').map(Number); return x > W && x < E && y > S && y < N; });
const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(2), +c[1].toFixed(2)] : c.map(round));
const out = { type: 'FeatureCollection', features: fc.features.filter((f) => f.geometry && inBox(f)).map((f) => ({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } })) };
fs.writeFileSync('src/lib/region.json', JSON.stringify(out));
console.log(out.features.length, 'features', (fs.statSync('src/lib/region.json').size / 1024).toFixed(0), 'KB');
