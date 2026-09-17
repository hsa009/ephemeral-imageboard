
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

CREATE TABLE IF NOT EXISTS bans (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS presence (
  id SERIAL PRIMARY KEY,
  ghost_id TEXT UNIQUE NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen_at DESC);

ALTER TABLE presence DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_threads_bumped ON threads(last_bumped_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_niche ON threads(niche);
CREATE INDEX IF NOT EXISTS idx_threads_fts ON threads USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_replies_reply_to ON replies(reply_to_id);

ALTER PUBLICATION supabase_realtime ADD TABLE replies;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS is_verified_handle BOOLEAN DEFAULT FALSE;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS is_verified_handle BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE threads DISABLE ROW LEVEL SECURITY;
ALTER TABLE replies DISABLE ROW LEVEL SECURITY;
ALTER TABLE bans DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
