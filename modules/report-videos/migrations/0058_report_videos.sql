-- The rendered videos: one per recent daily, weekly and selected item. The files under <data>/videos/
-- are named by the kind, the key and the fingerprint of what they show, so a changed one gets a new
-- file and address.
CREATE TABLE IF NOT EXISTS report_videos (
  kind text NOT NULL CHECK (kind IN ('daily', 'weekly', 'item')),
  key text NOT NULL,
  title text NOT NULL,
  headline text,
  issue_number int,
  at timestamptz NOT NULL,
  fingerprint text NOT NULL,
  duration_ms int NOT NULL,
  bytes bigint NOT NULL,
  clips int NOT NULL,
  rendered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);
