-- Complete legacy Phase 3B.5 backfill snapshots with the safe evidence metadata
-- that still exists at migration time. File paths are deliberately excluded.
UPDATE "bsc_versions" version
SET "snapshot" = version."snapshot"
  || jsonb_build_object(
    'employeeComment', bsc."employee_comment",
    'managerComment', bsc."manager_comment",
    'evidence', COALESCE(evidence."items", '[]'::jsonb)
  )
FROM "employee_bsc" bsc
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', attachment."id",
      'itemId', attachment."bsc_item_id",
      'fileName', attachment."file_name",
      'mimeType', attachment."mime_type",
      'fileSize', attachment."file_size"::text,
      'uploadedBy', attachment."uploaded_by",
      'uploadedAt', attachment."uploaded_at"
    ) ORDER BY attachment."uploaded_at", attachment."id"
  ) AS "items"
  FROM "bsc_attachments" attachment
  WHERE attachment."employee_bsc_id" = bsc."id"
    AND attachment."deleted_at" IS NULL
) evidence ON true
WHERE version."employee_bsc_id" = bsc."id"
  AND COALESCE((version."snapshot" ->> 'backfilled')::boolean, false) = true
  AND NOT (version."snapshot" ? 'evidence');
