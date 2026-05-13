import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../services/api';

export default function ReportsPage() {
  const { t } = useLanguage();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [report, setReport] = useState(null);

  useEffect(() => { api.get('/families/children').then(r => { setChildren(r.data); if (r.data.length) setSelectedChild(r.data[0].id); }).catch(() => {}); }, []);
  useEffect(() => { if (selectedChild) api.get(`/reports/child/${selectedChild}`).then(r => setReport(r.data)).catch(() => {}); }, [selectedChild]);

  const exportCSV = async (type) => {
    try {
      const { data } = await api.get(`/reports/export/${type}`, { params: { child_id: selectedChild } });
      if (!data.length) return;
      const headers = Object.keys(data[0]);
      const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${type}_report.csv`; a.click(); URL.revokeObjectURL(url);
    } catch {}
  };

  if (!report) return <div className="flex-center" style={{padding:60}}><span style={{fontSize:'2rem'}}>⏳</span></div>;

  return (
    <div className="animate-fade-in">
      <div className="flex-between mb-24">
        <div><h1 className="page-title">📈 {t('reports')}</h1></div>
        <div className="flex gap-8">
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('tasks')}>📊 {t('tasks')} CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('grades')}>📚 {t('grades')} CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('history')}>📋 History CSV</button>
        </div>
      </div>

      <div className="flex gap-12 mb-24">
        {children.map(c => (
          <button key={c.id} className={`btn ${selectedChild === c.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedChild(c.id)}
            style={selectedChild === c.id ? {} : {borderLeft:`3px solid ${c.color}`}}>{c.name}</button>
        ))}
      </div>

      <div className="grid grid-4 mb-24">
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(0,184,148,0.1)'}}>✅</div><div className="stat-info"><h3>{report.taskStats.approved}</h3><p>{t('approved')}</p></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(253,203,110,0.15)'}}>⏳</div><div className="stat-info"><h3>{report.taskStats.pending}</h3><p>{t('pending')}</p></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(108,92,231,0.1)'}}>⭐</div><div className="stat-info"><h3>{report.child.points}</h3><p>{t('total_points')}</p></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'rgba(232,67,147,0.1)'}}>🏅</div><div className="stat-info"><h3>{report.medals.length}</h3><p>{t('medals')}</p></div></div>
      </div>

      <div className="grid grid-2 mb-24">
        <div className="card">
          <h3 className="card-title mb-16">📚 {t('grades')} - {t('average')}</h3>
          {Object.keys(report.avgBySubject).length === 0 ? <p style={{color:'var(--text-light)'}}>{t('no_grades')}</p> :
            Object.entries(report.avgBySubject).map(([subj, avg]) => (
              <div key={subj} className="flex-between" style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{fontWeight:600}}>{subj}</span>
                <span style={{fontWeight:700,color: avg >= 7 ? 'var(--success)' : avg >= 5 ? '#E67E22' : 'var(--danger)'}}>{avg}</span>
              </div>
            ))}
        </div>
        <div className="card">
          <h3 className="card-title mb-16">🏅 {t('medals')}</h3>
          <div className="flex gap-8" style={{flexWrap:'wrap'}}>
            {report.medals.length === 0 ? <p style={{color:'var(--text-light)'}}>Nenhuma medalha</p> :
              report.medals.map(m => (
                <div key={m.id} className="medal-card earned" style={{minWidth:80}}>
                  <div className="medal-icon">{m.icon}</div>
                  <div className="medal-name">{m.name}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title mb-16">📋 {t('recent_activity')}</h3>
        {report.history.map(h => (
          <div key={h.id} className="flex-between" style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:'0.88rem'}}>{h.event}</span>
            <div className="flex gap-8">{h.points !== 0 && <span className={`badge ${h.points > 0 ? 'badge-success' : 'badge-danger'}`}>{h.points > 0 ? '+' : ''}{h.points}</span>}
              <span style={{fontSize:'0.75rem',color:'var(--text-light)'}}>{new Date(h.created_at).toLocaleDateString('pt-BR')}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
