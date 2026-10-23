# Deploy wacherfrontend to Hostinger (Business, SSH)

Frontend repo: https://github.com/wacheit26-bit/wacherfrontend  
API stays on your existing backend (not deployed on Hostinger for this setup).

## SSH connection (from your PC)

```bash
ssh -p 65002 u947699366@46.202.183.117
```

Use the password from Hostinger hPanel (do not commit or share it in chat).

## One-time server setup

After SSH login, check paths (Hostinger varies slightly):

```bash
whoami
pwd
ls -la ~/domains 2>/dev/null || ls -la ~
```

Typical document root for the main domain:

```text
~/domains/wacheelectronics.com/public_html
```

Install Git if missing (`git --version`). On Business hosting, enable **Node.js** in hPanel if available (Node 18+), then verify:

```bash
node -v
npm -v
```

If Node is not available over SSH, build locally and upload only `dist/` (see **Plan B** below).

### Plan A — build on the server (recommended)

```bash
mkdir -p ~/repos
cd ~/repos
git clone https://github.com/wacheit26-bit/wacherfrontend.git
cd wacherfrontend
```

Create production env for the build (matches `.env.example`):

```bash
cat > .env.production << 'EOF'
VITE_API_ORIGINS=https://wach.wacheelectronics.com,https://watcher3-u8aw.onrender.com
EOF
```

Install and build:

```bash
npm ci
npm run build
```

Publish `dist/` to the live site (adjust `PUBLIC_HTML` if your path differs):

```bash
PUBLIC_HTML="$HOME/domains/wacheelectronics.com/public_html"
mkdir -p "$PUBLIC_HTML"
rsync -av --delete dist/ "$PUBLIC_HTML/"
```

Or use the script in the repo:

```bash
chmod +x scripts/hostinger-deploy-frontend.sh
PUBLIC_HTML="$HOME/domains/wacheelectronics.com/public_html" ./scripts/hostinger-deploy-frontend.sh
```

Open https://wacheelectronics.com and test login / admin routes. Refresh on `/admin` should work (SPA `.htaccess` is copied into `dist/` from `public/`).

### Plan B — build on your PC, upload `dist/` only

On Windows (project folder):

```powershell
$env:VITE_API_ORIGINS="https://wach.wacheelectronics.com,https://watcher3-u8aw.onrender.com"
npm ci
npm run build
```

Upload contents of `dist/` to `public_html` via Hostinger **File Manager**, **FTP**, or:

```powershell
scp -P 65002 -r dist/* u947699366@46.202.183.117:domains/wacheelectronics.com/public_html/
```

(Path may need to be `~/domains/...` — confirm over SSH first.)

## Updates after code changes

On the server (Plan A):

```bash
cd ~/repos/wacherfrontend
git pull origin main
npm ci
npm run build
rsync -av --delete dist/ "$HOME/domains/wacheelectronics.com/public_html/"
```

Or run `scripts/hostinger-deploy-frontend.sh` again.

From your dev machine you can also run `.\scripts\push-frontend-to-github.ps1` first, then `git pull` on the server.

## hPanel Git (optional)

In Hostinger: **Websites → Git** → connect **wacheit26-bit/wacherfrontend** → deploy to `public_html`.  
You still need a **build step** (Node in hPanel or build locally before deploy). SSH + script above is usually simpler for Vite.

## Troubleshooting

| Issue | Check |
|--------|--------|
| Blank page after deploy | Browser devtools → failed JS/CSS (wrong base path). |
| API errors | `VITE_API_ORIGINS` must be set **before** `npm run build`. |
| 404 on refresh | `.htaccess` must exist in `public_html` (from `dist/`). |
| CORS | Backend must allow `https://wacheelectronics.com`. |

## Security

Prefer switching SSH to **key-based auth** in hPanel and disabling password login when you can.
