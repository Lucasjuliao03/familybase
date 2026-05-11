import {
  USER_DISPLAY_COLOR_PALETTE,
  normalizeHex,
  isUserDisplaySwatchDisabled,
} from '../lib/userDisplayColors';

export default function UserDisplayColorPicker({
  value,
  onChange,
  primaryColor,
  secondaryColor,
  excludeUserId,
  adultMembers,
  label,
  id,
}) {
  const current = normalizeHex(value || '');

  return (
    <div className="form-group">
      {label ? (
        <label className="form-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="flex gap-8 flex-wrap" id={id} role="listbox" aria-label={label || 'Cores'}>
        {USER_DISPLAY_COLOR_PALETTE.map((c) => {
          const disabled = isUserDisplaySwatchDisabled(c, {
            primary: primaryColor,
            secondary: secondaryColor,
            excludeUserId,
            adultMembers,
          });
          const selected = !disabled && current === normalizeHex(c);
          return (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              title={disabled ? undefined : c}
              onClick={() => onChange(normalizeHex(c))}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: c,
                border: selected ? '3px solid var(--text)' : '2px solid transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.28 : 1,
                boxSizing: 'border-box',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
