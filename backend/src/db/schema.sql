-- Enable RLS
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- Contracts Table
create table public.contracts (
  address text primary key,
  chain_id int not null,
  symbol text,
  name text,
  decimals int,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  creator_address text,
  is_verified boolean default false
);

alter table public.contracts enable row level security;
create policy "Public read access for contracts" on public.contracts for select using (true);

-- Liquidity Events Table
create table public.liquidity_events (
  id uuid default gen_random_uuid() primary key,
  contract_address text references public.contracts(address) on delete cascade,
  pair_address text not null,
  dex_name text not null,
  base_token text not null, -- e.g. WETH, BNB address or symbol
  initial_liquidity_amount numeric,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.liquidity_events enable row level security;
create policy "Public read access for liquidity_events" on public.liquidity_events for select using (true);

-- Risk Analysis Table
create type risk_classification as enum ('SAFE', 'VULNERABLE', 'SCAM', 'OPPORTUNITY', 'UNKNOWN');

create table public.risk_analysis (
  contract_address text primary key references public.contracts(address) on delete cascade,
  risk_score int check (risk_score >= 0 and risk_score <= 100),
  is_honeypot boolean default false,
  buy_tax numeric,
  sell_tax numeric,
  risk_reasons jsonb default '[]'::jsonb, -- Array of strings
  classification risk_classification default 'UNKNOWN',
  analyzed_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.risk_analysis enable row level security;
create policy "Public read access for risk_analysis" on public.risk_analysis for select using (true);

-- Realtime subscription
drop publication if exists supabase_realtime;
create publication supabase_realtime for table public.contracts, public.liquidity_events, public.risk_analysis;
