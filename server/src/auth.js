import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function issueToken(user) {
  return jwt.sign({ sub: user.id, scope: user.scope, email: user.email }, config.JWT_SECRET, { expiresIn: '12h', issuer: 'tenvoria-api', audience: 'tenvoria-app' });
}
export function requireAuth(requiredScope) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in required.' });
    try {
      const payload = jwt.verify(header.slice(7), config.JWT_SECRET, { issuer: 'tenvoria-api', audience: 'tenvoria-app' });
      if (requiredScope && payload.scope !== requiredScope) return res.status(403).json({ error: 'This application is not available to this account.' });
      req.auth = { id: payload.sub, scope: payload.scope, email: payload.email };
      next();
    } catch { return res.status(401).json({ error: 'Session expired or invalid.' }); }
  };
}
