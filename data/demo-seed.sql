-- data/demo-seed.sql
--
-- Hand-authored demo data (NOT generated). Seeds a single "demo" user with
-- one box and five owned specimens, each matching a real event row from
-- data/events-seed.sql by species_id + exact event name, so those five
-- catalog events render as "owned" in the demo UI.
--
-- Idempotent: INSERT OR REPLACE keyed on each table's primary key, safe to
-- re-run any number of times.

INSERT OR REPLACE INTO users (id, email, created_at) VALUES
  ('demo', 'demo@pokeflexdex.local', 0);

INSERT OR REPLACE INTO boxes (id, user_id, name) VALUES
  ('demo-events', 'demo', 'Events');

-- Matches events.slug='mew-2002' (species_id=151, name='Mew — Event', is_shiny=0)
INSERT OR REPLACE INTO specimens
  (id, user_id, species_id, form_id, is_shiny, is_event, event_name, box_id, source, created_at, updated_at)
VALUES
  ('demo-1', 'demo', 151, NULL, 0, 1, 'Mew — Event', 'demo-events', 'manual', 0, 0);

-- Matches events.slug='celebi-2001' (species_id=251, name='Celebi — Event', is_shiny=0)
INSERT OR REPLACE INTO specimens
  (id, user_id, species_id, form_id, is_shiny, is_event, event_name, box_id, source, created_at, updated_at)
VALUES
  ('demo-2', 'demo', 251, NULL, 0, 1, 'Celebi — Event', 'demo-events', 'manual', 0, 0);

-- Matches events.slug='jirachi-2004-tanabata-jirachi-2004'
-- (species_id=385, name='Jirachi — 2004 Tanabata Jirachi', is_shiny=0)
INSERT OR REPLACE INTO specimens
  (id, user_id, species_id, form_id, is_shiny, is_event, event_name, box_id, source, created_at, updated_at)
VALUES
  ('demo-3', 'demo', 385, NULL, 0, 1, 'Jirachi — 2004 Tanabata Jirachi', 'demo-events', 'manual', 0, 0);

-- Matches events.slug='charizard-shiny-charizard-2002'
-- (species_id=6, name='Charizard — Shiny Charizard', is_shiny=1)
INSERT OR REPLACE INTO specimens
  (id, user_id, species_id, form_id, is_shiny, is_event, event_name, box_id, source, created_at, updated_at)
VALUES
  ('demo-4', 'demo', 6, NULL, 1, 1, 'Charizard — Shiny Charizard', 'demo-events', 'manual', 0, 0);

-- Matches events.slug='pikachu-shiny-pikachu-gift-2019'
-- (species_id=25, name='Pikachu — Shiny Pikachu Gift', is_shiny=1)
INSERT OR REPLACE INTO specimens
  (id, user_id, species_id, form_id, is_shiny, is_event, event_name, box_id, source, created_at, updated_at)
VALUES
  ('demo-5', 'demo', 25, NULL, 1, 1, 'Pikachu — Shiny Pikachu Gift', 'demo-events', 'manual', 0, 0);
