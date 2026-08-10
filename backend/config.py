"""Centralized application configuration."""

import os
import tempfile
from pathlib import Path


def _env_list(name: str, default: list) -> list:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw else default


def _env_path(name: str, default: Path) -> Path:
    raw = os.getenv(name)
    return Path(raw) if raw else default


# ----------------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"
TEMPLATE_DIR = FRONTEND_DIR / "template"

STATIC_URL_PATH = os.getenv("STATIC_URL_PATH", "/static")
API_PREFIX = os.getenv("API_PREFIX", "/api")

TEMP_UPLOAD_DIR = _env_path(
    "TEMP_UPLOAD_DIR", Path(tempfile.gettempdir()) / "pii_discovery_uploads"
)

# ----------------------------------------------------------------------------
# Application metadata
# ----------------------------------------------------------------------------

APP_TITLE = os.getenv("APP_TITLE", "PII Discovery API")
APP_DESCRIPTION = os.getenv(
    "APP_DESCRIPTION",
    "Scans uploaded files/folders for personally identifiable information.",
)
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")

# ----------------------------------------------------------------------------
# CORS
# ----------------------------------------------------------------------------

CORS_ALLOW_ORIGINS = _env_list("CORS_ALLOW_ORIGINS", ["*"])
CORS_ALLOW_METHODS = _env_list("CORS_ALLOW_METHODS", ["*"])
CORS_ALLOW_HEADERS = _env_list("CORS_ALLOW_HEADERS", ["*"])
CORS_ALLOW_CREDENTIALS = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() == "true"

# ----------------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------------

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv("LOG_FORMAT", "%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# ----------------------------------------------------------------------------
# Upload limits
# ----------------------------------------------------------------------------

MAX_UPLOAD_FILES = _env_int("MAX_UPLOAD_FILES", 500)
MAX_UPLOAD_FILE_SIZE_MB = _env_int("MAX_UPLOAD_FILE_SIZE_MB", 25)
MAX_UPLOAD_TOTAL_SIZE_MB = _env_int("MAX_UPLOAD_TOTAL_SIZE_MB", 250)

# ----------------------------------------------------------------------------
# Allowed file extensions
# ----------------------------------------------------------------------------

ALLOWED_FILE_EXTENSIONS = set(
    _env_list(
        "ALLOWED_FILE_EXTENSIONS",
        [".txt", ".pdf", ".docx", ".xls", ".xlsx", ".csv"],
    )
)
