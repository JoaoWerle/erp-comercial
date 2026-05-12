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
const productRoutes = require('./src/routes/productRoutes');
const customerRoutes = require('./src/routes/customerRoutes');
const sellerRoutes = require('./src/routes/sellerRoutes');

// Middleware para verificar se o usuário é Administrador
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta área.' });
    }
};

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
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

        let query = 'SELECT * FROM products WHERE tenant_id = ? AND active = true';
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE tenant_id = ? AND active = true';
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
        
        if (theme) {
            query += ' AND theme = ?';
            countQuery += ' AND theme = ?';
            queryParams.push(theme);
        }

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
        
        // Verificar se o usuário está ativo
        if (user.active === false || user.active === 0) {
            return res.status(403).json({ 
                error: 'Sua conta está inativa.', 
                reason: user.inactive_reason || 'Motivo não informado.' 
            });
        }

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

// Importar Rotas Modulares
const inventoryRoutes = require('./src/routes/inventoryRoutes');

app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);

// ==========================================
// GESTÃO DE CAIXA (SESSÕES E MOVIMENTAÇÕES)
// ==========================================

// Buscar sessão de caixa aberta atual
// Listar histórico de caixas fechados
app.get('/api/cash/history', verifyToken, async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const [rows] = await pool.query(
            'SELECT * FROM cash_sessions WHERE tenant_id = ? AND status = "closed" ORDER BY closed_at DESC',
            [tenant_id]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar histórico de caixas' });
    }
});

app.get('/api/cash/current', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM cash_sessions WHERE tenant_id = ? AND status = "open"',
            [req.user.tenant_id]
        );
        res.json(rows[0] || null);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar caixa atual' });
    }
});

// Abrir novo caixa
app.post('/api/cash/open', verifyToken, async (req, res) => {
    try {
        const { openingBalance } = req.body;
        const tenant_id = req.user.tenant_id;
        const user_id = req.user.id;

        // Verificar se já existe um caixa aberto
        const [existing] = await pool.query('SELECT id FROM cash_sessions WHERE tenant_id = ? AND status = "open"', [tenant_id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Já existe um caixa aberto para este lojista.' });
        }

        const [result] = await pool.query(
            'INSERT INTO cash_sessions (tenant_id, user_id, opening_balance, status) VALUES (?, ?, ?, "open")',
            [tenant_id, user_id, openingBalance || 0]
        );

        res.status(201).json({ id: result.insertId, message: 'Caixa aberto com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao abrir caixa' });
    }
});

// Listar transações de uma sessão
app.get('/api/cash/transactions', verifyToken, async (req, res) => {
    try {
        const { session_id } = req.query;
        const tenant_id = req.user.tenant_id;
        
        const [rows] = await pool.query(
            'SELECT * FROM cash_transactions WHERE session_id = ? AND tenant_id = ? ORDER BY created_at DESC',
            [session_id, tenant_id]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar transações' });
    }
});

// Registrar Sangria ou Aporte
app.post('/api/cash/transaction', verifyToken, async (req, res) => {
    try {
        const { sessionId, type, amount, reason } = req.body;
        const tenant_id = req.user.tenant_id;

        await pool.query(
            'INSERT INTO cash_transactions (session_id, tenant_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)',
            [sessionId, tenant_id, type, amount, reason]
        );

        res.status(201).json({ message: 'Movimentação registrada com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao registrar movimentação' });
    }
});

// Fechar caixa atual
app.post('/api/cash/close', verifyToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { sessionId, actualBalance } = req.body;
        const tenant_id = req.user.tenant_id;

        // 1. Buscar dados da sessão
        const [sessionRows] = await connection.query('SELECT * FROM cash_sessions WHERE id = ? AND tenant_id = ?', [sessionId, tenant_id]);
        if (sessionRows.length === 0) throw new Error('Sessão não encontrada');
        const session = sessionRows[0];

        // 2. Calcular total de vendas em DINHEIRO nesta sessão
        const [salesRows] = await connection.query(
            'SELECT SUM(total_revenue) as totalCashSales FROM sales WHERE session_id = ? AND payment_method = "dinheiro" AND status = "completed"',
            [sessionId]
        );
        const totalCashSales = parseFloat(salesRows[0].totalCashSales || 0);

        // 3. Calcular total de movimentações (In - Out)
        const [transRows] = await connection.query(
            'SELECT SUM(CASE WHEN type = "in" THEN amount ELSE -amount END) as netTransactions FROM cash_transactions WHERE session_id = ?',
            [sessionId]
        );
        const netTransactions = parseFloat(transRows[0].netTransactions || 0);

        // 4. Calcular Saldo Esperado
        const expectedBalance = parseFloat(session.opening_balance) + totalCashSales + netTransactions;

        // 5. Finalizar Sessão
        await connection.query(
            'UPDATE cash_sessions SET closing_balance_expected = ?, closing_balance_actual = ?, status = "closed", closed_at = NOW() WHERE id = ?',
            [expectedBalance, actualBalance, sessionId]
        );

        await connection.commit();
        res.json({ 
            message: 'Caixa fechado com sucesso!',
            summary: {
                opening: Number(session.opening_balance),
                salesCash: Number(totalCashSales),
                netTransactions: Number(netTransactions),
                expected: Number(expectedBalance),
                actual: Number(actualBalance),
                difference: Number(actualBalance - expectedBalance)
            }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('ERRO AO FECHAR CAIXA:', error);
        res.status(500).json({ error: 'Erro ao fechar caixa: ' + error.message });
    } finally {
        connection.release();
    }
});

const saleRoutes = require('./src/routes/saleRoutes');

app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', saleRoutes);

// ==========================================
// ROTAS DE DASHBOARD E RELATÓRIOS
// ==========================================

app.get('/api/dashboard/stats', verifyToken, async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { startDate, endDate } = req.query;
        let whereClause = '';
        let queryParams = [tenant_id];

        if (startDate && endDate) {
            whereClause += ' AND created_at >= ? AND created_at <= ?';
            queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const [statsRows] = await pool.query(`
            SELECT 
                COUNT(*) as totalSales,
                COALESCE(SUM(total_revenue), 0) as totalRevenue,
                COALESCE(SUM(total_cost), 0) as totalCost,
                COALESCE(SUM(total_profit), 0) as totalProfit
            FROM sales 
            WHERE tenant_id = ? AND status = 'completed' ${whereClause}
        `, queryParams);

        res.json(statsRows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// Rota de Analytics (Gráficos)
app.get('/api/dashboard/analytics', verifyToken, async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const userRole = (req.user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';
        const { startDate, endDate, granularity } = req.query;

        // 1. Vendas (Dados brutos ou agrupados)
        let salesSelect = 'sale_date as date, total_revenue as revenue';
        let salesGroup = '';
        
        if (granularity === 'horário') {
            salesSelect = "HOUR(created_at) as date, SUM(total_revenue) as revenue";
            salesGroup = 'GROUP BY HOUR(created_at)';
        } else if (granularity === 'semanal') {
            // Agrupa pela data da segunda-feira da semana
            salesSelect = "DATE_FORMAT(DATE_SUB(sale_date, INTERVAL WEEKDAY(sale_date) DAY), '%Y-%m-%d') as date, SUM(total_revenue) as revenue";
            salesGroup = "GROUP BY DATE_SUB(sale_date, INTERVAL WEEKDAY(sale_date) DAY)";
        } else if (granularity === 'mensal') {
            salesSelect = "DATE_FORMAT(created_at, '%Y-%m') as date, SUM(total_revenue) as revenue";
            salesGroup = 'GROUP BY DATE_FORMAT(created_at, "%Y-%m")';
        } else if (granularity === 'trimestral') {
            salesSelect = "CONCAT(YEAR(created_at), '-Q', QUARTER(created_at)) as date, SUM(total_revenue) as revenue";
            salesGroup = 'GROUP BY YEAR(created_at), QUARTER(created_at)';
        } else if (granularity === 'semestral') {
            salesSelect = "CONCAT(YEAR(created_at), '-S', IF(MONTH(created_at) <= 6, 1, 2)) as date, SUM(total_revenue) as revenue";
            salesGroup = 'GROUP BY YEAR(created_at), IF(MONTH(created_at) <= 6, 1, 2)';
        } else if (granularity === 'anual') {
            salesSelect = "YEAR(created_at) as date, SUM(total_revenue) as revenue";
            salesGroup = 'GROUP BY YEAR(created_at)';
        }

        let whereClause = " AND status = 'completed'";
        let salesParams = [];
        
        if (!isAdmin) {
            whereClause += ' AND tenant_id = ?';
            salesParams.push(tenant_id);
        }

        if (startDate && endDate) {
            whereClause += ' AND created_at >= ? AND created_at <= ?';
            salesParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const salesQuery = `SELECT ${salesSelect} FROM sales WHERE 1=1 ${whereClause} ${salesGroup} ORDER BY date ASC`;

        const [salesRows] = await pool.query(salesQuery, salesParams);
        
        // 2. Processar Distribuição por Categoria e Produto (Baseado em Vendas Reais)
        // Primeiro, carregamos as categorias de todos os produtos do tenant para mapeamento
        let productCatQuery = `SELECT title, COALESCE(NULLIF(category, ''), 'Outros') as category FROM products WHERE active = true`;
        let productCatParams = [];
        if (!isAdmin) {
            productCatQuery += ' AND tenant_id = ?';
            productCatParams.push(tenant_id);
        }
        const [products] = await pool.query(productCatQuery, productCatParams);
        const categoryMapRef = {};
        products.forEach(p => categoryMapRef[p.title] = p.category);

        // Buscamos as vendas brutas do período para processar os itens
        const rawSalesQuery = `SELECT items FROM sales WHERE 1=1 ${whereClause}`;
        const [rawSales] = await pool.query(rawSalesQuery, salesParams);

        const categoryMap = {};
        const productMap = {};

        rawSales.forEach(sale => {
            try {
                const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || []);
                items.forEach(item => {
                    const qty = Number(item.quantity) || 0;
                    const revenue = (Number(item.price) || 0) * qty;
                    const name = item.name || 'Produto Sem Nome';
                    
                    // Faturamento por Produto
                    if (!productMap[name]) productMap[name] = { revenue: 0, qty: 0 };
                    productMap[name].revenue += revenue;
                    productMap[name].qty += qty;

                    // Faturamento por Categoria (usando o mapa de referência)
                    const category = categoryMapRef[name] || 'Outros';
                    if (!categoryMap[category]) categoryMap[category] = { revenue: 0, qty: 0 };
                    categoryMap[category].revenue += revenue;
                    categoryMap[category].qty += qty;
                });
            } catch (e) { /* skip invalid json */ }
        });

        // Transformar em array e ordenar
        const topProducts = Object.entries(productMap)
            .map(([label, stats]) => ({ label, value: stats.revenue, qty: stats.qty }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const topCategories = Object.entries(categoryMap)
            .map(([label, stats]) => ({ label, value: stats.revenue, qty: stats.qty }))
            .sort((a, b) => b.value - a.value);

        res.json({ 
            sales: salesRows, 
            categories: topCategories.length > 0 ? topCategories : [{ label: 'Sem vendas', value: 0, qty: 0 }],
            products: topProducts.length > 0 ? topProducts : [{ label: 'Sem vendas', value: 0, qty: 0 }]
        });
    } catch (error) {
        console.error('Erro no Analytics:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// Rota de Semente (Seed) - Popular dados de teste
app.post('/api/admin/seed', verifyToken, async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        
        // Adicionar alguns produtos se não existirem
        await pool.query(`
            INSERT IGNORE INTO products (tenant_id, title, category, price, cost_price, availableQuantity, active)
            VALUES 
            (?, 'Camiseta Algodão Premium', 'Vestuário', 89.90, 35.00, 50, 1),
            (?, 'Calça Jeans Slim', 'Vestuário', 159.00, 70.00, 30, 1),
            (?, 'Tênis Esportivo', 'Calçados', 299.00, 120.00, 15, 1),
            (?, 'Relógio Digital', 'Acessórios', 120.00, 45.00, 10, 1)
        `, [tenant_id, tenant_id, tenant_id, tenant_id]);

        // Adicionar vendas fictícias nos últimos dias
        const dates = [
            'DATE_SUB(NOW(), INTERVAL 5 DAY)',
            'DATE_SUB(NOW(), INTERVAL 4 DAY)',
            'DATE_SUB(NOW(), INTERVAL 3 DAY)',
            'DATE_SUB(NOW(), INTERVAL 2 DAY)',
            'DATE_SUB(NOW(), INTERVAL 1 DAY)',
            'NOW()'
        ];

        for (const date of dates) {
            const revenue = Math.floor(Math.random() * 500) + 100;
            const cost = revenue * 0.4;
            const mockItems = JSON.stringify([
                { name: 'Produto Teste A', quantity: 1, price: revenue * 0.7 },
                { name: 'Produto Teste B', quantity: 2, price: revenue * 0.15 }
            ]);
            await pool.query(`
                INSERT INTO sales (tenant_id, total_revenue, total_cost, total_profit, items, payment_method, created_at, sale_date, sale_time, status)
                VALUES (?, ?, ?, ?, ?, 'Cartão', ${date}, DATE(${date}), TIME(${date}), 'completed')
            `, [tenant_id, revenue, cost, revenue - cost, mockItems]);
        }

        res.json({ message: 'Dados de teste gerados com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao gerar dados de teste' });
    }
});

app.get('/api/sales/history', verifyToken, async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { startDate, endDate, session_id } = req.query;

        let query = `
            SELECT s.*, c.name as customer_name, sel.name as seller_name 
            FROM sales s 
            LEFT JOIN customers c ON s.customer_id = c.id 
            LEFT JOIN sellers sel ON s.seller_id = sel.id 
            WHERE s.tenant_id = ?
        `;
        let queryParams = [tenant_id];

        // Se houver filtro de data, aplicamos
        if (startDate && endDate) {
            query += ' AND s.created_at >= ? AND s.created_at <= ?';
            queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        // Filtro por sessão de caixa
        if (session_id) {
            query += ' AND s.session_id = ?';
            queryParams.push(session_id);
        }

        query += ' ORDER BY s.created_at DESC';

        const [rows] = await pool.query(query, queryParams);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar histórico de vendas' });
    }
});

// ==========================================
// GESTÃO DE LOJISTAS (Apenas Admin)
// ==========================================

// Listar todos os usuários (lojistas)
app.get('/api/admin/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.name, u.email, u.role, u.active, u.inactive_reason, u.tenant_id, t.name as tenant_name 
            FROM users u
            LEFT JOIN tenants t ON u.tenant_id = t.id
            ORDER BY u.id DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar lojistas' });
    }
});

// Criar novo lojista (e novo tenant opcionalmente, ou usar tenant 1)
app.post('/api/admin/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const { name, email, password, role, tenant_name } = req.body;
        
        // 1. Criar Tenant se necessário (simplificado: cada user novo ganha um tenant ou usa o 1)
        let tenant_id = 1;
        if (tenant_name) {
            const [tResult] = await pool.query('INSERT INTO tenants (name) VALUES (?)', [tenant_name]);
            tenant_id = tResult.insertId;
        }

        // 2. Criar Usuário
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (tenant_id, name, email, password, role, active) VALUES (?, ?, ?, ?, ?, ?)',
            [tenant_id, name, email, hashedPassword, role || 'user', true]
        );

        res.status(201).json({ message: 'Lojista cadastrado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao cadastrar lojista' });
    }
});

// Atualizar status/dados do lojista
app.put('/api/admin/users/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { active, inactive_reason, role, name, email } = req.body;
        const userId = req.params.id;

        // Se o admin tentar desativar a si mesmo, bloquear (opcional, mas recomendado)
        if (parseInt(userId) === req.user.id && (active === false || active === 'false')) {
            return res.status(400).json({ error: 'Você não pode desativar sua própria conta de administrador.' });
        }

        await pool.query(
            'UPDATE users SET active = ?, inactive_reason = ?, role = ?, name = ?, email = ? WHERE id = ?',
            [active === 'true' || active === true, inactive_reason || '', role, name, email, userId]
        );

        res.json({ message: 'Lojista atualizado com sucesso!' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar lojista' });
    }
});

// ==========================================
// CONFIGURAÇÕES DA LOJA (PROFILE & BRANDING)
// ==========================================

// Buscar configurações da loja
app.get('/api/settings/profile', verifyToken, async (req, res) => {
    try {
        const [tenants] = await pool.query('SELECT name, logo_url, primary_color, secondary_color, tertiary_color FROM tenants WHERE id = ?', [req.user.tenant_id]);
        if (tenants.length === 0) return res.status(404).json({ error: 'Loja não encontrada.' });
        res.json(tenants[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar configurações.' });
    }
});

// Salvar configurações da loja (com upload de logo)
app.post('/api/settings/profile', verifyToken, upload.single('logo'), async (req, res) => {
    try {
        const { name, primary_color, secondary_color, tertiary_color } = req.body;
        const tenantId = req.user.tenant_id;
        
        let logoUrl = null;
        if (req.file) {
            logoUrl = `/uploads/${req.file.filename}`;
        }

        // Se houver logo, atualiza com logo_url, senão mantém a atual ou atualiza apenas campos de texto
        let query = 'UPDATE tenants SET name = ?, primary_color = ?, secondary_color = ?, tertiary_color = ?';
        const params = [name, primary_color, secondary_color, tertiary_color];

        if (logoUrl) {
            query += ', logo_url = ?';
            params.push(logoUrl);
        }

        query += ' WHERE id = ?';
        params.push(tenantId);

        await pool.query(query, params);
        
        res.json({ message: 'Configurações atualizadas com sucesso!', logo_url: logoUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
});

// Routes registration
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sellers', sellerRoutes);

app.listen(PORT, () => {
    console.log(`🚀 ERP Comercial Server rodando na porta ${PORT}`);
});
