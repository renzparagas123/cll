// src/lib/supabase.js
// Supabase Client Configuration for Production

import { createClient } from '@supabase/supabase-js';

// Get environment variables
// React automatically loads .env.production when running `npm run build` or in production mode
// For local development, you can also create .env.development.local
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '⚠️ Missing Supabase environment variables!\n' +
    'Please check your .env.production file has:\n' +
    'REACT_APP_SUPABASE_URL=your_project_url\n' +
    'REACT_APP_SUPABASE_ANON_KEY=your_anon_key'
  );
}

// Create and export the Supabase client
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      // Persist session in localStorage
      persistSession: true,
      // Auto refresh token before expiry
      autoRefreshToken: true,
      // Detect session from URL (for OAuth)
      detectSessionInUrl: true,
    },
    // Optional: Configure realtime subscriptions
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// Helper function to handle Supabase errors
export const handleSupabaseError = (error) => {
  if (error) {
    console.error('Supabase Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
  return { success: true };
};

// Export default for convenience
export default supabase;