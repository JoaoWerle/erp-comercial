const mysql = require('mysql2/promise');
require('dotenv').config();

async function testSaleInsert() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const mockItems = [
            { id: 1, name: 'Produto Teste Real', price: 100, quantity: 1 }
        ];
        
        console.log('Testando inserção de venda direta no banco...');
        
        const [result] = await pool.query(
            `INSERT INTO sales (tenant_id, total_revenue, total_cost, total_profit, items, payment_method, installments, sale_date, sale_time) 
             VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME())`,
            [1, 100, 40, 60, JSON.stringify(mockItems), 'dinheiro', 1]
        );

        console.log('Venda inserida com ID:', result.insertId);
        
        const [rows] = await pool.query('SELECT items FROM sales WHERE id = ?', [result.insertId]);
        console.log('Conteúdo do campo items no banco:', rows[0].items);

    } catch (err) {
        console.error('ERRO NO TESTE:', err.message);
    } finally {
        await pool.end();
    }
}

testSaleInsert();
