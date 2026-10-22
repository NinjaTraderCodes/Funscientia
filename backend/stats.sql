-- stats.sql (optional): totals for the team, run in the SQL Editor only.
-- Nothing here is reachable from the game or the internet.

-- How many players, and how many came back to play again?
select count(*)                                as players,
       count(*) filter (where save_count > 1)  as played_more_than_once,
       max(updated_at)                         as last_played
from public.saves;

-- Which discoveries were unlocked, and by how many players?
select d.discovery, count(*) as players
from public.saves s,
     jsonb_array_elements_text(s.data -> 'discoveries') as d(discovery)
group by d.discovery
order by players desc;

-- What did players predict before each mini-game?
select p.question, p.answer, count(*) as players
from public.saves s,
     jsonb_each_text(s.data -> 'predictions') as p(question, answer)
group by p.question, p.answer
order by p.question, players desc;

-- How far did players get, and in which language?
select s.data ->> 'place' as place, s.data ->> 'lang' as lang, count(*) as players
from public.saves s
group by 1, 2
order by players desc;
