import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ugrgjgigyfuziqntxaqm.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncmdqZ2lneWZ1emlxbnR4YXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDU4MzEsImV4cCI6MjA4NTc4MTgzMX0.s_A1txvtdPiKO4JwHAbJSlePjSERy_Oh8C5IDgl2Was';

export const supabase = createClient(supabaseUrl, supabaseKey);
