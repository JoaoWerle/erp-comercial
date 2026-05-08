const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTriggers() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log('--- TRIGGERS ---');
        const [rows] = await pool.query('SHOW TRIGGERS');
        console.table(rows);
        
        console.log('--- COLUMNS IN SALES ---');
        const [cols] = await pool.query('DESCRIBE sales');
        console.table(cols);
    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        await pool.end();
    }
}

checkTriggers();
