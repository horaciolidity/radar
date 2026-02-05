import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
    console.log("Checking for contract_audits table...");

    // Note: Supabase JS client doesn't support 'CREATE TABLE' directly.
    // The user would typically run this in the Supabase SQL Editor.
    // However, we can check if it exists by trying to select from it.

    const { error } = await supabase.from('contract_audits').select('*').limit(1);

    if (error && error.code === '42P01') {
        console.log("\n[ACTION REQUIRED] Table 'contract_audits' does not exist.");
        console.log("Please run the following SQL in your Supabase SQL Editor:\n");
        console.log(`
create table public.contract_audits (
  id uuid default gen_random_uuid() primary key,
  address text,
  network text,
  code_hash text,
  code_content text,
  result jsonb,
  risk_score int,
  created_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.contract_audits enable row level security;

-- Create policy to allow anyone to read
create policy "Allow public read access"
  on public.contract_audits for select
  using (true);

-- Create policy to allow internal service to insert
create policy "Allow public insert access"
  on public.contract_audits for insert
  with check (true);
    `);
    } else if (error) {
        console.error("Error checking table:", error);
    } else {
        console.log("Table 'contract_audits' already exists.");
    }
}

setupDatabase();
