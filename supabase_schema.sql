create table if not exists public.commune_states (
  commune_key text not null,
  commune_name text not null,
  updated_by uuid references auth.users(id) on delete set null,
  email_sent boolean not null default false,
  contracted boolean not null default false,
  phone text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (commune_key)
);

alter table public.commune_states enable row level security;

create policy "Authenticated users can read commune states"
  on public.commune_states
  for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert commune states"
  on public.commune_states
  for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update commune states"
  on public.commune_states
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can delete commune states"
  on public.commune_states
  for delete
  using (auth.role() = 'authenticated');

-- Enable Supabase Realtime for this table so all authenticated clients receive live updates.
-- If this line reports that the table is already in the publication, you can ignore it.
alter publication supabase_realtime add table public.commune_states;