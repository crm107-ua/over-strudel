# Deployment

Over Strudel is a static-like Next.js app (everything runs in the browser). Two ready-made setups are provided.

| Setup | When to use it |
| --- | --- |
| [Docker Compose](#1-docker-compose) | A machine where you want one command and an included Nginx. |
| [PM2 + your own Nginx](#2-pm2-behind-an-existing-nginx) | A Linux server that already hosts other apps behind a reverse proxy. |

Requirements: Node.js ≥ 20.9 (22 recommended) for PM2; Docker 24+ for Docker.

## 1. Docker Compose

```bash
docker compose up -d --build
```

- `app` — multi-stage image (`node:20-alpine`: deps → build → runner), standalone server on port 3000, non-root user.
- `nginx` — in front on port **80**: gzip, immutable caching for `/_next/static` (this includes the Web Worker chunk).
  TLS is not included: terminate it in front (Caddy, Traefik, a cloud load balancer) or add a `443` block to
  `nginx/nginx.conf`.

Update: `git pull && docker compose up -d --build`.

## 2. PM2 behind an existing Nginx

The repository ships `ecosystem.config.cjs`, which describes **only** the `over-strudel` process (standalone server,
`PORT=4244`, `HOSTNAME=127.0.0.1`). Using `--only over-strudel` guarantees other PM2 processes are never touched.

### 2.1 First deployment

On the server (as the user that owns the PM2 daemon), in the application directory:

```bash
# get the sources into /var/www/html/overstrudel (git clone, or the upload shown in 2.3)
npm ci
npm run build                      # also copies .next/static and public next to the standalone server.js
pm2 start ecosystem.config.cjs --only over-strudel
curl -I http://127.0.0.1:4244      # expect HTTP/1.1 200
```

Persist the process list so it survives reboots. `pm2 save` writes **every** process in the list, so back the current
dump up first:

```bash
cp ~/.pm2/dump.pm2 ~/.pm2/dump.pm2.bak-$(date +%F)
pm2 save
```

(PM2 must already be registered with the init system — `pm2 startup` once, as root — for the saved list to be resurrected
at boot. Check with `systemctl is-enabled pm2-<user>`.)

### 2.2 Nginx

The app must be reachable as `http://127.0.0.1:4244`. Example server block (adapt the domain and certificates):

```nginx
server {
    listen 443 ssl;
    server_name overstrudel.example.com;

    # ssl_certificate     /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:4244;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_read_timeout 60s;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Optional but recommended: `gzip on;` for `text/css application/javascript application/json image/svg+xml` and
`Cache-Control: public, max-age=31536000, immutable` for `/_next/static/`.

### 2.3 Updating from your own machine (no CI)

Deployments are done by hand from a local checkout, so what runs on the server is exactly a commit you chose:

```bash
# local machine, at the commit you want to ship
git archive --format=tar.gz -o over-strudel.tgz HEAD
scp over-strudel.tgz user@server:/tmp/

ssh user@server 'cd /var/www/html/overstrudel \
  && rm -rf .next \
  && tar xzf /tmp/over-strudel.tgz \
  && npm ci \
  && npm run build \
  && pm2 startOrReload ecosystem.config.cjs --only over-strudel --update-env \
  && pm2 save'
```

The build happens on the server so native/optional dependencies match its platform.

### 2.4 Operations

```bash
pm2 describe over-strudel          # status, uptime, restarts, script path
pm2 logs over-strudel --lines 100
pm2 reload over-strudel            # zero-downtime restart of this app only
pm2 stop over-strudel
```

Rollback: ship the previous commit with the same procedure (`git archive <older-commit>`), or restore the backed-up
`dump.pm2` if the process list itself was damaged (`pm2 kill` is **not** needed: `pm2 resurrect` loads the dump).

## 3. Environment

The app needs no secrets or environment variables. The ones used at runtime are `PORT`, `HOSTNAME` and
`NODE_ENV=production` (set in `ecosystem.config.cjs` / the Dockerfile).

## 4. Licensing note for operators

Over Strudel is AGPL-3.0-or-later. If you modify it and run it as a public service, users must be able to obtain your
modified source. The footer link points to this repository; change it to your fork if you deploy modifications.
