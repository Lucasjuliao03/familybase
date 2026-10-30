import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_WEB_PLANS,displayPrice,formatBRL,annualSaving,planPromotion} from './webPlans.js';
test('requested presentation prices and annual savings use exact cents',()=>{
 assert.equal(displayPrice(DEFAULT_WEB_PLANS[0]),19.90);assert.equal(displayPrice(DEFAULT_WEB_PLANS[1]),199.00);
 assert.equal(annualSaving(DEFAULT_WEB_PLANS),39.80);
 assert.equal(formatBRL(199/12).replace(/\s/g,''),'R$16,58');
 assert.equal(annualSaving([{...DEFAULT_WEB_PLANS[0],enabled:false},DEFAULT_WEB_PLANS[1]]),0);
 assert.equal(annualSaving([DEFAULT_WEB_PLANS[0],{...DEFAULT_WEB_PLANS[1],display_price:300}]),0);
 assert.deepEqual(planPromotion(DEFAULT_WEB_PLANS[0]),{regularPrice:39.90,saving:20,percent:50});
 assert.deepEqual(planPromotion(DEFAULT_WEB_PLANS[1]),{regularPrice:478.80,saving:279.80,percent:58});
 assert.equal(planPromotion({...DEFAULT_WEB_PLANS[0],regular_price:null}),null);
 assert.equal(planPromotion({...DEFAULT_WEB_PLANS[0],regular_price:19.90}),null);
 assert.equal(planPromotion({...DEFAULT_WEB_PLANS[0],display_price:50}),null);
 assert.equal(planPromotion({...DEFAULT_WEB_PLANS[0],display_price:0}),null);
 assert.equal(planPromotion({...DEFAULT_WEB_PLANS[0],regular_price:'invalid'}),null);
 assert.deepEqual(planPromotion({code:'premium_anual'}),planPromotion(DEFAULT_WEB_PLANS[1]));
});
