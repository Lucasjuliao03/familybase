import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getDeviceId } from '../../lib/device';

const DEVICE_ICONS = { mobile: '📱', tablet: '💊', desktop: '💻' };

function formatLastSeen(dateStr) {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins} min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

export default function DeviceManagerModal({ familyId, onClose }) {
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // device id being saved
  const currentDeviceId = getDeviceId();

  const loadData = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      // Buscar membros da família diretamente da tabela users
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, avatar_url, role')
        .eq('family_id', familyId);

      const userMap = {};
      (usersData || []).forEach(u => { userMap[u.id] = u; });
      setUsers(userMap);

      // Buscar dispositivos
      const { data: devData, error } = await supabase
        .from('family_member_devices')
        .select('*')
        .eq('family_id', familyId)
        .order('last_seen_at', { ascending: false });

      if (error) throw error;
      setDevices(devData || []);
    } catch (e) {
      console.error('DeviceManagerModal loadData:', e);
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleVisibility = async (dev) => {
    // is_location_enabled null from DB default means true
    const currentState = dev.is_location_enabled !== false;
    const newState = !currentState;
    setSaving(dev.id);
    setDevices(prev => prev.map(d => d.id === dev.id ? { ...d, is_location_enabled: newState } : d));
    const { error } = await supabase
      .from('family_member_devices')
      .update({ is_location_enabled: newState })
      .eq('id', dev.id);
    if (error) {
      console.error('toggleVisibility error:', error);
      // revert
      setDevices(prev => prev.map(d => d.id === dev.id ? { ...d, is_location_enabled: currentState } : d));
    }
    setSaving(null);
  };

  const setPrimary = async (dev) => {
    setSaving(dev.id);
    // Update local state immediately
    setDevices(prev => prev.map(d => {
      if (d.user_id !== dev.user_id) return d;
      return { ...d, is_primary_location_device: d.id === dev.id };
    }));
    // First, clear all primaries for this user
    await supabase
      .from('family_member_devices')
      .update({ is_primary_location_device: false })
      .eq('family_id', familyId)
      .eq('user_id', dev.user_id);
    // Then set this one as primary
    const { error } = await supabase
      .from('family_member_devices')
      .update({ is_primary_location_device: true })
      .eq('id', dev.id);
    if (error) console.error('setPrimary error:', error);
    setSaving(null);
  };

  const deleteDevice = async (dev) => {
    if (!confirm(`Excluir "${dev.device_name || 'Dispositivo'}"? Ele será recriado se acessado novamente.`)) return;
    setSaving(dev.id);
    setDevices(prev => prev.filter(d => d.id !== dev.id));
    // Excluir localização do dispositivo
    await supabase.from('family_locations').delete()
      .eq('family_id', familyId)
      .eq('device_id', dev.device_id);
    const { error } = await supabase.from('family_member_devices').delete().eq('id', dev.id);
    if (error) console.error('deleteDevice error:', error);
    setSaving(null);
  };

  // Agrupar devices por usuário
  const grouped = {};
  devices.forEach(dev => {
    if (!grouped[dev.user_id]) grouped[dev.user_id] = [];
    grouped[dev.user_id].push(dev);
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #fff)', borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 580, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>⚙️ Gerir Aparelhos</h2>
            <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.82rem' }}>
              Controle quais aparelhos enviam localização e defina o principal para alertas de zona.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94A3B8', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#64748B', padding: 32 }}>A carregar dispositivos…</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>
              Nenhum dispositivo registrado.<br />
              <small>Os dispositivos aparecem aqui após o primeiro envio de localização.</small>
            </div>
          ) : (
            Object.entries(grouped).map(([uid, devList]) => {
              const member = users[uid];
              return (
                <div key={uid}>
                  {/* Member header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--primary, #6366F1)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.9rem'
                    }}>
                      {member?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span style={{ fontWeight: 700 }}>{member?.name || 'Membro'}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>({devList.length} aparelho{devList.length !== 1 ? 's' : ''})</span>
                  </div>

                  {/* Device rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8 }}>
                    {devList.map(dev => {
                      const isEnabled = dev.is_location_enabled !== false;
                      const isMine = dev.device_id === currentDeviceId;
                      const isPrimary = !!dev.is_primary_location_device;
                      const isSavingThis = saving === dev.id;
                      const icon = DEVICE_ICONS[dev.device_type] || '💻';

                      return (
                        <div key={dev.id} style={{
                          border: `1px solid ${isEnabled ? 'var(--border, #E2E8F0)' : '#CBD5E1'}`,
                          borderRadius: 10, padding: '10px 12px',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 8, opacity: isEnabled ? 1 : 0.55,
                          background: isEnabled ? 'var(--bg-card, #fff)' : '#F8FAFC',
                          flexWrap: 'wrap'
                        }}>
                          {/* Left info */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <span>{icon}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {dev.device_name || 'Dispositivo'}
                              </span>
                              {isMine && (
                                <span style={{ fontSize: '0.65rem', background: '#3B82F6', color: '#fff', padding: '2px 6px', borderRadius: 10, flexShrink: 0 }}>
                                  Este
                                </span>
                              )}
                              {isPrimary && (
                                <span style={{ fontSize: '0.65rem', background: '#F59E0B', color: '#fff', padding: '2px 6px', borderRadius: 10, flexShrink: 0 }}>
                                  ⭐ Principal
                                </span>
                              )}
                              {!isEnabled && (
                                <span style={{ fontSize: '0.65rem', background: '#94A3B8', color: '#fff', padding: '2px 6px', borderRadius: 10, flexShrink: 0 }}>
                                  Oculto
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                              Visto: {formatLastSeen(dev.last_seen_at)}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {!isPrimary && isEnabled && (
                              <button
                                disabled={isSavingThis}
                                onClick={() => setPrimary(dev)}
                                style={{
                                  fontSize: '0.75rem', padding: '5px 10px', borderRadius: 6,
                                  border: '1px solid #F59E0B', color: '#92400E', background: '#FEF3C7',
                                  cursor: 'pointer', fontWeight: 600
                                }}
                              >
                                ⭐ Principal
                              </button>
                            )}
                            <button
                              disabled={isSavingThis}
                              onClick={() => toggleVisibility(dev)}
                              style={{
                                fontSize: '0.75rem', padding: '5px 10px', borderRadius: 6,
                                border: '1px solid #CBD5E1', color: '#475569', background: '#F8FAFC',
                                cursor: 'pointer'
                              }}
                            >
                              {isEnabled ? '🙈 Ocultar' : '👁️ Mostrar'}
                            </button>
                            <button
                              disabled={isSavingThis}
                              onClick={() => deleteDevice(dev)}
                              style={{
                                fontSize: '0.75rem', padding: '5px 8px', borderRadius: 6,
                                border: '1px solid #FECACA', color: '#EF4444', background: '#FEF2F2',
                                cursor: 'pointer'
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border, #E2E8F0)' }}>
          <button onClick={loadData} style={{ fontSize: '0.8rem', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>
            🔄 Atualizar
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'var(--primary, #6366F1)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 20px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
