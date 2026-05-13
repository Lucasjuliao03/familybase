require('dotenv').config();
const { initDatabase } = require('../src/database/init');
const { supabase } = require('../src/database/supabaseClient');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { ensureFamilyModules } = require('../src/lib/familyModuleService');

async function seed() {
  const db = initDatabase();
  console.log('Connecting to database...');

  try {
    const familyName = 'Família Demo';
    
    // 1. Create Family
    const existingFamily = await db.prepare('SELECT id FROM families WHERE name = ?').get(familyName);
    let finalFamilyId;
    
    if (!existingFamily) {
      finalFamilyId = uuidv4();
      await db.prepare('INSERT INTO families (id, name, language, plan) VALUES (?, ?, ?, ?)').run(
        finalFamilyId, familyName, 'pt', 'premium'
      );
      console.log('✅ Family created');
    } else {
      finalFamilyId = existingFamily.id;
      console.log('ℹ️ Family already exists');
    }

    // 2. Enable Modules
    await ensureFamilyModules(db, finalFamilyId, 'premium');
    console.log('✅ Modules ensured');

    const usersToCreate = [
      { email: 'pai@familia.com', name: 'Pai Demo', role: 'parent', avatar: 'parent_male', profile: 'gestor' },
      { email: 'lucas@familia.com', name: 'Lucas', role: 'child', avatar: 'explorer', profile: null }
    ];

    for (const u of usersToCreate) {
      console.log(`Processing user: ${u.email}...`);
      
      // Check if exists in auth
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;
      
      let authUser = authData.users.find(user => user.email === u.email);
      let userId;

      if (!authUser) {
        console.log(`Creating user ${u.email} in Supabase Auth...`);
        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
          email: u.email,
          password: '123456',
          email_confirm: true,
          user_metadata: { name: u.name }
        });
        if (createError) throw createError;
        authUser = createData.user;
        console.log(`✅ User ${u.email} created in Auth`);
      } else {
        console.log(`ℹ️ User ${u.email} already exists in Auth`);
        // Update password just in case
        await supabase.auth.admin.updateUserById(authUser.id, { password: '123456' });
      }
      
      userId = authUser.id;

      // Now create/update profile in public.users
      const existingProfile = await db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
      const hashedPassword = bcrypt.hashSync('123456', 10);

      if (!existingProfile) {
        console.log(`Creating profile for ${u.email} in public.users...`);
        await db.prepare('INSERT INTO users (id, name, email, password, role, family_id, avatar_preset, access_profile, must_change_password, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          userId, u.name, u.email, hashedPassword, u.role, finalFamilyId, u.avatar, u.profile, false, 'active'
        );
        console.log(`✅ Profile for ${u.email} created`);
      } else {
        console.log(`ℹ️ Profile for ${u.email} already exists, updating...`);
        await db.prepare('UPDATE users SET id = ?, name = ?, password = ?, role = ?, family_id = ?, avatar_preset = ?, access_profile = ?, status = ? WHERE email = ?').run(
          userId, u.name, hashedPassword, u.role, finalFamilyId, u.avatar, u.profile, 'active', u.email
        );
      }

      // If child, ensure entry in children table
      if (u.role === 'child') {
        const existingChild = await db.prepare('SELECT id FROM children WHERE user_id = ?').get(userId);
        if (!existingChild) {
          await db.prepare('INSERT INTO children (id, name, age, color, avatar_preset, user_id, family_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
            uuidv4(), u.name, 10, '#00B894', u.avatar, userId, finalFamilyId, 'active'
          );
          console.log(`✅ Child profile for ${u.name} created`);
        }
      }
    }

    console.log('\n🚀 Demo seeding complete!');
    console.log('Parent: pai@familia.com / 123456');
    console.log('Child: lucas@familia.com / 123456');

  } catch (err) {
    console.error('❌ Seeding failed:', err);
  } finally {
    process.exit(0);
  }
}

seed();
