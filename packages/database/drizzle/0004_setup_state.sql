INSERT INTO app_metadata (key, value)
VALUES (
  'setup_status',
  CASE
    WHEN EXISTS (SELECT 1 FROM businesses WHERE active = 1)
      AND EXISTS (SELECT 1 FROM users WHERE active = 1 AND role IN ('owner', 'manager'))
    THEN 'completed'
    ELSE 'not_started'
  END
)
ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
INSERT INTO app_metadata (key, value)
VALUES ('setup_step', 'welcome')
ON CONFLICT(key) DO NOTHING;
