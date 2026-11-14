// Minimal Express-compatible router so the Guardian API routes run unchanged inside the page.
function compile(path) {
  if (path === '*') return { re: /^.*$/, keys: [] };
  const keys = [];
  const src = path.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; });
  return { re: new RegExp(`^${src === '/' ? '/?' : src.replace(/\/$/, '')}/?$`), keys };
}

export function Router() {
  const layers = [];
  const router = (req, res, done) => {
    let i = 0;
    const baseUrl = req.baseUrl, url = req.url;
    const next = (err) => {
      req.baseUrl = baseUrl; req.url = url;
      const layer = layers[i++];
      if (!layer) return done(err);
      const path = req.url;
      if (layer.kind === 'use') {
        if (layer.prefix !== '/' && !(path === layer.prefix || path.startsWith(layer.prefix + '/'))) return next(err);
        const isErr = layer.fn.length === 4;
        if (!!err !== isErr) return next(err);
        if (layer.prefix !== '/') { req.baseUrl = baseUrl + layer.prefix; req.url = path.slice(layer.prefix.length) || '/'; }
        try { isErr ? layer.fn(err, req, res, next) : layer.fn(req, res, next); } catch (e) { next(e); }
        return;
      }
      if (err || (layer.method !== req.method)) return next(err);
      const m = layer.re.exec(path);
      if (!m) return next();
      req.params = Object.fromEntries(layer.keys.map((k, j) => [k, decodeURIComponent(m[j + 1])]));
      req.route = { path: layer.path };
      let h = 0;
      const step = (e) => {
        if (e) return next(e);
        const fn = layer.handlers[h++];
        if (!fn) return next();
        try { const r = fn(req, res, step); if (r && typeof r.catch === 'function') r.catch(step); } catch (ex) { step(ex); }
      };
      step();
    };
    next();
  };
  router.use = (...args) => {
    const prefix = typeof args[0] === 'string' ? args.shift().replace(/\/$/, '') || '/' : '/';
    for (const fn of args) layers.push({ kind: 'use', prefix, fn });
    return router;
  };
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
    router[m] = (path, ...handlers) => { layers.push({ kind: 'route', method: m.toUpperCase(), path, ...compile(path), handlers }); return router; };
  }
  return router;
}

export default { Router };
