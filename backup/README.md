# Website source backup / Sao lưu mã nguồn website

This ZIP contains the complete application source for the running release: WSV and CTC functions, UI, calculations, import/export logic, authentication and access rules, templates, fonts, package lockfile, database migrations, and build configuration.

It does not export operational data: POs, saved months/settings, uploaded Excel files, uploaded images, user lists, or audit history. The new website starts with the default initialization provided by the code. Static assets and Excel templates required by application features remain included.

## Dựng lại website / Rebuild

1. Extract this ZIP into a new project folder.
2. Install Node 22.13+ and the pnpm version declared in package.json. Run `pnpm install --frozen-lockfile`.
3. Register a NEW Site/project. Create a new D1 database and R2 bucket for the DB and BUCKET bindings declared in `.openai/hosting.json`; apply the SQL migrations in `drizzle/` in order. Keep the new project's own identity and resources.
4. Configure ChatGPT/OAuth sign-in for the new origin. Recreate hosting secrets and verify owner email configuration in `lib/server.ts`. Sessions and deployment credentials are not included. For another provider, adapt `app/chatgpt-auth.ts` and `lib/server.ts` to its authenticated identity and bindings.
5. Use the included project setup/build scripts and run `pnpm build`, then deploy with the selected hosting provider. Sign in as owner and check both WSV and CTC, imports, exports, images, settings and permissions before use.

The ZIP is a source package, not a hosted service or a database snapshot. To run the website, its authentication and storage must be configured on the new hosting environment. Keep the downloaded ZIP outside the original website.
