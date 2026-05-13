import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { shoppingApi } from '../../services/shoppingApi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';

const COMMON_SUGGESTIONS = [
  'Leite', 'Pão', 'Ovos', 'Carne', 'Frango', 
  'Frutas', 'Legumes', 'Arroz', 'Feijão', 
  'Café', 'Papel Higiênico', 'Sabonete', 'Detergente'
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

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

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await shoppingApi.getShoppingList();
      setItems(data);
    } catch (error) {
      toast.error('Erro ao carregar lista de compras');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

    const currentMonthStr = filterMonth; // YYYY-MM
    const currentYearStr = filterMonth.slice(0, 4); // YYYY
    let totalSpentMonth = 0;
    let totalSpentYear = 0;
    const estTotals = {};
    const monthlySpending = {};
    const userTotals = {};
    const productTotals = {};

    items.history.forEach(item => {
      const price = item.price || 0;
      if (!price) return;

      const dateObj = new Date(item.bought_at || item.created_at);
      const month = dateObj.toISOString().slice(0, 7);
      const year = dateObj.toISOString().slice(0, 4);
      
      // Evolução de gastos
      if (!monthlySpending[month]) monthlySpending[month] = 0;
      monthlySpending[month] += price;

      if (year === currentYearStr) {
        totalSpentYear += price;
      }

      // Estatísticas do mês atual
      if (month === currentMonthStr) {
        totalSpentMonth += price;
        const est = item.establishment ? item.establishment.trim() : 'Outros';
        if (!estTotals[est]) estTotals[est] = 0;
        estTotals[est] += price;

        const userName = item.bought_by_name || 'Desconhecido';
        if (!userTotals[userName]) userTotals[userName] = 0;
        userTotals[userName] += price;

        const prodName = item.name;
        if (!productTotals[prodName]) productTotals[prodName] = 0;
        productTotals[prodName] += price;
      }
    });

    const pieData = Object.keys(estTotals).map(k => ({ name: k, value: estTotals[k] })).sort((a, b) => b.value - a.value);
    const userPieData = Object.keys(userTotals).map(k => ({ name: k, value: userTotals[k] })).sort((a, b) => b.value - a.value);
    
    // Top 5 products
    const topProducts = Object.keys(productTotals).map(k => ({ name: k, Total: productTotals[k] })).sort((a, b) => b.Total - a.Total).slice(0, 5);

    // Sort months chronologically
    const areaData = Object.keys(monthlySpending).sort().map(m => {
      const [yyyy, mm] = m.split('-');
      return { month: `${mm}/${yyyy}`, Total: monthlySpending[m] };
    });

    return { totalSpentMonth, totalSpentYear, pieData, userPieData, topProducts, areaData };
  }, [items.history, viewMode]);

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

      {/* TABS E FILTROS */}
      <div className="mb-24" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="tabs tabs-scroll" style={{ margin: 0, flexShrink: 0 }}>
          <button type="button" className={`tab ${viewMode === 'pending' ? 'active' : ''}`} onClick={() => setViewMode('pending')}>
            📋 Para Comprar ({items.pending.length})
          </button>
          <button className={`tab ${viewMode === 'history' ? 'active' : ''}`} onClick={() => setViewMode('history')}>
            ✅ Histórico ({items.history.length})
          </button>
          {canSeeDashboard && (
            <button className={`tab ${viewMode === 'dashboard' ? 'active' : ''}`} onClick={() => setViewMode('dashboard')}>
              📊 Dashboard
            </button>
          )}
        </div>
        
        {viewMode === 'dashboard' && canSeeDashboard && (
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-light)' }}>Mês Referência:</label>
            <input 
              type="month" 
              className="form-input" 
              style={{ padding: '4px 10px', height: '36px', width: 'auto' }}
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            />
          </div>
        )}
      </div>

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
        /* DASHBOARD VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '16px', alignItems: 'flex-start', maxWidth: '100%' }}>
          
          {/* CARDS */}
          <div className="card flex-center flex-col" style={{ gridColumn: '1/-1', backgroundColor: 'var(--primary)', backgroundImage: 'linear-gradient(135deg, var(--primary), #2c3e50)', color: '#ffffff', padding: '30px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', opacity: 0.9, color: '#ffffff' }}>Total Gasto em {filterMonth.split('-').reverse().join('/')}</h3>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, margin: '15px 0', textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
              R$ {dashboardData.totalSpentMonth.toFixed(2)}
            </div>
            <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '6px 16px', borderRadius: '20px', fontSize: '0.9rem', backdropFilter: 'blur(4px)' }}>
                Acumulado no Ano: <strong>R$ {dashboardData.totalSpentYear.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="mb-16">📈 Evolução de Gastos Mensais</h3>
            <div style={{ height: 250 }}>
              {dashboardData.areaData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboardData.areaData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="var(--text-light)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-light)" fontSize={12} tickFormatter={(val) => `R$${val}`} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value) => `R$ ${parseFloat(value).toFixed(2)}`} />
                    <Area type="monotone" dataKey="Total" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex-center" style={{ height: '100%', color: 'var(--text-light)' }}>Nenhum histórico disponível.</div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="mb-16">🏬 Gastos por Estabelecimento (Mês)</h3>
            <div style={{ height: 250 }}>
              {dashboardData.pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dashboardData.pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {dashboardData.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `R$ ${parseFloat(value).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex-center" style={{ height: '100%', color: 'var(--text-light)' }}>Nenhum gasto registrado este mês.</div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="mb-16">👤 Gastos por Usuário (Mês)</h3>
            <div style={{ height: 250 }}>
              {dashboardData.userPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dashboardData.userPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}`}>
                      {dashboardData.userPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `R$ ${parseFloat(value).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex-center" style={{ height: '100%', color: 'var(--text-light)' }}>Nenhum gasto registrado este mês.</div>
              )}
            </div>
          </div>

          <div className="card" style={{ gridColumn: '1/-1' }}>
            <h3 className="mb-16">🏆 Top 5 Produtos Mais Caros no Mês</h3>
            <div style={{ height: 280 }}>
              {dashboardData.topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardData.topProducts} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <XAxis type="number" stroke="var(--text-light)" fontSize={12} tickFormatter={(val) => `R$${val}`} />
                    <YAxis dataKey="name" type="category" stroke="var(--text-light)" fontSize={12} width={120} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--bg-hover)' }} formatter={(value) => `R$ ${parseFloat(value).toFixed(2)}`} />
                    <Bar dataKey="Total" radius={[0, 4, 4, 0]} barSize={30}>
                      {dashboardData.topProducts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex-center" style={{ height: '100%', color: 'var(--text-light)' }}>Nenhum produto com valor registrado neste mês.</div>
              )}
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
