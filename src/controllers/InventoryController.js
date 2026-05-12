const InventoryService = require('../services/InventoryService');
const InventoryRepository = require('../repositories/InventoryRepository');

class InventoryController {
    async replenish(req, res) {
        try {
            const { productId, variantId, quantityToAdd, reason, cost_price } = req.body;
            const tenant_id = req.user.tenant_id;

            await InventoryService.replenish({
                productId, variantId, quantityToAdd, reason, cost_price, tenant_id
            });

            res.json({ message: 'Estoque atualizado com sucesso!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message || 'Erro ao atualizar estoque' });
        }
    }

    async bulkReplenish(req, res) {
        try {
            const { productId, reason, entries } = req.body;
            const tenant_id = req.user.tenant_id;

            await InventoryService.bulkReplenish({
                productId, reason, entries, tenant_id
            });

            res.json({ message: 'Estoque atualizado com sucesso!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message || 'Erro ao atualizar estoque' });
        }
    }

    async getHistory(req, res) {
        try {
            const productId = req.params.productId;
            const tenant_id = req.user.tenant_id;
            const history = await InventoryRepository.getHistoryByProduct(productId, tenant_id);
            res.json(history);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar histórico' });
        }
    }
}

module.exports = new InventoryController();
