-- Where each entry's screen begins in a broadcast, for the player's chapters; videos rendered before it have none.
ALTER TABLE report_videos ADD COLUMN IF NOT EXISTS chapters jsonb;
