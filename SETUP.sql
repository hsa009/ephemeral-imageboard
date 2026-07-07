-- Run this in Supabase SQL Editor to create the imageboard tables

-- Create threads table
CREATE TABLE IF NOT EXISTS threads (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  comment TEXT NOT NULL,
  image_filename TEXT,
  author_ip TEXT,
  username TEXT DEFAULT 'Anonymous',
  niche TEXT DEFAULT 'random',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_bumped_at TIMESTAMPTZ DEFAULT NOW(),
  bump_count INTEGER DEFAULT 0,
  locked BOOLEAN DEFAULT FALSE,
  reactions JSONB DEFAULT '{}',
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', subject || ' ' || comment)) STORED
);

-- Create replies table
CREATE TABLE IF NOT EXISTS replies (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  image_filename TEXT,
  author_ip TEXT,
  username TEXT DEFAULT 'Anonymous',
  reply_to_id INTEGER REFERENCES replies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reactions JSONB DEFAULT '{}'
);

-- Create bans table
CREATE TABLE IF NOT EXISTS bans (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ
);

-- Create presence table for ghost counter polling
CREATE TABLE IF NOT EXISTS presence (
  id SERIAL PRIMARY KEY,
  ghost_id TEXT UNIQUE NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient counting
CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen_at DESC);

-- Allow public access
ALTER TABLE presence DISABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_threads_bumped ON threads(last_bumped_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_niche ON threads(niche);
CREATE INDEX IF NOT EXISTS idx_threads_fts ON threads USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_replies_reply_to ON replies(reply_to_id);

-- Enable realtime for replies (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE replies;

-- Create users table for wallet auth
CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow public read/write access (disable RLS for now - add later for production)
ALTER TABLE threads DISABLE ROW LEVEL SECURITY;
ALTER TABLE replies DISABLE ROW LEVEL SECURITY;
ALTER TABLE bans DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
