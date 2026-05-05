document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // AUTENTICAÇÃO
    // ==========================================
    const token = localStorage.getItem('erp_token');
    const user = JSON.parse(localStorage.getItem('erp_user') || '{}');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Set user info
    const userNameEl = document.querySelector('.user-name');
    const userAvatarEl = document.querySelector('.user-avatar');
    if (userNameEl) userNameEl.innerText = user.name || 'Usuário';
    if (userAvatarEl) userAvatarEl.innerText = (user.name || 'U').substring(0, 2).toUpperCase();

    // Headers padrão para fetch
    const fetchHeaders = {
        'Authorization': `Bearer ${token}`
    };

    // ==========================================
    // LAYOUT & MENU
    // ==========================================
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    
    toggleBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            link.classList.add('active');
            const targetId = link.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // Recarregar dados se for a aba específica
            if (targetId === 'estoque') loadProducts();
            if (targetId === 'caixa') loadPosProducts();
        });
    });

    // ==========================================
    // CONFIGURAÇÃO E CORES
    // ==========================================
    const root = document.documentElement;
    const colorPrimary = document.getElementById('colorPrimary');
    const colorSecondary = document.getElementById('colorSecondary');
    const colorTertiary = document.getElementById('colorTertiary');
    const saveColorsBtn = document.getElementById('saveColorsBtn');

    const loadColors = () => {
        const p = localStorage.getItem('erp_primary') || '#2563eb';
        const s = localStorage.getItem('erp_secondary') || '#f3f4f6';
        const t = localStorage.getItem('erp_tertiary') || '#ffffff';
        root.style.setProperty('--primary', p);
        root.style.setProperty('--secondary', s);
        root.style.setProperty('--tertiary', t);
        if(colorPrimary) colorPrimary.value = p;
        if(colorSecondary) colorSecondary.value = s;
        if(colorTertiary) colorTertiary.value = t;
    };
    loadColors();

    if(colorPrimary) {
        colorPrimary.addEventListener('input', (e) => root.style.setProperty('--primary', e.target.value));
        colorSecondary.addEventListener('input', (e) => root.style.setProperty('--secondary', e.target.value));
        colorTertiary.addEventListener('input', (e) => root.style.setProperty('--tertiary', e.target.value));
        saveColorsBtn.addEventListener('click', () => {
            localStorage.setItem('erp_primary', colorPrimary.value);
            localStorage.setItem('erp_secondary', colorSecondary.value);
            localStorage.setItem('erp_tertiary', colorTertiary.value);
            saveColorsBtn.innerText = 'Cores Salvas!';
            setTimeout(() => saveColorsBtn.innerText = 'Salvar Identidade Visual', 2000);
        });
    }

    // ==========================================
    // ESTOQUE (CRUD DE PRODUTOS)
    // ==========================================
    let currentProducts = [];
    const loadProducts = async () => {
        try {
            const res = await fetch('/api/products', { headers: fetchHeaders });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('erp_token');
                window.location.href = '/login.html';
                return;
            }
            currentProducts = await res.json();
            renderProductsTable(currentProducts);
            document.getElementById('dashTotalProducts').innerText = currentProducts.length;
        } catch (error) {
            console.error('Erro ao carregar produtos', error);
        }
    };

    const renderProductsTable = (products) => {
        const tbody = document.getElementById('productsTableBody');
        tbody.innerHTML = '';
        products.forEach(p => {
            const price = parseFloat(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            tbody.innerHTML += `
                <tr>
                    <td><strong>${p.title}</strong></td>
                    <td>${p.category}</td>
                    <td>${p.availableQuantity} unid.</td>
                    <td>${price}</td>
                    <td>
                        <button class="btn btn-primary" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;">Editar</button>
                    </td>
                </tr>
            `;
        });
    };

    // Modal Novo Produto
    const modal = document.getElementById('productModal');
    const newProductBtn = document.getElementById('newProductBtn');
    const closeBtn = document.getElementById('closeProductModal');
    const form = document.getElementById('productForm');

    if (newProductBtn) {
        newProductBtn.addEventListener('click', () => modal.style.display = 'flex');
        closeBtn.addEventListener('click', () => { modal.style.display = 'none'; form.reset(); });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('saveProductBtn');
            submitBtn.disabled = true;
            submitBtn.innerText = 'Salvando...';

            try {
                const formData = new FormData(form);
                const res = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }, // FormData sets boundary automatically
                    body: formData
                });
                if(res.ok) {
                    modal.style.display = 'none';
                    form.reset();
                    loadProducts();
                } else {
                    alert('Erro ao salvar produto.');
                }
            } catch(e) {
                console.error(e);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Salvar';
            }
        });
    }

    // ==========================================
    // FRENTE DE CAIXA (PDV)
    // ==========================================
    let posCart = [];

    const loadPosProducts = async () => {
        // Aproveita o load inicial se já tiver
        if (currentProducts.length === 0) await loadProducts();
        renderPosProducts(currentProducts);
    };

    const renderPosProducts = (products) => {
        const grid = document.getElementById('posProductList');
        grid.innerHTML = '';
        products.forEach(p => {
            if(p.availableQuantity <= 0) return; // Não mostra sem estoque
            
            const card = document.createElement('div');
            card.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; background: white; text-align: center; cursor: pointer; transition: transform 0.2s;';
            card.innerHTML = `
                <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem;">Estoque: ${p.availableQuantity}</div>
                <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem; color: #1f2937;">${p.title}</h4>
                <div style="font-weight: 600; color: #2563eb;">R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</div>
            `;
            card.onmouseover = () => card.style.transform = 'scale(1.05)';
            card.onmouseout = () => card.style.transform = 'scale(1)';
            card.onclick = () => addToPosCart(p);
            grid.appendChild(card);
        });
    };

    document.getElementById('posSearch')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = currentProducts.filter(p => p.title.toLowerCase().includes(term));
        renderPosProducts(filtered);
    });

    const addToPosCart = (product) => {
        const existing = posCart.find(i => i.id === product.id);
        if (existing) {
            if (existing.quantity >= product.availableQuantity) {
                alert('Quantidade máxima em estoque atingida.');
                return;
            }
            existing.quantity++;
        } else {
            posCart.push({ id: product.id, title: product.title, price: product.price, quantity: 1, max: product.availableQuantity });
        }
        updatePosCartUI();
    };

    const removeFromPosCart = (id) => {
        posCart = posCart.filter(i => i.id !== id);
        updatePosCartUI();
    };

    const updatePosCartUI = () => {
        const cartEl = document.getElementById('posCartItems');
        const totalEl = document.getElementById('posTotalValue');
        const checkoutBtn = document.getElementById('posCheckoutBtn');

        if (posCart.length === 0) {
            cartEl.innerHTML = '<p style="color: #6b7280; font-size: 0.9rem;">Nenhum item adicionado.</p>';
            totalEl.innerText = 'R$ 0,00';
            checkoutBtn.disabled = true;
            return;
        }

        cartEl.innerHTML = '';
        let total = 0;
        posCart.forEach(item => {
            total += (item.price * item.quantity);
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f3f4f6;';
            div.innerHTML = `
                <div>
                    <div style="font-weight: 500; font-size: 0.9rem;">${item.title}</div>
                    <div style="font-size: 0.8rem; color: #6b7280;">${item.quantity}x R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}</div>
                </div>
                <button style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold;">X</button>
            `;
            div.querySelector('button').onclick = () => removeFromPosCart(item.id);
            cartEl.appendChild(div);
        });

        totalEl.innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        checkoutBtn.disabled = false;
    };

    document.getElementById('posCheckoutBtn')?.addEventListener('click', async () => {
        if(posCart.length === 0) return;
        
        const btn = document.getElementById('posCheckoutBtn');
        btn.disabled = true;
        btn.innerText = 'Processando...';

        try {
            const items = posCart.map(i => ({ id: i.id, quantity: i.quantity }));
            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...fetchHeaders },
                body: JSON.stringify({ items })
            });

            if(res.ok) {
                alert('Venda finalizada com sucesso!');
                posCart = [];
                updatePosCartUI();
                await loadProducts(); // Atualiza estoque na memória
                renderPosProducts(currentProducts); // Atualiza grid PDV
            } else {
                const data = await res.json();
                alert(data.error || 'Erro ao processar venda.');
            }
        } catch(e) {
            alert('Erro de conexão.');
        } finally {
            btn.innerText = 'Finalizar Venda';
            btn.disabled = posCart.length === 0;
        }
    });

    // Início automático
    loadProducts();
});
