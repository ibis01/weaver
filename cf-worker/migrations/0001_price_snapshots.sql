-- Phase 4: Price snapshot accumulation
-- Created 2026-10-22

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  price_usd REAL NOT NULL,
  liquidity_usd REAL,
  observed_at INTEGER NOT NULL, -- Unix timestamp in milliseconds
  source TEXT NOT NULL DEFAULT 'dexscreener'
);

-- Prevent duplicate inserts for the same token at the same exact timestamp
CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_unique 
  ON price_snapshots(chain, address, observed_at);

-- Speed up the validator's lookup: find price near a specific timestamp
CREATE INDEX IF NOT EXISTS idx_snap_lookup 
  ON price_snapshots(chain, address, observed_at);
