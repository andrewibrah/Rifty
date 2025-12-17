from fastapi import FastAPI

from .routers.agent import router as agent_router
from .routers.ai import router as ai_router
from .routers.adjacent import router as adjacent_router

app = FastAPI(title="Rifty AI Service", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(agent_router)
app.include_router(ai_router)
app.include_router(adjacent_router)
