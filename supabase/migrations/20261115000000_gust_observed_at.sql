-- When each observation's gust was measured. METARs only report a gust
-- 10 kt or more above the mean wind, so the alert cycle also takes gusts
-- from BoM's station readings, which are newer than the METAR they are
-- stored with. Null when there is no gust; existing rows came from METARs,
-- so their gust time is the observation time.
alter table public.observations add column gust_observed_at timestamptz;

update public.observations
set gust_observed_at = observed_at
where gust_kt is not null;
