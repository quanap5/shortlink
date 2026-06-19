from fastapi import FastAPI
from mangum import Mangum

from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging

configure_logging()
settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(router)

handler = Mangum(app)
