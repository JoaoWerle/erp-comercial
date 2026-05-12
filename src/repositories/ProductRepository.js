const pool = require('../database/db').pool;

class ProductRepository {
    async create(productData) {
        const {
            tenant_id, title, description, price, category, brand, theme,
            condition_state, active, images, sku, barcode, has_variations, variations_data
        } = productData;

        const [result] = await pool.query(
            `INSERT INTO products (
                tenant_id, title, description, price, category, brand, theme, 
                condition_state, active, images, sku, barcode, has_variations, variations_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenant_id, title, description || '', price || 0, category || 'Geral',
                brand || '', theme || '', condition_state || 'Novo', active,
                JSON.stringify(images || []), sku || null, barcode || null, 
                has_variations || false, variations_data || null
            ]
        );
        return result.insertId;
    }

    async update(id, tenant_id, productData) {
        const {
            title, description, price, category, brand, theme,
            condition_state, active, sku, barcode, has_variations, variations_data, images
        } = productData;

        // Garantir tipos
        const hasVars = has_variations === true || has_variations === 1 || has_variations === 'true' || has_variations === '1';
        const varsData = typeof variations_data === 'object' ? JSON.stringify(variations_data) : variations_data;
        const isActive = active === true || active === 1 || active === 'true' || active === '1' || active === 'on';

        let query = `UPDATE products SET 
            title = ?, description = ?, price = ?, category = ?, brand = ?, 
            theme = ?, condition_state = ?, active = ?, sku = ?, barcode = ?, 
            has_variations = ?, variations_data = ?`;
        
        let params = [
            title, description || '', price || 0, category || 'Geral', brand || '',
            theme || '', condition_state || 'Novo', isActive ? 1 : 0, sku || null, barcode || null,
            hasVars ? 1 : 0, varsData || null
        ];

        if (images) {
            query += `, images = ?`;
            params.push(JSON.stringify(images));
        }

        query += ` WHERE id = ? AND tenant_id = ?`;
        params.push(id, tenant_id);

        await pool.query(query, params);
    }

    async getById(id, tenant_id) {
        const [rows] = await pool.query(
            'SELECT * FROM products WHERE id = ? AND tenant_id = ?',
            [id, tenant_id]
        );
        return rows[0];
    }

    async findAllByTenant(tenant_id) {
        const [rows] = await pool.query(
            `SELECT p.*, 
             (SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', v.id, 
                    'sku', v.sku, 
                    'stock_quantity', v.stock_quantity, 
                    'price', v.price,
                    'attributes_description', (
                        SELECT GROUP_CONCAT(pav.value SEPARATOR ' · ')
                        FROM product_variant_options pvo
                        JOIN product_attribute_values pav ON pvo.attribute_value_id = pav.id
                        WHERE pvo.variant_id = v.id
                    )
                )
             ) FROM product_variants v WHERE v.product_id = p.id) as variants
             FROM products p 
             WHERE p.tenant_id = ? 
             ORDER BY p.id DESC`,
            [tenant_id]
        );
        return rows.map(p => ({
            ...p,
            images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images,
            variants: typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants || [])
        }));
    }

    async findVariantsByProduct(productId, tenant_id) {
        const [rows] = await pool.query(
            `SELECT v.*,
             (SELECT GROUP_CONCAT(pav.value SEPARATOR ' · ')
              FROM product_variant_options pvo
              JOIN product_attribute_values pav ON pvo.attribute_value_id = pav.id
              WHERE pvo.variant_id = v.id) as attributes_description
             FROM product_variants v 
             WHERE v.product_id = ? AND v.tenant_id = ?`,
            [productId, tenant_id]
        );
        return rows;
    }

    async delete(id, tenant_id) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM inventory_history WHERE product_id = ? AND tenant_id = ?', [id, tenant_id]);
            const [result] = await connection.query('DELETE FROM products WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
            if (result.affectedRows === 0) throw new Error('Produto não encontrado');
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Métodos para Atributos e Variações
    async createAttribute(tenant_id, product_id, name) {
        const [result] = await pool.query(
            'INSERT INTO product_attributes (tenant_id, product_id, name) VALUES (?, ?, ?)',
            [tenant_id, product_id, name]
        );
        return result.insertId;
    }

    async createAttributeValue(attribute_id, value) {
        const [result] = await pool.query(
            'INSERT INTO product_attribute_values (attribute_id, value) VALUES (?, ?)',
            [attribute_id, value]
        );
        return result.insertId;
    }

    async createVariant(variantData) {
        const { tenant_id, product_id, sku, price, active, barcode, cost_price, stock_quantity } = variantData;
        const [result] = await pool.query(
            'INSERT INTO product_variants (tenant_id, product_id, sku, barcode, price, cost_price, stock_quantity, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [tenant_id, product_id, sku, barcode || null, price || 0, cost_price || 0, stock_quantity || 0, active]
        );
        return result.insertId;
    }

    async createVariantOption(variant_id, attribute_value_id) {
        await pool.query(
            'INSERT INTO product_variant_options (variant_id, attribute_value_id) VALUES (?, ?)',
            [variant_id, attribute_value_id]
        );
    }

    async deleteAttributesByProduct(product_id, tenant_id) {
        await pool.query(
            'DELETE FROM product_attributes WHERE product_id = ? AND tenant_id = ?',
            [product_id, tenant_id]
        );
    }

    async deleteVariantsByProduct(product_id, tenant_id) {
        await pool.query(
            'DELETE FROM product_variants WHERE product_id = ? AND tenant_id = ?',
            [product_id, tenant_id]
        );
    }
}

module.exports = new ProductRepository();
