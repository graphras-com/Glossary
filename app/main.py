from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import async_session, engine
from app.models import Base
from app.routers import backup, categories, terms
from app.seed import seed

# Resolved path to the frontend build output (populated by Docker build or manual build)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and seed on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await seed(db)
    yield
    await engine.dispose()


app = FastAPI(title="Dictionary API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(categories.router)
app.include_router(terms.router)
app.include_router(backup.router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}


# --- Serve frontend SPA (only when the static dir exists) ---
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
