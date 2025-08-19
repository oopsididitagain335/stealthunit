// server.js
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + suffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-stealthunit-key-2025',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true }
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ DB Error:', err));

// Schemas
const adminSchema = new mongoose.Schema({
  username: String,
  password: String
});

const newsSchema = new mongoose.Schema({
  title: String,
  content: String,
  image: String,
  author: String,
  date: { type: Date, default: Date.now }
});

const News = mongoose.model('News', newsSchema);
const Admin = mongoose.model('Admin', adminSchema);

// === Create Default Admin with Strong Password ===
async function createDefaultAdmin() {
  const username = 'admin'; // ✅ Keep as 'admin'
  const password = 'StealthUnitGG!2025'; // 🔐 Strong, hard to guess

  const hash = await bcrypt.hash(password, 10);
  const exists = await Admin.findOne({ username });
  if (!exists) {
    await Admin.create({ username, password: hash });
    console.log(`🔐 Admin created: ${username} / ${password}`);
    console.log('💡 Change password after first login!');
  }
}

// === Auth Middleware ===
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    res.locals.username = req.session.username;
    return next();
  }
  res.redirect('/adminp/login');
}

// === PUBLIC ROUTES ===
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/team', (_, res) => res.sendFile(path.join(__dirname, 'public', 'team.html')));
app.get('/news', (_, res) => res.sendFile(path.join(__dirname, 'public', 'news.html')));
app.get('/store', (_, res) => res.sendFile(path.join(__dirname, 'public', 'store.html')));
app.get('/lookbook', (_, res) => res.sendFile(path.join(__dirname, 'public', 'lookbook.html')));
app.get('/contact', (_, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/404', (_, res) => res.sendFile(path.join(__dirname, 'public', '404.html')));

// === ADMIN AUTH ===
app.get('/adminp/login', (req, res) => {
  if (req.session.userId) return res.redirect('/adminp/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.post('/adminp/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username });
  if (admin && await bcrypt.compare(password, admin.password)) {
    req.session.userId = admin._id;
    req.session.username = admin.username;
    return res.redirect('/adminp/dashboard');
  }
  res.redirect('/adminp/login');
});

app.get('/adminp/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => res.redirect('/adminp/login'));
  } else {
    res.redirect('/adminp/login');
  }
});

// === ADMIN DASHBOARD & PAGES ===
app.get('/adminp/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/admin/adminnews', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'adminnews.html'));
});

// === API: News ===
app.get('/api/news', async (_, res) => {
  try {
    const news = await News.find().sort({ date: -1 });
    res.json(news);
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.get('/api/news/:id', async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (!news) return res.status(404).json({ error: 'Not found' });
    res.json(news);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/news', requireAuth, async (_, res) => {
  try {
    const news = await News.find().sort({ date: -1 });
    res.json(news);
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.post('/api/admin/news', requireAuth, async (req, res) => {
  const { title, content, image, author } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Required' });

  try {
    const news = new News({ title, content, image, author: author || res.locals.username });
    await news.save();
    res.status(201).json(news);
  } catch (e) {
    res.status(500).json({ error: 'Save failed' });
  }
});

app.delete('/api/admin/news/:id', requireAuth, async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// === Catch-all 404 ===
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// === Error Handler ===
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  createDefaultAdmin();
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});
