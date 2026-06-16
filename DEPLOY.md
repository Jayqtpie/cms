# Deploying Content Studio

There are **two separate things** to deploy for each client. Keep them straight and the rest is easy.

| Piece | What it is | Where it lives |
|-------|-----------|----------------|
| **CMS backend** (this repo) | Express server that serves the editor (`/admin`), the API (`/api`), the engine bundle (`/cms/cms-engine.js`), uploaded images (`/uploads`), and stores content as JSON. | Your VPS, one deployment per client, behind a subdomain like `cms.clientdomain.com`. |
| **The client's website** | Their Next.js / static site. | Wherever it normally hosts (Vercel, Netlify, their own box…). The `/cms` skill annotates it. |

The `/cms` skill runs **inside the client's website repo** — it does not build or deploy this CMS.

---

## Prerequisites (VPS)

- A Linux VPS with **Node 18+**, **npm**, **nginx**, and **pm2** (`npm i -g pm2`).
- A DNS record for a subdomain per client, e.g. `cms.clientdomain.com` → your VPS IP.
- The CMS **must be served over HTTPS** — client sites are HTTPS, and a browser blocks an HTTPS page from loading an HTTP script/API (mixed content). Certbot steps are below.

---

## Part A — Deploy the CMS backend (per client)

Do this once per client. Example client id: `groomsgetready`.

### 1. Get the code and build (on the VPS)

```bash
git clone <your-website-cms-repo> /srv/cms-groomsgetready
cd /srv/cms-groomsgetready
npm ci
npm run build        # builds engine + editor + server into dist/
```

`dist/`, `node_modules/`, `.env`, `data/`, and `public/uploads/` are gitignored — they are created on the server, never committed.

### 2. Generate secrets

```bash
# bcrypt hash of the password the client will type to log in:
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'ChooseAStrongPassword'

# a random JWT signing secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Create `.env`

```
CMS_PASSWORD=$2a$10$....the bcrypt hash from step 2....
JWT_SECRET=....the hex string from step 2....
PORT=4101
```

Give **each client a unique PORT** (4101, 4102, …) so multiple CMS instances can run on one VPS. The server auto-loads this `.env` on start.

### 4. Create `cms.site.json` (the client's brand + identity)

```json
{
  "siteId": "groomsgetready",
  "siteUrl": "https://groomsgetready.co",
  "brand": {
    "name": "Grooms Get Ready",
    "eyebrow": "PERSONAL TRAINING",
    "headline": "Update your website in *minutes.*",
    "tagline": "One goal. Your best day.",
    "accent": "#c9a85f",
    "bg": "radial-gradient(120% 100% at 0% 0%, #2a2114 0%, #16120b 55%, #100d08 100%)",
    "logo": null
  }
}
```

- `siteId` namespaces this client's content under `data/groomsgetready/`.
- `siteUrl` is the client's **live site** — the editor loads it in the preview pane.
- `accent` tints the admin to the client's brand (contrast-safe); `bg` styles the login panel.

> Do **not** set `CMS_SITE_CONFIG` in a client's `.env` unless you keep per-client config files side by side. By default the server reads `cms.site.json`. (The `cms.site.demo.json` + `public/demo/` files are local-testing only — remove them for a clean client deploy if you like.)

### 5. Start it with pm2

```bash
cd /srv/cms-groomsgetready
pm2 start npm --name cms-groomsgetready -- start
pm2 save
```

Running via `npm start` keeps the working directory correct, so the server finds `.env`, `cms.site.json`, `dist/`, and `data/`. Confirm it's up:

```bash
pm2 logs cms-groomsgetready   # expect: "Content Studio server listening on :4101"
curl localhost:4101/api/config   # expect: the brand JSON
```

### 6. nginx + HTTPS

```nginx
server {
  server_name cms.groomsgetready.co;
  client_max_body_size 12M;            # uploads (server caps files at 8 MB)

  location / {
    proxy_pass http://127.0.0.1:4101;  # this client's PORT
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d cms.groomsgetready.co   # issues HTTPS cert
```

Verify: `https://cms.groomsgetready.co/admin` shows the login, and `https://cms.groomsgetready.co/api/config` returns JSON.

---

## Part B — Connect the client's website

In the **client's repo** (not this one), with Claude Code:

1. Run `/cms`. It will:
   - write `public/cms.config.js` with `siteId`, `backend.base: "https://cms.groomsgetready.co"`, the `groups` (sidebar order), `groupIcons`, and any `variants` (e.g. Groom/Bride);
   - add the two `<script>` tags (config + `https://cms.groomsgetready.co/cms/cms-engine.js`);
   - add `data-cms` attributes to editable elements and convert repeating blocks to the `data-cms-list` pattern;
   - write a `CMS-FIELDS.md` manifest of every editable field.
2. Review the manifest, then deploy the client site as you normally would.

The client logs in at `https://cms.groomsgetready.co/admin`, edits, and hits **Publish**; their live site reads published content from the CMS API.

---

## Updating the CMS later

Because every client site loads the editor and engine **from your CMS host**, shipping an improvement updates all of them:

```bash
cd /srv/cms-groomsgetready
git pull && npm ci && npm run build
pm2 restart cms-groomsgetready
```

Client content lives in `data/` (separate from code), so it's untouched by redeploys.

## Backups

Per client, back up the two folders that hold their data:

```
/srv/cms-groomsgetready/data/groomsgetready/     # draft.json + published.json
/srv/cms-groomsgetready/public/uploads/groomsgetready/   # uploaded images/video
```

## Troubleshooting

- **`ECONNREFUSED` / can't reach API** — the server isn't running on its PORT. `pm2 logs <name>`; a missing/!invalid `.env` makes it exit with "JWT_SECRET and CMS_PASSWORD env vars are required".
- **401 on login** — wrong password, or `CMS_PASSWORD` isn't a valid bcrypt hash.
- **Editor sidebar/fields empty** — the preview site isn't annotated, the engine 404s, or `siteUrl` is wrong. Open the client site with `?cms=preview` and check the browser console for the engine load.
- **Preview pane blank** — the client site may block being framed (`X-Frame-Options: DENY` or a restrictive CSP `frame-ancestors`). Allow the CMS origin to frame it.
- **Mixed-content blocked** — the CMS must be HTTPS (Part A step 6).
- **Uploads fail (413)** — raise nginx `client_max_body_size` (set to 12M above).
