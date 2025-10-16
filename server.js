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
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

// Rota de teste
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0'
    });
});

// Rota de teste do banco
app.get('/api/test-db', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT current_user, current_database()');
        const tables = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        client.release();
        
        res.json({
            connection: 'success',
            user: result.rows[0].current_user,
            database: result.rows[0].current_database,
            tables: tables.rows.map(row => row.table_name)
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
        
        console.log('🔍 Login attempt:', { email, password }); // DEBUG
        
        const client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM users WHERE email = $1 AND active = true',
            [email]
        );
        
        console.log('👥 Users found:', result.rows.length); // DEBUG
        
        if (result.rows.length === 0) {
            console.log('❌ User not found'); // DEBUG
            client.release();
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        
        const user = result.rows[0];
        console.log('👤 User data:', { id: user.id, email: user.email, role: user.role }); // DEBUG
        console.log('🔒 Password hash from DB:', user.password_hash); // DEBUG
        
        // Verificar senha
        const isValid = await bcrypt.compare(password, user.password_hash);
        console.log('🔐 Password valid:', isValid); // DEBUG
        
        if (!isValid) {
            console.log('❌ Invalid password'); // DEBUG
            client.release();
            return res.status(401).json({ error: 'Senha inválida' });
        }
        
        // Gerar token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // Remover senha da resposta
        const { password_hash, ...userData } = user;
        
        client.release();
        
        console.log('✅ Login successful'); // DEBUG
        
        res.json({
            access_token: token,
            user: userData
        });
        
    } catch (error) {
        console.error('💥 Login error:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token necessário' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Rota protegida de teste
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
            [req.user.userId]
        );
        
        client.release();
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 NutriFitt API rodando na porta ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 Teste DB: http://localhost:${PORT}/api/test-db`);
    console.log(`👤 Admin login: admin@nutrifitt.com / admin123`);
});

module.exports = app;
