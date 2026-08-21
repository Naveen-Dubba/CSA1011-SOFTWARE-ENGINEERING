import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import { auth, roles } from './middleware/auth.js';
import { asyncRoute } from './utils/http.js';

dotenv.config();
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());
const query = (sql, params = []) => pool.execute(sql, params);
const tokenFor = (user) => jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, location: user.location }, process.env.JWT_SECRET || 'development-secret', { expiresIn: '8h' });

app.get('/', (_req, res) => { res.json({ service: 'agritrace-api', status: 'ok', health: '/api/health' }); });
app.get('/api/health', asyncRoute(async (_req, res) => { await query('SELECT 1'); res.json({ status: 'ok', service: 'agritrace-api' }); }));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password, role = 'consumer', location = '' } = req.body;
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: 'Name, email and a password of 8+ characters are required' });
  const [existing] = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing.length) return res.status(409).json({ message: 'An account with this email already exists' });
  const [result] = await query('INSERT INTO users (name,email,password_hash,role,location) VALUES (?,?,?,?,?)', [name, email.toLowerCase(), await bcrypt.hash(password, 12), role, location]);
  const user = { id: result.insertId, name, email: email.toLowerCase(), role, location };
  res.status(201).json({ user, token: tokenFor(user) });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await query('SELECT * FROM users WHERE email = ?', [email?.toLowerCase()]);
  if (!rows.length || !(await bcrypt.compare(password || '', rows[0].password_hash))) return res.status(401).json({ message: 'Invalid email or password' });
  const { password_hash, ...user } = rows[0];
  res.json({ user, token: tokenFor(user) });
}));

app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {
  const [[counts]] = await query(`SELECT COUNT(*) total_batches, COALESCE(SUM(quantity),0) total_quantity, SUM(status IN ('in_transit')) in_transit, SUM(status IN ('delivered','available')) delivered, SUM(status='approved') approved FROM batches`);
  const [[users]] = await query(`SELECT COUNT(*) total_users, SUM(role='farmer') farmers FROM users`);
  const [activity] = await query(`SELECT t.*, b.trace_id, b.produce_name, u.name actor_name FROM traceability_records t JOIN batches b ON b.id=t.batch_id LEFT JOIN users u ON u.id=t.actor_id ORDER BY t.created_at DESC LIMIT 8`);
  const [categories] = await query(`SELECT category, ROUND(SUM(quantity),2) quantity FROM batches GROUP BY category ORDER BY quantity DESC`);
  const [statuses] = await query(`SELECT status, COUNT(*) count FROM batches GROUP BY status`);
  res.json({ ...counts, ...users, activity, categories, statuses, role: req.user.role });
}));

app.get('/api/batches', auth, asyncRoute(async (req, res) => {
  const term = `%${req.query.search || ''}%`;
  const own = req.user.role === 'farmer' ? 'AND b.farmer_id = ?' : '';
  const params = req.user.role === 'farmer' ? [term, req.user.id] : [term];
  const [rows] = await query(`SELECT b.*, u.name farmer_name FROM batches b JOIN users u ON u.id=b.farmer_id WHERE (b.trace_id LIKE ? OR b.produce_name LIKE ? OR b.category LIKE ?) ${own} ORDER BY b.created_at DESC`, req.user.role === 'farmer' ? [term, term, term, req.user.id] : [term, term, term]);
  res.json(rows);
}));
app.post('/api/batches', auth, roles('admin','farmer'), asyncRoute(async (req, res) => {
  const { produce_name, category, variety, quantity, unit = 'kg', harvest_date, expiry_date, farm_location } = req.body;
  if (!produce_name || !category || !quantity) return res.status(400).json({ message: 'Produce name, category and quantity are required' });
  const traceId = `AGR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const [result] = await query('INSERT INTO batches (trace_id,produce_name,category,variety,quantity,unit,harvest_date,expiry_date,farm_location,farmer_id,current_location) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [traceId, produce_name, category, variety || '', quantity, unit, harvest_date || null, expiry_date || null, farm_location || req.user.location || '', req.user.id, farm_location || req.user.location || 'Farm']);
  await query('INSERT INTO traceability_records (batch_id,actor_id,action,location,quantity,status,remarks) VALUES (?,?,?,?,?,?,?)', [result.insertId, req.user.id, 'Registered by Farmer', farm_location || req.user.location || 'Farm', quantity, 'Registered', 'Produce batch created']);
  res.status(201).json({ id: result.insertId, trace_id: traceId });
}));
app.put('/api/batches/:id/status', auth, asyncRoute(async (req, res) => {
  const { status, location, remarks = '' } = req.body;
  const allowed = ['registered','collected','processing','approved','in_transit','delivered','available','rejected'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid batch status' });
  await query('UPDATE batches SET status=?, current_location=? WHERE id=?', [status, location || req.user.location || '', req.params.id]);
  await query('INSERT INTO traceability_records (batch_id,actor_id,action,location,status,remarks) VALUES (?,?,?,?,?,?)', [req.params.id, req.user.id, `Status updated to ${status}`, location || req.user.location || '', status, remarks]);
  res.json({ message: 'Batch status updated' });
}));
app.delete('/api/batches/:id', auth, roles('admin','farmer'), asyncRoute(async (req, res) => { await query('DELETE FROM batches WHERE id=? AND (farmer_id=? OR ?="admin")', [req.params.id, req.user.id, req.user.role]); res.status(204).end(); }));

app.get('/api/traceability/:traceId', asyncRoute(async (req, res) => {
  const [batches] = await query('SELECT b.*, u.name farmer_name, u.email farmer_email FROM batches b JOIN users u ON u.id=b.farmer_id WHERE b.trace_id=?', [req.params.traceId]);
  if (!batches.length) return res.status(404).json({ message: 'No product found for that traceability ID' });
  const [events] = await query('SELECT t.*, u.name actor_name, u.role actor_role FROM traceability_records t LEFT JOIN users u ON u.id=t.actor_id WHERE t.batch_id=? ORDER BY t.created_at', [batches[0].id]);
  const [quality] = await query('SELECT q.*, u.name inspector_name FROM quality_inspections q JOIN users u ON u.id=q.inspector_id WHERE q.batch_id=? ORDER BY q.inspection_date DESC LIMIT 1', [batches[0].id]);
  res.json({ batch: batches[0], events, quality: quality[0] || null });
}));
app.get('/api/quality', auth, asyncRoute(async (_req, res) => { const [rows] = await query('SELECT q.*, b.trace_id, b.produce_name, u.name inspector_name FROM quality_inspections q JOIN batches b ON b.id=q.batch_id JOIN users u ON u.id=q.inspector_id ORDER BY q.inspection_date DESC'); res.json(rows); }));
app.post('/api/quality', auth, roles('admin','processor','collection_center'), asyncRoute(async (req, res) => { const { batch_id, condition_note, temperature, moisture, grade, result = 'Pending', remarks } = req.body; const [r] = await query('INSERT INTO quality_inspections (batch_id,inspector_id,condition_note,temperature,moisture,grade,result,remarks) VALUES (?,?,?,?,?,?,?,?)', [batch_id, req.user.id, condition_note || '', temperature || null, moisture || null, grade || '', result, remarks || '']); await query('UPDATE batches SET status=? WHERE id=?', [result === 'Approved' ? 'approved' : result === 'Rejected' ? 'rejected' : 'processing', batch_id]); res.status(201).json({ id: r.insertId }); }));
app.get('/api/shipments', auth, asyncRoute(async (_req, res) => { const [rows] = await query('SELECT s.*, b.trace_id, b.produce_name, u.name distributor_name FROM shipments s JOIN batches b ON b.id=s.batch_id JOIN users u ON u.id=s.distributor_id ORDER BY s.id DESC'); res.json(rows); }));
app.post('/api/shipments', auth, roles('admin','distributor'), asyncRoute(async (req, res) => { const { batch_id, vehicle_number, driver_name, source, destination, expected_delivery } = req.body; const shipmentId = `SHP-${Date.now().toString().slice(-8)}`; const [r] = await query('INSERT INTO shipments (shipment_id,batch_id,distributor_id,vehicle_number,driver_name,source,destination,dispatch_date,expected_delivery) VALUES (?,?,?,?,?,?,?,?,?)', [shipmentId, batch_id, req.user.id, vehicle_number || '', driver_name || '', source || '', destination || '', new Date(), expected_delivery || null]); await query('UPDATE batches SET status="in_transit" WHERE id=?', [batch_id]); await query('INSERT INTO traceability_records (batch_id,actor_id,action,location,status,remarks) VALUES (?,?,?,?,?,?)', [batch_id, req.user.id, 'Shipment dispatched', source || '', 'In Transit', `Shipment ${shipmentId} to ${destination || 'retailer'}`]); res.status(201).json({ id: r.insertId, shipment_id: shipmentId }); }));
app.put('/api/shipments/:id', auth, asyncRoute(async (req, res) => { const { status } = req.body; const [shipments] = await query('SELECT * FROM shipments WHERE id=?', [req.params.id]); if (!shipments.length) return res.status(404).json({ message: 'Shipment not found' }); await query('UPDATE shipments SET status=?, actual_delivery=IF(?="Delivered", NOW(), actual_delivery) WHERE id=?', [status, status, req.params.id]); if (status === 'Delivered') await query('UPDATE batches SET status="delivered" WHERE id=?', [shipments[0].batch_id]); res.json({ message: 'Shipment updated' }); }));
app.get('/api/notifications', auth, asyncRoute(async (req, res) => { const [rows] = await query('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 12', [req.user.id]); res.json(rows); }));
app.use((err, _req, res, _next) => { console.error(err); res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: err.code === 'ER_DUP_ENTRY' ? 'That record already exists' : 'Something went wrong on the server' }); });
const port = Number(process.env.PORT || 5000);
async function ensureDemoAccount() {
  const [rows] = await query('SELECT id FROM users WHERE email=?', ['admin@agritrace.local']);
  if (!rows.length) {
    await query('INSERT INTO users (name,email,password_hash,role,location) VALUES (?,?,?,?,?)', ['Asha Raman', 'admin@agritrace.local', await bcrypt.hash('Admin@123', 12), 'admin', 'Nairobi network']);
  }
  const [farmers] = await query('SELECT id FROM users WHERE email=?', ['farmer@agritrace.local']);
  if (!farmers.length) {
    await query('INSERT INTO users (name,email,password_hash,role,location) VALUES (?,?,?,?,?)', ['Maya Njoroge', 'farmer@agritrace.local', await bcrypt.hash('Farmer@123', 12), 'farmer', 'Kiambu, Kenya']);
  }
  const [batches] = await query('SELECT id FROM batches LIMIT 1');
  if (!batches.length) {
    const [farmer] = await query('SELECT id, location FROM users WHERE email=?', ['farmer@agritrace.local']);
    const traceId = `AGR-${new Date().getFullYear()}-0001`;
    const [batch] = await query('INSERT INTO batches (trace_id,produce_name,category,variety,quantity,unit,harvest_date,expiry_date,farm_location,farmer_id,status,current_location) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [traceId, 'Roma tomatoes', 'Vegetables', 'Roma', 820, 'kg', `${new Date().getFullYear()}-08-12`, `${new Date().getFullYear()}-08-26`, farmer[0].location, farmer[0].id, 'approved', 'Kiambu collection center']);
    const [admin] = await query('SELECT id FROM users WHERE email=?', ['admin@agritrace.local']);
    await query('INSERT INTO traceability_records (batch_id,actor_id,action,location,quantity,status,remarks) VALUES (?,?,?,?,?,?,?)', [batch.insertId, farmer[0].id, 'Registered by Farmer', farmer[0].location, 820, 'Registered', 'Harvest recorded at source']);
    await query('INSERT INTO traceability_records (batch_id,actor_id,action,location,quantity,status,remarks) VALUES (?,?,?,?,?,?,?)', [batch.insertId, admin[0].id, 'Quality inspection passed', 'Kiambu collection center', 820, 'Approved', 'Grade A; temperature 18C']);
  }
}
ensureDemoAccount().then(() => app.listen(port, () => console.log(`Agritrace API listening on ${port}`))).catch((error) => { console.error('Database unavailable:', error.message); app.listen(port, () => console.log(`Agritrace API listening on ${port} (database pending)`)); });
