-- Password hashes for the "is your password in here?" lookup.
--
-- The dashboard lets a visitor check whether the bots have tried a password,
-- without ever receiving the password. The browser hashes it with SHA-256 and
-- sends only the first five hex characters; the API returns every stored hash
-- sharing that prefix and the browser finds its own match locally. That is the
-- k-anonymity model Have I Been Pwned uses, and it needs the hashes stored and
-- indexed by prefix.
--
-- A GENERATED ALWAYS column would be the obvious way to derive this, but
-- Postgres rejects it: convert_to() is stable rather than immutable because it
-- depends on the database encoding. Trigger functions carry no such
-- restriction, so the hash is maintained by a BEFORE INSERT trigger and
-- backfilled once here.

ALTER TABLE cowrie_unique_creds
  ADD COLUMN IF NOT EXISTS password_sha256 text;

-- Maintains the hash for every new credential pair. The ingest path and
-- sync_cowrie_event_aggs both insert here, so this covers both.
-- UPDATE OF password never fires in practice — password is half the conflict
-- key — but it keeps the column honest if a row is ever rewritten.
CREATE OR REPLACE FUNCTION set_cred_password_hash() RETURNS trigger AS $$
BEGIN
  NEW.password_sha256 := encode(sha256(convert_to(NEW.password, 'UTF8')), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_cred_password_hash ON cowrie_unique_creds;
CREATE TRIGGER trg_set_cred_password_hash
  BEFORE INSERT OR UPDATE OF password ON cowrie_unique_creds
  FOR EACH ROW EXECUTE FUNCTION set_cred_password_hash();

-- Backfill. Guarded so a re-run is a no-op rather than 200k pointless writes.
-- Does not fire the trigger above (which watches password, not this column).
UPDATE cowrie_unique_creds
   SET password_sha256 = encode(sha256(convert_to(password, 'UTF8')), 'hex')
 WHERE password_sha256 IS NULL;

-- The lookup is by five-character prefix, so index exactly that. 203k rows
-- over 1,048,576 possible prefixes means a prefix returns a handful of rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_creds_pwhash_prefix
  ON cowrie_unique_creds (left(password_sha256, 5));
