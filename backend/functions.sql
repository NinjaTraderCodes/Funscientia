-- functions.sql: the only three ways the game talks to the database.

-- 1) create_save(data) -> a new save code, e.g. 'K7QM-4FXA'
create or replace function public.create_save(p_data jsonb)
returns text
language plpgsql
security definer          -- runs with the owner's rights, so the table can stay locked
set search_path = ''      -- safety: every name below is written in full (public.saves)
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 easy-to-read characters
  v_picks    constant int[] := array[0, 1, 2, 3, 4, 5, 10, 11];  -- random bytes of a UUID
  v_bytes    bytea;
  v_code     text;
begin
  -- the data must be a JSON object, with a version number, and not too big
  if p_data is null or jsonb_typeof(p_data) <> 'object' or not (p_data ? 'version') then
    raise exception 'data must be a JSON object with a "version"' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 16000 then
    raise exception 'data is too big (max 16000 bytes)' using errcode = '22023';
  end if;

  -- pick a random code; in the very rare case it already exists, try again
  for attempt in 1..10 loop
    v_bytes := uuid_send(gen_random_uuid());  -- 16 cryptographically random bytes
    v_code := '';
    for i in 1..8 loop
      if i = 5 then
        v_code := v_code || '-';
      end if;
      v_code := v_code || substr(v_alphabet, get_byte(v_bytes, v_picks[i]) % 31 + 1, 1);
    end loop;
    begin
      insert into public.saves (code, data) values (v_code, p_data);
      return v_code;
    exception when unique_violation then
      -- that code is taken: loop and try another one
    end;
  end loop;
  raise exception 'could not create a save code, please try again';
end;
$$;


-- 2) save_progress(code, data) -> true if saved, false if there is no such code
create or replace function public.save_progress(p_code text, p_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or not (p_data ? 'version') then
    raise exception 'data must be a JSON object with a "version"' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 16000 then
    raise exception 'data is too big (max 16000 bytes)' using errcode = '22023';
  end if;

  -- accept 'k7qm4fxa', 'K7QM 4FXA', 'k7qm-4fxa'...: keep letters/digits, upper-case, add the dash
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_code !~ '^[2-9A-HJKMNP-Z]{8}$' then
    return false;
  end if;
  v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);

  update public.saves
     set data = p_data,
         updated_at = now(),
         save_count = save_count + 1
   where code = v_code;
  return found;  -- true when a row was updated
end;
$$;


-- 3) load_progress(code) -> the saved data, or null if there is no such code
create or replace function public.load_progress(p_code text)
returns jsonb
language plpgsql
stable                     -- only reads
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_data jsonb;
begin
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_code !~ '^[2-9A-HJKMNP-Z]{8}$' then
    return null;
  end if;
  v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);

  select s.data into v_data from public.saves s where s.code = v_code;
  return v_data;  -- null when not found
end;
$$;
