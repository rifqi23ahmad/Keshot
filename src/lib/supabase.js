const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

// Create a single supabase client for interacting with your database
// We use the service_role key to bypass RLS, which is needed for server-side logic
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
