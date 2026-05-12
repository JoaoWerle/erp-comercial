const SaleService = require('../services/SaleService');
const pool = require('../database/db').pool;

class SaleController {
    async create(req, res) {
        try {
            const { items, paymentMethod, installments, fee, discount, total, customerId, sellerId } = req.body;
            const tenant_id = req.user.tenant_id;

            // Verificar sessão de caixa
            const [cashSessionRows] = await pool.query('SELECT id FROM cash_sessions WHERE tenant_id = ? AND status = "open"', [tenant_id]);
            if (cashSessionRows.length === 0) {
                return res.status(403).json({ error: 'O caixa precisa estar ABERTO para realizar vendas.' });
            }
            const session_id = cashSessionRows[0].id;

            const result = await SaleService.processSale({
                items, paymentMethod, installments, fee, discount, total, tenant_id, session_id, customerId, sellerId
            });

            res.json({ message: 'Venda finalizada com sucesso!', ...result });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message || 'Erro ao processar venda' });
        }
    }

    async cancel(req, res) {
        try {
            const { id } = req.params;
            const { reason, responsible } = req.body;
            const tenant_id = req.user.tenant_id;

            await SaleService.cancelSale(id, tenant_id, { reason, responsible });
            res.json({ message: 'Venda cancelada e estoque estornado com sucesso!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message || 'Erro ao cancelar venda' });
        }
    }
}

module.exports = new SaleController();
