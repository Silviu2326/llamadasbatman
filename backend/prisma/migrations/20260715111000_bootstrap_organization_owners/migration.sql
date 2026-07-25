-- Bootstrap one owner per existing organization without bypassing separation of
-- duties in the runtime API. This is intentionally a later migration: the
-- 'owner' enum value added by the previous migration must be committed before
-- PostgreSQL can use it in data changes.
WITH oldest_admin AS (
  SELECT DISTINCT ON (u."orgId") u."id"
  FROM "User" u
  WHERE u."role" = 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM "User" existing_owner
      WHERE existing_owner."orgId" = u."orgId"
        AND existing_owner."role" = 'owner'
    )
  ORDER BY u."orgId", u."createdAt" ASC, u."id" ASC
)
UPDATE "User" target
SET "role" = 'owner'
FROM oldest_admin
WHERE target."id" = oldest_admin."id";
