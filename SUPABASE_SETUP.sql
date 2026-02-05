-- 1. Create the table if it doesn't exist
create table if not exists public.contract_audits (
  id uuid default gen_random_uuid() primary key,
  address text,
  network text,
  code_content text,
  result jsonb,
  risk_score int,
  created_at timestamp with time zone default now()
);

-- 2. Enable Row Level Security (RLS)
alter table public.contract_audits enable row level security;

-- 3. Create policies (Drop first to avoid "policy already exists" errors)
drop policy if exists "Allow public read" on public.contract_audits;
create policy "Allow public read" on public.contract_audits for select using (true);

drop policy if exists "Allow public insert" on public.contract_audits;
create policy "Allow public insert" on public.contract_audits for insert with check (true);
