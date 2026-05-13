require('dotenv').config();
const { initDatabase } = require('./init');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const db = initDatabase();

async function seed() {
  console.log('🌱 Seeding database...');

  // Create family
  const familyId = uuidv4();
  db.prepare(`INSERT INTO families (id, name, language, plan) VALUES (?, ?, ?, ?)`).run(
    familyId, 'Família Silva', 'pt', 'premium'
  );

  // Create parent
  const parentId = uuidv4();
  const parentPassword = bcrypt.hashSync('123456', 10);
  db.prepare(`INSERT INTO users (id, name, email, password, role, family_id, avatar_preset) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    parentId, 'Carlos Silva', 'pai@familia.com', parentPassword, 'parent', familyId, 'parent_male'
  );

  // Create second parent
  const parent2Id = uuidv4();
  db.prepare(`INSERT INTO users (id, name, email, password, role, family_id, avatar_preset) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    parent2Id, 'Maria Silva', 'mae@familia.com', parentPassword, 'parent', familyId, 'parent_female'
  );

  // Create children
  const children = [
    { name: 'Lucas', age: 12, color: '#6C5CE7', preset: 'explorer' },
    { name: 'Sofia', age: 9, color: '#E84393', preset: 'artist' },
    { name: 'Pedro', age: 7, color: '#00B894', preset: 'astronaut' }
  ];

  const childIds = [];
  for (const child of children) {
    const childId = uuidv4();
    const childUserId = uuidv4();
    childIds.push(childId);

    // Create child user account
    db.prepare(`INSERT INTO users (id, name, email, password, role, family_id, avatar_preset) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      childUserId, child.name, `${child.name.toLowerCase()}@familia.com`, parentPassword, 'child', familyId, child.preset
    );

    // Create child profile
    db.prepare(`INSERT INTO children (id, name, age, color, user_id, family_id, avatar_preset, points, coins, level, xp, streak_current) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      childId, child.name, child.age, child.color, childUserId, familyId, child.preset,
      child.age * 15, // Some initial points
      child.age * 3,  // Some initial coins
      Math.floor(child.age / 4) + 1, // Level based on age
      (child.age * 15) % 100, // XP
      Math.floor(Math.random() * 5) // Random streak
    );
  }

  // Create tasks
  const tasks = [
    { title: 'Arrumar a cama', type: 'home', points: 5, status: 'approved', childIdx: 0 },
    { title: 'Lavar a louça', type: 'home', points: 10, status: 'pending', childIdx: 0 },
    { title: 'Estudar matemática', type: 'school', points: 15, status: 'completed', childIdx: 0 },
    { title: 'Ler 30 minutos', type: 'school', points: 10, status: 'pending', childIdx: 0, frequency: 'daily' },
    { title: 'Organizar brinquedos', type: 'home', points: 5, status: 'approved', childIdx: 1 },
    { title: 'Fazer lição de casa', type: 'school', points: 15, status: 'pending', childIdx: 1, frequency: 'daily' },
    { title: 'Guardar roupas', type: 'home', points: 5, status: 'pending', childIdx: 1 },
    { title: 'Desenhar', type: 'school', points: 10, status: 'approved', childIdx: 1 },
    { title: 'Escovar os dentes', type: 'home', points: 3, status: 'approved', childIdx: 2, frequency: 'daily' },
    { title: 'Guardar brinquedos', type: 'home', points: 5, status: 'pending', childIdx: 2 },
    { title: 'Colorir atividade', type: 'school', points: 8, status: 'completed', childIdx: 2 },
  ];

  for (const task of tasks) {
    db.prepare(`INSERT INTO tasks (id, title, type, points, status, frequency, is_recurring, child_id, family_id) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`).run(
      uuidv4(), task.title, task.type, task.points, task.frequency || 'once', task.frequency && task.frequency !== 'once' ? 1 : 0, childIds[task.childIdx], familyId
    );
  }

  // Create grades
  const grades = [
    { subject: 'Matemática', type: 'test', score: 8.5, childIdx: 0 },
    { subject: 'Português', type: 'test', score: 9.0, childIdx: 0 },
    { subject: 'Ciências', type: 'homework', score: 7.5, childIdx: 0 },
    { subject: 'História', type: 'project', score: 10, childIdx: 0 },
    { subject: 'Matemática', type: 'test', score: 9.5, childIdx: 1 },
    { subject: 'Português', type: 'test', score: 8.0, childIdx: 1 },
    { subject: 'Artes', type: 'project', score: 10, childIdx: 1 },
    { subject: 'Matemática', type: 'test', score: 7.0, childIdx: 2 },
    { subject: 'Português', type: 'homework', score: 8.5, childIdx: 2 },
  ];

  for (const grade of grades) {
    db.prepare(`INSERT INTO grades (id, subject, type, score, date, child_id, family_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), grade.subject, grade.type, grade.score, '2026-05-01', childIds[grade.childIdx], familyId
    );
  }

  // Create rewards
  const rewards = [
    { name: 'Sessão de Cinema', icon: '🎬', point_cost: 100, type: 'non_financial' },
    { name: 'Sobremesa Especial', icon: '🍰', point_cost: 30, type: 'non_financial' },
    { name: 'Passeio no Parque', icon: '🎢', point_cost: 150, type: 'non_financial' },
    { name: '30min Extra de Videogame', icon: '🎮', point_cost: 50, type: 'non_financial' },
    { name: 'R$10 Bônus', icon: '💰', point_cost: 200, type: 'financial' },
    { name: 'Escolher o Jantar', icon: '🍕', point_cost: 80, type: 'non_financial' },
    { name: 'Baú Misterioso', icon: '🎁', point_cost: 120, type: 'surprise' },
  ];

  for (const reward of rewards) {
    db.prepare(`INSERT INTO rewards (id, name, icon, point_cost, type, family_id) VALUES (?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), reward.name, reward.icon, reward.point_cost, reward.type, familyId
    );
  }

  // Create allowance settings
  for (let i = 0; i < childIds.length; i++) {
    db.prepare(`INSERT OR IGNORE INTO allowance_settings (id, child_id, family_id, model_type, base_amount, currency, allow_accumulation) VALUES (?, ?, ?, 'hybrid', ?, 'BRL', 1)`).run(
      uuidv4(), childIds[i], familyId, (i + 1) * 20
    );
    // Create current open cycle
    const now = new Date();
    db.prepare(`INSERT OR IGNORE INTO allowance_cycles (id, child_id, family_id, month, year, opening_balance, base_amount, status) VALUES (?, ?, ?, ?, ?, 0, ?, 'open')`).run(
      uuidv4(), childIds[i], familyId, now.getMonth() + 1, now.getFullYear(), (i + 1) * 20
    );
  }

  // Create calendar events
  const events = [
    { title: 'Reunião Escolar - Lucas', date: '2026-05-15', type: 'school', childIdx: 0 },
    { title: 'Aula de Natação', date: '2026-05-12', type: 'activity', childIdx: 0 },
    { title: 'Ballet', date: '2026-05-13', type: 'activity', childIdx: 1 },
    { title: 'Aniversário do Pedro', date: '2026-06-20', type: 'family', childIdx: null },
    { title: 'Prova de Matemática', date: '2026-05-20', type: 'school', childIdx: 0 },
    { title: 'Passeio em Família', date: '2026-05-25', type: 'family', childIdx: null },
    { title: 'Apresentação de Artes', date: '2026-05-22', type: 'school', childIdx: 1 },
  ];

  for (const event of events) {
    db.prepare(`INSERT INTO calendar_events (id, title, date, type, child_id, family_id) VALUES (?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), event.title, event.date, event.type, event.childIdx !== null ? childIds[event.childIdx] : null, familyId
    );
  }

  // Give some medals to children
  db.prepare(`INSERT OR IGNORE INTO earned_medals (id, medal_id, child_id) VALUES (?, ?, ?)`).run(uuidv4(), 'medal_first_task', childIds[0]);
  db.prepare(`INSERT OR IGNORE INTO earned_medals (id, medal_id, child_id) VALUES (?, ?, ?)`).run(uuidv4(), 'medal_10_tasks', childIds[0]);
  db.prepare(`INSERT OR IGNORE INTO earned_medals (id, medal_id, child_id) VALUES (?, ?, ?)`).run(uuidv4(), 'medal_streak_3', childIds[0]);
  db.prepare(`INSERT OR IGNORE INTO earned_medals (id, medal_id, child_id) VALUES (?, ?, ?)`).run(uuidv4(), 'medal_first_task', childIds[1]);
  db.prepare(`INSERT OR IGNORE INTO earned_medals (id, medal_id, child_id) VALUES (?, ?, ?)`).run(uuidv4(), 'medal_nota_10', childIds[1]);
  db.prepare(`INSERT OR IGNORE INTO earned_medals (id, medal_id, child_id) VALUES (?, ?, ?)`).run(uuidv4(), 'medal_first_task', childIds[2]);

  // Create some history
  const historyEntries = [
    { event: 'Tarefa concluída: Arrumar a cama', points: 5, type: 'task', childIdx: 0 },
    { event: 'Medalha conquistada: Primeira Tarefa', points: 0, type: 'medal', childIdx: 0 },
    { event: 'Subiu para nível 2!', points: 0, type: 'level', childIdx: 0 },
    { event: 'Tarefa concluída: Organizar brinquedos', points: 5, type: 'task', childIdx: 1 },
    { event: 'Nota máxima em Artes!', points: 20, type: 'grade', childIdx: 1 },
    { event: 'Tarefa concluída: Escovar os dentes', points: 3, type: 'task', childIdx: 2 },
  ];

  for (const entry of historyEntries) {
    db.prepare(`INSERT INTO history (id, event, points, type, child_id, family_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), entry.event, entry.points, entry.type, childIds[entry.childIdx], familyId, new Date().toISOString()
    );
  }

  // Create notifications
  db.prepare(`INSERT INTO notifications (id, title, message, type, icon, user_id, family_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    uuidv4(), 'Bem-vindo ao FamilyBase!', 'Sua família foi criada com sucesso.', 'info', '🎉', parentId, familyId
  );
  db.prepare(`INSERT INTO notifications (id, title, message, type, icon, child_id, family_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    uuidv4(), 'Tarefa pendente', 'Lavar a louça precisa ser feita hoje!', 'task', '📋', childIds[0], familyId
  );

  console.log('✅ Seed data created successfully!');
  console.log('');
  console.log('👤 Login de Pai: pai@familia.com / 123456');
  console.log('👤 Login de Mãe: mae@familia.com / 123456');
  console.log('👦 Login Lucas: lucas@familia.com / 123456');
  console.log('👧 Login Sofia: sofia@familia.com / 123456');
  console.log('👦 Login Pedro: pedro@familia.com / 123456');

  db.close();
}

seed().catch(console.error);
