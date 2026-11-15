create extension if not exists pgcrypto;

create table if not exists public.users (
  telegram_id text primary key,
  username text,
  full_name text,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.wallets (
  telegram_id text primary key references public.users(telegram_id),
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.topups (
  id uuid primary key default gen_random_uuid(),
  reference_id text not null unique,
  telegram_id text not null references public.users(telegram_id),
  amount bigint not null check (amount > 0),
  status text not null default 'creating' check (status in ('creating','pending','paid','failed','expired')),
  xendit_payment_request_id text unique,
  xendit_payment_id text unique,
  qr_string text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null references public.users(telegram_id),
  amount bigint not null,
  type text not null check (type in ('credit','debit','adjustment')),
  reference_id text not null unique,
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price bigint not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.wallets enable row level security;
alter table public.topups enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.products enable row level security;

create or replace function public.credit_topup(p_reference_id text, p_payment_id text, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.topups%rowtype;
begin
  select * into t from public.topups where reference_id = p_reference_id for update;
  if not found then raise exception 'Topup not found'; end if;
  if t.status = 'paid' then
    if t.xendit_payment_id = p_payment_id then
      return jsonb_build_object('success', true, 'duplicate', true);
    end if;
    raise exception 'Already paid with a different payment ID';
  end if;
  if t.status <> 'pending' or t.amount <> p_amount then raise exception 'Topup status or amount mismatch'; end if;
  update public.topups set status = 'paid', xendit_payment_id = p_payment_id, paid_at = now() where id = t.id;
  update public.wallets set balance = balance + p_amount, updated_at = now() where telegram_id = t.telegram_id;
  if not found then raise exception 'Wallet not found'; end if;
  insert into public.wallet_transactions(telegram_id, amount, type, reference_id, description)
  values (t.telegram_id, p_amount, 'credit', 'topup:' || p_reference_id, 'Top up QRIS');
  return jsonb_build_object('success', true, 'duplicate', false);
end; $$;
revoke all on function public.credit_topup(text,text,bigint) from public, anon, authenticated;
grant execute on function public.credit_topup(text,text,bigint) to service_role;
