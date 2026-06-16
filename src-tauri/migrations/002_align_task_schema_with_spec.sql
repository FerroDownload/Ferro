ALTER TABLE tasks RENAME COLUMN source_urls TO source_uri;
ALTER TABLE tasks RENAME COLUMN externally_added TO orphan_imported;
ALTER TABLE tasks ADD COLUMN completed_at TEXT;
ALTER TABLE tasks ADD COLUMN uploaded_bytes INTEGER NOT NULL DEFAULT 0;

UPDATE tasks
SET source_uri = COALESCE(json_extract(source_uri, '$[0]'), source_uri)
WHERE source_uri IS NOT NULL;
