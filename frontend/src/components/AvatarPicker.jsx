import { useState, useRef } from 'react';
import api, { publicAssetUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ADULT_AVATAR_CHOICES,CHILD_AVATAR_IDS,avatarLabel } from '../lib/familyIdentity';
import { getAvatarPresetUrl } from '../lib/avatarCatalog';
import { avatarKind } from '../lib/familyAvatar';

const PRESET_AVATARS = [
  { id: 'astronaut', emoji: '🚀', label: 'Astronauta', color: '#6C5CE7' },
  { id: 'explorer', emoji: '🗺️', label: 'Explorador', color: '#00B894' },
  { id: 'artist', emoji: '🎨', label: 'Artista', color: '#E84393' },
  { id: 'scientist', emoji: '🔬', label: 'Cientista', color: '#74B9FF' },
  { id: 'athlete', emoji: '⚽', label: 'Atleta', color: '#FDCB6E' },
  { id: 'musician', emoji: '🎵', label: 'Músico', color: '#A29BFE' },
  { id: 'chef', emoji: '🍳', label: 'Chef', color: '#FF7675' },
  { id: 'reader', emoji: '📚', label: 'Leitor', color: '#55EFC4' },
  { id: 'gamer', emoji: '🎮', label: 'Gamer', color: '#6C5CE7' },
  { id: 'ninja', emoji: '🥷', label: 'Ninja', color: '#2D3436' },
  { id: 'princess', emoji: '👸', label: 'Princesa', color: '#FD79A8' },
  { id: 'superhero', emoji: '🦸', label: 'Super-herói', color: '#E17055' },
  { id: 'parent_male', emoji: '👨', label: 'Pai', color: '#0984E3' },
  { id: 'parent_female', emoji: '👩', label: 'Mãe', color: '#E84393' },
  { id: 'robot', emoji: '🤖', label: 'Robô', color: '#636E72' },
  { id: 'dragon', emoji: '🐉', label: 'Dragão', color: '#6C5CE7' },
];

/**
 * AvatarPicker — componente de seleção de avatar
 * Props:
 *  - currentAvatarUrl: string | null
 *  - currentPreset: string | null
 *  - onSave: (result) => void  — result: { avatar_url, avatar_preset }
 *  - endpoint: '/auth/avatar' | '/auth/avatar/child/:id'
 *  - size: 'md' | 'lg' (default 'md')
 */
export default function AvatarPicker({ currentAvatarUrl, currentPreset, onSave, endpoint = '/auth/avatar', size = 'md' }) {
  const { user }=useAuth();
  const presetIds=avatarKind(endpoint,user?.role)==='child' ? CHILD_AVATAR_IDS:ADULT_AVATAR_CHOICES;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('presets'); // 'presets' | 'upload'
  const [selectedPreset, setSelectedPreset] = useState(currentPreset || '');
  const [uploading, setUploading] = useState(false);
  const [error,setError]=useState('');
  const pending=useRef(false);
  const fileRef = useRef(null);

  const avatarSize = size === 'lg' ? 90 : 64;

  const getDisplaySrc = () => {
    if (currentAvatarUrl) return publicAssetUrl(currentAvatarUrl);
    if (currentPreset) return getAvatarPresetUrl(currentPreset);
    return null;
  };

  const getPresetEmoji = (presetId) => {
    const p = PRESET_AVATARS.find(a => a.id === presetId);
    return p ? p.emoji : '😊';
  };

  const handleSelectPreset = async (presetId) => {
    if(pending.current) return;
    pending.current=true; setUploading(true); setError('');
    try {
      const { data } = await api.put(endpoint, {avatar_preset:presetId});
      if(data?.avatar_preset!==presetId) throw new Error('O avatar não foi confirmado pelo banco. Tente novamente.');
      setSelectedPreset(presetId);
      onSave?.(data);
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o avatar.');
    } finally {
      pending.current=false; setUploading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || pending.current) return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5*1024*1024) {setError('Escolha uma imagem PNG, JPG ou WebP de até 5 MB.');return;}
    pending.current=true; setUploading(true); setError('');
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.put(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onSave?.(data);
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a imagem.');
    } finally {
      pending.current=false;
      setUploading(false);
    }
  };

  const displaySrc = getDisplaySrc();
  const currentEmoji = !displaySrc && currentPreset ? getPresetEmoji(currentPreset) : null;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Avatar atual */}
      <div
        role="button" tabIndex={0} aria-label="Alterar avatar"
        onKeyDown={e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();setOpen(v=>!v);}}}
        onClick={() => setOpen(!open)}
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          overflow: 'hidden',
          cursor: 'pointer',
          border: '3px solid var(--primary)',
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: avatarSize * 0.45,
          position: 'relative',
          transition: 'all 0.2s',
        }}
        title="Clique para mudar o avatar"
      >
        {displaySrc ? (
          <img src={displaySrc} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span>{currentEmoji || '😊'}</span>
        )}
        {/* Edit overlay */}
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.2s', borderRadius: '50%',
          fontSize: '1.2rem', color: 'white',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0'}
        >
          ✏️
        </div>
      </div>

      {/* Picker Modal */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => {if(!pending.current) setOpen(false);}} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 320, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 10000,
            maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column'
          }} role="dialog" aria-modal="true" aria-label="Escolher avatar">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '0.9rem' }}>Escolher Avatar</strong>
            </div>
            {/* Tabs */}
            <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                className={`tab ${tab === 'presets' ? 'active' : ''}`}
                style={{ flex: 1, borderRadius: 0, justifyContent: 'center' }}
                onClick={() => setTab('presets')}
              >
                🎭 Avatares
              </button>
              <button
                className={`tab ${tab === 'upload' ? 'active' : ''}`}
                style={{ flex: 1, borderRadius: 0, justifyContent: 'center' }}
                onClick={() => setTab('upload')}
              >
                📷 Foto
              </button>
            </div>

            {tab === 'presets' && (
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {presetIds.map(id => ({ id,label:avatarLabel(id) })).map(av => (
                  <button
                    key={av.id}
                    type="button" disabled={uploading} aria-pressed={selectedPreset===av.id}
                    onClick={() => handleSelectPreset(av.id)}
                    title={av.label}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '8px 4px', borderRadius: 10, border: `2px solid ${selectedPreset === av.id ? 'var(--primary)' : 'transparent'}`,
                      background: selectedPreset === av.id ? 'rgba(108,92,231,0.1)' : 'var(--bg)',
                      cursor: 'pointer', gap: 4, transition: 'all 0.15s',
                    }}
                  >
                    <img src={getAvatarPresetUrl(av.id)} alt="" width="54" height="54" style={{ objectFit:'contain' }} />
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-light)', lineHeight: 1 }}>{av.label}</span>
                  </button>
                ))}
              </div>
            )}

            {error && <p role="alert" style={{padding:12,color:'var(--danger)'}}>{error}</p>}
            <button type="button" className="btn btn-ghost" disabled={uploading} onClick={()=>setOpen(false)}>{uploading?'Salvando…':'Fechar'}</button>

            {tab === 'upload' && (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', border: '2px dashed var(--border)',
                  margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                }}>
                  {displaySrc ? <img src={displaySrc} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : '📷'}
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: 12 }}>
                  Envie uma foto (JPG, PNG, até 5MB)
                </p>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
                <button
                  className="btn btn-primary"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Enviando...' : '📤 Escolher Foto'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { PRESET_AVATARS };
