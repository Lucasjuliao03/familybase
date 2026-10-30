import { ADULT_AVATAR_CHOICES, CHILD_AVATAR_IDS, avatarLabel } from '../../lib/familyIdentity';
import { getAvatarPresetUrl } from '../../lib/avatarCatalog';

export default function CatalogAvatarChoice({ kind = 'adult', value, onChange, disabled = false, showcase = false }) {
  const ids = kind === 'adult' ? ADULT_AVATAR_CHOICES : CHILD_AVATAR_IDS;
  const labels = Object.fromEntries(ids.map(id => [id, avatarLabel(id)]));
  return <div className={showcase ? 'catalog-avatar-showcase' : ''}>
    {showcase && <div className="catalog-avatar-preview"><img src={getAvatarPresetUrl(value || ids[0])} alt={labels[value || ids[0]] || 'Prévia do avatar'} /></div>}
    <div className="catalog-avatar-choice" role="radiogroup" aria-label={kind === 'adult' ? 'Avatares adultos' : 'Avatares infantis'}>
    {ids.map(id => <button type="button" key={id} role="radio" aria-checked={value === id} disabled={disabled} onClick={() => onChange(id)} className={value === id ? 'is-selected' : ''}>
      <img src={getAvatarPresetUrl(id)} alt="" width="54" height="54" />
      <span>{labels[id] || id}</span>
    </button>)}
    </div>
  </div>;
}
