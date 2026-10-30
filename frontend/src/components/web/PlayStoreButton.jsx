import { PLAY_APP_URL } from '../../lib/playBillingWeb';
import '../../styles/components/store-banner.css';
/** Official, unmodified badge. No outbound link is exposed before launch. */
export default function PlayStoreButton({ available = false, url, className = '' }) {
  const badge=<img src="/brand/google-play-badge-pt-br.png" width="200" height="77" alt="Google Play" loading="lazy" />;
  return <div className={`play-store-action ${className}`}>
    {available ? <a className="play-store-badge" href={url || PLAY_APP_URL} target="_blank" rel="noopener noreferrer" aria-label="Instalar Tudo de Família na Google Play">{badge}</a>
      : <button type="button" className="play-store-badge" disabled aria-label="Google Play — publicação em preparação">{badge}</button>}
    <span className={`play-store-status ${available?'is-live':''}`}><i aria-hidden="true" />{available?'Baixe o aplicativo Android':'Em breve na Google Play'}</span>
  </div>;
}
