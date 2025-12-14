// Simple in-memory rate limiter (per-process). For clustered deployments, use Redis.

const createRateLimiter = ({ windowMs = 60_000, max = 60, keyGenerator } = {}) => {
  const hits = new Map();
  const getKey = (req) => (keyGenerator ? keyGenerator(req) : (req.ip || req.headers['x-forwarded-for'] || 'global'));

  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of hits.entries()) {
      if (now - data.start >= windowMs) hits.delete(key);
    }
  }, Math.max(5_000, Math.floor(windowMs / 2))).unref();

  return (req, res, next) => {
    const key = getKey(req);
    const now = Date.now();
    const record = hits.get(key) || { count: 0, start: now };
    if (now - record.start >= windowMs) {
      record.count = 0;
      record.start = now;
    }
    record.count += 1;
    hits.set(key, record);
    if (record.count > max) {
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }
    next();
  };
};

module.exports = { createRateLimiter };


