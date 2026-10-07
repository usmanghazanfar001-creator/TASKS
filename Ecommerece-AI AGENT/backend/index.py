"""Vercel entrypoint: exposes the FastAPI app."""
import sys
from pathlib import Path

# Make `import app...` work even if the runtime doesn't put this folder on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import app  # noqa: E402,F401
