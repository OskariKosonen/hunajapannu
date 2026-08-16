-- Re-index the password lookup on a 3-character prefix instead of 5.
--
-- Migration 008 copied Have I Been Pwned's 5-character prefix without
-- checking whether it fits this corpus, and it does not. HIBP holds ~850M
-- hashes, so 5 hex characters (1,048,576 buckets) returns ~800 candidates and
-- the caller is genuinely hidden among them. This honeypot holds ~262,000
-- distinct passwords, which over the same buckets averages 0.25 candidates:
-- measured against production, every real lookup returned exactly one hash —
-- the caller's own. That is k-anonymity with k=1, i.e. none: the server could
-- infer which password was checked whenever it was in the corpus.
--
-- 3 characters gives 4,096 buckets and ~64 candidates per lookup, which is a
-- real anonymity set, and a response of a few kilobytes. The prefix length
-- has to be chosen for the size of the corpus, not copied.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_creds_pwhash_prefix3
  ON cowrie_unique_creds (left(password_sha256, 3));

-- The 5-character index from 008 is now dead weight; nothing queries it.
DROP INDEX CONCURRENTLY IF EXISTS idx_cowrie_unique_creds_pwhash_prefix;
