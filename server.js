const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDB, pool } = require('./src/database/db');
const { verifyToken, JWT_SECRET } = require('./src/middleware/auth');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Inicializar banco de dados
initDB();

// ==========================================
// ROTA PÚBLICA (API consumida pela Vitrine)
// ==========================================
app.get('/api/public/products', async (req, res) => {
    try {
        const tenantId = req.query.tenantId || 1; // Padrão 1 se não for enviado
        let { page = 0, limit = 24, search = '', category = 'all', theme = '' } = req.query;
        
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = page * limit;

        let query = 'SELECT * FROM products WHERE tenant_id = ?';
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE tenant_id = ?';
        let queryParams = [tenantId];

        if (category && category !== 'all') {
            query += ' AND category = ?';
            countQuery += ' AND category = ?';
            queryParams.push(category);
        }

        if (search) {
            query += ' AND (title LIKE ? OR description LIKE ?)';
            countQuery += ' AND (title LIKE ? OR description LIKE ?)';
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        
        // TODO: The 'theme' filter could join with the tenants table or be ignored if we assume 1 tenant = 1 theme.
        // For now we'll fetch products for the tenant.

        query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        const finalQueryParams = [...queryParams, limit, offset];

        const [rows] = await pool.query(query, finalQueryParams);
        const [countRows] = await pool.query(countQuery, queryParams);
        
        // Formatar imagens
        const products = rows.map(p => ({
            ...p,
            images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
        }));
        
        res.json({ data: products, totalCount: countRows[0].total });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO (SaaS)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Credenciais inválidas' });

        const token = jwt.sign(
            { id: user.id, tenant_id: user.tenant_id, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, user: { id: user.id, name: user.name, role: user.role, tenant_id: user.tenant_id } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// ==========================================
// ROTAS PRIVADAS DO ERP (Protegidas)
// ==========================================

// Listar produtos do lojista no painel
app.get('/api/products', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE tenant_id = ? ORDER BY id DESC', [req.user.tenant_id]);
        const products = rows.map(p => ({
            ...p,
            images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
        }));
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
});

// Criar novo produto com upload de imagem
app.post('/api/products', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { title, description, price, category, condition_state, availableQuantity } = req.body;
        const tenant_id = req.user.tenant_id;
        
        let images = [];
        if (req.file) {
            // URL to access the image publicly
            images.push(`http://localhost:4000/uploads/${req.file.filename}`);
        }

        const [result] = await pool.query(
            `INSERT INTO products (tenant_id, title, description, price, category, condition_state, availableQuantity, images) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenant_id, title, description || '', price || 0, category || 'Geral', condition_state || 'Novo', availableQuantity || 0, JSON.stringify(images)]
        );

        res.status(201).json({ id: result.insertId, message: 'Produto cadastrado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao salvar produto' });
    }
});

// Registrar venda manual (Frente de Caixa PDV)
app.post('/api/sales', verifyToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { items } = req.body; // Array de { id, quantity }
        const tenant_id = req.user.tenant_id;

        if (!items || !items.length) {
            return res.status(400).json({ error: 'Nenhum item na venda' });
        }

        for (const item of items) {
            const [productRows] = await connection.query('SELECT availableQuantity FROM products WHERE id = ? AND tenant_id = ? FOR UPDATE', [item.id, tenant_id]);
            if (productRows.length === 0) throw new Error(`Produto ${item.id} não encontrado`);
            
            const currentStock = productRows[0].availableQuantity;
            if (currentStock < item.quantity) throw new Error(`Estoque insuficiente para o produto ${item.id}`);

            await connection.query('UPDATE products SET availableQuantity = availableQuantity - ? WHERE id = ?', [item.quantity, item.id]);
        }

        await connection.commit();
        res.json({ message: 'Venda finalizada com sucesso! Estoque atualizado.' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: error.message || 'Erro ao processar venda' });
    } finally {
        connection.release();
    }
});

app.listen(PORT, () => {
    console.log(`🚀 ERP Comercial Server rodando na porta ${PORT}`);
});
