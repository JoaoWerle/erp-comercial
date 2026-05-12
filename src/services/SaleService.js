const SaleRepository = require('../repositories/SaleRepository');
const InventoryRepository = require('../repositories/InventoryRepository');
const pool = require('../database/db').pool;

class SaleService {
    async processSale(saleData) {
        const { items, paymentMethod, installments, fee, discount, total, tenant_id, session_id, customerId, sellerId } = saleData;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            let total_cost = 0;
            const processedItems = [];

            for (const item of items) {
                // Se o item vier com variantId, usamos ele. Se não, buscamos a variante padrão.
                let variantId = item.variantId;
                if (!variantId) {
                    const [variants] = await connection.query('SELECT id FROM product_variants WHERE product_id = ? AND tenant_id = ? LIMIT 1', [item.id, tenant_id]);
                    if (variants.length === 0) throw new Error(`Nenhuma variante encontrada para o produto ${item.name}`);
                    variantId = variants[0].id;
                }

                // Buscar dados da variante com trava
                const [variantRows] = await connection.query(
                    'SELECT v.*, p.title FROM product_variants v JOIN products p ON v.product_id = p.id WHERE v.id = ? AND v.tenant_id = ? FOR UPDATE',
                    [variantId, tenant_id]
                );
                
                if (variantRows.length === 0) throw new Error(`Variação ID ${variantId} não encontrada.`);
                const variant = variantRows[0];

                if (variant.stock_quantity < item.quantity) {
                    throw new Error(`Estoque insuficiente para "${variant.title} (${variant.sku})"`);
                }

                total_cost += (Number(variant.cost_price || 0) * Number(item.quantity));
                
                processedItems.push({
                    id: variant.product_id,
                    variantId: variant.id,
                    variantDesc: item.variantDesc,
                    name: variant.title,
                    sku: variant.sku,
                    price: Number(item.price),
                    quantity: Number(item.quantity)
                });

                // Deduzir estoque da variante
                const newQty = variant.stock_quantity - item.quantity;
                await connection.query('UPDATE product_variants SET stock_quantity = ? WHERE id = ?', [newQty, variant.id]);

                // Registrar histórico
                await connection.query(
                    'INSERT INTO inventory_history (tenant_id, product_id, variant_id, quantity_change, new_quantity, reason) VALUES (?, ?, ?, ?, ?, ?)',
                    [tenant_id, variant.product_id, variant.id, -item.quantity, newQty, `Venda PDV`]
                );
            }

            const total_revenue = Number(total);
            const total_profit = total_revenue - total_cost;

            // Criar venda
            const saleId = await SaleRepository.create({
                tenant_id,
                session_id,
                total_revenue,
                total_cost,
                total_profit,
                payment_method: paymentMethod,
                installments,
                fee,
                discount,
                customer_id: customerId,
                seller_id: sellerId
            });

            // Salvar itens processados
            await SaleRepository.updateItems(saleId, JSON.stringify(processedItems));

            await connection.commit();
            return { saleId };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async cancelSale(id, tenant_id, details) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const sale = await SaleRepository.getById(id, tenant_id);
            if (!sale) throw new Error('Venda não encontrada');
            if (sale.status === 'canceled') throw new Error('Esta venda já foi cancelada');

            const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || []);
            for (const item of items) {
                if (item.variantId) {
                    // Estornar estoque para a variante
                    await connection.query('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.variantId]);
                    
                    // Registrar histórico
                    const [vRows] = await connection.query('SELECT stock_quantity FROM product_variants WHERE id = ?', [item.variantId]);
                    const newQty = vRows[0].stock_quantity;
                    await connection.query(
                        'INSERT INTO inventory_history (tenant_id, product_id, variant_id, quantity_change, new_quantity, reason) VALUES (?, ?, ?, ?, ?, ?)',
                        [tenant_id, item.id, item.variantId, item.quantity, newQty, `Estorno Venda #${id}`]
                    );
                }
            }

            await SaleRepository.updateStatus(id, 'canceled', details);

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = new SaleService();
