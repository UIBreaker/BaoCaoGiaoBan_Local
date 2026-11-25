const express = require('express');
const cors = require('cors');
const path = require('node:path');
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const staffRoutes = require('./routes/staffRoutes');
const customFormRoutes = require('./routes/customFormRoutes');
const { auth } = require('./middleware/auth');
const { getStaffByDepartment } = require('./controllers/staffController');
const errorHandler = require('./middleware/errorHandler');
const pool = require('./config/db');

const app = express();

// High performance Gzip compression for all JSON / API responses (with safe fallback)
try {
  const compression = require('compression');
  app.use(compression({
    threshold: 1024,
    level: 6
  }));
} catch (e) {
  // Gracefully fallback if compression is not installed
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'");
  next();
});

app.get('/api', (req, res) => {
  res.json({
    status: 'success',
    message: 'Hệ thống API Báo cáo Giao ban đang hoạt động bình thường',
    timestamp: new Date().toISOString()
  });
});

const { getLatestChangelog } = require('./controllers/changelogController');

// Public System Changelog API
app.get('/api/system/changelog/latest', getLatestChangelog);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/custom-forms', customFormRoutes);
app.get('/api/staff-by-department', auth, getStaffByDepartment);

app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'API route not found.' }));
const frontend = path.resolve(__dirname, '../../client/dist');
app.use(express.static(frontend));
app.get('/{*route}', (req, res) => res.sendFile(path.join(frontend, 'index.html')));

// Error Handler
app.use(errorHandler);

module.exports = app;
