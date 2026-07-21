-- Background export jobs table
create type public.export_job_status as enum ('queued','processing','completed','failed','canceled');
create type public.export_job_kind as enum ('agent_feedback','agent_emails');

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.export_job_kind not null,
  format text not null default 'csv',
  label text,
  params jsonb not null default '{}'::jsonb,
  status public.export_job_status not null default 'queued',
  progress int not null default 0,
  total int,
  row_count int,
  file_path text,
  file_name text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index export_jobs_user_created_idx on public.export_jobs (user_id, created_at desc);
create index export_jobs_status_idx on public.export_jobs (status, created_at) where status in ('queued','processing');

grant select, insert, update on public.export_jobs to authenticated;
grant all on public.export_jobs to service_role;

alter table public.export_jobs enable row level security;

create policy "Users read own export jobs"
  on public.export_jobs for select to authenticated
  using (auth.uid() = user_id);

create policy "Users create own export jobs"
  on public.export_jobs for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users cancel own queued export jobs"
  on public.export_jobs for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger tg_export_jobs_updated_at before update on public.export_jobs
  for each row execute function public.tg_set_updated_at();

alter table public.export_jobs replica identity full;
alter publication supabase_realtime add table public.export_jobs;

-- Notification on completion / failure
create or replace function public.tg_export_job_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'completed' then
      perform public.create_notification(
        new.user_id, 'export.completed',
        'Export ready',
        coalesce(new.label, 'Your export') || ' — ' || coalesce(new.row_count, 0) || ' rows',
        '/exports/' || new.id::text, 'export_job', new.id
      );
    elsif new.status = 'failed' then
      perform public.create_notification(
        new.user_id, 'export.failed',
        'Export failed',
        coalesce(new.error, 'Export could not be generated.'),
        '/exports/' || new.id::text, 'export_job', new.id
      );
    end if;
  end if;
  return new;
end $$;

create trigger tg_export_jobs_notify after update on public.export_jobs
  for each row execute function public.tg_export_job_notify();