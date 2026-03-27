-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table
create table public.users (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text unique not null,
  name text,
  created_at timestamptz default now()
);

create index users_telegram_id_idx on public.users(telegram_id);

-- Transactions table
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  type text not null, -- 'income' or 'expense'
  amount int4 not null,
  category text not null,
  note text,
  created_at timestamptz default now()
);

create index transactions_user_id_idx on public.transactions(user_id);
create index transactions_created_at_idx on public.transactions(created_at);

-- Idempotency table
create table public.processed_updates (
  update_id int8 primary key,
  created_at timestamptz default now()
);
