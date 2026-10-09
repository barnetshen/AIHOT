-- The broadcast video of each recent daily and weekly. The files under <data>/videos/ are named by the
-- issue and the fingerprint of what they show, so a changed issue gets a new file and address.
CREATE TABLE IF NOT EXISTS report_videos (
  kind text NOT NULL CHECK (kind IN ('daily', 'weekly')),
  key text NOT NULL,
  title text NOT NULL,
  headline text,
  issue_number int NOT NULL,
  fingerprint text NOT NULL,
  duration_ms int NOT NULL,
  bytes bigint NOT NULL,
  clips int NOT NULL,
  pictures int NOT NULL,
  rendered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);
