const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuração do banco
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://nutrifitt-site-avbdo.netlify.app',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ROTA NOVA: Root amigável
app.get('/', (req, res) => {
  res.send('🚀 Bem-vindo à API NutriFitt!');
});

// Rota de teste
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
  });
});

// Rota de teste do banco
app.get('/api/test-db', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT current_user, current_database');
    const tables = await client.query(
      `SELECT tablename FROM information_schema.tables WHERE table_schema='public' ORDER BY tablename`
    );
    client.release();
    res.json({
      connection: 'success',
      user: result.rows[0].current_user,
      database: result.rows[0].current_database,
      tables: tables.rows.map(row => row.tablename),
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Rota de login básica
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM users WHERE email = $1 AND active = true',
      [email]
    );
    if (result.rows.length === 0) {
      client.release();
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.passwordhash);
    if (!isValid) {
      client.release();
      return res.status(401).json({ error: 'Senha inválida' });
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    const { passwordhash, ...userData } = user;
    client.release();
    res.json({ accessToken: token, user: userData });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Middleware de autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token necessário' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
}

// Rota protegida de teste
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT id, name, email, role, createdat FROM users WHERE id = $1',
      [req.user.userId]
    );
    client.release();
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`NutriFitt API rodando na porta ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Teste DB: http://localhost:${PORT}/api/test-db`);
  console.log(`Admin login: admin@nutrifitt.com / admin123`);
});

module.exports = app;
