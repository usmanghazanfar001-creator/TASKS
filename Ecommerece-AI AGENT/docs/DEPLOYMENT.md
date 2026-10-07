# Deployment Guide

## Option A: Docker Compose (single host)

Good for a demo, staging box, or a small production deployment on a
single VM (DigitalOcean droplet, AWS EC2, Azure VM, Railway, etc).

1. Install Docker + Docker Compose on the host.
2. Copy the repo to the host (`git clone ...`).
3. Create an env file for the stack:

   ```bash
   cd ecommerce-ai/docker
   cat > .env <<'EOF'
   SECRET_KEY=<generate a long random string>
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-6
   FRONTEND_ORIGIN=https://your-domain.com
   VITE_API_URL=https://api.your-domain.com
   EOF
   ```

4. Bring the stack up:

   ```bash
   docker compose up --build -d
   ```

   This starts: Postgres (with a persistent volume), Redis, the
   FastAPI backend on port 8000, and the built React app served by
   nginx on port 5173.

5. Seed demo data (optional, first run only):

   ```bash
   docker compose exec backend python seed.py
   ```

6. Put nginx or a managed load balancer in front of ports 8000 (API)
   and 5173 (frontend) with TLS termination, e.g. via Let's Encrypt.

### Generating a SECRET_KEY

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Option B: Split deployment (managed platforms)

- **Backend** → any container platform that takes a Dockerfile (AWS
  ECS/Fargate, Azure Container Apps, Railway, Render, Fly.io). Point
  `DATABASE_URL` at a managed Postgres instance (RDS, Azure Database
  for PostgreSQL, Railway Postgres, Supabase, etc). Set
  `ANTHROPIC_API_KEY`, `SECRET_KEY`, and `FRONTEND_ORIGIN` as
  environment variables/secrets on the platform.
- **Frontend** → static hosting is enough since it's a Vite SPA
  (Vercel, Netlify, Cloudflare Pages, or the provided nginx
  Dockerfile). Set `VITE_API_URL` at build time to your backend's
  public URL.
- **Redis** → managed Redis (ElastiCache, Upstash, Railway Redis) if
  you extend the app to use Celery or response caching; it isn't on
  the critical path for the current feature set.

## GitHub Actions CI

`.github/workflows/ci.yml` runs on every push/PR to `main`:

- `backend-tests`: installs backend deps and runs `pytest`
- `frontend-build`: installs frontend deps and runs `npm run build`
  (type-checks + bundles)

To add automatic deployment, extend that workflow with a job that
builds and pushes the Docker images to a registry (GHCR, ECR, Docker
Hub) and triggers a deploy on your platform of choice after tests
pass.

## Environment variables reference

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | No (defaults to SQLite) | Use Postgres in production |
| `SECRET_KEY` | Yes (prod) | JWT signing key — must be kept secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default 60 |
| `ANTHROPIC_API_KEY` | Yes, to enable `/api/chat` | Without it the rest of the app still works |
| `ANTHROPIC_MODEL` | No | Default `claude-sonnet-4-6` |
| `REDIS_URL` | No | Reserved for future caching/rate limiting |
| `FRONTEND_ORIGIN` | Yes (prod) | CORS allow-origin for your deployed frontend |

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | Yes | Public URL of the backend API |

## Database migrations

This project creates tables via `Base.metadata.create_all()` on
startup for simplicity. For a production rollout with evolving
schemas, introduce Alembic:

```bash
pip install alembic
cd backend
alembic init migrations
# configure migrations/env.py to import app.database.Base and app.models
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Then replace the `Base.metadata.create_all()` call in `app/main.py`
with running migrations as a deploy step.
