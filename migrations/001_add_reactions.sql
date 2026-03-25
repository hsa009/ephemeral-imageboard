-- Add reactions JSONB column to threads and replies tables
ALTER TABLE threads ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
ALTER TABLE replies ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- Enable realtime for replies table
ALTER PUBLICATION supabase_realtime ADD TABLE replies;
