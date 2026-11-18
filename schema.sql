CREATE TABLE IF NOT EXISTS hits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT,
  ip              TEXT,
  country         TEXT,
  asn             INTEGER,
  network_org     TEXT,
  method          TEXT,
  usedlink        TEXT,
  query           TEXT,
  referer         TEXT,
  useragent       TEXT,
  accept          TEXT,
  recordcategory  TEXT,
  headers         TEXT
);
CREATE INDEX IF NOT EXISTS idx_hits_timestamp      ON hits(timestamp);
CREATE INDEX IF NOT EXISTS idx_hits_usedlink       ON hits(usedlink);
CREATE INDEX IF NOT EXISTS idx_hits_recordcategory ON hits(recordcategory);
