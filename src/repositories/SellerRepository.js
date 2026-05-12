const pool = require('../database/db').pool;

class SellerRepository {
    async create(data) {
        const [result] = await pool.query(
            `INSERT INTO sellers (tenant_id, name, phone, email, commission_percentage, notes, active) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [data.tenant_id, data.name, data.phone, data.email, data.commission_percentage || 0, data.notes, data.active ?? 1]
        );
        return result.insertId;
    }

    async update(id, tenant_id, data) {
        await pool.query(
            `UPDATE sellers SET name = ?, phone = ?, email = ?, commission_percentage = ?, notes = ?, active = ?
             WHERE id = ? AND tenant_id = ?`,
            [data.name, data.phone, data.email, data.commission_percentage || 0, data.notes, data.active ?? 1, id, tenant_id]
        );
    }

    async findAllByTenant(tenant_id) {
        const [rows] = await pool.query(
            `SELECT s.*,
             (SELECT COUNT(*) FROM sales WHERE seller_id = s.id) as total_sales,
             (SELECT SUM(total_revenue) FROM sales WHERE seller_id = s.id) as total_revenue
             FROM sellers s WHERE tenant_id = ? ORDER BY name ASC`,
            [tenant_id]
        );
        return rows;
    }

    async findById(id, tenant_id) {
        const [rows] = await pool.query('SELECT * FROM sellers WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
        return rows[0];
    }

    async getActiveSellers(tenant_id) {
        const [rows] = await pool.query('SELECT id, name FROM sellers WHERE tenant_id = ? AND active = 1 ORDER BY name ASC', [tenant_id]);
        return rows;
    }
}

module.exports = new SellerRepository();
