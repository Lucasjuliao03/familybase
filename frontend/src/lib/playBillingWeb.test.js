import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_APP_URL, PLAY_MANAGE_URL, subscriptionDestination, playStatusLabel } from './playBillingWeb.js';
test('only confirmed entitlement releases family web access',()=>{
  for(const role of ['parent','child','relative']) {
    const user={role};
    assert.equal(subscriptionDestination(user,{has_access:false,can_manage_billing:false}),'/billing-wait-gestor');
    assert.equal(subscriptionDestination(user,null),'/billing-wait-gestor');
    assert.equal(subscriptionDestination(user,{has_access:true}),role==='child'?'/child':'/parent');
  }
  assert.equal(subscriptionDestination({role:'parent'},{has_access:false,can_manage_billing:true}),'/subscribe');
  assert.equal(subscriptionDestination(null,{}),'/login');
});
test('Play URLs use existing app and product identifiers, without tokens',()=>{
  const listing=new URL(PLAY_APP_URL),manage=new URL(PLAY_MANAGE_URL);
  assert.equal(listing.hostname,'play.google.com');assert.equal(listing.searchParams.get('id'),'com.familybase.mobile');
  assert.equal(manage.searchParams.get('sku'),'tudodefamilia_premium');assert.equal(manage.searchParams.get('package'),'com.familybase.mobile');
  assert.equal(manage.searchParams.has('token'),false);
  assert.equal(playStatusLabel({subscription_status:'pending'}),'Compra aguardando confirmação');
  assert.equal(playStatusLabel({subscription_status:'grace_period'}),'Período de carência');
});
