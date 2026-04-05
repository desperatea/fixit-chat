from fastapi import APIRouter

from app.api.v1 import agents, auth, backup, notes, sessions, settings, stats, widget

v1_router = APIRouter()

# Public widget endpoints
v1_router.include_router(widget.router)

# Admin endpoints
admin_router = APIRouter(prefix="/admin")
admin_router.include_router(auth.router)
admin_router.include_router(sessions.router)
admin_router.include_router(notes.router)
admin_router.include_router(agents.router)
admin_router.include_router(settings.router)
admin_router.include_router(stats.router)
admin_router.include_router(backup.router)

v1_router.include_router(admin_router)


@v1_router.get("/ping")
async def ping():
    return {"message": "pong"}
