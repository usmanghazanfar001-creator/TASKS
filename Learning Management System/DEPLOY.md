# Deploying the LMS

## Environment variables
| Name | Purpose | Default |
|------|---------|---------|
| `JWT_SECRET` | Signs login tokens. **Required** when `NODE_ENV=production`. | dev placeholder |
| `PORT` | HTTP port | 3000 |
| `DB_PATH` | SQLite file location (put it on a persistent volume) | `./lms.db` |
| `RATE_LIMIT` | Max login/register calls per IP per 15 min | 100 |

## Docker
```bash
docker build -t lms .
docker run -d -p 3000:3000 -v lms-data:/data -e JWT_SECRET="$(openssl rand -hex 32)" lms
```
Health check: `GET /api/health`.

## Without Docker (e.g. a VPS)
```bash
npm install --omit=dev
NODE_ENV=production JWT_SECRET=... DB_PATH=/var/lib/lms/lms.db node server.js
```
Run it under a process manager (systemd or pm2) and put nginx or Caddy in front for HTTPS.

## Before going live
- Log in with the demo accounts and change their passwords (or delete them).
- Serve over HTTPS only.
- Back up the SQLite file regularly.

## Optimizations already included
gzip compression, static file caching in production, database indexes on all lookup columns, SQLite WAL mode,
request-size limit, security headers, login rate limiting, graceful shutdown.

## Scaling note
SQLite suits a single server. For several servers, move to PostgreSQL or MySQL.
