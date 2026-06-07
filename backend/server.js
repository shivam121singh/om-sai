const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 1. Load Environment Variables
dotenv.config();
const app = express();

// 2. Middleware
app.use(cors({
    origin: '*', // Allows requests from any origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 3. File System Setup
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// 4. Static File Serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// --- MONGOOSE SCHEMAS ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const applicantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fullName: String,
    email: String,
    phone: String,
    destinationCountry: String,
    purpose: String,
    fileName: String,
    filePath: String,
    photoPath: String,
    submittedAt: { type: Date, default: Date.now }
});
const Applicant = mongoose.model('Applicant', applicantSchema);

const jobSchema = new mongoose.Schema({
    title: String,
    description: String,
    location: String,
    salary: String,
    posterPath: String,
    createdAt: { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', jobSchema);

// --- MULTI-PART FILE PROCESSING ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- MIDDLEWARES ---
const verifyUserToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Log in first!' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: 'Session expired!' });
        
        // Ensure this matches the key you used in jwt.sign (userId)
        req.user = decoded; 
        next();
    });
};

const verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err || decoded.role !== 'admin') return res.sendStatus(403);
        next();
    });
};

// --- ROUTES ---
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword
    });

    await user.save();

    res.json({
      success: true,
      message: "Signup successful"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password'
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.post('/api/applicants', verifyUserToken, upload.fields([{ name: 'resumeFile' }, { name: 'candidatePhoto' }]), async (req, res) => { /* Your Existing Logic */ });

app.post('/api/admin/login', (req, res) => {
    const { adminId, adminPassword } = req.body;
    // Authenticate using Environment Variables defined in Vercel
    if (adminId === process.env.ADMIN_ID && adminPassword === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });
        return res.json({ success: true, token });
    }
    res.status(401).json({ success: false, message: 'Invalid Admin Credentials!' });
});

app.get('/api/admin/applicants', verifyAdminToken, async (req, res) => { /* Your Existing Logic */ });

app.post('/api/jobs', verifyAdminToken, upload.single('jobPoster'), async (req, res) => { /* Your Existing Logic */ });
app.get('/api/jobs', async (req, res) => { /* Your Existing Logic */ });
app.put('/api/jobs/:id', verifyAdminToken, upload.single('jobPoster'), async (req, res) => { /* Your Existing Logic */ });
app.delete('/api/jobs/:id', verifyAdminToken, async (req, res) => { /* Your Existing Logic */ });

// Catch-all route to serve the frontend for any non-API request
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// --- SERVER STARTUP ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('🎉 Connected to MongoDB successfully!');
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch(err => console.error('Database connection error:', err));
