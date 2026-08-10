"""FastAPI application entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from page_routes import page_router

import config
from routes import router

logging.basicConfig(level=config.LOG_LEVEL, format=config.LOG_FORMAT)
logger = logging.getLogger(__name__)

templates = Jinja2Templates(directory=str(config.TEMPLATE_DIR))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s", config.APP_TITLE)
    yield
    logger.info("Shutting down %s", config.APP_TITLE)


app = FastAPI(
    title=config.APP_TITLE,
    description=config.APP_DESCRIPTION,
    version=config.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOW_ORIGINS,
    allow_methods=config.CORS_ALLOW_METHODS,
    allow_headers=config.CORS_ALLOW_HEADERS,
    allow_credentials=config.CORS_ALLOW_CREDENTIALS,
)

app.mount(config.STATIC_URL_PATH, StaticFiles(directory=str(config.STATIC_DIR)), name="static")

app.include_router(page_router)

app.include_router(
    router,
    prefix=config.API_PREFIX
)