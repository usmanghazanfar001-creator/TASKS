#!/usr/bin/env bash
# Build frontend + start everything on ONE server: http://localhost:8000
set -e
cd "$(dirname "$0")"
(cd frontend && npm install && npm run build)
cd backend
[ -d venv ] || python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
[ -f ecommerce_ai.db ] || python seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000
