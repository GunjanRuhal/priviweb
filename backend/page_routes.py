from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

import config

page_router = APIRouter()

templates = Jinja2Templates(directory=str(config.TEMPLATE_DIR))


@page_router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def index(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {}
    )