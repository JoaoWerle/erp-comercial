const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../.env') });

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
                logo_url VARCHAR(255),
                primary_color VARCHAR(20) DEFAULT '#2563eb',
                secondary_color VARCHAR(20) DEFAULT '#f3f4f6',
                tertiary_color VARCHAR(20) DEFAULT '#ffffff',
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
                role VARCHAR(20) DEFAULT 'user',
                active BOOLEAN DEFAULT true,
                inactive_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT,
                title VARCHAR(255) NOT NULL,
                sku VARCHAR(100) UNIQUE,
                barcode VARCHAR(100),
                description TEXT,
                price DECIMAL(10, 2) NOT NULL,
                cost_price DECIMAL(10, 2) DEFAULT 0,
                category VARCHAR(100),
                brand VARCHAR(100),
                theme VARCHAR(50),
                condition_state VARCHAR(50),
                availableQuantity INT DEFAULT 0,
                active BOOLEAN DEFAULT true,
                has_variations BOOLEAN DEFAULT false,
                variations_data JSON,
                images JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )
        `);

        try { await pool.query('ALTER TABLE products ADD COLUMN cost_price DECIMAL(10, 2) DEFAULT 0'); } catch(e) {}
        try { await pool.query('ALTER TABLE products ADD COLUMN active BOOLEAN DEFAULT true'); } catch(e) {}
        try { await pool.query('ALTER TABLE users MODIFY COLUMN role VARCHAR(20) DEFAULT \'user\''); } catch(e) {}
        try { await pool.query('ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT true'); } catch(e) {}
        try { await pool.query('ALTER TABLE users ADD COLUMN inactive_reason TEXT'); } catch(e) {}
        
        // Migrações tabela tenants
        try { await pool.query("ALTER TABLE tenants ADD COLUMN logo_url VARCHAR(255)"); } catch(e) {}
        try { await pool.query("ALTER TABLE tenants ADD COLUMN primary_color VARCHAR(20) DEFAULT '#2563eb'"); } catch(e) {}
        try { await pool.query("ALTER TABLE tenants ADD COLUMN secondary_color VARCHAR(20) DEFAULT '#f3f4f6'"); } catch(e) {}
        try { await pool.query("ALTER TABLE tenants ADD COLUMN tertiary_color VARCHAR(20) DEFAULT '#ffffff'"); } catch(e) {}

        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_attributes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT,
                product_id INT,
                name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                product_id INT NOT NULL,
                variant_id INT NULL, 
                quantity_change INT NOT NULL,
                new_quantity INT NOT NULL, 
                reason VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            );
        `)
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_attribute_values (
                id INT AUTO_INCREMENT PRIMARY KEY,
                attribute_id INT,
                value VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (attribute_id) REFERENCES product_attributes(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_variants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT,
                product_id INT,
                sku VARCHAR(100) UNIQUE,
                barcode VARCHAR(100),
                price DECIMAL(10, 2),
                image VARCHAR(255),
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_variant_options (
                id INT AUTO_INCREMENT PRIMARY KEY,
                variant_id INT,
                attribute_value_id INT,
                FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
                FOREIGN KEY (attribute_value_id) REFERENCES product_attribute_values(id) ON DELETE CASCADE
            )
        `);

        
        // Sessões de caixa
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                user_id INT NULL,
                opening_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                status VARCHAR(30) NOT NULL DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME NULL,
                FOREIGN KEY (tenant_id)
                    REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id)
                    REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB
        `);

        // Clientes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                cpf VARCHAR(14) NULL,
                phone VARCHAR(30) NULL,
                email VARCHAR(255) NULL,
                birth_date DATE NULL,
                notes TEXT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id)
                    REFERENCES tenants(id) ON DELETE CASCADE,
                INDEX idx_customers_tenant (tenant_id),
                INDEX idx_customers_name (name)
            ) ENGINE=InnoDB
        `);

        // Vendedores
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sellers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(30) NULL,
                email VARCHAR(255) NULL,
                commission_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
                notes TEXT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id)
                    REFERENCES tenants(id) ON DELETE CASCADE,
                INDEX idx_sellers_tenant (tenant_id),
                INDEX idx_sellers_name (name)
            ) ENGINE=InnoDB
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                session_id INT NULL,
                customer_id INT NULL,
                seller_id INT NULL,
                total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                total_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                total_profit DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                items JSON NULL,
                payment_method VARCHAR(50) NOT NULL,
                installments INT DEFAULT 1,
                fee DECIMAL(10, 2) DEFAULT 0.00,
                discount DECIMAL(10, 2) DEFAULT 0.00,
                sale_date DATE NOT NULL,
                sale_time TIME NOT NULL,
                status VARCHAR(50) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                cancel_reason VARCHAR(255) NULL,
                cancel_responsible VARCHAR(255) NULL,
                canceled_at DATETIME NULL,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
                FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE SET NULL
            );
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
                [1, 'Administrador', 'admin@erp.com', hashedPassword, 'admin']
            );
            console.log('✅ Usuário admin criado (admin@erp.com / admin123).');
        }

        console.log('✅ Banco de dados MySQL inicializado com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao inicializar o banco de dados MySQL:', error);
    }
}

module.exports = { initDB, pool };
