import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getDeviceId } from '../../lib/device';
import './LocationModals.css';

export default function DeviceManagerModal({ familyId, onClose }) {
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const currentDeviceId = getDeviceId();

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, avatar_url');
      const userMap = {};
      (usersData || []).forEach(u => { userMap[u.id] = u; });
      setUsers(userMap);

      const { data: devData } = await supabase
        .from('family_member_devices')
        .select('*')
        .eq('family_id', familyId)
        .order('last_seen_at', { ascending: false });
      setDevices(devData || []);
    } catch (e) {
      console.error('Error loading devices:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (familyId) loadData();
  }, [familyId]);

  const toggleVisibility = async (dev) => {
    const newState = !dev.is_location_enabled;
    setDevices(prev => prev.map(d => d.id === dev.id ? { ...d, is_location_enabled: newState } : d));
    await supabase.from('family_member_devices').update({ is_location_enabled: newState }).eq('id', dev.id);
  };

  const setPrimary = async (dev) => {
    // Definir este como principal e todos os outros DO MESMO USUÁRIO como não-principais
    setDevices(prev => prev.map(d => {
      if (d.user_id !== dev.user_id) return d;
      return { ...d, is_primary_location_device: d.id === dev.id };
    }));
    
    await supabase.from('family_member_devices')
      .update({ is_primary_location_device: false })
      .eq('user_id', dev.user_id);
      
    await supabase.from('family_member_devices')
      .update({ is_primary_location_device: true })
      .eq('id', dev.id);
  };

  const deleteDevice = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este dispositivo? Ele será recriado caso seja acessado novamente.')) return;
    setDevices(prev => prev.filter(d => d.id !== id));
    await supabase.from('family_member_devices').delete().eq('id', id);
    // Também exclui a localização atrelada a ele
    await supabase.from('family_locations').delete().eq('device_id', devices.find(d => d.id === id)?.device_id);
  };

  const getDeviceIcon = (type) => {
    if (type === 'mobile') return '📱';
    if (type === 'tablet') return '💊';
    return '💻';
  };

  return (
    <div className="location-modal-overlay" onClick={onClose}>
      <div className="location-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <h2>Gerir Dispositivos da Família</h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: 20 }}>
          Controle quais aparelhos podem enviar localização e escolha o aparelho principal (usado para gerar alertas de entrada/saída de zona).
        </p>

        {loading ? (
          <p>A carregar...</p>
        ) : (
          <div className="devices-list" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
            {devices.map(dev => {
              const userName = users[dev.user_id]?.name || 'Membro';
              const isMine = dev.device_id === currentDeviceId;
              
              return (
                <div key={dev.id} style={{
                  border: '1px solid var(--border)', padding: 12, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: dev.is_location_enabled ? '#fff' : '#f8fafc',
                  opacity: dev.is_location_enabled ? 1 : 0.6
                }}>
                  <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {getDeviceIcon(dev.device_type)} {dev.device_name || 'Dispositivo'}
                      {isMine && <span style={{ fontSize: '0.7rem', background: '#3B82F6', color: '#fff', padding: '2px 6px', borderRadius: 10 }}>Este aparelho</span>}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 4 }}>
                      👤 {userName} {dev.is_primary_location_device && <span style={{ color: '#F59E0B', fontWeight: 'bold' }}>⭐ Principal</span>}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!dev.is_primary_location_device && dev.is_location_enabled && (
                      <button onClick={() => setPrimary(dev)} style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #CBD5E1', background: '#fff', cursor: 'pointer' }}>
                        Tornar Principal
                      </button>
                    )}
                    <button onClick={() => toggleVisibility(dev)} style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #CBD5E1', background: '#fff', cursor: 'pointer' }}>
                      {dev.is_location_enabled ? '🙈 Ocultar' : '👁️ Mostrar'}
                    </button>
                    <button onClick={() => deleteDevice(dev.id)} style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #FECACA', color: '#EF4444', background: '#FEF2F2', cursor: 'pointer' }}>
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
            
            {devices.length === 0 && <p>Nenhum dispositivo registrado.</p>}
          </div>
        )}

        <div className="location-modal-actions" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
