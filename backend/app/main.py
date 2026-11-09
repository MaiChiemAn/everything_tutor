from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.core.config import settings

app = FastAPI(title="Python Quiz API", version="1.0.0", description="Role-based Python programming quizzes. See /docs for the interactive API reference.")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
