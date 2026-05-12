const ProductService = require('../services/ProductService');
const ProductRepository = require('../repositories/ProductRepository');

class ProductController {
    async create(req, res) {
        try {
            const productData = this.mapRequestToProduct(req);
            const id = await ProductService.createProduct(productData);
            res.status(201).json({ id, message: 'Produto cadastrado com sucesso!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao salvar produto' });
        }
    }

    async update(req, res) {
        try {
            console.log('Update Body:', req.body);
            const id = req.params.id;
            const tenant_id = req.user.tenant_id;
            const productData = this.mapRequestToProduct(req);
            console.log('Mapped Data:', productData);
            
            await ProductService.updateProduct(id, tenant_id, productData);
            res.json({ message: 'Produto atualizado com sucesso!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao atualizar produto' });
        }
    }

    async delete(req, res) {
        try {
            const id = req.params.id;
            const tenant_id = req.user.tenant_id;
            await ProductService.deleteProduct(id, tenant_id);
            res.json({ message: 'Produto excluído com sucesso!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao excluir produto' });
        }
    }

    async list(req, res) {
        try {
            const tenant_id = req.user.tenant_id;
            const products = await ProductRepository.findAllByTenant(tenant_id);
            res.json(products);
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar produtos' });
        }
    }

    async getVariants(req, res) {
        try {
            const productId = req.params.id;
            const tenant_id = req.user.tenant_id;
            const variants = await ProductRepository.findVariantsByProduct(productId, tenant_id);
            res.json(variants);
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar variações' });
        }
    }

    mapRequestToProduct(req) {
        const { 
            title, description, price, category, brand, theme, 
            condition_state, active, sku, barcode, has_variations, variations_data 
        } = req.body;
        
        const tenant_id = req.user.tenant_id;
        const isActive = active === 'false' || active === false || active === '0' || active === 0 ? false : true;
        const hasVars = has_variations === 'true' || has_variations === true || has_variations === 'on' || has_variations === '1' || has_variations === 1;

        let images = null;
        if (req.file) {
            images = [`http://localhost:4000/uploads/${req.file.filename}`];
        }

        return {
            tenant_id, title, description, price, category, brand, theme,
            condition_state, active: isActive, images, sku, barcode, 
            has_variations: hasVars, variations_data
        };
    }
}

module.exports = new ProductController();
