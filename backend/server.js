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

app.use(cors());
app.use(express.json());

// Create required upload directory folder if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Serves files with explicit CORS headers so frontend JavaScript can convert images to downloadable blobs
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
}));
app.use(express.static(path.join(__dirname, '../frontend')));

// --- MONGOOSE SCHEMAS ---

// Regular Applicant Account Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Updated Applications Schema (Now supports both file items)
const applicantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fullName: String,
  email: String,
  phone: String,
  destinationCountry: String,
  purpose: String,
  fileName: String,
  filePath: String,       // Holds the resume document path
  photoPath: String,      // UPDATED: Now securely stores the photo image asset path
  submittedAt: { type: Date, default: Date.now }
});
const Applicant = mongoose.model('Applicant', applicantSchema);

// Dynamic Jobs Posting Database Schema
const jobSchema = new mongoose.Schema({
  title: String,
  description: String,
  location: String,
  salary: String,
  posterPath: String, 
  createdAt: { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', jobSchema);

// --- MULTI-PART FILE PROCESSING CONFIGURATION ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- TOKEN VERIFICATION MIDDLEWARES ---
const verifyUserToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Log in first!' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Session expired!' });
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

// 1. Applicant Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email registered!' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ success: true, message: 'Account created!' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 2. Applicant Log In
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: 'Invalid credentials!' });
    }
    const token = jwt.sign({ id: user._id, email: user.email, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.json({ success: true, token });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 3. CORRECTED: Combined Applicant Multi-File Form Upload Route
app.post('/api/applicants', verifyUserToken, upload.fields([
  { name: 'resumeFile', maxCount: 1 },
  { name: 'candidatePhoto', maxCount: 1 }
]), async (req, res) => {
  try {
    const { fullName, email, phone, destinationCountry, purpose } = req.body;
    
    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: "Missing required details." });
    }

    // Isolate file locations cleanly from multi-field arrays
    const resumeUploaded = req.files['resumeFile'] ? req.files['resumeFile'][0] : null;
    const photoUploaded = req.files['candidatePhoto'] ? req.files['candidatePhoto'][0] : null;

    // Build model entry payload map
    const newApplicant = new Applicant({
      userId: req.user.id,
      fullName,
      email,
      phone,
      destinationCountry,
      purpose,
      fileName: resumeUploaded ? resumeUploaded.originalname : '',
      filePath: resumeUploaded ? `/uploads/${resumeUploaded.filename}` : '',
      photoPath: photoUploaded ? `/uploads/${photoUploaded.filename}` : ''
    });

    await newApplicant.save();
    res.status(201).json({ success: true, message: "Application and Photo uploaded successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Admin Credentials Validator Gateway
app.post('/api/admin/login', (req, res) => {
  const { adminId, adminPassword } = req.body;
  if (adminId === process.env.ADMIN_ID && adminPassword === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, message: 'Invalid Admin Credentials!' });
});

// 5. Admin Dashboard Applicants Monitor List Fetcher
app.get('/api/admin/applicants', verifyAdminToken, async (req, res) => {
  const applicants = await Applicant.find().sort({ submittedAt: -1 });
  res.json(applicants);
});

// --- FULL CRUD JOBS MANAGEMENT DESK ---

// Create Job Post (Admin Only)
app.post('/api/jobs', verifyAdminToken, upload.single('jobPoster'), async (req, res) => {
  try {
    const { title, description, location, salary } = req.body;
    const newJob = new Job({
      title, description, location, salary,
      posterPath: req.file ? `/uploads/${req.file.filename}` : '/uploads/default.png'
    });
    await newJob.save();
    res.status(201).json({ success: true, message: 'Job vacancy created successfully!' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Read All Jobs (Public - Shared by Services page and Dashboard)
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Update Job Post details (Admin Only)
app.put('/api/jobs/:id', verifyAdminToken, upload.single('jobPoster'), async (req, res) => {
  try {
    const { title, description, location, salary } = req.body;
    let updateFields = { title, description, location, salary };
    if (req.file) {
      updateFields.posterPath = `/uploads/${req.file.filename}`;
    }
    await Job.findByIdAndUpdate(req.params.id, updateFields);
    res.json({ success: true, message: 'Job post updated successfully!' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Delete Job Post (Admin Only)
app.delete('/api/jobs/:id', verifyAdminToken, async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Job listing deleted automatically across platforms!' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Database Connection & Engine Startup
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('🎉 Connected to MongoDB successfully!');
    app.listen(process.env.PORT || 5000, () => console.log('🚀 Server running on port 5000'));
  })
  .catch(err => console.error(err));