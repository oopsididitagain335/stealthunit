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

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'player-' + uniqueSuffix + path.extname(file.originalname));
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
  secret: process.env.SESSION_SECRET || 'stealthunitgg-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// MongoDB Schemas
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
});

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  image: { type: String },
  date: { type: Date, default: Date.now },
  author: { type: String, default: 'StealthUnitGG' }
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

// Ensure admin user exists
async function createDefaultAdmin() {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await Admin.create({
        username: 'admin',
        password: hashedPassword
      });
      console.log('Default admin created: admin / admin123');
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/adminp/login');
}

// === PUBLIC ROUTES ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/store', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

app.get('/team', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

app.get('/lookbook', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lookbook.html'));
});

app.get('/news', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'news.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
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
      req.session.role = admin.role;
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
    req.session.destroy(err => {
      if (err) console.error('Session destruction error:', err);
      res.redirect('/adminp/login');
    });
  } else {
    res.redirect('/adminp/login');
  }
});

app.get('/adminp/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

// === API ROUTES ===

// Admin News Routes
app.get('/api/admin/news', requireAuth, async (req, res) => {
  try {
    const news = await News.find().sort({ date: -1 });
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

app.post('/api/admin/news', requireAuth, async (req, res) => {
  try {
    const { title, content, image, author } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const news = new News({
      title,
      content,
      image: image || '',
      author: author || 'StealthUnitGG'
    });

    await news.save();
    res.status(201).json(news);
  } catch (error) {
    console.error('Error creating news:', error);
    res.status(500).json({ error: 'Failed to create news' });
  }
});

app.put('/api/admin/news/:id', requireAuth, async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!news) return res.status(404).json({ error: 'Not found' });
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/admin/news/:id', requireAuth, async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Public News API
app.get('/api/news', async (req, res) => {
  try {
    const news = await News.find().sort({ date: -1 });
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Single News Article by ID ✅ ADDED
app.get('/api/news/:id', async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (!news) {
      return res.status(404).json({ error: 'News article not found' });
    }
    res.json(news);
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// Players API
app.get('/api/admin/players', requireAuth, async (req, res) => {
  try {
    const players = await Player.find();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

app.post('/api/admin/players', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file ? `/uploads/${req.file.filename}` : req.body.image || '';
    const { name, username, role, game, bio } = req.body;

    if (!name || !username || !role || !game) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const player = new Player({
      name, username, role, game, bio, image: imagePath
    });

    await player.save();
    res.status(201).json(player);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// Products API (same as before)
app.get('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const { name, description, price, image, category } = req.body;
    if (!name || !description || !price || !image || !category) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Public APIs
app.get('/api/players', async (req, res) => {
  try {
    const players = await Player.find();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({ inStock: true });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// === DYNAMIC NEWS DETAIL PAGE ROUTE ✅ ADDED ===
app.get('/news/:id', async (req, res) => {
  const newsId = req.params.id;
  const news = await News.findById(newsId);
  if (news) {
    res.sendFile(path.join(__dirname, 'public', 'news-detail.html'));
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

// Catch-all for 404
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
  createDefaultAdmin();
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  server.close(() => process.exit(1));
});
