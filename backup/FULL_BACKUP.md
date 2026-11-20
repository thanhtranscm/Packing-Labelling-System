# Packing & Labelling — Full backup / Sao lưu đầy đủ

This ZIP contains a saved snapshot of both WSV and CTC, all registered users and change history, all stored uploads/Excel versions/images, and the source code for the running release.

- `manifest.json`: snapshot time, workspace revisions, source fingerprint, object names/types and ZIP paths.
- `database.json`: original rows from every application database table, including workspace storage pointers.
- `workspaces/WSV.json`, `workspaces/CTC.json`: complete readable workspace state at the snapshot revisions.
- `objects/`: stored file bytes, mapped to original storage keys and filenames by the manifest. This includes retained historical workspace objects and unreferenced uploads.
- `source.zip`: application source, templates, fonts, lockfile, migrations and configuration.
- `restore.mjs`: restore helper for a NEW Cloudflare D1 database and R2 bucket.

## Khôi phục / Restore

1. Extract this ZIP and `source.zip` into a new project folder. Preserve the backup folder separately.
2. Recreate a NEW Site/project (do not reuse the original project ID). `.openai/hosting.json` declares DB and BUCKET bindings; bind them to new persistent resources. Alternatively adapt the included Worker project to your own Cloudflare account.
3. Install Node 22.13+ and the pnpm version declared in `package.json`; run `pnpm install --frozen-lockfile`.
4. Create a Wrangler configuration for the NEW database and bucket, and sign in with `wrangler login`. From the source folder, run:

   `node /path/to/backup/restore.mjs --database NEW_DATABASE_NAME --bucket NEW_BUCKET_NAME --config /path/to/new/wrangler.jsonc --apply`

   Run without `--apply` first to generate/inspect `restore.sql`. The helper never removes existing data: inserts fail on duplicate primary keys. Use empty destination resources. Data includes historical revisions and exact original object keys.
5. Check the owner emails in `lib/server.ts`, and configure sign-in for the new site's origin. Authentication sessions, deployment credentials and provider-managed secrets are intentionally NOT exported: recreate these with your provider. See `RESTORE_CONFIG.md` in source.zip.
6. Run `pnpm build`, deploy, sign in as owner and verify both workspaces, settings, images, Excel downloads, history and authorized users before using the restored site.

Snapshots contain data already saved on the server; unsaved form edits and this browser's display preferences are not authoritative website data. Imports made before original-file retention was introduced may have parsed PO data without the original uploaded Excel bytes. Future imports retain their originals.

ZIP integrity is checked by its CRC records; the source ZIP also has a SHA-256 fingerprint. If any required stored object is missing/changed during export, download fails rather than silently returning an incomplete backup. Keep a downloaded copy outside the website so it remains available if the original hosting is unavailable.
