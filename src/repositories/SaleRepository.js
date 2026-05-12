const pool = require('../database/db').pool;

class SaleRepository {
    async create(saleData) {
        const {
            tenant_id, session_id, total_revenue, total_cost, total_profit, 
            payment_method, installments, fee, discount, status,
            customer_id, seller_id
        } = saleData;

        const [result] = await pool.query(
            `INSERT INTO sales 
            (tenant_id, session_id, total_revenue, total_cost, total_profit, payment_method, installments, fee, discount, sale_date, sale_time, status, customer_id, seller_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?)`,
            [
                tenant_id, session_id, total_revenue, total_cost, total_profit, 
                payment_method, installments, fee, discount, status || 'completed',
                customer_id || null, seller_id || null
            ]
        );
        return result.insertId;
    }

    async updateItems(saleId, itemsJson) {
        await pool.query('UPDATE sales SET items = ? WHERE id = ?', [itemsJson, saleId]);
    }

    async getById(id, tenant_id) {
        const [rows] = await pool.query('SELECT * FROM sales WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
        return rows[0];
    }

    async updateStatus(id, status, details = {}) {
        const { reason, responsible } = details;
        await pool.query(
            'UPDATE sales SET status = ?, cancel_reason = ?, cancel_responsible = ?, canceled_at = NOW() WHERE id = ?',
            [status, reason || null, responsible || null, id]
        );
    }
}

module.exports = new SaleRepository();
