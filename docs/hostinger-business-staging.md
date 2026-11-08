# Hostinger Business — RAKAN BALANCE Web staging

## Architecture and hard boundaries

- This is a Vite/React **client-only** application. It does **not** need Node.js to run after the build, a MySQL database, PHP code, or an application server.
- Live financial records and attachments are stored in the **user's browser IndexedDB**, and preferences in browser localStorage. Data is not synced between devices or sent to Hostinger by this deployment.
- The real and demo workspaces remain isolated by the application, not by the hosting account.
- Do not add a server-side database, credentials, or API keys for this deployment.
- This staging is **online-first**: a web manifest exists, but a production offline service worker has not yet been approved/tested (WEB-F6 is separate).
- The existing local PIN protects the interface but is **not server-side authentication or encryption at rest**. Do not claim otherwise.
- A change of browser, origin (including domain/subdomain), cleared site storage, or incognito window may result in an empty ledger on that device. Existing local data on the old origin is **not migrated automatically**.

## Site isolation

1. In **Hostinger Business** create a **new, independent website** with a dedicated subdomain. Do not overwrite or point a directory at an existing production website.
2. Confirm the actual FQDN (for example `rakan.example.com`) and the Hostinger account/plan before enabling automatic deployment.
3. Configure DNS/Hostinger domain assignment only for that subdomain. Enable and verify HTTPS/SSL; no mixed content.
4. Do not reuse another site's `public_html`, database, SMTP, storage bucket, or site files.

## Deployment option A — managed GitHub frontend build (if available for this plan)

Hostinger Business's managed Web App flow supports GitHub deployment of Vite/React apps. In hPanel choose a new web application/site with an independent subdomain and connect **only** `aalmkhlafi77-sudo/rakan-balance`.

- Branch: `main` **only after PR review and approved deployment**.
- Framework: Vite / React (automatic detection).
- Install command: `npm install` (or the package manager/lockfile Hostinger correctly detects).
- Build command: `npm run build`.
- Build output: `dist`.
- No Node.js server entry file: do not configure `vite dev` or `vite preview` as a production web server.
- No environment variables/secrets required for the current static application.
- Ensure client-side routes, if introduced later, fall back to `index.html` (the current UI uses in-app tab state, not URL routes).
- Avoid granting deployment access to all GitHub repositories if a single-repository grant is supported.
- Initial deployment is **manual/approval-gated**. If GitHub auto-deploy is enabled, subsequent pushes to `main` can publish immediately; do not enable this silently.

The exact host controls vary by Hostinger site type; review the generated configuration before clicking Deploy.

## Deployment option B — static PHP/HTML website, upload built files only

If the Hostinger Web App flow is not available, create a distinct **PHP/HTML (static)** website on the subdomain.

Build from a clean checked-out approved commit:

```sh
npm install
npm run lint
npm run test
npm run build
```

Upload **the contents of `dist/`** into that subdomain's assigned web root (usually `public_html/` for that independent site). The root must contain `index.html`, `assets/`, `manifest.webmanifest`, and `.htaccess` (enable viewing hidden files). Do **not** upload `src/`, `node_modules/`, `.git/`, `.env*`, `bun.lock`, test artifacts, or backups. The `public/.htaccess` file is copied to `dist/.htaccess` by Vite.

This Apache fallback requires mod_rewrite. On non-Apache managed hosting, configure the equivalent SPA fallback through Hostinger's deployment interface; the `.htaccess` file will have no effect.

## Staging acceptance checklist (no real financial data)

- HTTPS opens the correct subdomain; other hosted sites are unchanged.
- Main UI, theme switcher, approved logo, menu and mobile bottom navigation work.
- Asset URLs and browser icon are served with 200 responses.
- Hard refresh works at the root, and unknown app paths route to `index.html` without replacing genuine asset 404s with HTML.
- Use **demo scope only**, test a new entry, reload, close/open the browser and verify persistence.
- Test export/import backup in demo scope, PDF download and WhatsApp text action.
- Check in desktop and mobile browser. Keep real user financial data out of staging acceptance.
- Confirm no real data was uploaded or copied to server; IndexedDB remains on the device.
- Document the approved URL, deployment revision, rollback and whether automatic redeploy is enabled.

## Rollback

Static deployment: restore the previously approved `dist/` content in this subdomain's dedicated document root.
Managed deployment: select/redeploy the last known-good Hostinger release or commit.
Neither rollback changes existing client-side IndexedDB records; never clear browser storage as a deployment recovery step.

## Operational notes

- Manual JSON backups must be kept by the owner independently: browser-local data is not a Hostinger MySQL backup.
- Reinstalling, changing subdomains or switching browsers creates a different origin/storage context.
- WEB-F6 (offline install and service worker) should be implemented and verified separately; manifest alone does not enable offline mode.
