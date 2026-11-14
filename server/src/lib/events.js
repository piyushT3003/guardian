// Server-sent events bus for real-time UI updates.
const clients = new Set();
let lastEventAt = null;

export function addClient(res, user) {
  const c = { res, user };
  clients.add(c);
  res.on('close', () => clients.delete(c));
}
export function emit(type, payload = {}) {
  lastEventAt = Date.now();
  const data = `event: ${type}\ndata: ${JSON.stringify({ type, at: lastEventAt, ...payload })}\n\n`;
  for (const c of clients) {
    if (payload.familyUserId && c.user.role === 'family' && c.user.id !== payload.familyUserId) continue;
    try { c.res.write(data); } catch { clients.delete(c); }
  }
}
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch {} } }, 20000).unref();
export const streamStats = () => ({ clients: clients.size, lastEventAt });
