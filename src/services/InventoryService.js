const InventoryRepository = require('../repositories/InventoryRepository');
const pool = require('../database/db').pool;

class InventoryService {
    async replenish(data) {
        const { variantId, quantityToAdd, reason, cost_price, tenant_id } = data;
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const variant = await InventoryRepository.getVariantWithProduct(variantId, tenant_id);
            if (!variant) throw new Error('Variante não encontrada');

            const currentQty = variant.stock_quantity || 0;
            const newQty = currentQty + parseInt(quantityToAdd);

            // Atualizar estoque na variante
            await InventoryRepository.updateStock(variantId, newQty, cost_price);

            // Registrar histórico
            await InventoryRepository.addHistory({
                tenant_id,
                product_id: variant.product_id,
                variant_id: variant.id,
                quantity_change: quantityToAdd,
                new_quantity: newQty,
                reason: reason || 'Reposição de Estoque'
            });

            await connection.commit();
            return { newQuantity: newQty };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async bulkReplenish(data) {
        const { productId, reason, entries, tenant_id } = data;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            for (const entry of entries) {
                const { variantId, quantityToAdd, cost_price } = entry;

                // Buscar variante atual para cálculo e trava de linha
                const [vRows] = await connection.query(
                    'SELECT stock_quantity FROM product_variants WHERE id = ? AND tenant_id = ? FOR UPDATE',
                    [variantId, tenant_id]
                );
                
                if (vRows.length === 0) throw new Error(`Variação ${variantId} não encontrada.`);
                
                const currentQty = vRows[0].stock_quantity || 0;
                const newQty = currentQty + Number(quantityToAdd);

                // Atualizar estoque e custo
                await connection.query(
                    'UPDATE product_variants SET stock_quantity = ?, cost_price = ? WHERE id = ?',
                    [newQty, cost_price, variantId]
                );

                // Histórico
                await connection.query(
                    `INSERT INTO inventory_history 
                    (tenant_id, product_id, variant_id, quantity_change, new_quantity, reason) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [tenant_id, productId, variantId, quantityToAdd, newQty, reason || 'Reposição em Massa']
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = new InventoryService();
