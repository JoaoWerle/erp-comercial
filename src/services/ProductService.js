const ProductRepository = require('../repositories/ProductRepository');
const pool = require('../database/db').pool;

class ProductService {
    async createProduct(productData) {
        const productId = await ProductRepository.create(productData);

        if (productData.has_variations && productData.variations_data) {
            await this.processVariations(productId, productData.tenant_id, productData.variations_data);
        } else {
            // Criar variante padrão para produtos simples
            await ProductRepository.createVariant({
                tenant_id: productData.tenant_id,
                product_id: productId,
                sku: productData.sku || `SKU-${productId}`,
                barcode: productData.barcode || null,
                price: productData.price,
                active: true
            });
        }

        return productId;
    }

    async updateProduct(id, tenant_id, productData) {
        // Buscar estado atual antes de atualizar
        const currentProduct = await ProductRepository.getById(id, tenant_id);
        if (!currentProduct) throw new Error('Produto não encontrado');

        const oldHasVars = !!currentProduct.has_variations;
        const newHasVars = productData.has_variations === true || productData.has_variations === 'true' || productData.has_variations === 1;
        
        // Normalizar strings de JSON para comparação
        const oldVarsDataStr = currentProduct.variations_data ? (typeof currentProduct.variations_data === 'string' ? currentProduct.variations_data : JSON.stringify(currentProduct.variations_data)) : null;
        const newVarsDataStr = productData.variations_data ? (typeof productData.variations_data === 'string' ? productData.variations_data : JSON.stringify(productData.variations_data)) : null;

        await ProductRepository.update(id, tenant_id, productData);

        // Se mudou de Simples para Variação OU se os atributos mudaram
        if (newHasVars && (oldHasVars !== newHasVars || oldVarsDataStr !== newVarsDataStr)) {
            // Limpa dados antigos para reconstruir
            // ORDEM IMPORTANTE: Primeiro variantes para limpar product_variant_options
            await ProductRepository.deleteVariantsByProduct(id, tenant_id);
            await ProductRepository.deleteAttributesByProduct(id, tenant_id);
            
            await this.processVariations(id, tenant_id, productData.variations_data);
        } 
        else if (newHasVars && oldHasVars) {
            // Se já era variação e continua igual, apenas atualizamos preços das variantes (se desejado)
            // Ou não fazemos nada se o objetivo era apenas atualizar o produto pai
        }
        else if (!newHasVars) {
            // Caso seja um produto simples (ou convertido para simples)
            const [countRows] = await pool.query('SELECT COUNT(*) as count FROM product_variants WHERE product_id = ?', [id]);
            
            if (countRows[0].count !== 1 || oldHasVars) {
                // Se era variação e virou simples, ou se não tinha variante, recria a padrão
                await ProductRepository.deleteAttributesByProduct(id, tenant_id);
                await ProductRepository.deleteVariantsByProduct(id, tenant_id);
                
                await ProductRepository.createVariant({
                    tenant_id,
                    product_id: id,
                    sku: productData.sku || `SKU-${id}`,
                    barcode: productData.barcode || null,
                    price: productData.price,
                    active: true
                });
            } else {
                // Já era simples e continua simples, apenas atualiza SKU/Barcode/Preço da variante única
                await pool.query(
                    'UPDATE product_variants SET sku = ?, barcode = ?, price = ? WHERE product_id = ?',
                    [productData.sku, productData.barcode, productData.price, id]
                );
            }
        }
    }

    async processVariations(productId, tenant_id, variationsData) {
        const data = typeof variationsData === 'string' ? JSON.parse(variationsData) : variationsData;
        
        if (data && data.attributes) {
            const attrMap = []; // Para guardar IDs dos valores criados

            for (const attr of data.attributes) {
                const attributeId = await ProductRepository.createAttribute(tenant_id, productId, attr.name);
                const valuesIds = [];
                
                if (attr.values && Array.isArray(attr.values)) {
                    for (const value of attr.values) {
                        const valueId = await ProductRepository.createAttributeValue(attributeId, value);
                        valuesIds.push({ id: valueId, value });
                    }
                }
                attrMap.push({ name: attr.name, values: valuesIds });
            }

            // Gerar combinações e salvar na product_variants
            await this.generateAndSaveVariants(productId, tenant_id, attrMap);
        }
    }

    async generateAndSaveVariants(productId, tenant_id, attrMap) {
        if (attrMap.length === 0) return;

        // Gerador de combinações
        const combinations = attrMap.reduce((acc, attr) => {
            if (acc.length === 0) return attr.values.map(v => [v]);
            const newAcc = [];
            acc.forEach(prevCombo => {
                attr.values.forEach(v => newAcc.push([...prevCombo, v]));
            });
            return newAcc;
        }, []);

        for (const combo of combinations) {
            const variantName = combo.map(v => v.value).join(' / ');
            const variantId = await ProductRepository.createVariant({
                tenant_id,
                product_id: productId,
                sku: `SKU-${productId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // SKU Provisório
                price: null, // Será definido no futuro
                active: true
            });

            for (const valueObj of combo) {
                await ProductRepository.createVariantOption(variantId, valueObj.id);
            }
        }
    }

    async deleteProduct(id, tenant_id) {
        return ProductRepository.delete(id, tenant_id);
    }
}

module.exports = new ProductService();
