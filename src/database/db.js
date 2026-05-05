const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erp_comercial',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDB() {
    try {
        // Create the database if it doesn't exist
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });
        
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'erp_comercial'}`);
        await connection.end();

        // Initialize tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                domain VARCHAR(255) UNIQUE,
                theme_id VARCHAR(50) DEFAULT 'kids',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('superadmin', 'shopkeeper') DEFAULT 'shopkeeper',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2) NOT NULL,
                category VARCHAR(100),
                condition_state VARCHAR(50),
                availableQuantity INT DEFAULT 0,
                images JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )
        `);

        // Seed Default Tenant & User
        const [tenants] = await pool.query('SELECT * FROM tenants WHERE id = 1');
        if (tenants.length === 0) {
            await pool.query(`INSERT INTO tenants (name, domain, theme_id) VALUES ('Minha Loja Padrão', 'minhaloja.com', 'kids')`);
            console.log('✅ Tenant padrão criado.');
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', ['admin@erp.com']);
        if (users.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.query(
                `INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)`,
                [1, 'Administrador', 'admin@erp.com', hashedPassword, 'superadmin']
            );
            console.log('✅ Usuário admin criado (admin@erp.com / admin123).');
        }

        console.log('✅ Banco de dados MySQL inicializado com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao inicializar o banco de dados MySQL:', error);
    }
}

module.exports = { pool, initDB };
