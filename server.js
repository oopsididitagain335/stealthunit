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

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Images only'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-stealthunit-key-2025',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/stealthunit'
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stealthunit', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// === MongoDB Schemas ===

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  image: { type: String },
  author: { type: String, default: 'StealthUnitGG' },
  date: { type: Date, default: Date.now }
});

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true },
  role: { type: String, required: true },
  game: { type: String, required: true },
  bio: { type: String },
  image: { type: String },
  socialLinks: {
    twitter: { type: String },
    instagram: { type: String },
    twitch: { type: String },
    youtube: { type: String }
  },
  stats: {
    kills: { type: Number, default: 0 },
    deaths: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    kdRatio: { type: Number, default: 0 }
  },
  achievements: [{ type: String }],
  teamHistory: [{ type: String }]
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  category: { type: String, enum: ['Apparel', 'Accessories', 'Collectibles'] },
  inStock: { type: Boolean, default: true }
});

// Models
const Admin = mongoose.model('Admin', adminSchema);
const News = mongoose.model('News', newsSchema);
const Player = mongoose.model('Player', playerSchema);
const Product = mongoose.model('Product', productSchema);

// === Ensure Default Admin Exists ===
async function createDefaultAdmin() {
  try {
    const username = 'admin';
    const password = 'StealthUnitGG!2025'; // 🔐 Strong password
    const adminExists = await Admin.findOne({ username });
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await Admin.create({ username, password: hashedPassword });
      console.log(`🔐 Admin created: ${username} / ${password}`);
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
}

// === Authentication Middleware ===
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    res.locals.username = req.session.username;
    return next();
  }
  res.redirect('/adminp/login');
}

// === PUBLIC ROUTES ===
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/team', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

app.get('/news', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'news.html'));
});

app.get('/store', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

app.get('/lookbook', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lookbook.html'));
});

app.get('/contact', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// === DYNAMIC NEWS DETAIL PAGE ===
app.get('/news/:id', async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (news) {
      res.sendFile(path.join(__dirname, 'public', 'news-detail.html'));
    } else {
      res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
  } catch (e) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

// === ADMIN PANEL ROUTES ===
app.get('/adminp/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/adminp/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.post('/adminp/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    
    if (admin && await bcrypt.compare(password, admin.password)) {
      req.session.userId = admin._id;
      req.session.username = admin.username;
      res.redirect('/adminp/dashboard');
    } else {
      res.redirect('/adminp/login');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.redirect('/adminp/login');
  }
});

app.get('/adminp/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.redirect('/adminp/login');
    });
  } else {
    res.redirect('/adminp/login');
  }
});

app.get('/adminp/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/admin/adminnews', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'adminnews.html'));
});

// === API ROUTES ===

// Public News API
app.get('/api/news', async (req, res) => {
  try {
    const news = await News.find().sort({ date: -1 });
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Single News by ID
app.get('/api/news/:id', async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (!news) {
      return res.status(404).json({ error: 'News article not found' });
    }
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// Admin News CRUD
app.get('/api/admin/news', requireAuth, async (req, res) => {
  try {
    const news = await News.find().sort({ date: -1 });
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

app.post('/api/admin/news', requireAuth, async (req, res) => {
  const { title, content, image, author } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  try {
    const news = new News({
      title,
      content,
      image: image || '',
      author: author || res.locals.username
    });

    await news.save();
    res.status(201).json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create news' });
  }
});

app.delete('/api/admin/news/:id', requireAuth, async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) {
      return res.status(404).json({ error: 'News article not found' });
    }
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Players API
app.get('/api/players', async (req, res) => {
  try {
    const players = await Player.find();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Products API
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({ inStock: true });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// === 404 Catch-All ===
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// === Error Handler ===
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// === Start Server ===
const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  createDefaultAdmin();
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  server.close(() => process.exit(1));
});
