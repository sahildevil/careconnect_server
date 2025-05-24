const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
  console.error("Missing Supabase credentials. Please check your .env file.");
  process.exit(1);
}

// Default shared instance
const supabase = createClient(supabaseUrl, supabaseKey);

// Admin instance with service role key
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Function to create fresh instances when needed
const createFreshInstance = (useServiceRole = false) => {
  return createClient(
    supabaseUrl,
    useServiceRole ? supabaseServiceKey : supabaseKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};

module.exports = {
  supabase,
  supabaseAdmin,
  createFreshInstance,
};
