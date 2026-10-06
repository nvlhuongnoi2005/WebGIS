-- A raw upload has an independent lifecycle from a GDAL inspection/conversion.
-- This lets administrators retain files that Tile Server cannot convert (for
-- example .bpf) without misrepresenting the raw upload as failed.
ALTER TABLE dataset_versions
  ADD COLUMN IF NOT EXISTS inspection_status text NOT NULL DEFAULT 'not_requested';

UPDATE dataset_versions
SET inspection_status = 'ready'
WHERE status = 'ready' AND inspection_status = 'not_requested';

UPDATE dataset_versions
SET inspection_status = 'failed'
WHERE status = 'failed' AND inspection_status = 'not_requested';
