import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';

export default function MasterDashboard() {
  const { t } = useLanguage();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState({});
  const [families, setFamilies] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subModal, setSubModal] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rStats, rFams, rUsers, rLogs, rSubs] = await Promise.all([
        api.get('/master/stats').catch(() => ({ data: {} })),
        api.get('/master/families').catch(() => ({ data: [] })),
        api.get('/master/users').catch(() => ({ data: [] })),
        api.get('/master/audit-logs?limit=50').catch(() => ({ data: [] })),
        api.get('/master/subscriptions').catch(() => ({ data: [] })),
      ]);
      setStats(rStats.data);
      setFamilies(rFams.data);
      setUsers(rUsers.data);
      setLogs(rLogs.data);
      setSubscriptions(rSubs.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleFamilyStatus = async (id, status) => {
    try {
      await api.put(`/master/families/${id}/status`, { status });
      toast.success(`Família ${status === 'blocked' ? 'bloqueada' : 'desbloqueada'}!`);
      fetchData();
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const handleUserStatus = async (id, status) => {
    try {
      await api.put(`/master/users/${id}/status`, { status });
      toast.success('Status atualizado!');
      fetchData();
    } catch { toast.error('Erro'); }
  };

  const handleSaveSub = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/master/subscriptions/${subModal.family_id}`, subModal);
      toast.success('Assinatura atualizada!');
      setSubModal(null);
      fetchData();
    } catch { toast.error('Erro'); }
  };

  const planColors = { free: 'var(--text-light)', family: 'var(--primary)', premium: '#FDCB6E' };

  return (
    <div className="animate-fade-in" style={{ padding: 24 }}>
      <div className="flex-between mb-24">
        <div>
          <h1 className="page-title" style={{ fontSize: '1.8rem' }}>🌐 Painel Master</h1>
          <p className="page-subtitle">Administração Global do SaaS FamilyBase</p>
        </div>
        <button className="btn btn-ghost" onClick={fetchData}>🔄 Atualizar</button>
      </div>

      {/* STATS */}
      <div className="grid grid-4 mb-32">
        {[
          { label: 'Famílias', value: stats.totalFamilies, icon: '👨‍👩‍👧‍👦', color: 'var(--primary)' },
          { label: 'Ativas', value: stats.activeFamilies, icon: '✅', color: 'var(--success)' },
          { label: 'Bloqueadas', value: stats.blockedFamilies, icon: '🚫', color: 'var(--danger)' },
          { label: 'Usuários', value: stats.totalUsers, icon: '👤', color: 'var(--secondary)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${s.color}20`, fontSize: '1.5rem' }}>{s.icon}</div>
            <div className="stat-info">
              <h3 style={{ color: s.color }}>{s.value ?? '—'}</h3>
              <p>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="tabs mb-24" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>🏠 Famílias</button>
        <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>👤 Usuários</button>
        <button className={`tab ${tab === 'subscriptions' ? 'active' : ''}`} onClick={() => setTab('subscriptions')}>💳 Assinaturas</button>
        <button className={`tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>📋 Audit Logs</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40 }}>⏳ Carregando...</div>}

      {!loading && tab === 'overview' && (
        <div className="table-container">
          <table>
            <thead><tr><th>Família</th><th>Plano</th><th>Pais</th><th>Filhos</th><th>Status</th><th>Criado em</th><th>Ações</th></tr></thead>
            <tbody>
              {families.map(f => (
                <tr key={f.id}>
                  <td><strong>{f.name}</strong></td>
                  <td><span className="badge" style={{ color: planColors[f.plan] || '' }}>💳 {f.plan || 'free'}</span></td>
                  <td>{f.parent_count}</td>
                  <td>{f.children_count}</td>
                  <td>
                    <span className={`badge badge-${f.status === 'active' ? 'success' : f.status === 'blocked' ? 'danger' : 'warning'}`}>
                      {f.status || 'active'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{new Date(f.created_at).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <div className="flex gap-8">
                      {f.status !== 'blocked'
                        ? <button className="btn btn-sm btn-danger" onClick={() => handleFamilyStatus(f.id, 'blocked')}>🚫 Bloquear</button>
                        : <button className="btn btn-sm btn-ghost" onClick={() => handleFamilyStatus(f.id, 'active')}>✅ Desbloquear</button>
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'users' && (
        <div className="table-container">
          <table>
            <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Família</th><th>Status</th><th>Último Acesso</th><th>Ações</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td style={{ fontSize: '0.85rem' }}>{u.email}</td>
                  <td><span className={`badge badge-${u.role === 'parent' ? 'primary' : u.role === 'relative' ? 'info' : 'success'}`}>{u.role}</span></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{u.family_name}</td>
                  <td><span className={`badge badge-${u.status === 'active' ? 'success' : 'danger'}`}>{u.status || 'active'}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString('pt-BR') : '—'}</td>
                  <td>
                    {u.status !== 'blocked'
                      ? <button className="btn btn-sm btn-danger" onClick={() => handleUserStatus(u.id, 'blocked')}>🚫</button>
                      : <button className="btn btn-sm btn-ghost" onClick={() => handleUserStatus(u.id, 'active')}>✅</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'subscriptions' && (
        <div>
          <div className="table-container">
            <table>
              <thead><tr><th>Família</th><th>Plano</th><th>Status</th><th>Expira em</th><th>Max Filhos</th><th>Max Parentes</th><th>Ações</th></tr></thead>
              <tbody>
                {subscriptions.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.family_name}</strong></td>
                    <td><span className="badge badge-primary">{s.plan}</span></td>
                    <td><span className={`badge badge-${s.status === 'active' ? 'success' : 'danger'}`}>{s.status}</span></td>
                    <td>{s.expires_at ? new Date(s.expires_at).toLocaleDateString('pt-BR') : '∞'}</td>
                    <td>{s.max_children}</td>
                    <td>{s.max_relatives}</td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => setSubModal({ ...s })}>✏️ Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'logs' && (
        <div className="table-container">
          <table>
            <thead><tr><th>Data</th><th>Usuário</th><th>Perfil</th><th>Módulo</th><th>Ação</th><th>Descrição</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{new Date(l.created_at).toLocaleString('pt-BR')}</td>
                  <td>{l.user_name || '—'}</td>
                  <td><span className="badge badge-info">{l.role}</span></td>
                  <td>{l.module}</td>
                  <td><code style={{ fontSize: '0.8rem' }}>{l.action}</code></td>
                  <td style={{ fontSize: '0.85rem' }}>{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subModal && (
        <div className="modal-overlay" onClick={() => setSubModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">✏️ Editar Assinatura</h2><button className="modal-close" onClick={() => setSubModal(null)}>✕</button></div>
            <form onSubmit={handleSaveSub}>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Plano</label>
                  <select className="form-select" value={subModal.plan} onChange={e => setSubModal(p => ({ ...p, plan: e.target.value }))}>
                    <option value="free">Gratuito</option>
                    <option value="family">Família</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={subModal.status} onChange={e => setSubModal(p => ({ ...p, status: e.target.value }))}>
                    <option value="active">Ativo</option>
                    <option value="trial">Trial</option>
                    <option value="cancelled">Cancelado</option>
                    <option value="suspended">Suspenso</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Máx. Filhos</label><input type="number" className="form-input" value={subModal.max_children || 1} onChange={e => setSubModal(p => ({ ...p, max_children: +e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Máx. Parentes</label><input type="number" className="form-input" value={subModal.max_relatives || 0} onChange={e => setSubModal(p => ({ ...p, max_relatives: +e.target.value }))} /></div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Data de Expiração</label><input type="date" className="form-input" value={subModal.expires_at?.split('T')[0] || ''} onChange={e => setSubModal(p => ({ ...p, expires_at: e.target.value }))} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setSubModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
