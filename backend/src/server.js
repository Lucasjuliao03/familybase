require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const isVercel = !!process.env.VERCEL;

// Criar diretórios locais apenas fora da Vercel (sistema de arquivos ephemeral)
if (!isVercel) {
  const uploadPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
  const dataPath = path.resolve('./data');
  fs.mkdirSync(uploadPath, { recursive: true });
  fs.mkdirSync(path.join(uploadPath, 'avatars'), { recursive: true });
  fs.mkdirSync(path.join(uploadPath, 'family-logos'), { recursive: true });
  fs.mkdirSync(path.join(uploadPath, 'health'), { recursive: true });
  fs.mkdirSync(dataPath, { recursive: true });
}

// Initialize database
const { initDatabase } = require('./database/init');
const db = initDatabase();

async function logDatabaseReachable() {
  try {
    await db.prepare('SELECT 1 AS ok').get();
    console.log('✅ Base de dados: ligação verificada');
  } catch (e) {
    console.warn('⚠️  Base de dados inacessível:', e.code || e.message);
    const url = process.env.DATABASE_URL || '';
    const host = url.match(/@([^/?:]+)/);
    if (host) console.warn('   Host em DATABASE_URL:', host[1]);
    console.warn('   No Supabase: Project Settings → Database → Connection string (URI).');
  }
}
logDatabaseReachable();

async function seedMasterUser() {
  const masterEmail = process.env.MASTER_EMAIL;
  const masterPassword = process.env.MASTER_PASSWORD;
  const masterName = process.env.MASTER_NAME || 'Master Admin';

  if (!masterEmail || !masterPassword) {
    console.log('ℹ️  MASTER_EMAIL/MASTER_PASSWORD not set - skipping master seed');
    return;
  }

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(masterEmail);
  if (!existing) {
    const hashed = bcrypt.hashSync(masterPassword, 10);
    try {
      await db.prepare("INSERT INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, 'master', 'active')")
        .run(uuidv4(), masterName, masterEmail, hashed);
      console.log('✅ Master user created');
    } catch(e) {
      console.error('Could not create master user:', e.message);
    }
  } else {
    console.log('ℹ️  Master user already exists');
  }
}

seedMasterUser();
const { seedSystemModules } = require('./lib/familyModuleService');
seedSystemModules(db).then(() => console.log('✅ System modules seeded')).catch(e => console.error('Failed to seed modules:', e.message));

// Cron jobs apenas fora da Vercel (serverless não suporta processos persistentes)
if (!isVercel) {
  const { startCronJobs } = require('./cron/taskGenerator');
  startCronJobs(db);
} else {
  console.log('ℹ️ Vercel serverless: cron jobs disabled. Use Supabase pg_cron for scheduled tasks.');
}

const app = express();
const PORT = process.env.PORT || 3001;

const { supabaseProxyRouter } = require('./middleware/supabaseProxy');

const extraCors = (process.env.CORS_EXTRA_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// CORS — aceita o frontend na Vercel e localhost
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  ...extraCors,
].filter(Boolean);

const supabaseCorsHeaders = [
  'Content-Type',
  'Authorization',
  'apikey',
  'x-client-info',
  'x-supabase-api-version',
  'prefer',
  'accept-profile',
  'content-profile',
  'accept',
  'range',
  'if-none-match',
];

app.use(cors({
  origin: (origin, callback) => {
    // Permite sem origin (Postman, curl) ou origens permitidas
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado para origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: supabaseCorsHeaders,
}));

// Proxy Supabase antes de express.json() para não consumir o body (auth, storage, REST)
app.use('/api/supabase', supabaseProxyRouter(process.env.SUPABASE_URL));
if (process.env.SUPABASE_URL) {
  console.log('↪ Proxy Supabase ativo em /api/supabase →', process.env.SUPABASE_URL.replace(/\/$/, ''));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir uploads locais apenas fora da Vercel
if (!isVercel) {
  const uploadPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
  app.use('/uploads', express.static(uploadPath));
}

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
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: isVercel ? 'vercel' : 'local' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Em ambiente local, inicia o servidor HTTP normalmente
// Na Vercel, exportamos o app como handler serverless
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`🚀 FamilyBase API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
