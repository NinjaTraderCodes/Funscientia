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

-- ===== Round 2 (October 2026): the new fields "results" and "furthest" =====
-- Read-only, like the queries above. Jury starting points (templates) are left out.

-- 5) Stars per mission: how many players finished it, their average stars, and how many got 1, 2 or 3.
--    (results.<mission>.stars is each player's BEST result; for "revision", score = memory moves)
select r.mission,
       count(*)                                              as players,
       round(avg((r.result ->> 'stars')::numeric), 2)        as average_stars,
       count(*) filter (where (r.result ->> 'stars') = '1') as one_star,
       count(*) filter (where (r.result ->> 'stars') = '2') as two_stars,
       count(*) filter (where (r.result ->> 'stars') = '3') as three_stars
from public.saves s,
     jsonb_each(coalesce(s.data -> 'results', '{}'::jsonb)) as r(mission, result)
where coalesce(s.data ->> 'template', 'false') <> 'true'
group by r.mission
order by array_position(array['mouth', 'stomach', 'small-intestine', 'revision'], r.mission);

-- 6) How far players got: the furthest place each one reached (older saves: where they are),
--    in the order of the journey.
select coalesce(s.data ->> 'furthest', s.data ->> 'place') as furthest_place,
       count(*)                                           as players
from public.saves s
where coalesce(s.data ->> 'template', 'false') <> 'true'
group by 1
order by array_position(array['road', 'road2', 'mouth', 'esophagus', 'stomach', 'intestine-road',
                              'intestine-gate', 'small-intestine', 'revision', 'complete'],
                        coalesce(s.data ->> 'furthest', s.data ->> 'place'));

-- 7) Predictions: for each question asked before a mission, how many players answered
--    and how many predicted correctly (the mission then shows them the answer).
with correct(question, answer) as (
  values ('saliva', 'sugar'), ('pepsin', 'protein'), ('bile', 'bile')
),
answers as (
  select p.question, p.answer
  from public.saves s,
       jsonb_each_text(coalesce(s.data -> 'predictions', '{}'::jsonb)) as p(question, answer)
  where coalesce(s.data ->> 'template', 'false') <> 'true'
)
select c.question,
       c.answer                                                         as correct_answer,
       count(a.answer)                                                  as answered,
       count(*) filter (where a.answer = c.answer)                      as correct,
       round(100.0 * count(*) filter (where a.answer = c.answer)
             / nullif(count(a.answer), 0), 1)                           as percent_correct
from correct c
left join answers a on a.question = c.question
group by c.question, c.answer
order by c.question;

-- 8) The Small Intestine mission and the Memory Challenge: average wrong helpers (mistakes) of the
--    players who finished the mission, and average memory moves of those who finished the challenge.
select round(avg((s.data -> 'chapter3' ->> 'mistakes')::numeric)
               filter (where (s.data -> 'chapter3' ->> 'lesson') = '4'), 1)
         as avg_intestine_mistakes,
       round(avg((s.data -> 'results' -> 'revision' ->> 'score')::numeric), 1)
         as avg_memory_moves
from public.saves s
where coalesce(s.data ->> 'template', 'false') <> 'true';
