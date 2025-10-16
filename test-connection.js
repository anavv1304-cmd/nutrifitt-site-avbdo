const { Pool } = require('pg');
require('dotenv').config();

async function testConnection() {
    console.log('🔍 Testando conexão com PostgreSQL...');
    
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        const client = await pool.connect();
        
        // Teste básico
        const result = await client.query('SELECT current_user, current_database(), version()');
        console.log('✅ Conexão bem-sucedida!');
        console.log('👤 Usuário:', result.rows[0].current_user);
        console.log('🏛️  Banco:', result.rows[0].current_database);
        
        // Verificar tabelas
        const tables = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('📋 Tabelas encontradas:');
        tables.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });
        
        // Verificar usuários
        const users = await client.query('SELECT id, name, email, role FROM users');
        console.log('👥 Usuários no sistema:');
        users.rows.forEach(user => {
            console.log(`  - ${user.name} (${user.email}) - ${user.role}`);
        });
        
        // Verificar planos
        const plans = await client.query('SELECT id, name, price FROM subscription_plans');
        console.log('💰 Planos disponíveis:');
        plans.rows.forEach(plan => {
            console.log(`  - ${plan.name}: R$ ${plan.price}`);
        });
        
        client.release();
        await pool.end();
        
        console.log('\n🎉 Tudo funcionando perfeitamente!');
        console.log('🚀 Próximo passo: npm run dev');
        
    } catch (error) {
        console.error('❌ Erro na conexão:', error.message);
        console.error('💡 Verifique suas configurações no arquivo .env');
        process.exit(1);
    }
}

testConnection();
