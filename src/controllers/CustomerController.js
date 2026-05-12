const CustomerRepository = require('../repositories/CustomerRepository');

class CustomerController {
    async create(req, res) {
        try {
            const customerId = await CustomerRepository.create({
                ...req.body,
                tenant_id: req.user.tenant_id
            });
            res.status(201).json({ id: customerId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            await CustomerRepository.update(req.params.id, req.user.tenant_id, req.body);
            res.json({ message: 'Cliente atualizado com sucesso' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async list(req, res) {
        try {
            const customers = await CustomerRepository.findAllByTenant(req.user.tenant_id);
            res.json(customers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async search(req, res) {
        try {
            const customers = await CustomerRepository.search(req.user.tenant_id, req.query.q || '');
            res.json(customers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new CustomerController();
