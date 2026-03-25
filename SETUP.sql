-- Run this in Supabase SQL Editor to create the imageboard tables

-- Create threads table
CREATE TABLE IF NOT EXISTS threads (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  comment TEXT NOT NULL,
  image_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_bumped_at TIMESTAMPTZ DEFAULT NOW(),
  bump_count INTEGER DEFAULT 0,
  locked BOOLEAN DEFAULT FALSE
);

-- Create replies table
CREATE TABLE IF NOT EXISTS replies (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  image_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bans table
CREATE TABLE IF NOT EXISTS bans (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_threads_bumped ON threads(last_bumped_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id);

-- Enable RLS (optional - for production)
-- ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

-- Allow public read access (adjust for production)
-- CREATE POLICY "Allow public read threads" ON threads FOR SELECT USING (true);
-- CREATE POLICY "Allow public read replies" ON replies FOR SELECT USING (true);
-- CREATE POLICY "Allow public insert threads" ON threads FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Allow public insert replies" ON replies FOR INSERT WITH CHECK (true);
