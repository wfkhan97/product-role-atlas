-- pipeline/sql/002_runs.sql: one row per run of a pipeline stage, written by pipeline/log.py when SUPABASE_DB_URL
-- is set (the handler fires when the stage's process ends) and by the research repo's runlog.py the same way.
-- Applied once by the owner in the project's SQL editor; a thread never applies a migration. Service role only:
-- row-level security on with no policies, so the service role (which bypasses it) inserts and selects and nobody
-- else does anything. Nothing in a row is content: names, times, counts.
create table if not exists public.runs (
  id          bigint generated always as identity primary key,
  repo        text not null,                       -- product-role-atlas, gradbuddy-research
  job         text not null,                       -- refresh-mba, refresh-product, rescrape-sp27, ... (PIPELINE_JOB), else the stage
  stage       text not null,                       -- scrape, extract, build_graph, ...
  host        text,                                -- the runner's name (RUNNER_NAME) or the machine's host name
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  ok          boolean not null,                    -- no ERROR line and no uncaught exception
  counts      jsonb not null default '{}'::jsonb,  -- the numbers of the stage's INFO summary line, keyed by their words
  warnings    integer not null default 0,
  errors      integer not null default 0,
  log_path    text                                 -- the logs/ file (PIPELINE_LOG), which the jobs push to the logs store
);
comment on table public.runs is 'one row per pipeline stage run (pipeline/log.py RunRecorder; python -m pipeline.runs reads it)';
create index if not exists runs_job_started_idx on public.runs (job, started_at desc);
alter table public.runs enable row level security;
-- no policies on purpose: service role only.
