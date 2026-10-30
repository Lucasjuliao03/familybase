import PlayStoreButton from './PlayStoreButton';
export default function PlayDownloadBanner({ available=false, url, compact=false }) {
  return <section className={`play-download-banner ${compact?'is-compact':''}`} aria-label="Aplicativo Android">
    <div className="play-download-mark" aria-hidden="true"><img src="/brand/logo.webp" width="98" height="98" alt="" /><span>♥</span></div>
    <div className="play-download-copy"><p className="play-download-kicker">SUA FAMÍLIA, SEMPRE POR PERTO</p><h2>A rotina no computador.<br />O cuidado no seu bolso.</h2><p>Organize pela web e acompanhe pelo aplicativo Android. Uma conta, os mesmos combinados, a mesma família.</p></div>
    <div className="play-download-cta"><PlayStoreButton available={available} url={url}/>{!available && <small>Estamos preparando a publicação.<br />O botão será liberado quando o app estiver disponível.</small>}</div>
  </section>;
}
