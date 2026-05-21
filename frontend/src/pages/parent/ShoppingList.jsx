import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { shoppingApi } from '../../services/shoppingApi';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';

const COMMON_SUGGESTIONS = [
  'Leite', 'Pão', 'Ovos', 'Carne', 'Frango', 
  'Frutas', 'Legumes', 'Arroz', 'Feijão', 
  'Café', 'Papel Higiênico', 'Sabonete', 'Detergente'
];

const COLORS = ['#6366F1', '#10B981', '#F97316', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B'];

export default function ShoppingList() {
  const { t } = useLanguage();
  const toast = useToast();
  const { user } = useAuth();
  const canSeeDashboard = user?.role === 'parent' || user?.role === 'master';
  const [items, setItems] = useState({ pending: [], history: [] });
  const [viewMode, setViewMode] = useState('pending'); // 'pending' | 'history' | 'dashboard'
  const [showModal, setShowModal] = useState(false);
  const [showPricePrompt, setShowPricePrompt] = useState(false);
  const [pricePromptItem, setPricePromptItem] = useState(null);
  const [priceInput, setPriceInput] = useState('');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const initialForm = { name: '', is_urgent: false, establishment: '', quantity: '', description: '', price: '' };
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState(null);
  
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async ({ silent } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await shoppingApi.getShoppingList();
      setItems(data);
    } catch (error) {
      if (!silent) toast.error('Erro ao carregar lista de compras');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  /** Ciclo vida (tabs); navegação remonta página e volta a usar o mesmo useEffect — sem throttle aqui. */
  useAutoRefresh(useCallback(() => fetchData({ silent: true }), [fetchData]), 2500);

  const handleCreateOrEdit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      const payload = { ...form, price: parseFloat(form.price) || 0 };
      if (editId) {
        await shoppingApi.editItem(editId, payload);
        toast.success('Item atualizado com sucesso!');
      } else {
        await shoppingApi.addItem(payload);
        toast.success('Item adicionado com sucesso!');
      }
      setForm(initialForm);
      setEditId(null);
      setShowModal(false);
      fetchData();
    } catch (error) {
      toast.error(editId ? 'Erro ao atualizar item' : 'Erro ao adicionar item');
    }
  };

  const handleBuyClick = (item) => {
    setPricePromptItem(item);
    setPriceInput(item.price ? String(item.price) : '');
    setShowPricePrompt(true);
  };

  const confirmBuy = async (e) => {
    e.preventDefault();
    try {
      const priceVal = parseFloat(priceInput) || 0;
      await shoppingApi.markAsBought(pricePromptItem.id, priceVal);
      toast.success('Item marcado como comprado!');
      setShowPricePrompt(false);
      setPricePromptItem(null);
      fetchData();
    } catch (error) {
      toast.error('Erro ao marcar item');
    }
  };

  const handleUnbuy = async (id) => {
    try {
      await shoppingApi.unmarkAsBought(id);
      toast.success('Item retornado para a lista!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao desfazer compra');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este item?')) return;
    try {
      await shoppingApi.deleteItem(id);
      toast.success('Item excluído');
      fetchData();
    } catch (error) {
      toast.error('Erro ao excluir item');
    }
  };

  const openEditModal = (item) => {
    setForm({
      name: item.name,
      is_urgent: !!item.is_urgent,
      establishment: item.establishment || '',
      quantity: item.quantity || '',
      description: item.description || '',
      price: item.price || ''
    });
    setEditId(item.id);
    setShowModal(true);
  };

  const openAddModal = () => {
    setForm(initialForm);
    setEditId(null);
    setShowModal(true);
  };

  // Agrupamento por estabelecimento
  const groupedPending = useMemo(() => {
    return items.pending.reduce((acc, item) => {
      const key = item.establishment ? item.establishment.trim() : 'Geral';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items.pending]);

  const sortedEstablishments = useMemo(() => {
    return Object.keys(groupedPending).sort((a, b) => {
      if (a === 'Geral') return 1;
      if (b === 'Geral') return -1;
      return a.localeCompare(b);
    });
  }, [groupedPending]);

  // Dashboard calculations
  const dashboardData = useMemo(() => {
    if (viewMode !== 'dashboard') return null;
    // Estatísticas adicionais
    let urgentCount = 0;
    let totalItemsMonth = 0;
    let avgTicket = 0;
    let mostBoughtItem = { name: '-', count: 0 };
    const itemCount = {};

    const currentMonthStr = filterMonth; // YYYY-MM
    const currentYearStr = filterMonth.slice(0, 4); // YYYY
    let totalSpentMonth = 0;
    let totalSpentYear = 0;
    const estTotals = {};
    const monthlySpending = {};
    const userTotals = {};
    const productTotals = {};

    // Gastos diários do mês de referência
    const [refYear, refMonth] = currentMonthStr.split('-');
    const daysInMonth = new Date(Number(refYear), Number(refMonth), 0).getDate();
    const dailySpending = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailySpending[d] = 0;
    }

    items.history.forEach(item => {
      const price = item.price || 0;
      if (!price) return;

      const dateObj = new Date(item.bought_at || item.created_at);
      const month = dateObj.toISOString().slice(0, 7);
      const year = dateObj.toISOString().slice(0, 4);

      if (!monthlySpending[month]) monthlySpending[month] = 0;
      monthlySpending[month] += price;

      if (year === currentYearStr) totalSpentYear += price;

      if (month === currentMonthStr) {
        totalSpentMonth += price;
        totalItemsMonth += 1;
        const est = item.establishment ? item.establishment.trim() : 'Outros';
        if (!estTotals[est]) estTotals[est] = 0;
        estTotals[est] += price;

        const userName = item.bought_by_name || 'Desconhecido';
        if (!userTotals[userName]) userTotals[userName] = 0;
        userTotals[userName] += price;

        const prodName = item.name;
        if (!productTotals[prodName]) productTotals[prodName] = 0;
        productTotals[prodName] += price;

        if (!itemCount[prodName]) itemCount[prodName] = 0;
        itemCount[prodName] += 1;
        if (itemCount[prodName] > mostBoughtItem.count) {
          mostBoughtItem = { name: prodName, count: itemCount[prodName] };
        }

        const day = dateObj.getDate();
        dailySpending[day] = (dailySpending[day] || 0) + price;
      }
    });
    urgentCount = (items.pending || []).filter(i => i.is_urgent).length;
    avgTicket = totalItemsMonth > 0 ? totalSpentMonth / totalItemsMonth : 0;

    const pieData = Object.keys(estTotals).map(k => ({ name: k, value: estTotals[k] })).sort((a, b) => b.value - a.value);
    const userPieData = Object.keys(userTotals).map(k => ({ name: k, value: userTotals[k] })).sort((a, b) => b.value - a.value);
    
    // Top 5 products
    const topProducts = Object.keys(productTotals).map(k => ({ name: k, Total: productTotals[k] })).sort((a, b) => b.Total - a.Total).slice(0, 5);

    // Sort months chronologically
    const areaData = Object.keys(monthlySpending).sort().map(m => {
      const [yyyy, mm] = m.split('-');
      return { month: `${mm}/${yyyy}`, Total: monthlySpending[m] };
    });

    const dailyData = Object.keys(dailySpending).map(day => ({
      day: `${day}`,
      Gasto: dailySpending[day]
    })).sort((a, b) => Number(a.day) - Number(b.day));

    return {
      totalSpentMonth, totalSpentYear, pieData, userPieData,
      topProducts, areaData, dailyData,
      urgentCount, totalItemsMonth, avgTicket, mostBoughtItem,
    };
  }, [items.history, items.pending, viewMode, filterMonth]);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <div className="flex-between mb-24" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">🛒 Lista e Contabilidade</h1>
          <p className="page-subtitle">Gerencie suas compras e acompanhe os gastos</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Adicionar Item
        </button>
      </div>

      {/* Vistas principais — grelha no telemóvel (sem depender só de scroll horizontal) */}
      <div
        className="shopping-view-segments mb-24"
        role="tablist"
        aria-label="Lista de compras"
      >
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'pending'}
          className={`shopping-segment${viewMode === 'pending' ? ' shopping-segment--active' : ''}`}
          onClick={() => setViewMode('pending')}
        >
          <span className="shopping-segment__icon" aria-hidden>📋</span>
          <span className="shopping-segment__label">Para comprar</span>
          <span className="shopping-segment__count">{items.pending.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'history'}
          className={`shopping-segment${viewMode === 'history' ? ' shopping-segment--active' : ''}`}
          onClick={() => setViewMode('history')}
        >
          <span className="shopping-segment__icon" aria-hidden>✓</span>
          <span className="shopping-segment__label">Histórico</span>
          <span className="shopping-segment__count">{items.history.length}</span>
        </button>
        {canSeeDashboard && (
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'dashboard'}
            className={`shopping-segment shopping-segment--accent${viewMode === 'dashboard' ? ' shopping-segment--active' : ''}`}
            onClick={() => setViewMode('dashboard')}
          >
            <span className="shopping-segment__icon" aria-hidden>📊</span>
            <span className="shopping-segment__label">Painel</span>
          </button>
        )}
      </div>

      {viewMode === 'dashboard' && canSeeDashboard && (
        <div
          className="shopping-dashboard-controls mb-24"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'flex-end',
            width: '100%',
          }}
        >
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)' }}>Mês Referência:</label>
          <input
            type="month"
            className="form-input"
            style={{ padding: '4px 10px', height: '36px', width: 'auto', maxWidth: '100%' }}
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex-center py-24"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div></div>
      ) : viewMode === 'pending' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sortedEstablishments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
              Nenhum item pendente. Clique em "Adicionar Item" para começar.
            </div>
          ) : (
            sortedEstablishments.map((est) => (
              <div key={est} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ background: 'var(--bg-card)', padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🏪 {est} <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-light)' }}>({groupedPending[est].length} {groupedPending[est].length === 1 ? 'item' : 'itens'})</span>
                </div>
                <div style={{ padding: '8px 0' }}>
                  {groupedPending[est].map((item) => (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                      borderBottom: '1px solid var(--border)', flexWrap: 'nowrap',
                      background: item.is_urgent ? 'rgba(255,107,107,0.05)' : 'transparent',
                    }}>
                      {/* Botão comprar */}
                      <button
                        className="btn btn-sm"
                        style={{ width: 32, height: 32, minWidth: 32, padding: 0, borderRadius: 8, border: '2px solid var(--border)', background: 'transparent', flexShrink: 0 }}
                        onClick={() => handleBuyClick(item)}
                        title="Marcar como comprado"
                      />
                      {/* Nome + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: item.is_urgent ? 'var(--danger)' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {item.is_urgent && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>⚠️</span>}
                          <span style={{ wordBreak: 'break-word' }}>{item.name}</span>
                          {item.quantity && <span style={{ fontWeight: 400, fontSize: '0.82rem', color: 'var(--text-light)' }}>× {item.quantity}</span>}
                        </div>
                        {item.description && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.description}
                          </div>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 2 }}>
                          👤 {item.registered_by_name} · {new Date(item.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      {/* Ações */}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEditModal(item)} title="Editar">✏️</button>
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(item.id)} title="Excluir">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : viewMode === 'history' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.history.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
              Nenhum item no histórico.
            </div>
          ) : items.history.map((item) => (
            <div key={item.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap' }}>
              <button
                className="btn btn-sm"
                style={{ width: 32, height: 32, minWidth: 32, padding: 0, borderRadius: 8, background: 'var(--success)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                onClick={() => handleUnbuy(item.id)}
                title="Desfazer compra"
              >↩️</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>
                  {item.name}
                  {item.quantity && <span style={{ fontWeight: 400, fontSize: '0.82rem', color: 'var(--text-light)', marginLeft: 6 }}>× {item.quantity}</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                  {item.establishment && <span>🏪 {item.establishment}</span>}
                  <span>👤 {item.bought_by_name}</span>
                  <span>📅 {new Date(item.bought_at).toLocaleDateString()}</span>
                </div>
              </div>
              {item.price > 0 && (
                <span className="badge badge-primary" style={{ flexShrink: 0 }}>R$ {item.price.toFixed(2)}</span>
              )}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEditModal(item)} title="Editar">✏️</button>
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(item.id)} title="Excluir">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'dashboard' && canSeeDashboard ? (
        /* ──────────── DASHBOARD VIEW (novo design) ──────────── */
        <div className="shop-dash">

          {/* 1. Hero banner com gasto do mês */}
          <div className="shop-dash__hero">
            <div className="shop-dash__hero-left">
              <span className="shop-dash__hero-label">Total gasto em {filterMonth.split('-').reverse().join('/')}</span>
              <div className="shop-dash__hero-value">
                R$ {dashboardData.totalSpentMonth.toFixed(2)}
              </div>
              <div className="shop-dash__hero-pills">
                <div className="shop-dash__hero-pill">
                  📅 Acumulado no ano: <strong>R$ {dashboardData.totalSpentYear.toFixed(2)}</strong>
                </div>
                <div className="shop-dash__hero-pill">
                  🧾 {dashboardData.totalItemsMonth} itens este mês
                </div>
              </div>
            </div>
            <div className="shop-dash__hero-icon">🛒</div>
          </div>

          {/* 2. KPI cards coloridos */}
          <div className="shop-dash__kpis">
            <div className="stat-card grad-purple">
              <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>🧾</div>
              <div className="stat-info">
                <h3>{dashboardData.totalItemsMonth}</h3>
                <p>Itens comprados</p>
              </div>
            </div>
            <div className="stat-card grad-orange">
              <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>🚨</div>
              <div className="stat-info">
                <h3>{dashboardData.urgentCount}</h3>
                <p>Itens urgentes</p>
              </div>
            </div>
            <div className="stat-card grad-blue">
              <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>💰</div>
              <div className="stat-info">
                <h3>R$ {dashboardData.avgTicket.toFixed(2)}</h3>
                <p>Ticket médio</p>
              </div>
            </div>
            <div className="stat-card grad-green">
              <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}>⭐</div>
              <div className="stat-info">
                <h3 style={{ fontSize: '1rem' }}>{dashboardData.mostBoughtItem.name}</h3>
                <p>Item mais comprado</p>
              </div>
            </div>
          </div>

          {/* Gráfico de Gastos Diários (Mês Atual) */}
          <div className="shop-dash__row" style={{ gridTemplateColumns: '1fr' }}>
            <div className="card shop-dash__chart-card">
              <div className="card-header">
                <h3 className="card-title">📅 Gastos Diários (Mês Selecionado)</h3>
                <span className="badge badge-info">Dia a dia</span>
              </div>
              <div className="shop-dash__chart" style={{ height: 280 }}>
                {dashboardData.dailyData.some(d => d.Gasto > 0) ? (
                  <ResponsiveContainer width="99%" height="100%" minWidth={0}>
                    <BarChart data={dashboardData.dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <XAxis dataKey="day" stroke="var(--text-light)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-light)" fontSize={11} tickFormatter={(v) => `R$${v}`} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'var(--bg-hover)' }} formatter={(v) => `R$ ${parseFloat(v).toFixed(2)}`} />
                      <Bar dataKey="Gasto" fill="#6366F1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="shop-dash__empty">📭 Sem compras realizadas neste mês</div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Linha de gráficos: evolução + estabelecimento */}
          <div className="shop-dash__row">
            <div className="card shop-dash__chart-card">
              <div className="card-header">
                <h3 className="card-title">📈 Evolução de Gastos</h3>
                <span className="badge badge-info">Histórico</span>
              </div>
              <div className="shop-dash__chart">
                {dashboardData.areaData.length > 0 ? (
                  <ResponsiveContainer width="99%" height="100%" minWidth={0}>
                    <AreaChart data={dashboardData.areaData} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" stroke="var(--text-light)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-light)" fontSize={11} tickFormatter={(v) => `R$${v}`} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v) => `R$ ${parseFloat(v).toFixed(2)}`} />
                      <Area type="monotone" dataKey="Total" stroke="#6366F1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTotal)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="shop-dash__empty">📭 Sem histórico disponível</div>
                )}
              </div>
            </div>

            <div className="card shop-dash__chart-card">
              <div className="card-header">
                <h3 className="card-title">🏬 Por estabelecimento</h3>
                <span className="badge badge-primary">Mês</span>
              </div>
              <div className="shop-dash__chart">
                {dashboardData.pieData.length > 0 ? (
                  <ResponsiveContainer width="99%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={dashboardData.pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value"
                           label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {dashboardData.pieData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v) => `R$ ${parseFloat(v).toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="shop-dash__empty">📭 Sem gastos este mês</div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Linha: usuário + top produtos */}
          <div className="shop-dash__row">
            <div className="card shop-dash__chart-card">
              <div className="card-header">
                <h3 className="card-title">👤 Por usuário</h3>
                <span className="badge badge-success">Mês</span>
              </div>
              <div className="shop-dash__chart">
                {dashboardData.userPieData.length > 0 ? (
                  <ResponsiveContainer width="99%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={dashboardData.userPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={85} paddingAngle={2} dataKey="value"
                           label={({ name }) => name}>
                        {dashboardData.userPieData.map((_, i) => (<Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v) => `R$ ${parseFloat(v).toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="shop-dash__empty">📭 Sem dados</div>
                )}
              </div>
            </div>

            <div className="card shop-dash__chart-card">
              <div className="card-header">
                <h3 className="card-title">🏆 Top 5 produtos mais caros</h3>
                <span className="badge badge-warning">Mês</span>
              </div>
              <div className="shop-dash__chart">
                {dashboardData.topProducts.length > 0 ? (
                  <ResponsiveContainer width="99%" height="100%" minWidth={0}>
                    <BarChart data={dashboardData.topProducts} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                      <XAxis type="number" stroke="var(--text-light)" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                      <YAxis dataKey="name" type="category" stroke="var(--text-light)" fontSize={11} width={110} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'var(--bg-hover)' }} formatter={(v) => `R$ ${parseFloat(v).toFixed(2)}`} />
                      <Bar dataKey="Total" radius={[0, 6, 6, 0]} barSize={22}>
                        {dashboardData.topProducts.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="shop-dash__empty">📭 Sem produtos registados</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL: ADD / EDIT ITEM */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editId ? '✏️ Editar Item' : '➕ Adicionar Item'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateOrEdit}>
              
              {!editId && (
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Sugestões rápidas:</label>
                  <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                    {COMMON_SUGGESTIONS.map(sug => (
                      <button 
                        key={sug} 
                        type="button" 
                        className="btn btn-sm btn-ghost" 
                        style={{ border: '1px solid var(--border)', fontSize: '0.75rem' }}
                        onClick={() => setForm(p => ({ ...p, name: sug }))}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-2">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Nome do Produto *</label>
                  <input 
                    className="form-input" 
                    value={form.name} 
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} 
                    placeholder="Ex: Leite, Pão, Maçã..."
                    autoFocus
                    required 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Quantidade</label>
                  <input 
                    className="form-input" 
                    value={form.quantity} 
                    onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} 
                    placeholder="Ex: 2, 1kg, 500g..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Estabelecimento</label>
                  <input 
                    className="form-input" 
                    value={form.establishment} 
                    onChange={e => setForm(p => ({ ...p, establishment: e.target.value }))} 
                    placeholder="Ex: Supermercado X, Padaria..."
                    list="estabelecimentos-sugestoes"
                  />
                  <datalist id="estabelecimentos-sugestoes">
                    <option value="Supermercado" />
                    <option value="Padaria" />
                    <option value="Açougue" />
                    <option value="Hortifruti" />
                    <option value="Farmácia" />
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Valor Total (R$) {editId && <span style={{color: 'var(--primary)'}}>(Opcional)</span>}</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input" 
                    value={form.price} 
                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))} 
                    placeholder="Ex: 15.50"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input 
                    className="form-input" 
                    value={form.description} 
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))} 
                    placeholder="Marca, detalhes..."
                  />
                </div>
              </div>
              
              <div className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={form.is_urgent} 
                    onChange={e => setForm(p => ({ ...p, is_urgent: e.target.checked }))} 
                    style={{ width: 18, height: 18 }} 
                  />
                  <span style={{ fontWeight: 600, color: form.is_urgent ? 'var(--danger)' : 'var(--text)' }}>
                    ⚠️ Marcar como Urgente
                  </span>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editId ? 'Salvar Alterações' : 'Adicionar Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BUY PROMPT */}
      {showPricePrompt && (
        <div className="modal-overlay" onClick={() => setShowPricePrompt(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2 className="modal-title">✅ Confirmar Compra</h2>
              <button className="modal-close" onClick={() => setShowPricePrompt(false)}>✕</button>
            </div>
            <form onSubmit={confirmBuy}>
              <div className="form-group">
                <p className="mb-16">Marcando <strong>{pricePromptItem?.name}</strong> como comprado.</p>
                <label className="form-label">Valor pago (Opcional - R$)</label>
                <input 
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input" 
                  value={priceInput} 
                  onChange={e => setPriceInput(e.target.value)} 
                  placeholder="Ex: 10.50"
                  autoFocus
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: 8 }}>
                  Preencher o valor ajuda a manter o controle no seu Dashboard.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowPricePrompt(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Confirmar Compra</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
