-- Adds Gold Coast (YBCG) as a third airport.
--
-- New mail groups cover all three airports by default. Existing groups that
-- already cover every other airport (Brisbane and Cairns) get Gold Coast too,
-- so groups meant for "all airports" keep meaning that. Groups set up for
-- one airport keep their choice; Gold Coast can be switched on in Mail groups.
alter table public.mail_groups
  alter column airports set default array['YBBN', 'YBCS', 'YBCG'];

update public.mail_groups
set airports = array_append(airports, 'YBCG')
where airports @> array['YBBN', 'YBCS']
  and not airports @> array['YBCG'];
