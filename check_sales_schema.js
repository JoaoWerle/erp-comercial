const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'erp_comercial'
    });

    try {
        const [rows] = await pool.query('DESCRIBE sales');
        console.log('--- ESTRUTURA DA TABELA SALES ---');
        console.table(rows);
    } catch (err) {
        console.error('Erro ao verificar esquema:', err.message);
    } finally {
        await pool.end();
    }
}

checkSchema();
