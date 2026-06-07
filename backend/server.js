const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

dotenv.config();
const app = express();

// 1. Updated CORS: Replace with your actual frontend URL
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:3000', 'https://om-sai-e8f2.vercel.app'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// 2. File System Setup
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- MONGOOSE SCHEMAS ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const applicantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fullName: String, email: String, phone: String,
    destinationCountry: String, purpose: String,
    fileName: String, filePath: String, photoPath: String,
    submittedAt: { type: Date, default: Date.now }
});
const Applicant = mongoose.model('Applicant', applicantSchema);

const jobSchema = new mongoose.Schema({
    title: String, description: String, location: String,
    salary: String, posterPath: String, createdAt: { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', jobSchema);

// --- MULTER STORAGE ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- MIDDLEWARES ---
const verifyUserToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Log in first!' });
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Session expired!' });
        req.user = decoded;
        next();
    });
};

const verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err || decoded.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
        next();
    });
};

// --- ROUTES ---
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();
        res.json({ success: true, message: "Signup successful" });
    } catch (err) { res.status(500).json({ success: false, message: "Server Error" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token });
    } catch (err) { res.status(500).json({ success: false, message: 'Server Error' }); }
});

app.post('/api/admin/login', (req, res) => {
    const { adminId, adminPassword } = req.body;
    if (adminId === process.env.ADMIN_ID && adminPassword === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });
        return res.json({ success: true, token });
    }
    res.status(401).json({ success: false, message: 'Invalid Admin Credentials!' });
});

// --- SERVER STARTUP ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to Database');
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error(err));
