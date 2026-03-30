-- ============================================================
-- BUSTED — Schéma Supabase
-- À exécuter dans le SQL Editor de votre projet Supabase
-- ============================================================

-- ─────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────

CREATE TABLE groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  invite_code char(6) NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  reveal_at   timestamptz          -- timestamp de révélation du vendredi
);

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  username            text NOT NULL,
  avatar_url          text,
  onboarding_answers  jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start    date NOT NULL,
  is_revealed   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cells (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_id          uuid NOT NULL REFERENCES grids(id) ON DELETE CASCADE,
  target_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content          text,
  position         integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'unchecked'
                     CHECK (status IN ('unchecked','pending_confirmation','pending_vote','busted','rejected')),
  is_auto_generated boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id          uuid NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  submitter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proof_text       text,
  proof_image_url  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE votes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  voter_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_valid        boolean NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, voter_user_id)
);

CREATE TABLE proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  proposer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content          text NOT NULL,
  vote_count       integer NOT NULL DEFAULT 0,
  is_approved      boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────

ALTER TABLE groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE grids       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cells       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals   ENABLE ROW LEVEL SECURITY;

-- Helper : renvoie le group_id de l'utilisateur connecté
CREATE OR REPLACE FUNCTION current_user_group_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT group_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

-- ── groups ──────────────────────────────
-- Accès aux membres du même groupe
CREATE POLICY "groups: membres du même groupe"
  ON groups FOR SELECT
  USING (id = current_user_group_id());

CREATE POLICY "groups: insert par membres"
  ON groups FOR INSERT
  WITH CHECK (true); -- géré applicativement (création de groupe)

-- ── users ───────────────────────────────
CREATE POLICY "users: membres du même groupe"
  ON users FOR SELECT
  USING (group_id = current_user_group_id());

CREATE POLICY "users: insert soi-même"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users: update soi-même"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- ── grids ───────────────────────────────
-- Visible uniquement par le propriétaire, sauf si révélée
CREATE POLICY "grids: propriétaire ou révélée"
  ON grids FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR is_revealed = true
  );

CREATE POLICY "grids: insert par propriétaire"
  ON grids FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "grids: update par propriétaire"
  ON grids FOR UPDATE
  USING (owner_user_id = auth.uid());

-- ── cells ───────────────────────────────
-- SELECT interdit si target_user_id = auth.uid() ET grille non révélée
CREATE POLICY "cells: masquée si cible et non révélée"
  ON cells FOR SELECT
  USING (
    NOT (
      target_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM grids
        WHERE grids.id = cells.grid_id
          AND grids.is_revealed = false
      )
    )
    -- doit aussi appartenir au groupe de l'utilisateur
    AND EXISTS (
      SELECT 1 FROM grids
      WHERE grids.id = cells.grid_id
        AND grids.group_id = current_user_group_id()
    )
  );

CREATE POLICY "cells: insert membres du groupe"
  ON cells FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grids
      WHERE grids.id = cells.grid_id
        AND grids.group_id = current_user_group_id()
    )
  );

CREATE POLICY "cells: update membres du groupe"
  ON cells FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM grids
      WHERE grids.id = cells.grid_id
        AND grids.group_id = current_user_group_id()
    )
  );

-- ── submissions ──────────────────────────
CREATE POLICY "submissions: membres du même groupe"
  ON submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM cells c
      JOIN grids g ON g.id = c.grid_id
      WHERE c.id = submissions.cell_id
        AND g.group_id = current_user_group_id()
    )
  );

CREATE POLICY "submissions: insert membres du groupe"
  ON submissions FOR INSERT
  WITH CHECK (
    submitter_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM cells c
      JOIN grids g ON g.id = c.grid_id
      WHERE c.id = submissions.cell_id
        AND g.group_id = current_user_group_id()
    )
  );

-- ── votes ────────────────────────────────
CREATE POLICY "votes: membres du même groupe"
  ON votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM submissions s
      JOIN cells c ON c.id = s.cell_id
      JOIN grids g ON g.id = c.grid_id
      WHERE s.id = votes.submission_id
        AND g.group_id = current_user_group_id()
    )
  );

CREATE POLICY "votes: insert membres du groupe"
  ON votes FOR INSERT
  WITH CHECK (
    voter_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM submissions s
      JOIN cells c ON c.id = s.cell_id
      JOIN grids g ON g.id = c.grid_id
      WHERE s.id = votes.submission_id
        AND g.group_id = current_user_group_id()
    )
  );

-- ── proposals ────────────────────────────
CREATE POLICY "proposals: membres du même groupe"
  ON proposals FOR SELECT
  USING (group_id = current_user_group_id());

CREATE POLICY "proposals: insert membres du groupe"
  ON proposals FOR INSERT
  WITH CHECK (
    proposer_user_id = auth.uid()
    AND group_id = current_user_group_id()
  );

CREATE POLICY "proposals: update membres du groupe"
  ON proposals FOR UPDATE
  USING (group_id = current_user_group_id());
