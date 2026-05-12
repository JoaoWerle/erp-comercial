const pool = require('../database/db').pool;

class CustomerRepository {
    async create(data) {
        const [result] = await pool.query(
            `INSERT INTO customers (tenant_id, name, cpf, phone, email, birth_date, notes, active) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.tenant_id, data.name, data.cpf, data.phone, data.email, data.birth_date, data.notes, data.active ?? 1]
        );
        return result.insertId;
    }

    async update(id, tenant_id, data) {
        await pool.query(
            `UPDATE customers SET name = ?, cpf = ?, phone = ?, email = ?, birth_date = ?, notes = ?, active = ?
             WHERE id = ? AND tenant_id = ?`,
            [data.name, data.cpf, data.phone, data.email, data.birth_date, data.notes, data.active ?? 1, id, tenant_id]
        );
    }

    async findAllByTenant(tenant_id) {
        const [rows] = await pool.query(
            `SELECT c.*, 
             (SELECT COUNT(*) FROM sales WHERE customer_id = c.id) as total_purchases,
             (SELECT SUM(total_revenue) FROM sales WHERE customer_id = c.id) as total_spent,
             (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id) as last_purchase
             FROM customers c WHERE tenant_id = ? ORDER BY name ASC`,
            [tenant_id]
        );
        return rows;
    }

    async findById(id, tenant_id) {
        const [rows] = await pool.query('SELECT * FROM customers WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
        return rows[0];
    }

    async search(tenant_id, term) {
        const query = term.toLowerCase();
        const [rows] = await pool.query(
            `SELECT id, name, phone, cpf FROM customers 
             WHERE tenant_id = ? AND (name LIKE ? OR phone LIKE ? OR cpf LIKE ?) 
             LIMIT 10`,
            [tenant_id, `%${query}%`, `%${query}%`, `%${query}%`]
        );
        return rows;
    }
}

module.exports = new CustomerRepository();
