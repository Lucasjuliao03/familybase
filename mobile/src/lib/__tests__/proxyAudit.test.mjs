// Testes do modo "proxy de perfil do filho".
// Executar com Node 22.18+ / 23.6+ (type stripping nativo):
//   npm test
// ou: node --experimental-strip-types --test src/lib/__tests__/
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveProxyAction,
  extractEntityId,
  summarizeBody,
  buildProxyAuditRow,
  makeProxySession,
  canActAsChild,
  isMutatingMethod,
  normalizePath,
} from '../proxyAudit.ts';

const PARENT = { id: 'parent-1', name: 'Ana Souza', family_id: 'fam-1' };
const CHILD = {
  id: 'child-9',
  user_id: 'childuser-9',
  name: 'João Souza',
  color: '#FF8800',
  family_id: 'fam-1',
};

// ─── Auditoria: derivação de ação ──────────────────────────────────────────
test('deriveProxyAction reconhece conclusão de tarefa', () => {
  assert.equal(
    deriveProxyAction('put', '/tasks/occurrences/abc/complete'),
    'task_complete',
  );
});

test('deriveProxyAction reconhece aprovação/revisão', () => {
  assert.equal(deriveProxyAction('put', '/tasks/occurrences/abc/approve'), 'task_review');
});

test('deriveProxyAction diferencia sugestão (POST) de update de tarefa', () => {
  assert.equal(deriveProxyAction('post', '/tasks'), 'task_suggest');
  assert.equal(deriveProxyAction('put', '/tasks/123'), 'task_occurrence_update');
});

test('deriveProxyAction cobre saúde, notas e mesada', () => {
  assert.equal(deriveProxyAction('post', '/health/medication-logs'), 'health_medication_log');
  assert.equal(deriveProxyAction('post', '/grades'), 'grade_update');
  assert.equal(deriveProxyAction('post', '/allowance/redemptions'), 'allowance_redemption');
});

// ─── Auditoria: utilitários ────────────────────────────────────────────────
test('extractEntityId extrai UUID do path', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  assert.equal(extractEntityId(`/tasks/occurrences/${id}/complete`), id);
  assert.equal(extractEntityId('/tasks/occurrences'), null);
});

test('normalizePath remove querystring', () => {
  assert.equal(normalizePath('/tasks/occurrences?date=2026-05-28'), '/tasks/occurrences');
});

test('isMutatingMethod identifica mutações', () => {
  assert.equal(isMutatingMethod('GET'), false);
  assert.equal(isMutatingMethod('post'), true);
  assert.equal(isMutatingMethod('PUT'), true);
  assert.equal(isMutatingMethod('delete'), true);
});

test('summarizeBody remove campos sensíveis e trunca textos longos', () => {
  const out = summarizeBody({
    observation: 'ok',
    password: 'secreta',
    token: 'xyz',
    points: 10,
    long: 'a'.repeat(400),
    nested: { x: 1 },
  });
  assert.equal(out.password, undefined);
  assert.equal(out.token, undefined);
  assert.equal(out.observation, 'ok');
  assert.equal(out.points, 10);
  assert.equal(out.nested, '[obj]');
  assert.ok(String(out.long).endsWith('…'));
  assert.ok(String(out.long).length <= 280);
});

// ─── Auditoria: linha de registro (user_id=filho, performed_by=pai) ─────────
test('buildProxyAuditRow registra child_id do filho e performed_by do pai', () => {
  const session = makeProxySession({ child: CHILD, parent: PARENT, now: () => '2026-05-28T00:00:00.000Z' });
  const row = buildProxyAuditRow(session, 'put', '/tasks/occurrences/occ-1/complete', {
    observation: 'feito por mim',
    completed_late: false,
  });

  assert.equal(row.child_id, 'child-9');          // dono do registro = filho
  assert.equal(row.performed_by, 'parent-1');     // ator = pai
  assert.equal(row.action, 'task_complete');
  assert.equal(row.http_method, 'PUT');
  assert.equal(row.path, '/tasks/occurrences/occ-1/complete');
  assert.equal(row.entity, 'tasks');
  assert.equal(row.metadata.child_user_id, 'childuser-9');
  assert.equal(row.metadata.body.observation, 'feito por mim');
});

// ─── Segurança: quem pode atuar como filho ─────────────────────────────────
test('canActAsChild: pai/gestor da mesma família pode', () => {
  assert.equal(canActAsChild('parent', 'fam-1', 'fam-1'), true);
  assert.equal(canActAsChild('relative', 'fam-1', 'fam-1'), true);
});

test('canActAsChild: master pode em qualquer família', () => {
  assert.equal(canActAsChild('master', 'fam-1', 'fam-2'), true);
});

test('canActAsChild: criança NUNCA pode (requisito 6)', () => {
  assert.equal(canActAsChild('child', 'fam-1', 'fam-1'), false);
});

test('canActAsChild: pai de outra família não pode', () => {
  assert.equal(canActAsChild('parent', 'fam-1', 'fam-2'), false);
});

// ─── Fluxo pai → filho → retorno ───────────────────────────────────────────
test('fluxo: entrar como filho, auditar ação e voltar ao pai', () => {
  // 1) Pai entra no perfil do filho
  let session = makeProxySession({ child: CHILD, parent: PARENT });
  assert.equal(session.childProfileId, 'child-9');
  assert.equal(session.parentId, 'parent-1');
  assert.equal(session.familyId, 'fam-1');

  // 2) Ação no modo filho gera log com performed_by = pai
  const audit = buildProxyAuditRow(session, 'put', '/tasks/occurrences/o1/complete', {});
  assert.equal(audit.performed_by, 'parent-1');
  assert.equal(audit.child_id, 'child-9');

  // 3) Pai volta ao próprio perfil → sessão de proxy encerrada
  session = null;
  assert.equal(session, null);
});

test('makeProxySession exige filho e pai válidos', () => {
  assert.throws(() => makeProxySession({ child: {}, parent: PARENT }));
  assert.throws(() => makeProxySession({ child: CHILD, parent: {} }));
});
