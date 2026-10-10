export function cors(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || '';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
export const send = (res, status, body) => res.status(status).json(body);
export function allow(req, res, methods) {
  if (!methods.includes(req.method)) { send(res, 405, { error: 'method_not_allowed' }); return false; }
  return true;
}
export function handle(methods, fn) {
  return async (req, res) => {
    if (cors(req, res)) return;
    if (!allow(req, res, methods)) return;
    try { await fn(req, res); }
    catch (e) {
      if (e?.status) return send(res, e.status, { error: e.message, details: e.details });
      console.error(e);
      send(res, 500, { error: 'internal_error' });
    }
  };
}
export const httpError = (status, message, details) => Object.assign(new Error(message), { status, details });
