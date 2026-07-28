// THE single place profit/cost data is stripped for users who can't view it.
// It wraps res.json and deep-removes sensitive keys when the authenticated user
// lacks the viewProfit permission. Because the check runs when res.json is
// CALLED (not when this middleware runs), req.user — set later by requireAuth —
// is available. Never rely on the frontend to hide these values.

// A key is sensitive if it is a *profit* field (…profit, but NOT viewProfit) or
// a *cost rate* field (costRate, …).
function isSensitiveKey(k) {
  const key = String(k).toLowerCase();
  if (key === 'viewprofit') return false;
  return key.endsWith('profit') || key.includes('costrate');
}

// Recursively clone `value`, dropping sensitive keys. Operates on a JSON-safe
// structure (see below) so ObjectIds/Dates are already plain strings.
function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k)) continue;
      out[k] = stripSensitive(v);
    }
    return out;
  }
  return value;
}

export default function profitFilter(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (req.user?.permissions?.viewProfit === true) return originalJson(body);
    // Normalise to plain JSON first (ObjectId → hex, Date → ISO), then strip.
    return originalJson(stripSensitive(JSON.parse(JSON.stringify(body))));
  };
  next();
}

export { isSensitiveKey, stripSensitive };

// Role-filter a plain data object the SAME way res.json would for this user, for
// non-JSON responses (PDF/XLSX) that bypass the res.json wrapper. Returns the
// data unchanged for viewProfit users; deep-strips profit/costRate otherwise.
export function filterForUser(req, data) {
  if (req.user?.permissions?.viewProfit === true) return data;
  return stripSensitive(JSON.parse(JSON.stringify(data)));
}
