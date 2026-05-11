require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Ensure directories exist
const uploadPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
const dataPath = path.resolve('./data');
fs.mkdirSync(uploadPath, { recursive: true });
fs.mkdirSync(path.join(uploadPath, 'avatars'), { recursive: true });
fs.mkdirSync(path.join(uploadPath, 'family-logos'), { recursive: true });
fs.mkdirSync(path.join(uploadPath, 'health'), { recursive: true });
fs.mkdirSync(dataPath, { recursive: true });

// Initialize database
const { initDatabase } = require('./database/init');
const db = initDatabase();

async function seedMasterUser() {
  const masterEmail = process.env.MASTER_EMAIL;
  const masterPassword = process.env.MASTER_PASSWORD;
  const masterName = process.env.MASTER_NAME || 'Master Admin';

  if (!masterEmail || !masterPassword) {
    console.log('ℹ️  MASTER_EMAIL/MASTER_PASSWORD not set in .env - skipping master seed');
    return;
  }

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(masterEmail);
  if (!existing) {
    const hashed = bcrypt.hashSync(masterPassword, 10);
    try {
      await db.prepare("INSERT INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, 'master', 'active')")
        .run(uuidv4(), masterName, masterEmail, hashed);
      console.log('✅ Master user created securely');
    } catch(e) {
      console.error('Could not create master user:', e.message);
    }
  } else {
    console.log('ℹ️  Master user already exists');
  }
}

seedMasterUser();

// Start cron jobs for recurring tasks
const { startCronJobs } = require('./cron/taskGenerator');
startCronJobs(db);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadPath));

// Make db available to routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Routes
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/families', require('./modules/families/families.routes'));
app.use('/api/tasks', require('./modules/tasks/tasks.routes'));
app.use('/api/grades', require('./modules/grades/grades.routes'));
app.use('/api/gamification', require('./modules/gamification/gamification.routes'));
app.use('/api/allowance', require('./modules/allowance/allowance.routes'));
app.use('/api/calendar', require('./modules/calendar/calendar.routes'));
app.use('/api/notifications', require('./modules/notifications/notifications.routes'));
app.use('/api/reports', require('./modules/reports/reports.routes'));
app.use('/api/master', require('./modules/master/master.routes'));
app.use('/api/shopping', require('./modules/shopping/shopping.routes'));
app.use('/api/health', require('./modules/health/health.routes'));
app.use('/api/mural', require('./modules/mural/mural.routes'));
app.use('/api/push', require('./modules/push/push.routes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 FamilyBase API running on http://localhost:${PORT}`);
});

module.exports = app;
