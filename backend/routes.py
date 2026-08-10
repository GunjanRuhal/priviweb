"""HTTP API surface for the PII Discovery service."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

import config
import scan_services

logger = logging.getLogger(__name__)

router = APIRouter()

# ----------------------------------------------------------------------------
# Response / request models
# ----------------------------------------------------------------------------

class ApiResponse(BaseModel):
    """Consistent envelope for every JSON response returned by this API."""

    success: bool
    message: str
    data: Optional[Any] = None


class AnchorsInput(BaseModel):
    """Optional identifiers used to anchor a PII search to one person."""

    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    aadhaar: Optional[str] = None
    pan: Optional[str] = None

    def non_empty(self) -> Dict[str, str]:
        """Return only the anchors that were actually supplied."""
        return {
            field: value.strip()
            for field, value in self.model_dump().items()
            if value and value.strip()
        }


def _envelope(success: bool, message: str, data: Any = None) -> Dict[str, Any]:
    """Build the {success, message, data} shape shared by every response."""
    return ApiResponse(success=success, message=message, data=data).model_dump()


def _fail(status_code: int, message: str) -> HTTPException:
    """Raise-ready HTTPException whose detail already matches our envelope."""
    return HTTPException(status_code=status_code, detail=_envelope(False, message))


# ----------------------------------------------------------------------------
# Health
# ----------------------------------------------------------------------------

@router.get("/health", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, Any]:
    """Report application health status."""
    return _envelope(
        True,
        "Service is healthy.",
        data={"status": "ok", "version": config.APP_VERSION},
    )


# ----------------------------------------------------------------------------
# Scan
# ----------------------------------------------------------------------------

@router.post("/scan", response_model=ApiResponse)
async def scan(
    files: List[UploadFile] = File(default=[], description="One or more files, or a folder upload."),
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    aadhaar: Optional[str] = Form(None),
    pan: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """Accept an upload plus an anchor identifier and return PII discovery results."""
    uploaded_files = [f for f in files if f.filename]
    if not uploaded_files:
        raise _fail(status.HTTP_400_BAD_REQUEST, "At least one file must be uploaded.")

    anchors = AnchorsInput(
        name=name, email=email, phone=phone, aadhaar=aadhaar, pan=pan
    ).non_empty()
    if not anchors:
        raise _fail(
            status.HTTP_400_BAD_REQUEST,
            "At least one identifier (name, email, phone, aadhaar, or pan) is required.",
        )

    try:
        result_data = await scan_services.handle_scan(files=uploaded_files, anchors=anchors)
    except ValueError as exc:
        raise _fail(status.HTTP_400_BAD_REQUEST, str(exc))
    except Exception:
        logger.exception("Unhandled error while scanning uploaded files")
        raise _fail(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "An unexpected error occurred while scanning files.",
        )

    return _envelope(True, "Scan completed successfully.", data=result_data)
