const pool = require('../database/db').pool;

class InventoryRepository {
    async getVariantWithProduct(variantId, tenant_id) {
        const [rows] = await pool.query(
            `SELECT v.*, p.title as product_title 
             FROM product_variants v 
             JOIN products p ON v.product_id = p.id 
             WHERE v.id = ? AND v.tenant_id = ?`,
            [variantId, tenant_id]
        );
        return rows[0];
    }

    async updateStock(variantId, newQuantity, cost_price = null) {
        let query = 'UPDATE product_variants SET stock_quantity = ?';
        let params = [newQuantity];

        if (cost_price !== null) {
            query += ', cost_price = ?';
            params.push(cost_price);
        }

        query += ' WHERE id = ?';
        params.push(variantId);

        await pool.query(query, params);
    }

    async addHistory(data) {
        const { tenant_id, product_id, variant_id, quantity_change, new_quantity, reason } = data;
        await pool.query(
            `INSERT INTO inventory_history 
            (tenant_id, product_id, variant_id, quantity_change, new_quantity, reason) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [tenant_id, product_id, variant_id, quantity_change, new_quantity, reason]
        );
    }

    async getHistoryByProduct(productId, tenant_id) {
        const [rows] = await pool.query(
            `SELECT h.*, v.sku as variant_sku,
             (SELECT GROUP_CONCAT(pav.value SEPARATOR ' · ')
              FROM product_variant_options pvo
              JOIN product_attribute_values pav ON pvo.attribute_value_id = pav.id
              WHERE pvo.variant_id = v.id) as variant_description
             FROM inventory_history h 
             LEFT JOIN product_variants v ON h.variant_id = v.id 
             WHERE h.product_id = ? AND h.tenant_id = ? 
             ORDER BY h.created_at DESC`,
            [productId, tenant_id]
        );
        return rows;
    }
}

module.exports = new InventoryRepository();
