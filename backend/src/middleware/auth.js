import jwt from 'jsonwebtoken';
export function auth(req, res, next) { const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) return res.status(401).json({ message: 'Authentication required' }); try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'development-secret'); next(); } catch { res.status(401).json({ message: 'Session expired' }); } }
export function roles(...allowed) { return (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action' }); }
