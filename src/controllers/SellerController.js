const SellerRepository = require('../repositories/SellerRepository');

class SellerController {
    async create(req, res) {
        try {
            const sellerId = await SellerRepository.create({
                ...req.body,
                tenant_id: req.user.tenant_id
            });
            res.status(201).json({ id: sellerId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            await SellerRepository.update(req.params.id, req.user.tenant_id, req.body);
            res.json({ message: 'Vendedor atualizado com sucesso' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async list(req, res) {
        try {
            const sellers = await SellerRepository.findAllByTenant(req.user.tenant_id);
            res.json(sellers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async listActive(req, res) {
        try {
            const sellers = await SellerRepository.getActiveSellers(req.user.tenant_id);
            res.json(sellers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new SellerController();
