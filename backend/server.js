require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) console.warn('WARNING: Set JWT_SECRET in your environment before deployment.');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const { Schema } = mongoose;
const businessSchema = new Schema({ name: { type: String, required: true, trim: true }, inventoryCount: { type: Number, default: 0, min: 0 }, createdAt: { type: Date, default: Date.now } });
const userSchema = new Schema({ name: { type: String, required: true, trim: true }, email: { type: String, required: true, lowercase: true, unique: true, trim: true }, password: { type: String, required: true, select: false }, role: { type: String, enum: ['admin', 'staff'], default: 'staff' }, business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true } }, { timestamps: true });
const productSchema = new Schema({ business: { type: Schema.Types.ObjectId, ref: 'Business', required: true }, name: { type: String, required: true, trim: true, maxlength: 120 }, category: { type: String, required: true, trim: true, maxlength: 80 }, sku: { type: String, trim: true, default: '' }, barcode: { type: String, trim: true, default: '' }, price: { type: Number, required: true, min: 0 }, quantity: { type: Number, required: true, min: 0, default: 0 }, minStock: { type: Number, min: 0, default: 5 } }, { timestamps: true });
productSchema.index({ business: 1, name: 1 });
productSchema.index({ business: 1, category: 1 });
productSchema.index({ business: 1, barcode: 1 }, { sparse: true });
productSchema.index({ business: 1, quantity: 1, minStock: 1 });
const saleSchema = new Schema({ business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true }, product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, productName: { type: String, required: true }, quantity: { type: Number, required: true, min: 1 }, price: { type: Number, required: true, min: 0 }, totalAmount: { type: Number, required: true, min: 0 }, soldBy: { type: Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true });
saleSchema.index({ business: 1, createdAt: -1 });
saleSchema.index({ business: 1, product: 1, createdAt: -1 });
const Business = mongoose.model('Business', businessSchema);
const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Sale = mongoose.model('Sale', saleSchema);

function signToken(user) { return jwt.sign({ id: String(user._id), role: user.role, business: String(user.business?._id || user.business) }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Login required.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ message: 'Session expired. Please log in again.' }); }
}
function adminOnly(req, res, next) { if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin permission required.' }); next(); }
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function validId(id) { return mongoose.Types.ObjectId.isValid(id); }

app.get('/', (_req, res) => res.json({ name: 'StockGrow API', status: 'running', version: '2.0.0' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

// First registration creates a business and its first admin. Later staff accounts are created by an admin.
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password, businessName } = req.body;
  if (!name || !email || !password || !businessName) return res.status(400).json({ message: 'Name, email, password and business name are required.' });
  if (String(password).length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
  if (await User.findOne({ email: String(email).toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists.' });
  const business = await Business.create({ name: businessName });
  try {
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role: 'admin', business: business._id });
    res.status(201).json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role, business: business.name } });
  } catch (error) { await Business.findByIdAndDelete(business._id); throw error; }
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+password').populate('business', 'name');
  if (!user || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password.' });
  res.json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role, business: user.business.name } });
}));
app.get('/api/auth/me', auth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.user.id).populate('business', 'name');
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json({ id: user._id, name: user.name, email: user.email, role: user.role, business: user.business.name });
}));
app.post('/api/users', auth, adminOnly, asyncRoute(async (req, res) => {
  const { name, email, password, role = 'staff' } = req.body;
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: 'Name, email and password (8+ characters) are required.' });
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ message: 'Invalid role.' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already exists.' });
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role, business: req.user.business });
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
}));

app.get('/api/products', auth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const filter = { business: req.user.business };
  if (req.query.search) filter.$or = [{ name: { $regex: String(req.query.search).slice(0, 80), $options: 'i' } }, { barcode: String(req.query.search) }, { sku: String(req.query.search) }];
  if (req.query.category) filter.category = req.query.category;
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$quantity', '$minStock'] };
  const [items, total] = await Promise.all([Product.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(filter)]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));
app.post('/api/products', auth, asyncRoute(async (req, res) => {
  // Atomic counter reservation enforces the 100K limit even under concurrent requests.
  const reservation = await Business.findOneAndUpdate(
    { _id: req.user.business, $or: [{ inventoryCount: { $lt: 100000 } }, { inventoryCount: { $exists: false } }] },
    { $inc: { inventoryCount: 1 } }, { new: true }
  );
  if (!reservation) return res.status(409).json({ message: 'This business has reached the 100,000 item limit.' });
  const data = { ...req.body, business: req.user.business };
  delete data._id; delete data.businessId;
  try {
    const product = await Product.create(data);
    res.status(201).json(product);
  } catch (error) {
    await Business.updateOne({ _id: req.user.business }, { $inc: { inventoryCount: -1 } });
    throw error;
  }
}));
app.put('/api/products/:id', auth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID.' });
  const data = { ...req.body }; delete data.business; delete data.businessId; delete data._id;
  const product = await Product.findOneAndUpdate({ _id: req.params.id, business: req.user.business }, { $set: data }, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  res.json(product);
}));
app.delete('/api/products/:id', auth, adminOnly, asyncRoute(async (req, res) => {
  const product = await Product.findOneAndDelete({ _id: req.params.id, business: req.user.business });
  if (!product) return res.status(404).json({ message: 'Product not found.' });
  await Business.updateOne({ _id: req.user.business, inventoryCount: { $gt: 0 } }, { $inc: { inventoryCount: -1 } });
  res.json({ message: 'Product deleted.' });
}));
app.get('/api/products/low-stock', auth, asyncRoute(async (req, res) => {
  const items = await Product.find({ business: req.user.business, $expr: { $lte: ['$quantity', '$minStock'] } }).sort({ quantity: 1 }).limit(200).lean();
  res.json(items);
}));

app.post('/api/sales', auth, asyncRoute(async (req, res) => {
  const { productId, quantity } = req.body; const qty = Number(quantity);
  if (!validId(productId) || !Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: 'Select a valid product and quantity.' });
  // Atomic stock decrement prevents two concurrent sales from overselling the same stock.
  const product = await Product.findOneAndUpdate({ _id: productId, business: req.user.business, quantity: { $gte: qty } }, { $inc: { quantity: -qty } }, { new: true });
  if (!product) return res.status(409).json({ message: 'Product not found or insufficient stock.' });
  try {
    const sale = await Sale.create({ business: req.user.business, product: product._id, productName: product.name, quantity: qty, price: product.price, totalAmount: product.price * qty, soldBy: req.user.id });
    res.status(201).json({ sale, remainingStock: product.quantity });
  } catch (error) {
    await Product.updateOne({ _id: product._id, business: req.user.business }, { $inc: { quantity: qty } });
    throw error;
  }
}));
app.get('/api/sales', auth, asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const [items, total] = await Promise.all([Sale.find({ business: req.user.business }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Sale.countDocuments({ business: req.user.business })]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {
  const business = new mongoose.Types.ObjectId(req.user.business);
  const [stock, lowStockProducts, sales] = await Promise.all([
    Product.aggregate([{ $match: { business } }, { $group: { _id: null, totalProducts: { $sum: 1 }, totalQuantity: { $sum: '$quantity' }, totalInventoryValue: { $sum: { $multiply: ['$price', '$quantity'] } } } }]),
    Product.countDocuments({ business, $expr: { $lte: ['$quantity', '$minStock'] } }),
    Sale.aggregate([{ $match: { business, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } }, { $group: { _id: null, salesCount: { $sum: 1 }, salesRevenue: { $sum: '$totalAmount' } } }])
  ]);
  res.json({ totalProducts: stock[0]?.totalProducts || 0, totalQuantity: stock[0]?.totalQuantity || 0, totalInventoryValue: stock[0]?.totalInventoryValue || 0, lowStockProducts, salesCount30d: sales[0]?.salesCount || 0, salesRevenue30d: sales[0]?.salesRevenue || 0 });
}));
app.get('/api/analytics/trends', auth, asyncRoute(async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30)); const from = new Date(); from.setDate(from.getDate() - days + 1); from.setHours(0, 0, 0, 0);
  const rows = await Sale.aggregate([{ $match: { business: new mongoose.Types.ObjectId(req.user.business), createdAt: { $gte: from } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, units: { $sum: '$quantity' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const byDate = new Map(rows.map(r => [r._id, r])); const result = [];
  for (let i = 0; i < days; i++) { const d = new Date(from); d.setDate(from.getDate() + i); const key = d.toISOString().slice(0, 10); const r = byDate.get(key); result.push({ date: key, revenue: r?.revenue || 0, units: r?.units || 0, orders: r?.orders || 0 }); }
  res.json(result);
}));
app.get('/api/analytics/restock', auth, asyncRoute(async (req, res) => {
  const products = await Product.find({ business: req.user.business }).limit(100000).lean();
  const since = new Date(Date.now() - 30 * 86400000);
  const sales = await Sale.aggregate([{ $match: { business: new mongoose.Types.ObjectId(req.user.business), createdAt: { $gte: since } } }, { $group: { _id: '$product', sold: { $sum: '$quantity' } } }]);
  const soldMap = new Map(sales.map(s => [String(s._id), s.sold]));
  const suggestions = products.map(p => { const sold30 = soldMap.get(String(p._id)) || 0; const avgDaily = sold30 / 30; const target = Math.max(p.minStock * 2, Math.ceil(avgDaily * 14)); const suggested = Math.max(0, target - p.quantity); return { _id: p._id, name: p.name, quantity: p.quantity, minStock: p.minStock, sold30, avgDaily: Number(avgDaily.toFixed(2)), suggestedQuantity: suggested, urgency: p.quantity <= p.minStock ? 'High' : suggested > 0 ? 'Medium' : 'Low' }; }).filter(p => p.suggestedQuantity > 0).sort((a, b) => b.suggestedQuantity - a.suggestedQuantity).slice(0, 100);
  res.json({ method: '30-day average daily sales × 14-day cover, with a minimum target of 2× minimum stock', suggestions });
}));

app.use((err, _req, res, _next) => { console.error(err); if (err.code === 11000) return res.status(409).json({ message: 'A record with this unique value already exists.' }); if (err.name === 'ValidationError') return res.status(400).json({ message: err.message }); res.status(500).json({ message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message }); });

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/StockGrow')
  .then(() => { console.log('MongoDB connected'); app.listen(PORT, () => console.log(`StockGrow API listening on ${PORT}`)); })
  .catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });

