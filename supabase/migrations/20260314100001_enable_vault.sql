-- Enable Vault (pgsodium) for encrypted secret storage
-- and pg_net for database-level HTTP calls (used by Database Webhooks).
--
-- pgsodium provides encryption primitives. Vault is built on top for
-- managing secrets that the database layer needs (Edge Function auth,
-- webhook headers, pg_net calls).
--
-- pg_net enables async HTTP requests from SQL triggers, enabling
-- Database Webhooks to notify agent servers on table events.

CREATE EXTENSION IF NOT EXISTS pgsodium;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Usage examples:
--   Store a secret:   SELECT vault.create_secret('value', 'secret-name', 'description');
--   Read a secret:    SELECT * FROM vault.decrypted_secrets WHERE name = 'secret-name';
--   HTTP POST:        SELECT net.http_post(url, headers, body);
