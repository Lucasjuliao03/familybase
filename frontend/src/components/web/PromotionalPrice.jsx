import { displayPrice, formatBRL, planPromotion } from '../../lib/webPlans';
import '../../styles/components/store-banner.css';

export default function PromotionalPrice({ plan, className = 'site-price' }) {
  const promotion = planPromotion(plan);
  return <div className="plan-price-presentation">
    {promotion && <>
      <span className="plan-promotion-tag">Promoção de lançamento · {promotion.percent}% de desconto</span>
      <div className="plan-regular-price">Preço regular <del>{formatBRL(promotion.regularPrice)}{plan.interval}</del></div>
    </>}
    <div className={className}>{formatBRL(displayPrice(plan))}<small>{plan.interval}</small></div>
    {promotion && <p className="plan-promotion-saving">Você economiza {formatBRL(promotion.saving)} {plan.code === 'premium_anual' ? 'por ano' : 'por mês'}.</p>}
  </div>;
}
