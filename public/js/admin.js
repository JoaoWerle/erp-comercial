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

    // Buscar dados atualizados do usuário para o Topbar
    const refreshUserInfo = async () => {
        try {
            const res = await fetch('/api/settings/profile', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                document.querySelectorAll('.user-name').forEach(el => el.innerText = data.name || user.name);
                document.querySelectorAll('.user-avatar').forEach(el => el.innerText = (data.name || user.name || 'U').substring(0, 2).toUpperCase());
            }
        } catch (e) { console.error('Erro ao atualizar info do usuário', e); }
    };
    refreshUserInfo();

    // Controle de Acesso (Nível Admin)
    if (user.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
    }

    // Headers padrão para fetch
    const fetchHeaders = {
        'Authorization': `Bearer ${token}`
    };

    window.logout = () => {
        localStorage.removeItem('erp_token');
        localStorage.removeItem('erp_user');
        window.location.href = '/login.html';
    };

    const showToast = (message, type = 'success') => {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 1rem; 
            border-radius: 8px; 
            color: white; 
            font-weight: 500; 
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: opacity 0.3s ease;
        `;
        toast.innerText = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // ==========================================
    // LAYOUT & MENU
    // ==========================================
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');

    // Registrar Plugin de Rótulos de Dados
    Chart.register(ChartDataLabels);

    // Instâncias dos Gráficos (Globais para destruição/atualização)
    let salesChartInstance = null;
    let categoriesChartInstance = null;
    let dashboardCategoryData = [];
    let dashboardProductData = [];
    let currentCategoryView = 'category'; // 'category' ou 'product'
    // Listener para o Switch de Categoria/Produto
    document.getElementById('categoryProductSwitch')?.addEventListener('click', (e) => {
        const option = e.target.closest('.switch-option');
        if (!option) return;

        const view = option.getAttribute('data-view');
        if (view === currentCategoryView) return;

        // Atualizar UI
        document.querySelectorAll('#categoryProductSwitch .switch-option').forEach(el => el.classList.remove('active'));
        option.classList.add('active');
        
        currentCategoryView = view;
        
        // Atualizar Título
        const titleEl = document.getElementById('categoryChartTitle');
        if (titleEl) {
            titleEl.innerHTML = view === 'category' 
                ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg> Categorias`
                : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 01-8 0"></path></svg> Produtos`;
        }

        // Renderizar com novos dados
        renderCategoriesChart(view === 'category' ? dashboardCategoryData : dashboardProductData);
    });

    
    // Configuração de Granularidade do Gráfico
    const granularities = ['horário', 'diário', 'mensal', 'anual'];
    let currentGranularityIndex = 1; // Começa no Diário (index 1)

    // ==========================================
    // MÁSCARA DE MOEDA (FORMATO 0,00)
    // ==========================================
    const formatCurrencyInput = (input) => {
        let value = input.value.replace(/\D/g, ""); // Remove tudo que não é dígito
        if (value === "") value = "0";
        
        // Converte para decimal (dividindo por 100)
        let numericValue = (parseInt(value) / 100).toFixed(2);
        
        // Formata para o padrão brasileiro (sem o R$)
        input.value = numericValue.replace(".", ",");
        
        // Disparar evento de input para garantir que outros listeners capturem a mudança se necessário
        input.dispatchEvent(new Event('input'));
    };

    // Selecionar todos os campos que precisam da máscara
    const currencyFields = [
        'productPrice', 'productCost', // Modal de Produto
        'openingBalanceInput',         // Abertura de Caixa
        'actualBalanceInput',          // Fechamento de Caixa
        'transAmount',                 // Sangria/Aporte
        'feeAmount', 'discountAmount'  // Checkout PDV
    ];

    currencyFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Valor inicial padrão
            if (!el.value || el.value === "0") el.value = "0,00";
            
            el.addEventListener('input', (e) => {
                // Prevenir loops se necessário, mas o replace(/\D/g) já ajuda
                formatCurrencyInput(e.target);
            });

            // Ao focar, posicionar cursor no final
            el.addEventListener('focus', (e) => {
                setTimeout(() => {
                    const len = e.target.value.length;
                    e.target.setSelectionRange(len, len);
                }, 10);
            });
        }
    });

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

            // Resetar o scroll para o topo ao trocar de aba
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Recarregar dados se for a aba específica
            if (targetId === 'dashboard') loadDashboard();
            if (targetId === 'estoque') loadProducts();
            if (targetId === 'caixa') loadPosProducts();
            if (targetId === 'fechamento') loadCashManagement();
            if (targetId === 'lojistas') loadLojistas();
        });
    });

    // ==========================================
    // CORES E MARCA (Sincronização Inicial)
    // ==========================================
    // A marca da loja é carregada via API no final do script (loadStoreSettings)

    // ==========================================
    // DASHBOARD
    // ==========================================
    const loadDashboard = async (startDate, endDate) => {
        // Se não vierem datas por parâmetro, pega dos campos globais
        const start = startDate || document.getElementById('dashStartDate').value;
        const end = endDate || document.getElementById('dashEndDate').value;
        
        let urlStats = '/api/dashboard/stats';
        if (start && end) urlStats += `?startDate=${start}&endDate=${end}`;

        try {
            // Load stats
            const statsRes = await fetch(urlStats, { headers: fetchHeaders });
            if (statsRes.ok) {
                const stats = await statsRes.json();
                document.getElementById('dashTotalSales').innerText = stats.totalSales || 0;
                document.getElementById('dashTotalRevenue').innerText = parseFloat(stats.totalRevenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                document.getElementById('dashTotalCost').innerText = parseFloat(stats.totalCost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                document.getElementById('dashTotalProfit').innerText = parseFloat(stats.totalProfit || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }
            // Load history
            await loadSalesHistory();
            // Load Analytics (Gráficos) respeitando a granularidade atual
            const currentGran = granularities[currentGranularityIndex] || 'diário';
            await loadAnalytics(start, end, currentGran);
        } catch (e) {
            console.error(e);
        }
    };

    const loadAnalytics = async (startDate, endDate, granularity = 'diário') => {
        if (typeof Chart === 'undefined') return;

        try {
            let url = `/api/dashboard/analytics?granularity=${granularity}`;
            if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
            
            const res = await fetch(url, { headers: fetchHeaders });
            const data = await res.json();

            let finalSalesData = [];
            const salesFromDB = data.sales || [];

            // Helper para formatar data local com segurança
            const formatDate = (dateObj, type) => {
                if (!dateObj || isNaN(dateObj.getTime())) return '---';
                const d = String(dateObj.getDate()).padStart(2, '0');
                const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                if (type === 'time') {
                    const h = String(dateObj.getHours()).padStart(2, '0');
                    const min = String(dateObj.getMinutes()).padStart(2, '0');
                    return `${d}/${m} ${h}:${min}`;
                }
                return `${d}/${m}`;
            };

            if (granularity === 'horário') {
                for (let h = 0; h < 24; h++) {
                    const record = salesFromDB.find(s => parseInt(s.date) === h);
                    finalSalesData.push({ label: `${String(h).padStart(2, '0')}:00`, value: record ? Number(record.revenue) : 0 });
                }
            } else if (startDate && endDate) {
                let current = new Date(startDate + 'T12:00:00');
                const last = new Date(endDate + 'T12:00:00');
                let safety = 0;

                while (current <= last && safety < 1000) {
                    safety++;
                    let key = '';
                    let label = '';
                    let increment = 'day';

                    if (granularity === 'diário') {
                        key = current.toISOString().split('T')[0];
                        label = formatDate(current);
                        increment = 'day';
                    } else if (granularity === 'semanal') {
                        // Calcular a segunda-feira da semana atual para o match
                        const monday = new Date(current);
                        const day = monday.getDay();
                        const diff = monday.getDate() - (day === 0 ? 6 : day - 1);
                        monday.setDate(diff);
                        
                        // Formato YYYY-MM-DD com zeros à esquerda (essencial para o match!)
                        const y = monday.getFullYear();
                        const m = String(monday.getMonth() + 1).padStart(2, '0');
                        const d = String(monday.getDate()).padStart(2, '0');
                        key = `${y}-${m}-${d}`;

                        // Calcular número da semana para o label (Sem. XX)
                        const startOfYear = new Date(y, 0, 1);
                        const weekNum = Math.ceil((((monday - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
                        label = `Sem. ${String(weekNum).padStart(2, '0')}`;
                        
                        increment = 'week';
                    } else if (granularity === 'mensal') {
                        key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
                        label = `${String(current.getMonth() + 1).padStart(2, '0')}/${current.getFullYear()}`;
                        increment = 'month';
                    } else if (granularity === 'trimestral') {
                        const q = Math.floor(current.getMonth() / 3) + 1;
                        key = `${current.getFullYear()}-Q${q}`;
                        label = `${q}º Trim. ${current.getFullYear()}`;
                        increment = 'quarter';
                    } else if (granularity === 'semestral') {
                        const s = current.getMonth() < 6 ? 1 : 2;
                        key = `${current.getFullYear()}-S${s}`;
                        label = `${s}º Sem. ${current.getFullYear()}`;
                        increment = 'semester';
                    } else if (granularity === 'anual') {
                        key = current.getFullYear();
                        label = current.getFullYear();
                        increment = 'year';
                    }

                    // Somar todos os registros que batem com a chave (evita ignorar vendas se houver mais de uma no mesmo período)
                    const matches = salesFromDB.filter(s => {
                        if (!s.date) return false;
                        let sDateKey = String(s.date);
                        if (sDateKey.includes('T')) sDateKey = sDateKey.split('T')[0];
                        return sDateKey === String(key);
                    });

                    const totalValue = matches.reduce((sum, s) => sum + Number(s.revenue || 0), 0);

                    if (!finalSalesData.find(d => d.label === label)) {
                        finalSalesData.push({ label: label, value: totalValue });
                    }

                    // Incrementar data
                    if (increment === 'day') current.setDate(current.getDate() + 1);
                    else if (increment === 'week') current.setDate(current.getDate() + 7);
                    else if (increment === 'month') current.setMonth(current.getMonth() + 1);
                    else if (increment === 'quarter') current.setMonth(current.getMonth() + 3);
                    else if (increment === 'semester') current.setMonth(current.getMonth() + 6);
                    else if (increment === 'year') current.setFullYear(current.getFullYear() + 1);
                }
            } else {
                // Fallback para quando não há datas selecionadas
                finalSalesData = salesFromDB.map(s => ({
                    label: s.date,
                    value: Number(s.revenue || 0)
                }));
            }

            renderSalesChart(finalSalesData.length > 0 ? finalSalesData : [{ label: 'Sem dados', value: 0 }]);
            dashboardCategoryData = data.categories || [];
            dashboardProductData = data.products || [];

            // Renderiza o gráfico baseado na visão atual
            const chartData = currentCategoryView === 'category' ? dashboardCategoryData : dashboardProductData;
            renderCategoriesChart(chartData.length > 0 ? chartData : [{ label: 'Sem dados', value: 1 }]);


        } catch (error) {
            console.error('Erro ao carregar analytics:', error);
        }
    };

    // Eventos de Granularidade e Filtros do Gráfico
    const updateChartData = () => {
        const start = document.getElementById('dashStartDate').value;
        const end = document.getElementById('dashEndDate').value;
        const granularity = granularities[currentGranularityIndex];
        loadAnalytics(start, end, granularity);
    };

    // Definir datas padrão (Início e Fim do Mês Atual)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const chartStartInput = document.getElementById('dashStartDate');
    const chartEndInput = document.getElementById('dashEndDate');
    if (chartStartInput) chartStartInput.value = firstDay;
    if (chartEndInput) chartEndInput.value = lastDay;

    // Ouvintes de evento com proteção contra elementos nulos
    const btnUp = document.getElementById('granularityUp');
    const btnDown = document.getElementById('granularityDown');
    const inputStart = document.getElementById('dashStartDate');
    const inputEnd = document.getElementById('dashEndDate');

    if (btnUp) {
        btnUp.addEventListener('click', () => {
            if (currentGranularityIndex < granularities.length - 1) {
                currentGranularityIndex++;
                document.getElementById('currentGranularity').innerText = granularities[currentGranularityIndex];
                updateChartData();
            }
        });
    }

    if (btnDown) {
        btnDown.addEventListener('click', () => {
            if (currentGranularityIndex > 0) {
                currentGranularityIndex--;
                document.getElementById('currentGranularity').innerText = granularities[currentGranularityIndex];
                updateChartData();
            }
        });
    }

    if (inputStart) inputStart.addEventListener('change', updateChartData);
    if (inputEnd) inputEnd.addEventListener('change', updateChartData);

    const renderSalesChart = (data) => {
        const ctx = document.getElementById('salesChart').getContext('2d');
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563eb';

        if (salesChartInstance) salesChartInstance.destroy();

        salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'Vendas (R$)',
                    data: data.map(d => d.value),
                    borderColor: primaryColor,
                    backgroundColor: primaryColor + '20', // Opacidade
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: 'white',
                    pointBorderColor: primaryColor,
                    pointBorderWidth: 2,
                    hoverRadius: 8,
                    hoverBorderWidth: 3,
                    hoverBackgroundColor: primaryColor,
                    hoverBorderColor: 'white'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        offset: 8,
                        formatter: (val) => val > 0 ? val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
                        font: (context) => ({
                            weight: 'bold',
                            size: context.active ? 14 : 10
                        }),
                        color: primaryColor,
                        padding: 4
                    },
                    legend: { display: false } 
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#f3f4f6' },
                        ticks: {
                            callback: (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                        }
                    },
                    x: { grid: { display: false } }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    };

    const renderCategoriesChart = (data) => {
        const ctx = document.getElementById('categoriesChart').getContext('2d');
        
        if (categoriesChartInstance) categoriesChartInstance.destroy();

        categoriesChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(item => item.label),
                datasets: [{
                    data: data.map(item => item.value),
                    quantities: data.map(item => item.qty), // Guardamos as quantidades aqui
                    backgroundColor: [
                        '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
                        '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'
                    ],
                    borderWidth: 0,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        callbacks: {
                            label: (context) => {
                                const revenue = context.raw;
                                const qty = context.dataset.quantities[context.dataIndex] || 0;
                                return [
                                    ` ${context.label}`,
                                    ` Faturamento: ${revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
                                    ` Quantidade: ${qty} un.`
                                ];
                            }
                        }
                    },

                    datalabels: {
                        color: '#fff',
                        font: (context) => ({
                            weight: 'bold',
                            size: context.active ? 14 : 11 // Aumenta no hover
                        }),
                        textAlign: 'center',
                        textShadowBlur: (context) => context.active ? 10 : 4,
                        textShadowColor: 'rgba(0,0,0,0.8)',
                        formatter: (value, context) => {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            if (total === 0) return '';
                            const percentage = ((value / total) * 100).toFixed(1);
                            return percentage > 5 ? `${percentage}%` : '';
                        },
                        display: (context) => context.dataset.data[context.dataIndex] > 0,
                        listeners: {
                            enter: (context) => {
                                context.active = true;
                                return true;
                            },
                            leave: (context) => {
                                context.active = false;
                                return true;
                            }
                        }
                    }
                }
            }
        });
    };



    const loadSalesHistory = async () => {
        const start = document.getElementById('dashStartDate').value;
        const end = document.getElementById('dashEndDate').value;
        let url = '/api/sales/history';
        if (start && end) url += `?startDate=${start}&endDate=${end}`;

        try {
            const res = await fetch(url, { headers: fetchHeaders });
            if (res.ok) {
                const history = await res.json();
                const tbody = document.getElementById('salesHistoryBody');
                if (!tbody) return;
                tbody.innerHTML = '';
                if (history.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;text-align:center;">Nenhuma venda encontrada no período.</td></tr>';
                    return;
                }
                history.forEach(s => {
                    const date = new Date(s.created_at).toLocaleString('pt-BR');
                    const pay = s.payment_method;
                    const cost = parseFloat(s.total_cost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const rev = parseFloat(s.total_revenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const prof = parseFloat(s.total_profit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

                    const tr = document.createElement('tr');
                    const isCanceled = s.status === 'canceled';
                    tr.style.borderBottom = '1px solid #f3f4f6';
                    if (isCanceled) {
                        tr.style.background = '#fff1f2';
                        tr.style.opacity = '0.7';
                    }

                    tr.innerHTML = `
                        <td style="padding: 1rem;">${date}${isCanceled ? ' <span style="font-size:0.7rem; background:#ef4444; color:white; padding:2px 4px; border-radius:4px;">CANCELADA</span>' : ''}</td>
                        <td style="padding: 1rem; text-transform: capitalize;">${pay}</td>
                        <td style="padding: 1rem; color: #ef4444;">${cost}</td>
                        <td style="padding: 1rem; color: #2563eb;">${rev}</td>
                        <td style="padding: 1rem; color: #10b981; font-weight: bold;">${prof}</td>
                        <td style="padding: 1rem; text-align: center;">
                            <div style="display: flex; justify-content: center; gap: 8px;">
                                <button class="icon-btn view-sale-btn" title="Ver Detalhes" style="color: #6366f1;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                </button>
                                ${!isCanceled ? `
                                <button class="icon-btn cancel-sale-btn" title="Cancelar Venda" style="color: #ef4444;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                                ` : ''}
                            </div>
                        </td>
                    `;

                    tr.querySelector('.view-sale-btn').onclick = () => showSaleDetails(s);
                    if (!isCanceled) {
                        tr.querySelector('.cancel-sale-btn').onclick = () => cancelSale(s.id);
                    }
                    tbody.appendChild(tr);
                });
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.showSaleDetails = (sale) => {
        const modal = document.getElementById('saleDetailModal');
        const content = document.getElementById('saleDetailContent');
        if (!modal || !content) return;

        // Formatações iniciais
        const saleDate = new Date(sale.created_at).toLocaleDateString('pt-BR');
        const saleTime = sale.sale_time || new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const totalValue = parseFloat(sale.total_revenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const isCanceled = sale.status === 'canceled';
        
        // Itens da venda
        let items = [];
        try {
            items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || []);
        } catch (e) { items = []; }

        let itemsHtml = `
            <div style="background: var(--primary); padding: 2rem 1.5rem; color: white; text-align: center; border-radius: 12px 12px 0 0; position: relative; overflow: hidden;">
                <div style="position: absolute; top: -20px; right: -20px; opacity: 0.1; transform: rotate(15deg);">
                    <svg width="120" height="120" fill="white" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                <h2 style="margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 2px; opacity: 0.9;">Comprovante de Venda</h2>
                <div style="font-size: 2.2rem; font-weight: 800; margin: 0.5rem 0;">#${sale.id}</div>
                <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.2); padding: 0.4rem 1rem; border-radius: 50px; font-size: 0.85rem;">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    ${saleDate} às ${saleTime}
                </div>
            </div>

            <div style="padding: 1.5rem;">
                <div style="margin-bottom: 1.5rem;">
                    <h3 style="font-size: 0.9rem; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                        Itens do Pedido
                    </h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #f3f4f6; text-align: left;">
                                <th style="padding: 0.75rem 0; font-size: 0.75rem; color: #9ca3af; text-transform: uppercase;">Item</th>
                                <th style="padding: 0.75rem 0; font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; text-align: center;">Qtd</th>
                                <th style="padding: 0.75rem 0; font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; text-align: right;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (items.length > 0) {
            items.forEach(item => {
                const subtotal = (parseFloat(item.price) * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                itemsHtml += `
                    <tr style="border-bottom: 1px solid #f9fafb;">
                        <td style="padding: 1rem 0;">
                            <div style="font-weight: 600; color: #111827; font-size: 0.95rem;">${item.name || 'Produto'}</div>
                            <div style="color: #6b7280; font-size: 0.8rem;">Vlr. Unit: ${parseFloat(item.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        </td>
                        <td style="padding: 1rem 0; text-align: center; color: #374151;">${item.quantity}</td>
                        <td style="padding: 1rem 0; text-align: right; font-weight: 600; color: #111827;">${subtotal}</td>
                    </tr>
                `;
            });
        } else {
            itemsHtml += `<tr><td colspan="3" style="padding: 2rem 0; text-align: center; color: #9ca3af; font-style: italic;">Dados dos itens não disponíveis para esta venda.</td></tr>`;
        }

        itemsHtml += `
                        </tbody>
                    </table>
                </div>

                <div style="background: #f8fafc; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-size: 0.9rem; color: #64748b;">
                        <span>Método de Pagamento</span>
                        <div style="display: flex; align-items: center; gap: 0.4rem; color: #334155; font-weight: 600;">
                            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                            ${sale.payment_method}${sale.installments > 1 ? ` (${sale.installments}x)` : ''}
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 2px dashed #e2e8f0;">
                        <span style="font-weight: 700; color: #1e293b; font-size: 1rem;">TOTAL DA VENDA</span>
                        <span style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${totalValue}</span>
                    </div>
                </div>
        `;

        if (isCanceled) {
            const cancelDate = sale.canceled_at ? new Date(sale.canceled_at).toLocaleString('pt-BR') : 'Não registrada';
            itemsHtml += `
                <div style="background: #fff1f2; border: 1px solid #fecaca; border-radius: 12px; padding: 1.25rem; border-left: 5px solid #ef4444;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; color: #991b1b; font-weight: 800; text-transform: uppercase; font-size: 0.75rem; margin-bottom: 0.75rem;">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        Venda Cancelada
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <div style="font-size: 0.7rem; color: #991b1b; opacity: 0.7; text-transform: uppercase;">Data do Cancelamento</div>
                            <div style="font-size: 0.85rem; font-weight: 600; color: #7f1d1d;">${cancelDate}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.7rem; color: #991b1b; opacity: 0.7; text-transform: uppercase;">Responsável</div>
                            <div style="font-size: 0.85rem; font-weight: 600; color: #7f1d1d;">${sale.cancel_responsible || 'Sistema'}</div>
                        </div>
                    </div>
                    <div style="margin-top: 1rem;">
                        <div style="font-size: 0.7rem; color: #991b1b; opacity: 0.7; text-transform: uppercase;">Motivo da Justificativa</div>
                        <div style="font-size: 0.85rem; color: #7f1d1d; background: rgba(255,255,255,0.5); padding: 0.5rem; border-radius: 6px; margin-top: 0.25rem;">${sale.cancel_reason || 'Não informado'}</div>
                    </div>
                </div>
            `;
        }

        itemsHtml += `</div>`; // Fechando o padding: 1.5rem

        content.innerHTML = itemsHtml;
        modal.style.display = 'flex';
    };

    window.cancelSale = (saleId) => {
        const modal = document.getElementById('cancelSaleModal');
        if (!modal) return;
        
        document.getElementById('cancelTargetId').value = saleId;
        document.getElementById('cancelReasonInput').value = '';
        document.getElementById('cancelResponsibleInput').value = '';
        modal.style.display = 'flex';
    };

    // Ouvinte para o botão de confirmação do cancelamento no modal
    document.getElementById('confirmCancelBtn')?.addEventListener('click', async () => {
        const saleId = document.getElementById('cancelTargetId').value;
        const reason = document.getElementById('cancelReasonInput').value.trim();
        const responsible = document.getElementById('cancelResponsibleInput').value.trim();

        if (!reason) {
            showToast('Por favor, informe o motivo do cancelamento', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('erp_token');
            const res = await fetch(`/api/sales/${saleId}/cancel`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason, responsible })
            });

            if (res.ok) {
                document.getElementById('cancelSaleModal').style.display = 'none';
                showToast('Venda cancelada com sucesso!', 'success');
                loadDashboard();
            } else {
                const data = await res.json();
                showToast(data.error || 'Erro ao cancelar venda', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Erro de conexão ao cancelar venda', 'error');
        }
    });

    document.getElementById('dashFilterBtn')?.addEventListener('click', loadDashboard);

    // ==========================================
    // GESTÃO DE LOJISTAS (ADMIN ONLY)
    // ==========================================
    let currentLojistas = [];
    const lojistaModal = document.getElementById('lojistaModal');
    const lojistaForm = document.getElementById('lojistaForm');
    const lojistaCloseBtn = document.getElementById('closeLojistaModal');
    const newLojistaBtn = document.getElementById('newLojistaBtn');



    const loadLojistas = async () => {
        try {
            const res = await fetch('/api/admin/users', { headers: fetchHeaders });
            if (res.ok) {
                currentLojistas = await res.json();
                renderLojistasTable(currentLojistas);
            }
        } catch (e) { console.error(e); }
    };

    const renderLojistasTable = (lojistas) => {
        const tbody = document.getElementById('lojistasTableBody');
        if(!tbody) return;
        tbody.innerHTML = '';
        lojistas.forEach(u => {
            const statusColor = (u.active === false || u.active === 0) ? '#ef4444' : '#10b981';
            const statusText = (u.active === false || u.active === 0) ? 'Inativo' : 'Ativo';
            const roleText = u.role === 'admin' ? 'Administrador' : 'Lojista';
            
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 1rem;">
                        <div style="font-weight: 600;">${u.name}</div>
                        <div style="font-size: 0.8rem; color: #6b7280;">${u.tenant_name || 'Sem Loja'} (ID: ${u.tenant_id})</div>
                    </td>
                    <td style="padding: 1rem;">${u.email}</td>
                    <td style="padding: 1rem;">
                        <span style="display:inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; margin-right: 5px;"></span>
                        ${statusText}
                        ${u.inactive_reason ? `<div style="font-size: 0.7rem; color: #ef4444;">Motivo: ${u.inactive_reason}</div>` : ''}
                    </td>
                    <td style="padding: 1rem;">${roleText}</td>
                    <td style="padding: 1rem;">
                        <button class="btn" style="background:#e5e7eb; color:#374151; font-size: 0.8rem; padding: 0.3rem 0.6rem;" onclick="window.openEditLojista(${u.id})">Editar</button>
                    </td>
                </tr>
            `;
        });
    };

    window.openEditLojista = (id) => {
        const u = currentLojistas.find(user => user.id === id);
        if (!u) return;
        
        document.getElementById('lojistaModalTitle').innerText = 'Editar Lojista';
        document.getElementById('lojistaId').value = u.id;
        lojistaForm.elements['name'].value = u.name;
        lojistaForm.elements['email'].value = u.email;
        lojistaForm.elements['role'].value = u.role;
        lojistaForm.elements['active'].value = u.active === false || u.active === 0 ? "false" : "true";
        lojistaForm.elements['inactive_reason'].value = u.inactive_reason || '';
        lojistaForm.elements['tenant_name'].parentElement.style.display = 'none'; // Não muda tenant no edit simples
        document.getElementById('passField').style.display = 'none'; // Não muda senha por aqui
        
        lojistaModal.style.display = 'flex';
    };

    if (newLojistaBtn) {
        newLojistaBtn.addEventListener('click', () => {
            document.getElementById('lojistaModalTitle').innerText = 'Novo Lojista';
            document.getElementById('lojistaId').value = '';
            lojistaForm.reset();
            lojistaForm.elements['tenant_name'].parentElement.style.display = 'block';
            document.getElementById('passField').style.display = 'block';
            lojistaModal.style.display = 'flex';
        });

        lojistaCloseBtn.addEventListener('click', () => lojistaModal.style.display = 'none');

        lojistaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('saveLojistaBtn');
            submitBtn.disabled = true;
            submitBtn.innerText = 'Salvando...';

            const payload = {
                name: lojistaForm.elements['name'].value,
                email: lojistaForm.elements['email'].value,
                password: lojistaForm.elements['password'].value,
                role: lojistaForm.elements['role'].value,
                active: lojistaForm.elements['active'].value,
                inactive_reason: lojistaForm.elements['inactive_reason'].value,
                tenant_name: lojistaForm.elements['tenant_name'].value
            };

            const id = document.getElementById('lojistaId').value;
            const url = id ? `/api/admin/users/${id}` : '/api/admin/users';
            const method = id ? 'PUT' : 'POST';

            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json', ...fetchHeaders },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    lojistaModal.style.display = 'none';
                    loadLojistas();
                    showToast('Lojista salvo com sucesso!');
                } else {
                    const data = await res.json();
                    showToast(data.error || 'Erro ao salvar lojista', 'error');
                }
            } catch (e) { showToast('Erro de conexão', 'error'); }
            finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Salvar';
            }
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
            const totalProductsEl = document.getElementById('dashTotalProducts');
            if (totalProductsEl) totalProductsEl.innerText = currentProducts.length;
        } catch (error) {
            console.error('Erro ao carregar produtos', error);
        }
    };

    const renderProductsTable = (products) => {
        const tbody = document.getElementById('productsTableBody');
        tbody.innerHTML = '';
        products.forEach(p => {
            const price = parseFloat(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const imageThumb = (p.images && p.images.length > 0) ? `<img src="${p.images[0]}" alt="${p.title}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 50px; height: 50px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #9ca3af; text-align: center;">Sem foto</div>';

            const inactiveRowStyle = (p.active === false || p.active === 0) ? 'background-color: #f7a9a9ff;' : '';

            tbody.innerHTML += `
                <tr style="${inactiveRowStyle}">
                    <td style="vertical-align: middle;">${imageThumb}</td>
                    <td style="vertical-align: middle;"><strong>${p.title}</strong></td>
                    <td style="vertical-align: middle;">${p.category}</td>
                    <td style="vertical-align: middle; text-align: center;">
                        <span style="display: block; font-weight: 600;">${p.availableQuantity}</span>
                        <span style="font-size: 0.7rem; color: #6b7280;">unidades</span>
                    </td>
                    <td style="vertical-align: middle;">${price}</td>
                    <td style="vertical-align: middle;">
                        <div style="display: flex; gap: 0.4rem;">
                            <button class="btn btn-primary" onclick="window.openReplenishModal(${p.id})" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: #10b981;" title="Alimentar Estoque">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                            <button class="btn btn-secondary" onclick="window.openStockHistoryModal(${p.id})" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; border: 1px solid #d1d5db; background: white; color: #374151;" title="Ver Histórico">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                            </button>
                            <button class="btn btn-primary" onclick="window.openEditModal(${p.id})" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">Editar</button>
                            <button class="btn btn-primary" onclick="window.openDeleteConfirmModal(${p.id})" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: #ef4444;" title="Excluir Produto">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
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

    window.openEditModal = (id) => {
        const p = currentProducts.find(prod => prod.id === id);
        if (!p) return;

        document.getElementById('modalTitle').innerText = 'Editar Produto';
        document.getElementById('productId').value = p.id;
        form.elements['title'].value = p.title;
        form.elements['description'].value = p.description || '';
        form.elements['price'].value = parseFloat(p.price || 0).toFixed(2).replace('.', ',');
        form.elements['cost_price'].value = parseFloat(p.cost_price || 0).toFixed(2).replace('.', ',');
        form.elements['availableQuantity'].value = p.availableQuantity;
        form.elements['category'].value = p.category;
        form.elements['theme'].value = p.theme || '';
        form.elements['active'].value = p.active === false || p.active === 0 ? "false" : "true";

        modal.style.display = 'flex';
    };

    if (newProductBtn) {
        newProductBtn.addEventListener('click', () => {
            document.getElementById('modalTitle').innerText = 'Novo Produto';
            form.reset();
            document.getElementById('productId').value = '';
            form.elements['price'].value = '0,00';
            form.elements['cost_price'].value = '0,00';
            modal.style.display = 'flex';
        });

        closeBtn.addEventListener('click', () => { modal.style.display = 'none'; form.reset(); });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('saveProductBtn');
            submitBtn.disabled = true;
            submitBtn.innerText = 'Salvando...';

            try {
                const formData = new FormData(form);
                
                // Converter vírgula para ponto nos campos de preço para o backend
                const priceValue = formData.get('price') ? formData.get('price').replace(',', '.') : '0.00';
                const costValue = formData.get('cost_price') ? formData.get('cost_price').replace(',', '.') : '0.00';
                formData.set('price', priceValue);
                formData.set('cost_price', costValue);

                const id = document.getElementById('productId').value;
                const url = id ? `/api/products/${id}` : '/api/products';
                const method = id ? 'PUT' : 'POST';

                const res = await fetch(url, {
                    method: method,
                    headers: { 'Authorization': `Bearer ${token}` }, // FormData sets boundary automatically
                    body: formData
                });
                if (res.ok) {
                    modal.style.display = 'none';
                    form.reset();
                    loadProducts();
                    showToast('Produto salvo com sucesso!', 'success');
                } else {
                    showToast('Erro ao salvar produto.', 'error');
                }
            } catch (e) {
                console.error(e);
                showToast('Erro de conexão.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Salvar';
            }
        });
    }

    // ==========================================
    // REPOSIÇÃO E HISTÓRICO DE ESTOQUE
    // ==========================================
    const replenishModal = document.getElementById('replenishModal');
    const replenishForm = document.getElementById('replenishForm');
    const stockHistoryModal = document.getElementById('stockHistoryModal');

    window.openReplenishModal = (id) => {
        const p = currentProducts.find(prod => prod.id === id);
        if (!p) return;
        document.getElementById('replenishProductId').value = p.id;
        document.getElementById('replenishProductName').innerText = p.title;
        document.getElementById('replenishQuantity').value = '';
        document.getElementById('replenishReason').value = '';
        replenishModal.style.display = 'flex';
    };

    replenishForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('replenishProductId').value;
        const quantityToAdd = document.getElementById('replenishQuantity').value;
        const reason = document.getElementById('replenishReason').value;

        try {
            const res = await fetch('/api/inventory/replenish', {
                method: 'POST',
                headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, quantityToAdd, reason })
            });
            if (res.ok) {
                replenishModal.style.display = 'none';
                loadProducts();
                showToast('Estoque atualizado!', 'success');
            } else {
                showToast('Erro ao atualizar estoque.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Erro de conexão.', 'error');
        }
    });

    window.openStockHistoryModal = async (id) => {
        const p = currentProducts.find(prod => prod.id === id);
        if (!p) return;
        document.getElementById('historyProductName').innerText = p.title;
        document.getElementById('stockHistoryTableBody').innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center;">Carregando...</td></tr>';
        stockHistoryModal.style.display = 'flex';

        try {
            const res = await fetch(`/api/inventory/history/${id}`, { headers: fetchHeaders });
            if (res.ok) {
                const history = await res.json();
                renderStockHistory(history);
            } else {
                showToast('Erro ao carregar histórico.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Erro de conexão.', 'error');
        }
    };

    const renderStockHistory = (history) => {
        const tbody = document.getElementById('stockHistoryTableBody');
        tbody.innerHTML = '';
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: #9ca3af;">Nenhuma movimentação registrada.</td></tr>';
            return;
        }

        history.forEach(h => {
            const date = new Date(h.created_at).toLocaleString('pt-BR');
            const isEntry = h.quantity_change > 0;
            const changeColor = isEntry ? '#10b981' : '#ef4444';
            const changeIcon = isEntry ? '+' : '';

            tbody.innerHTML += `
                <tr>
                    <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${date}</td>
                    <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${h.reason}</td>
                    <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; text-align: center; color: ${changeColor}; font-weight: 600;">${changeIcon}${h.quantity_change}</td>
                    <td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6; text-align: center; font-weight: 600;">${h.new_quantity}</td>
                </tr>
            `;
        });
    };

    window.closeModal = (id) => {
        document.getElementById(id).style.display = 'none';
    };

    // ==========================================
    // EXCLUSÃO DE PRODUTOS
    // ==========================================
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const deleteCodeInput = document.getElementById('deleteCodeInput');
    const deleteSecurityCodeDisplay = document.getElementById('deleteSecurityCode');
    let productToDeleteId = null;
    let currentSecurityCode = '';

    window.openDeleteConfirmModal = (id) => {
        const p = currentProducts.find(prod => prod.id === id);
        if (!p) return;
        productToDeleteId = id;
        
        // Gerar código de 5 dígitos aleatório
        currentSecurityCode = Math.floor(10000 + Math.random() * 90000).toString();
        
        document.getElementById('deleteProductName').innerText = p.title;
        deleteSecurityCodeDisplay.innerText = currentSecurityCode;
        deleteCodeInput.value = ''; // Limpar input anterior
        
        deleteConfirmModal.style.display = 'flex';
        setTimeout(() => deleteCodeInput.focus(), 100);
    };

    confirmDeleteBtn.addEventListener('click', async () => {
        if (!productToDeleteId) return;

        // Validar código
        if (deleteCodeInput.value !== currentSecurityCode) {
            showToast('Código de segurança incorreto!', 'error');
            deleteCodeInput.style.borderColor = '#ef4444';
            setTimeout(() => deleteCodeInput.style.borderColor = '#e5e7eb', 2000);
            return;
        }

        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.innerText = 'Excluindo...';

        try {
            const res = await fetch(`/api/products/${productToDeleteId}`, {
                method: 'DELETE',
                headers: fetchHeaders
            });
            if (res.ok) {
                deleteConfirmModal.style.display = 'none';
                loadProducts();
                showToast('Produto excluído com sucesso!', 'success');
            } else {
                showToast('Erro ao excluir produto.', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Erro de conexão.', 'error');
        } finally {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerText = 'Excluir Agora';
            productToDeleteId = null;
        }
    });

    // ==========================================
    // FRENTE DE CAIXA (PDV)
    // ==========================================
    let posCart = [];

    const loadPosProducts = async () => {
        // Aproveita o load inicial se já tiver
        if (currentProducts.length === 0) await loadProducts();
        applyPosFilters();
    };

    const renderPosProducts = (products) => {
        const grid = document.getElementById('posProductList');
        grid.innerHTML = '';
        products.forEach(p => {
            const isOutOfStock = p.availableQuantity <= 0;
            const card = document.createElement('div');

            card.style.cssText = `
                border: 1px solid #e5e7eb; 
                border-radius: 8px; 
                padding: 1rem; 
                background: ${isOutOfStock ? '#f9fafb' : 'white'}; 
                text-align: center; 
                cursor: ${isOutOfStock ? 'not-allowed' : 'pointer'}; 
                transition: transform 0.2s;
                opacity: ${isOutOfStock ? '0.6' : '1'};
            `;

            const stockLabel = isOutOfStock
                ? '<div style="font-size: 0.8rem; color: #ef4444; font-weight: bold; margin-bottom: 0.5rem;">Esgotado</div>'
                : `<div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem;">Estoque: ${p.availableQuantity}</div>`;

            const imageThumb = (p.images && p.images.length > 0)
                ? `<img src="${p.images[0]}" alt="${p.title}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px; margin-bottom: 0.5rem;">`
                : '<div style="width: 100%; height: 100px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #9ca3af; margin-bottom: 0.5rem;">Sem foto</div>';

            card.innerHTML = `
                ${imageThumb}
                ${stockLabel}
                <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem; color: #1f2937;">${p.title}</h4>
                <div style="font-weight: 600; color: #2563eb;">R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</div>
            `;

            if (!isOutOfStock) {
                card.onmouseover = () => card.style.transform = 'scale(1.05)';
                card.onmouseout = () => card.style.transform = 'scale(1)';
                card.onclick = () => addToPosCart(p);
            } else {
                card.onclick = () => showToast('Este produto está esgotado.', 'error');
            }
            grid.appendChild(card);
        });
    };

    const applyPosFilters = () => {
        const term = (document.getElementById('posSearch')?.value || '').toLowerCase();
        const stockFilter = document.getElementById('posStockFilter')?.value || 'todos';

        // Filtrar inativos por padrão
        let filtered = currentProducts.filter(p => p.title.toLowerCase().includes(term) && p.active !== false && p.active !== 0);

        if (stockFilter === 'com_estoque') {
            filtered = filtered.filter(p => p.availableQuantity > 0);
        } else if (stockFilter === 'sem_estoque') {
            filtered = filtered.filter(p => p.availableQuantity <= 0);
        }

        renderPosProducts(filtered);
    };

    document.getElementById('posSearch')?.addEventListener('input', applyPosFilters);
    document.getElementById('posStockFilter')?.addEventListener('change', applyPosFilters);

    const addToPosCart = (product) => {
        const existing = posCart.find(i => i.id === product.id);
        if (existing) {
            if (existing.quantity >= product.availableQuantity) {
                showToast('Quantidade máxima em estoque atingida.', 'error');
                return;
            }
            existing.quantity++;
        } else {
            posCart.push({
                id: product.id,
                title: product.title,
                price: product.price,
                quantity: 1,
                max: product.availableQuantity,
                image: (product.images && product.images.length > 0) ? product.images[0] : null
            });
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
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${item.image ? `<img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #9ca3af; text-align: center;">Sem foto</div>'}
                    <div>
                        <div style="font-weight: 500; font-size: 0.9rem;">${item.title}</div>
                        <div style="font-size: 0.8rem; color: #6b7280;">${item.quantity}x R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}</div>
                    </div>
                </div>
                <button style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold;">X</button>
            `;
            div.querySelector('button').onclick = () => removeFromPosCart(item.id);
            cartEl.appendChild(div);
        });

        totalEl.innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        checkoutBtn.disabled = false;
    };

    // ==========================================
    // FINALIZAR VENDA MODAL
    // ==========================================
    const checkoutModal = document.getElementById('checkoutModal');
    const closeCheckoutModal = document.getElementById('closeCheckoutModal');
    const checkoutForm = document.getElementById('checkoutForm');
    const paymentMethodEl = document.getElementById('paymentMethod');
    const installmentsGroupEl = document.getElementById('installmentsGroup');
    const feeAmountEl = document.getElementById('feeAmount');
    const discountAmountEl = document.getElementById('discountAmount');

    let posTotalValueNum = 0;

    const updateCheckoutTotals = () => {
        const fee = parseFloat(feeAmountEl.value.replace(',', '.')) || 0;
        const discount = parseFloat(discountAmountEl.value.replace(',', '.')) || 0;
        const finalTotal = posTotalValueNum + fee - discount;

        document.getElementById('checkoutSubtotal').innerText = posTotalValueNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('checkoutFeeInfo').innerText = '+ ' + fee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('checkoutDiscountInfo').innerText = '- ' + discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('checkoutTotalValue').innerText = Math.max(0, finalTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    document.getElementById('posCheckoutBtn')?.addEventListener('click', () => {
        if (posCart.length === 0) return;

        // Calculate subtotal
        posTotalValueNum = posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Reset form
        checkoutForm.reset();
        feeAmountEl.value = '0,00';
        discountAmountEl.value = '0,00';
        installmentsGroupEl.style.display = 'none';
        updateCheckoutTotals();

        checkoutModal.style.display = 'flex';
    });

    closeCheckoutModal?.addEventListener('click', () => checkoutModal.style.display = 'none');

    paymentMethodEl?.addEventListener('change', (e) => {
        if (e.target.value === 'credito') {
            installmentsGroupEl.style.display = 'block';
        } else {
            installmentsGroupEl.style.display = 'none';
        }
    });

    feeAmountEl?.addEventListener('input', updateCheckoutTotals);
    discountAmountEl?.addEventListener('input', updateCheckoutTotals);

    checkoutForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('confirmCheckoutBtn');
        btn.disabled = true;
        btn.innerText = 'Processando...';

        try {
            const items = posCart.map(i => ({ 
                id: i.id, 
                name: i.name, 
                price: i.price, 
                quantity: i.quantity 
            }));

            const payload = {
                items,
                paymentMethod: paymentMethodEl.value,
                installments: paymentMethodEl.value === 'credito' ? document.getElementById('installments').value : 1,
                fee: parseFloat(feeAmountEl.value.replace(',', '.')) || 0,
                discount: parseFloat(discountAmountEl.value.replace(',', '.')) || 0,
                total: posTotalValueNum + (parseFloat(feeAmountEl.value.replace(',', '.')) || 0) - (parseFloat(discountAmountEl.value.replace(',', '.')) || 0)
            };

            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...fetchHeaders },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast('Venda finalizada com sucesso!', 'success');
                checkoutModal.style.display = 'none';
                posCart = [];
                updatePosCartUI();
                await loadProducts(); // Atualiza estoque na memória
                applyPosFilters(); // Re-aplica filtros ao atualizar grid
            } else {
                const data = await res.json();
                showToast(data.error || 'Erro ao processar venda.', 'error');
            }
        } catch (err) {
            showToast('Erro de conexão.', 'error');
        } finally {
            btn.innerText = 'Confirmar Venda';
            btn.disabled = false;
        }
    });

    // ==========================================
    // PERSONALIZAÇÃO DE MARCA (FASE 2)
    // ==========================================

    // Carregar configurações da loja (Cores, Logo, Nome)
    const loadStoreSettings = async () => {
        try {
            const response = await fetch('/api/settings/profile', { headers: fetchHeaders });
            if (!response.ok) return;
            const data = await response.json();

            // Aplicar Cores
            if (data.primary_color) {
                document.documentElement.style.setProperty('--primary', data.primary_color);
                document.getElementById('colorPrimary').value = data.primary_color;
            }
            if (data.secondary_color) {
                document.documentElement.style.setProperty('--secondary', data.secondary_color);
                document.getElementById('colorSecondary').value = data.secondary_color;
            }
            if (data.tertiary_color) {
                document.documentElement.style.setProperty('--tertiary', data.tertiary_color);
                document.getElementById('colorTertiary').value = data.tertiary_color;
            }

            // Aplicar Nome e Logo na Topbar
            const topbarStoreName = document.getElementById('topbarStoreName');
            const topbarLogo = document.getElementById('topbarLogo');
            const storeNameInput = document.getElementById('storeNameInput');
            const logoPreview = document.getElementById('logoPreview');
            const logoPlaceholder = document.getElementById('logoPlaceholder');

            if (data.name) {
                topbarStoreName.innerText = data.name;
                if (storeNameInput) storeNameInput.value = data.name;
            }

            if (data.logo_url) {
                topbarLogo.src = data.logo_url;
                topbarLogo.style.display = 'block';
                if (logoPreview) {
                    logoPreview.src = data.logo_url;
                    logoPreview.style.display = 'block';
                    if (logoPlaceholder) logoPlaceholder.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Erro ao carregar configurações da loja:', error);
        }
    };

    // Salvar Perfil (Nome e Logo)
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveProfileBtn');
            const originalText = btn.innerText;
            btn.innerText = 'Salvando...';
            btn.disabled = true;

            const formData = new FormData(profileForm);
            
            // Adicionar cores atuais ao envio para manter consistência
            const pCol = document.getElementById('colorPrimary');
            const sCol = document.getElementById('colorSecondary');
            const tCol = document.getElementById('colorTertiary');
            
            if (pCol) formData.append('primary_color', pCol.value);
            if (sCol) formData.append('secondary_color', sCol.value);
            if (tCol) formData.append('tertiary_color', tCol.value);

            try {
                console.log('Enviando perfil da loja...');
                const response = await fetch('/api/settings/profile', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (response.ok) {
                    console.log('Perfil atualizado com sucesso!');
                    showToast('Perfil atualizado com sucesso!');
                    await loadStoreSettings();
                } else {
                    const errorData = await response.json();
                    console.error('Erro no servidor:', errorData);
                    showToast('Erro ao atualizar perfil.', 'error');
                }
            } catch (error) {
                showToast('Erro de conexão.', 'error');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // Salvar apenas Cores
    const saveColorsBtn = document.getElementById('saveColorsBtn');
    if (saveColorsBtn) {
        saveColorsBtn.addEventListener('click', async () => {
            const btn = saveColorsBtn;
            const originalText = btn.innerText;
            btn.innerText = 'Salvando...';
            btn.disabled = true;

            const colors = {
                name: document.getElementById('storeNameInput').value,
                primary_color: document.getElementById('colorPrimary').value,
                secondary_color: document.getElementById('colorSecondary').value,
                tertiary_color: document.getElementById('colorTertiary').value
            };

            try {
                const response = await fetch('/api/settings/profile', {
                    method: 'POST',
                    headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify(colors)
                });

                if (response.ok) {
                    showToast('Cores salvas com sucesso!');
                    await loadStoreSettings();
                } else {
                    showToast('Erro ao salvar cores.', 'error');
                }
            } catch (error) {
                showToast('Erro de conexão.', 'error');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // Preview de Logo antes de subir
    const logoUpload = document.getElementById('logoUpload');
    if (logoUpload) {
        logoUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const logoPreview = document.getElementById('logoPreview');
                    const logoPlaceholder = document.getElementById('logoPlaceholder');
                    if (logoPreview) {
                        logoPreview.src = event.target.result;
                        logoPreview.style.display = 'block';
                    }
                    if (logoPlaceholder) logoPlaceholder.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // ==========================================
    // GESTÃO DE CAIXA (LÓGICA)
    // ==========================================
    let currentCashSession = null;

    const loadCashManagement = async () => {
        try {
            const res = await fetch('/api/cash/current', { headers: fetchHeaders });
            const session = await res.json();
            currentCashSession = session;

            const badge = document.getElementById('cashStatusBadge');
            const closedView = document.getElementById('cashClosedView');
            const openView = document.getElementById('cashOpenView');

            if (!session) {
                if (badge) {
                    badge.innerText = 'FECHADO';
                    badge.style.background = '#fee2e2';
                    badge.style.color = '#ef4444';
                }
                if (closedView) closedView.style.display = 'block';
                if (openView) openView.style.display = 'none';
            } else {
                if (badge) {
                    badge.innerText = 'ABERTO';
                    badge.style.background = '#dcfce7';
                    badge.style.color = '#10b981';
                }
                if (closedView) closedView.style.display = 'none';
                if (openView) openView.style.display = 'block';
                updateCashSummary(session);
            }
        } catch (error) {
            console.error('Erro ao carregar caixa:', error);
        }
    };

    const updateCashSummary = async (session) => {
        try {
            // Exibir saldo inicial imediatamente (já temos na sessão)
            const openingEl = document.getElementById('currentOpeningBalance');
            if (openingEl) {
                openingEl.innerText = parseFloat(session.opening_balance || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }

            // Buscamos as vendas em dinheiro da sessão via histórico
            console.log('Buscando dados para Sessão ID:', session.id);
            
            const salesRes = await fetch(`/api/sales/history?session_id=${session.id}`, { headers: fetchHeaders });
            const sales = await salesRes.json();
            console.log('Vendas encontradas:', sales.length);
            
            const transRes = await fetch(`/api/cash/transactions?session_id=${session.id}`, { headers: fetchHeaders });
            const transactions = await transRes.json();
            console.log('Movimentações encontradas:', transactions.length);

            const cashSalesTotal = Array.isArray(sales) ? sales
                .filter(s => String(s.payment_method).toLowerCase() === 'dinheiro' && s.status === 'completed')
                .reduce((sum, s) => sum + Number(s.total_revenue || 0), 0) : 0;

            const transactionsTotal = Array.isArray(transactions) ? transactions
                .reduce((sum, t) => {
                    const val = Number(t.amount || 0);
                    return sum + (t.type === 'in' ? val : -val);
                }, 0) : 0;

            const salesEl = document.getElementById('currentCashSales');
            const transEl = document.getElementById('currentTransactionsBalance');
            const expectedEl = document.getElementById('currentExpectedBalance');

            if (salesEl) salesEl.innerText = cashSalesTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            if (transEl) transEl.innerText = transactionsTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            const opening = Number(session.opening_balance || 0);
            const expectedValue = opening + cashSalesTotal + transactionsTotal;
            if (expectedEl) expectedEl.innerText = expectedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            // Renderizar Atividades
            const activitiesBody = document.getElementById('currentSessionActivities');
            if (activitiesBody) {
                const activities = [
                    ...(Array.isArray(sales) ? sales.filter(s => String(s.payment_method).toLowerCase() === 'dinheiro' && s.status === 'completed').map(s => ({
                        time: s.created_at ? new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                        type: 'Venda',
                        desc: 'Venda em Dinheiro',
                        amount: Number(s.total_revenue || 0),
                        color: '#10b981'
                    })) : []),
                    ...(Array.isArray(transactions) ? transactions.map(t => ({
                        time: t.created_at ? new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                        type: t.type === 'in' ? 'Aporte' : 'Sangria',
                        desc: t.reason || 'Sem descrição',
                        amount: t.type === 'in' ? Number(t.amount || 0) : -Number(t.amount || 0),
                        color: t.type === 'in' ? '#3b82f6' : '#ef4444'
                    })) : [])
                ].sort((a, b) => b.time.localeCompare(a.time));

                activitiesBody.innerHTML = activities.length ? activities.map(a => `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 0.75rem; color: #6b7280;">${a.time}</td>
                        <td style="padding: 0.75rem; font-weight: 600; color: ${a.color}">${a.type}</td>
                        <td style="padding: 0.75rem; color: #374151;">${a.desc}</td>
                        <td style="padding: 0.75rem; text-align: right; font-weight: 600; color: ${a.color}">${a.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    </tr>
                `).join('') : '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: #9ca3af;">Nenhuma atividade nesta sessão</td></tr>';
            }
        } catch (error) {
            console.error('ERRO CRÍTICO NO RESUMO DO CAIXA:', error);
        }
    };

    // Abrir Caixa
    const openCashBtn = document.getElementById('openCashBtn');
    if (openCashBtn) {
        openCashBtn.addEventListener('click', async () => {
            const balanceRaw = document.getElementById('openingBalanceInput').value;
            const balance = balanceRaw.replace(',', '.');
            try {
                const res = await fetch('/api/cash/open', {
                    method: 'POST',
                    headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ openingBalance: balance })
                });
                if (res.ok) {
                    showToast('Caixa aberto com sucesso!', 'success');
                    loadCashManagement();
                } else {
                    const err = await res.json();
                    showToast(err.error, 'error');
                }
            } catch (error) {
                showToast('Erro ao abrir caixa', 'error');
            }
        });
    }

    // Lançar Transação (Sangria/Aporte)
    const cashTransactionForm = document.getElementById('cashTransactionForm');
    if (cashTransactionForm) {
        cashTransactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentCashSession) return;

            const data = {
                sessionId: currentCashSession.id,
                type: document.getElementById('transType').value,
                amount: document.getElementById('transAmount').value.replace(',', '.'),
                reason: document.getElementById('transReason').value
            };

            try {
                const res = await fetch('/api/cash/transaction', {
                    method: 'POST',
                    headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    showToast('Movimentação registrada!', 'success');
                    cashTransactionForm.reset();
                    loadCashManagement();
                }
            } catch (error) {
                showToast('Erro ao registrar', 'error');
            }
        });
    }

    // Fechar Caixa
    const closeCashBtn = document.getElementById('closeCashBtn');
    const cashCloseConfirmModal = document.getElementById('cashCloseConfirmModal');
    const confirmCashCloseBtn = document.getElementById('confirmCashCloseBtn');
    const cashCloseCodeInput = document.getElementById('cashCloseCodeInput');
    const cashCloseSecurityCodeDisplay = document.getElementById('cashCloseSecurityCode');
    let currentCashCloseCode = '';

    if (closeCashBtn) {
        closeCashBtn.addEventListener('click', () => {
            const actualRaw = document.getElementById('actualBalanceInput').value;
            const actual = actualRaw.replace(',', '.');
            if (!actual || actual === "0,00") return showToast('Informe o valor contado!', 'error');

            // Gerar código de 5 dígitos
            currentCashCloseCode = Math.floor(10000 + Math.random() * 90000).toString();
            cashCloseSecurityCodeDisplay.innerText = currentCashCloseCode;
            cashCloseCodeInput.value = '';
            
            cashCloseConfirmModal.style.display = 'flex';
            setTimeout(() => cashCloseCodeInput.focus(), 100);
        });
    }

    if (confirmCashCloseBtn) {
        confirmCashCloseBtn.addEventListener('click', async () => {
            if (cashCloseCodeInput.value !== currentCashCloseCode) {
                showToast('Código de segurança incorreto!', 'error');
                return;
            }

            const actual = document.getElementById('actualBalanceInput').value.replace(',', '.');
            confirmCashCloseBtn.disabled = true;
            confirmCashCloseBtn.innerText = 'Encerrando...';

            try {
                if (!currentCashSession || !currentCashSession.id) {
                    showToast('Sessão de caixa não identificada. Recarregue a página.', 'error');
                    return;
                }

                const res = await fetch('/api/cash/close', {
                    method: 'POST',
                    headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        sessionId: currentCashSession.id, 
                        actualBalance: actual 
                    })
                });

                if (res.ok) {
                    const result = await res.json();
                    cashCloseConfirmModal.style.display = 'none';
                    
                    const summary = result.summary;
                    const diff = Number(summary.difference);
                    
                    // Preencher Modal de Resumo
                    document.getElementById('summaryExpected').innerText = Number(summary.expected).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    document.getElementById('summaryActual').innerText = Number(summary.actual).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    document.getElementById('summaryDiffValue').innerText = Math.abs(diff).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    
                    const card = document.getElementById('summaryDiffCard');
                    const text = document.getElementById('summaryDiffText');
                    const icon = document.getElementById('summaryIcon');
                    const label = document.getElementById('summaryDiffLabel');

                    if (diff === 0) {
                        card.style.background = '#dcfce7';
                        card.style.color = '#166534';
                        label.innerText = 'CAIXA CORRETO';
                        text.innerText = 'O saldo físico bate perfeitamente com o sistema.';
                        icon.innerHTML = '<div style="background: #dcfce7; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: #10b981;"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>';
                    } else if (diff > 0) {
                        card.style.background = '#eff6ff';
                        card.style.color = '#1e40af';
                        label.innerText = 'SOBRA DE CAIXA';
                        text.innerText = `Há um excedente de R$ ${diff.toFixed(2)} em relação ao esperado.`;
                        icon.innerHTML = '<div style="background: #eff6ff; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: #3b82f6;"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg></div>';
                    } else {
                        card.style.background = '#fee2e2';
                        card.style.color = '#991b1b';
                        label.innerText = 'QUEBRA DE CAIXA';
                        text.innerText = `Faltam R$ ${Math.abs(diff).toFixed(2)} para atingir o valor esperado.`;
                        icon.innerHTML = '<div style="background: #fee2e2; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: #ef4444;"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></div>';
                    }

                    document.getElementById('cashSummaryModal').style.display = 'flex';
                    loadCashManagement();
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Erro ao fechar caixa', 'error');
                }
            } catch (error) {
                console.error('ERRO FATAL NO FECHAMENTO:', error);
                showToast('Erro técnico: ' + error.message, 'error');
            } finally {
                confirmCashCloseBtn.disabled = false;
                confirmCashCloseBtn.innerText = 'Encerrar Turno';
            }
        });
    }

    // Início automático (datas já configuradas no bloco superior)
    loadCashManagement();
    
    loadStoreSettings(); // Carregar marca da loja
    loadProducts();

    // Load dashboard if initial section
    if (document.getElementById('dashboard').classList.contains('active')) {
        loadDashboard();
    }
});
