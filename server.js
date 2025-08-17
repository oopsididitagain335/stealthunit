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

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/adminp/login');
}

// Routes
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

// Admin Panel Routes
app.get('/adminp/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.post('/adminp/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find admin by username
    const admin = await Admin.findOne({ username });
    
    // Check if admin exists and password is correct
    if (admin && await bcrypt.compare(password, admin.password)) {
      // Set session variables
      req.session.userId = admin._id;
      req.session.username = admin.username;
      req.session.role = admin.role;
      
      // Redirect to dashboard
      res.redirect('/adminp/dashboard');
    } else {
      // Invalid credentials
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/adminp/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        console.error('Session destruction error:', err);
      }
      res.redirect('/adminp/login');
    });
  } else {
    res.redirect('/adminp/login');
  }
});

app.get('/adminp/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

// API Routes for Admin Panel
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
    const news = new News(req.body);
    await news.save();
    res.status(201).json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create news' });
  }
});

app.put('/api/admin/news/:id', requireAuth, async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update news' });
  }
});

app.delete('/api/admin/news/:id', requireAuth, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ message: 'News deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete news' });
  }
});

// Players API with file upload
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
    // If a file was uploaded, use its path, otherwise use the image URL from form
    const imagePath = req.file ? `/uploads/${req.file.filename}` : (req.body.image || '');
    
    const playerData = {
      ...req.body,
      image: imagePath
    };
    
    const player = new Player(playerData);
    await player.save();
    res.status(201).json(player);
  } catch (error) {
    console.error('Error creating player:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

app.put('/api/admin/players/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // If a new image was uploaded, update the image path
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
      
      // Remove old image if it exists
      try {
        const player = await Player.findById(req.params.id);
        if (player && player.image) {
          const oldImagePath = path.join(__dirname, 'public', player.image);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      } catch (err) {
        console.error('Error removing old image:', err);
      }
    }
    
    const player = await Player.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(player);
  } catch (error) {
    console.error('Error updating player:', error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

app.delete('/api/admin/players/:id', requireAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    
    // Remove player image if it exists
    if (player && player.image) {
      try {
        const imagePath = path.join(__dirname, 'public', player.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (err) {
        console.error('Error removing player image:', err);
      }
    }
    
    await Player.findByIdAndDelete(req.params.id);
    res.json({ message: 'Player deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

// Products API
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
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Public API endpoints
app.get('/api/news', async (req, res) => {
  try {
    const news = await News.find().sort({ date: -1 }).limit(10);
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

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

// Handle all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  server.close(() => process.exit(1));
});
