// Cliente Mercado Pago Bricks (carregado via <script> em index.html).
// Doc: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick

const PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY || '';

let mpInstance = null;
let bricksBuilder = null;

export function getMP() {
  if (!PUBLIC_KEY) {
    throw new Error('VITE_MP_PUBLIC_KEY não está configurada no .env do frontend');
  }
  if (typeof window === 'undefined' || !window.MercadoPago) {
    throw new Error('SDK do Mercado Pago não carregou. Verifique o <script> em index.html.');
  }
  if (!mpInstance) {
    mpInstance = new window.MercadoPago(PUBLIC_KEY, { locale: 'pt-BR' });
    bricksBuilder = mpInstance.bricks();
  }
  return { mp: mpInstance, bricksBuilder };
}

export function destroyBrick(containerId) {
  try {
    if (window.cardPaymentBrickController) {
      window.cardPaymentBrickController.unmount();
      window.cardPaymentBrickController = null;
    }
  } catch {/* */}
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}
