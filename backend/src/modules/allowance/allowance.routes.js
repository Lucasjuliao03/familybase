const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../../middleware/auth');
const { parentOnly } = require('../../middleware/permissions');
const { requireModule, requireAnyModule, isEnabled } = require('../../middleware/familyModule');

const modAllow = requireModule('allowance');
const modFamilyShop = requireModule('family_shop');
const modPiggyGoals = requireAnyModule('piggy_bank', 'goals');
const modPiggyFlow = requireAnyModule('allowance', 'piggy_bank', 'goals');

async function allowanceAvailability(db, childId, familyId) {
  const settings = await db.prepare('SELECT * FROM allowance_settings WHERE child_id=?').get(childId);
  if (!settings || !settings.is_active) return { cycle: null, available: 0, settings: null };
  const now = new Date();
  const cycle = await db.prepare("SELECT * FROM allowance_cycles WHERE child_id=? AND month=? AND year=? AND status='open'").get(childId, now.getMonth() + 1, now.getFullYear());
  if (!cycle) return { cycle: null, available: 0, settings };
  const prevFinal = cycle.opening_balance;
  const expectedBase = settings.model_type !== 'accumulative' ? cycle.base_amount : 0;
  const balance = prevFinal + expectedBase + cycle.total_bonus + cycle.manual_adjustments - cycle.total_discount;
  return { cycle, available: Math.max(0, balance), settings };
}

router.use(authMiddleware);

// --- SETTINGS ---
router.get('/settings', modAllow, async (req, res) => {
  try {
    const db = req.db;
    let q = 'SELECT a.*, c.name as child_name FROM allowance_settings a JOIN children c ON a.child_id=c.id WHERE a.family_id=?';
    const p = [req.user.familyId];
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) { q += ' AND a.child_id=?'; p.push(child.id); }
    }
    res.json(await db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/settings/:child_id', modAllow, parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const { model_type, base_amount, currency, cycle_closing_day, payment_day, allow_accumulation, allow_negative_balance, max_bonus, max_discount, require_parent_approval, is_active } = req.body;

    const exists = await db.prepare('SELECT id FROM allowance_settings WHERE child_id=? AND family_id=?').get(req.params.child_id, req.user.familyId);
    if (exists) {
      await db.prepare(`UPDATE allowance_settings SET model_type=?, base_amount=?, currency=?, cycle_closing_day=?, payment_day=?, allow_accumulation=?, allow_negative_balance=?, max_bonus=?, max_discount=?, require_parent_approval=?, is_active=?, updated_at=datetime('now') WHERE id=?`).run(
        model_type, base_amount, currency, cycle_closing_day, payment_day, allow_accumulation, allow_negative_balance, max_bonus, max_discount, require_parent_approval, is_active, exists.id,
      );
    } else {
      const id = uuidv4();
      await db.prepare(`INSERT INTO allowance_settings (id, child_id, family_id, model_type, base_amount, currency, cycle_closing_day, payment_day, allow_accumulation, allow_negative_balance, max_bonus, max_discount, require_parent_approval, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, req.params.child_id, req.user.familyId, model_type, base_amount, currency, cycle_closing_day, payment_day, allow_accumulation, allow_negative_balance, max_bonus, max_discount, require_parent_approval, is_active,
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// --- CYCLES ---
router.get('/cycles', modAllow, async (req, res) => {
  try {
    let q = 'SELECT c.*, ch.name as child_name FROM allowance_cycles c JOIN children ch ON c.child_id=ch.id WHERE c.family_id=?';
    const p = [req.user.familyId];
    if (req.user.role === 'child') {
      const child = await req.db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) { q += ' AND c.child_id=?'; p.push(child.id); }
    }
    q += ' ORDER BY c.year DESC, c.month DESC';
    res.json(await req.db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/cycles/current', modAllow, async (req, res) => {
  try {
    const { child_id } = req.body;
    const db = req.db;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    let cycle = await db.prepare("SELECT * FROM allowance_cycles WHERE child_id=? AND month=? AND year=? AND status='open'").get(child_id, month, year);
    if (!cycle) {
      const id = uuidv4();
      const settings = await db.prepare('SELECT * FROM allowance_settings WHERE child_id=?').get(child_id);
      const base = settings ? settings.base_amount : 0;

      const prev = await db.prepare('SELECT final_amount FROM allowance_cycles WHERE child_id=? ORDER BY year DESC, month DESC LIMIT 1').get(child_id);
      const opening = (settings && settings.allow_accumulation && prev) ? prev.final_amount : 0;

      await db.prepare('INSERT INTO allowance_cycles (id, child_id, family_id, month, year, opening_balance, base_amount) VALUES (?,?,?,?,?,?,?)').run(
        id, child_id, req.user.familyId, month, year, opening, base,
      );
      cycle = await db.prepare('SELECT * FROM allowance_cycles WHERE id=?').get(id);
    }
    res.json(cycle);
  } catch (err) { res.status(500).json({ error: 'Erro ao obter ciclo' }); }
});

router.post('/cycles/:id/close', modAllow, parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const cycle = await db.prepare('SELECT * FROM allowance_cycles WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!cycle) return res.status(404).json({ error: 'Ciclo não encontrado' });

    const settings = await db.prepare('SELECT * FROM allowance_settings WHERE child_id=?').get(cycle.child_id);

    let final_amount = cycle.opening_balance;
    if (settings && settings.model_type !== 'accumulative') final_amount += cycle.base_amount;
    final_amount += cycle.total_bonus + cycle.manual_adjustments - cycle.total_discount;

    if (settings && !settings.allow_negative_balance && final_amount < 0) final_amount = 0;

    await db.prepare("UPDATE allowance_cycles SET status='closed', closed_at=datetime('now'), final_amount=? WHERE id=?").run(final_amount, req.params.id);
    res.json({ ok: true, final_amount });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/cycles/:id/pay', modAllow, parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const cycle = await db.prepare('SELECT * FROM allowance_cycles WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!cycle) return res.status(404).json({ error: 'Ciclo não encontrado' });

    await db.prepare("UPDATE allowance_cycles SET status='paid', paid_at=datetime('now'), approved_by=? WHERE id=?").run(req.user.id, req.params.id);

    const transId = uuidv4();
    await db.prepare('INSERT INTO allowance_transactions (id, child_id, family_id, cycle_id, type, origin, description, amount, status, approved_by) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      transId, cycle.child_id, req.user.familyId, cycle.id, 'debit', 'payment', 'Pagamento de mesada', cycle.final_amount, 'paid', req.user.id,
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// --- TRANSACTIONS ---
router.get('/transactions', modAllow, async (req, res) => {
  try {
    let q = 'SELECT t.*, c.name as child_name FROM allowance_transactions t JOIN children c ON t.child_id=c.id WHERE t.family_id=?';
    const p = [req.user.familyId];
    if (req.user.role === 'child') {
      const child = await req.db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) { q += ' AND t.child_id=?'; p.push(child.id); }
    } else if (req.query.child_id) {
      q += ' AND t.child_id=?'; p.push(req.query.child_id);
    }
    q += ' ORDER BY t.created_at DESC';
    res.json(await req.db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/transactions/manual', modAllow, parentOnly, async (req, res) => {
  try {
    const { child_id, cycle_id, type, amount, description } = req.body;
    const db = req.db;
    const id = uuidv4();
    await db.prepare('INSERT INTO allowance_transactions (id, child_id, family_id, cycle_id, type, origin, description, amount, status, approved_by) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      id, child_id, req.user.familyId, cycle_id || null, type, 'manual', description, amount, 'approved', req.user.id,
    );
    if (cycle_id) {
      if (type === 'credit') {
        await db.prepare('UPDATE allowance_cycles SET manual_adjustments = manual_adjustments + ? WHERE id=?').run(amount, cycle_id);
      } else {
        await db.prepare('UPDATE allowance_cycles SET manual_adjustments = manual_adjustments - ? WHERE id=?').run(amount, cycle_id);
      }
    }
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// --- SAVINGS GOALS ---
router.get('/goals', modPiggyGoals, async (req, res) => {
  try {
    let q = 'SELECT * FROM savings_goals WHERE family_id=?';
    const p = [req.user.familyId];
    if (req.user.role === 'child') {
      const child = await req.db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) { q += ' AND child_id=?'; p.push(child.id); }
    }
    res.json(await req.db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/goals', modPiggyGoals, async (req, res) => {
  try {
    const { child_id, title, target_amount } = req.body;
    let targetChild = child_id;
    if (req.user.role === 'child') {
      const child = await req.db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      targetChild = child.id;
    }
    const id = uuidv4();
    await req.db.prepare('INSERT INTO savings_goals (id, child_id, family_id, title, target_amount) VALUES (?,?,?,?,?)').run(
      id, targetChild, req.user.familyId, title, target_amount,
    );
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/goals/:id', modPiggyGoals, async (req, res) => {
  try {
    const { current_amount, status } = req.body;
    await req.db.prepare('UPDATE savings_goals SET current_amount=COALESCE(?,current_amount), status=COALESCE(?,status) WHERE id=?').run(current_amount, status, req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.delete('/goals/:id', modPiggyGoals, async (req, res) => {
  try {
    await req.db.prepare('DELETE FROM savings_goals WHERE id=? AND family_id=?').run(req.params.id, req.user.familyId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// --- REWARDS ---
router.get('/rewards/list', modFamilyShop, async (req, res) => {
  try {
    let q = 'SELECT * FROM rewards WHERE family_id=?';
    if (req.user.role === 'child') q += ' AND is_active=1';
    q += ' ORDER BY point_cost';
    res.json(await req.db.prepare(q).all(req.user.familyId));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/rewards', modFamilyShop, parentOnly, async (req, res) => {
  try {
    const { name, description, point_cost, coin_cost, type, icon } = req.body;
    const id = uuidv4();
    await req.db.prepare('INSERT INTO rewards (id,name,description,point_cost,coin_cost,type,icon,family_id,is_active) VALUES (?,?,?,?,?,?,?,?,1)').run(
      id, name, description || null, point_cost || 0, coin_cost || 0, type || 'non_financial', icon || '🎁', req.user.familyId,
    );
    res.status(201).json(await req.db.prepare('SELECT * FROM rewards WHERE id=?').get(id));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/rewards/:id', modFamilyShop, parentOnly, async (req, res) => {
  try {
    const { name, description, point_cost, coin_cost, type, icon, is_active } = req.body;
    await req.db.prepare(`UPDATE rewards SET 
      name=COALESCE(?,name), 
      description=COALESCE(?,description), 
      point_cost=COALESCE(?,point_cost), 
      coin_cost=COALESCE(?,coin_cost), 
      type=COALESCE(?,type), 
      icon=COALESCE(?,icon), 
      is_active=COALESCE(?,is_active) 
      WHERE id=? AND family_id=?`).run(
      name, description, point_cost, coin_cost, type, icon, is_active, req.params.id, req.user.familyId,
    );
    res.json(await req.db.prepare('SELECT * FROM rewards WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar' }); }
});

router.delete('/rewards/:id', modFamilyShop, parentOnly, async (req, res) => {
  try {
    await req.db.prepare('DELETE FROM rewards WHERE id=? AND family_id=?').run(req.params.id, req.user.familyId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao excluir' }); }
});

router.post('/rewards/:id/redeem', modFamilyShop, async (req, res) => {
  try {
    const db = req.db;
    const reward = await db.prepare('SELECT * FROM rewards WHERE id=? AND family_id=?').get(req.params.id, req.user.familyId);
    if (!reward) return res.status(404).json({ error: 'Recompensa não encontrada' });
    let childId;
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT * FROM children WHERE user_id=?').get(req.user.id);
      if (!child) return res.status(400).json({ error: 'Perfil não encontrado' });
      if (child.points < reward.point_cost) return res.status(400).json({ error: 'Pontos insuficientes' });
      childId = child.id;
    } else { childId = req.body.child_id; }
    const id = uuidv4();
    await db.prepare('INSERT INTO redemptions (id,reward_id,child_id) VALUES (?,?,?)').run(id, req.params.id, childId);
    if (isEnabled(db, req.user.familyId, 'notifications')) {
      const parents = await db.prepare('SELECT id FROM users WHERE family_id=? AND role=?').all(req.user.familyId, 'parent');
      const child = await db.prepare('SELECT name FROM children WHERE id=?').get(childId);
      for (const p of parents) {
        await db.prepare('INSERT INTO notifications (id,title,message,type,icon,user_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
          uuidv4(), 'Resgate solicitado!', `${child?.name} quer resgatar: ${reward.name}`, 'reward', reward.icon, p.id, req.user.familyId,
        );
      }
    }
    res.status(201).json({ message: 'Resgate solicitado, aguardando aprovação' });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/redemptions/:id/approve', modFamilyShop, parentOnly, async (req, res) => {
  try {
    const { approved } = req.body; const db = req.db;
    const redemption = await db.prepare('SELECT r.*,rw.point_cost,rw.name as reward_name FROM redemptions r JOIN rewards rw ON r.reward_id=rw.id WHERE r.id=?').get(req.params.id);
    if (!redemption) return res.status(404).json({ error: 'Não encontrado' });
    const status = approved ? 'approved' : 'rejected';
    await db.prepare('UPDATE redemptions SET status=?,approved_by=?,approved_at=datetime(\'now\') WHERE id=?').run(status, req.user.id, req.params.id);
    if (approved) {
      await db.prepare('UPDATE children SET points=points-? WHERE id=?').run(redemption.point_cost, redemption.child_id);
      await db.prepare('INSERT INTO history (id,event,points,type,child_id,family_id) VALUES (?,?,?,?,?,?)').run(
        uuidv4(), `Resgate: ${redemption.reward_name}`, -redemption.point_cost, 'reward', redemption.child_id, req.user.familyId,
      );
    }
    if (isEnabled(db, req.user.familyId, 'notifications')) {
      await db.prepare('INSERT INTO notifications (id,title,message,type,icon,child_id,family_id) VALUES (?,?,?,?,?,?,?)').run(
        uuidv4(), approved ? 'Resgate aprovado!' : 'Resgate negado', redemption.reward_name, 'reward', approved ? '🎉' : '❌', redemption.child_id, req.user.familyId,
      );
    }
    res.json({ message: approved ? 'Aprovado' : 'Rejeitado' });
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.get('/redemptions/list', modFamilyShop, async (req, res) => {
  try {
    let q = 'SELECT r.*,rw.name as reward_name,rw.icon,rw.point_cost,c.name as child_name FROM redemptions r JOIN rewards rw ON r.reward_id=rw.id JOIN children c ON r.child_id=c.id WHERE rw.family_id=?';
    const p = [req.user.familyId];
    if (req.user.role === 'child') {
      const child = await req.db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) { q += ' AND r.child_id=?'; p.push(child.id); }
    }
    q += ' ORDER BY r.created_at DESC';
    res.json(await req.db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

// --- Solicitações de transferência mesada → cofrinho/meta ---
router.post('/piggy-requests', modPiggyFlow, async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    if (req.user.role !== 'child') return res.status(403).json({ error: 'Apenas crianças podem solicitar' });
    const child = await db.prepare('SELECT * FROM children WHERE user_id=?').get(req.user.id);
    if (!child) return res.status(400).json({ error: 'Perfil não encontrado' });
    const { savings_goal_id, requested_amount, message } = req.body;
    const amt = Number(requested_amount);
    if (!savings_goal_id || !(amt > 0)) return res.status(400).json({ error: 'Dados inválidos' });

    const goal = await db.prepare('SELECT * FROM savings_goals WHERE id=? AND child_id=? AND family_id=?').get(savings_goal_id, child.id, fid);
    if (!goal) return res.status(404).json({ error: 'Meta não encontrada' });

    const { cycle, available } = await allowanceAvailability(db, child.id, fid);
    if (!cycle) return res.status(400).json({ error: 'Não há ciclo de mesada aberto. Peça a um responsável.' });
    if (amt > available) return res.status(400).json({ error: 'Valor maior que o saldo disponível' });

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO savings_conversion_requests (id,family_id,child_id,cycle_id,savings_goal_id,requested_amount,message,status)
      VALUES (?,?,?,?,?,?,?,'pending')
    `).run(id, fid, child.id, cycle.id, savings_goal_id, amt, message || null);

    if (await isEnabled(db, fid, 'notifications')) {
      const parents = await db.prepare('SELECT id FROM users WHERE family_id=? AND role=?').all(fid, 'parent');
      for (const p of parents) {
        await db.prepare(`INSERT INTO notifications (id,title,message,type,icon,user_id,family_id) VALUES (?,?,?,?,?,?,?)`).run(
          uuidv4(),
          'Pedido para o cofrinho',
          `${child.name} quer guardar R$ ${amt.toFixed(2)} na meta "${goal.title}".`,
          'allowance',
          '🐷',
          p.id,
          fid,
        );
      }
    }

    res.status(201).json(await db.prepare('SELECT * FROM savings_conversion_requests WHERE id=?').get(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro' });
  }
});

router.get('/piggy-requests', modPiggyFlow, async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    let q = `SELECT r.*, c.name as child_name, g.title as goal_title
      FROM savings_conversion_requests r
      JOIN children c ON c.id=r.child_id
      JOIN savings_goals g ON g.id=r.savings_goal_id
      WHERE r.family_id=?`;
    const p = [fid];
    if (req.user.role === 'child') {
      const child = await db.prepare('SELECT id FROM children WHERE user_id=?').get(req.user.id);
      if (child) { q += ' AND r.child_id=?'; p.push(child.id); }
    }
    q += ' ORDER BY r.requested_at DESC';
    res.json(await db.prepare(q).all(...p));
  } catch (err) { res.status(500).json({ error: 'Erro' }); }
});

router.put('/piggy-requests/:id/review', modPiggyFlow, parentOnly, async (req, res) => {
  try {
    const db = req.db;
    const fid = req.user.familyId;
    const { approved, review_note } = req.body;
    const reqRow = db.prepare('SELECT * FROM savings_conversion_requests WHERE id=? AND family_id=?').get(req.params.id, fid);
    if (!reqRow) return res.status(404).json({ error: 'Não encontrado' });
    if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Solicitação já processada' });

    if (approved) {
      const { cycle, available } = await allowanceAvailability(db, reqRow.child_id, fid);
      if (!cycle) {
        return res.status(400).json({ error: 'Não há ciclo de mesada aberto. Peça nova solicitação.' });
      }
      const amt = reqRow.requested_amount;
      if (amt > available) return res.status(400).json({ error: 'Saldo insuficiente neste ciclo' });
      const goal = await db.prepare('SELECT * FROM savings_goals WHERE id=? AND child_id=?').get(reqRow.savings_goal_id, reqRow.child_id);
      if (!goal) return res.status(404).json({ error: 'Meta não encontrada' });

      await db.prepare('UPDATE allowance_cycles SET manual_adjustments = manual_adjustments - ? WHERE id=?').run(amt, cycle.id);
      await db.prepare(`INSERT INTO allowance_transactions (id,child_id,family_id,cycle_id,type,origin,description,amount,status,approved_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        uuidv4(), reqRow.child_id, fid, cycle.id, 'debit', 'manual', `Cofrinho/meta: ${goal.title}`, amt, 'approved', req.user.id,
      );
      await db.prepare('UPDATE savings_goals SET current_amount = current_amount + ? WHERE id=?').run(amt, goal.id);

      await db.prepare(`UPDATE savings_conversion_requests SET status='approved', reviewed_at=datetime('now'), reviewed_by=?, review_note=? WHERE id=?`).run(
        req.user.id, review_note || null, req.params.id,
      );

      try {
        await db.prepare(`INSERT INTO history (id,event,points,type,child_id,family_id) VALUES (?,?,?,?,?,?)`).run(
          uuidv4(), `Cofrinho: R$ ${amt.toFixed(2)} para "${goal.title}" (aprovado)`, 0, 'allowance', reqRow.child_id, fid,
        );
      } catch (e) { /* ignore */ }

      const childUser = await db.prepare('SELECT user_id FROM children WHERE id=?').get(reqRow.child_id);
      if (childUser?.user_id && isEnabled(db, fid, 'notifications')) {
        await db.prepare(`INSERT INTO notifications (id,title,message,type,icon,user_id,child_id,family_id) VALUES (?,?,?,?,?,?,?,?)`).run(
          uuidv4(),
          'Pedido de cofrinho aprovado',
          `Foi aprovado guardar R$ ${amt.toFixed(2)} na meta "${goal.title}".`,
          'allowance',
          '✅',
          null,
          reqRow.child_id,
          fid,
        );
      }
    } else {
      await db.prepare(`UPDATE savings_conversion_requests SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, review_note=? WHERE id=?`).run(
        req.user.id, review_note || null, req.params.id,
      );
      const childUser = await db.prepare('SELECT user_id FROM children WHERE id=?').get(reqRow.child_id);
      if (childUser?.user_id && isEnabled(db, fid, 'notifications')) {
        db.prepare(`INSERT INTO notifications (id,title,message,type,icon,user_id,child_id,family_id) VALUES (?,?,?,?,?,?,?,?)`).run(
          uuidv4(),
          'Pedido de cofrinho recusado',
          review_note || 'Um responsável recusou o pedido.',
          'allowance',
          '❌',
          null,
          reqRow.child_id,
          fid,
        );
      }
    }

    try {
      await db.prepare(`INSERT INTO audit_logs (id,family_id,user_id,role,module,action,description) VALUES (?,?,?,?,?,?,?)`).run(
        uuidv4(), fid, req.user.id, req.user.role, 'allowance', 'piggy_review', `${approved ? 'approve' : 'reject'} ${req.params.id}`,
      );
    } catch (e) { /* ignore */ }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro' });
  }
});

module.exports = router;
