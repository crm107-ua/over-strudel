# Deployment

Over Strudel is a static-like Next.js app (everything runs in the browser; the server only serves assets). Two ready-made
Docker setups are provided.

| Setup | File | When to use it |
| --- | --- | --- |
| [All-in-one](#1-all-in-one-docker-compose) | `docker-compose.yml` | A machine where you want one command and a bundled Nginx on port 80. |
| [VPS behind your Nginx](#2-vps-docker-behind-the-hosts-nginx) | `docker-compose.prod.yml` | A server that already runs a reverse proxy and other services. **Recommended for production.** |

Requirements: Docker 24+ with the Compose v2 plugin. No Node.js is needed on the host.

## 1. All-in-one (Docker Compose)

```bash
docker compose up -d --build
```

- `app` — multi-stage image (`node:20-alpine`: deps → build → runner), standalone server on port 3000, non-root user.
- `nginx` — in front on port **80**: gzip, immutable caching for `/_next/static` (this includes the Web Worker chunk).
  TLS is not included: terminate it in front (Caddy, Traefik, a cloud load balancer) or add a `443` block to
  `nginx/nginx.conf`.

Update: `git pull && docker compose up -d --build`.

## 2. VPS: Docker behind the host's Nginx

`docker-compose.prod.yml` runs only the app, published **on the loopback interface** (`127.0.0.1:4244`). The host's Nginx
terminates TLS and proxies to it, so nothing else — on the machine or outside it — can reach the container directly.

### 2.1 What is hardened

| Setting | Effect |
| --- | --- |
| `user: APP_UID:APP_GID` | Runs as the deploy user (not root, not a shared account). |
| `read_only: true` + `tmpfs: /tmp` | The container filesystem is immutable; the app never writes to it. |
| `cap_drop: [ALL]`, `no-new-privileges` | No Linux capabilities, no privilege escalation. |
| `mem_limit: 512m`, `pids_limit: 200` | A runaway process cannot starve the host. |
| `ports: 127.0.0.1:4244:3000` | Not reachable from the network, only through Nginx. |
| `healthcheck`, `restart: unless-stopped` | Docker restarts it if it dies or stops answering, and on reboot. |
| `json-file` log rotation (10 MB × 3) | Logs cannot fill the disk. |

### 2.2 First deployment

On the server, as the user that will own the service (it must be able to run `docker`, i.e. be in the `docker` group):

```bash
mkdir -p /var/www/html/overstrudel && cd /var/www/html/overstrudel
# get the sources here (git clone, or the upload shown in 2.4)

export APP_UID=$(id -u) APP_GID=$(id -g)        # run the container as this user
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps    # STATUS should become "healthy"
curl -I http://127.0.0.1:4244                   # expect HTTP/1.1 200
```

To make the ids permanent, put them in a `.env` file next to the compose file (it is git-ignored):

```env
APP_UID=1000
APP_GID=1000
APP_PORT=4244
```

### 2.3 Nginx

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

Optional but recommended: `gzip on;` for `text/css application/javascript application/json image/svg+xml`, and
`Cache-Control: public, max-age=31536000, immutable` for `/_next/static/`.

### 2.4 Updating from your own machine (no CI)

Deployments are done by hand from a local checkout, so what runs on the server is exactly a commit you chose:

```bash
# local machine, at the commit you want to ship
git archive --format=tar.gz -o over-strudel.tgz HEAD
scp over-strudel.tgz user@server:/tmp/

ssh user@server 'cd /var/www/html/overstrudel \
  && docker tag over-strudel:latest over-strudel:previous 2>/dev/null || true \
  && tar xzf /tmp/over-strudel.tgz \
  && export APP_UID=$(id -u) APP_GID=$(id -g) \
  && docker compose -f docker-compose.prod.yml up -d --build \
  && docker compose -f docker-compose.prod.yml ps'
```

The image is built on the server, so it always matches the host's architecture. The old container keeps serving until the
new image is built; the swap takes a couple of seconds.

### 2.5 Operations

```bash
docker compose -f docker-compose.prod.yml ps               # state and health
docker compose -f docker-compose.prod.yml logs -f --tail 100
docker compose -f docker-compose.prod.yml restart
docker compose -f docker-compose.prod.yml down             # stop and remove (the image stays)
docker image prune -f                                      # reclaim disk after several updates
```

Rollback: `docker tag over-strudel:previous over-strudel:latest` and
`docker compose -f docker-compose.prod.yml up -d --no-build`.

### 2.6 Migrating from PM2

If the app used to run under PM2, switch over without touching other PM2 processes. Build the image first (the old process
keeps serving), then free the port and start the container:

```bash
pm2 delete over-strudel          # only this process
pm2 save                         # persist the list without it
docker compose -f docker-compose.prod.yml up -d --build
```

Back up `~/.pm2/dump.pm2` before `pm2 save`. The old `node_modules/` and `.next/` directories in the application folder
are no longer needed and can be removed.

## 3. Environment

The app needs no secrets. The runtime variables are `PORT`, `HOSTNAME` and `NODE_ENV=production` (set in the Dockerfile and
the compose files).

## 4. Licensing note for operators

Over Strudel is AGPL-3.0-or-later. If you modify it and run it as a public service, users must be able to obtain your
modified source. The footer link points to this repository; change it to your fork if you deploy modifications.
