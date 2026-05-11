const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('⚠️ Variáveis do Supabase ausentes no backend! (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

// Cliente com Service Role Key (bypassa o RLS e tem acesso total)
const supabase = createClient(supabaseUrl || '', supabaseServiceRoleKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = { supabase };
