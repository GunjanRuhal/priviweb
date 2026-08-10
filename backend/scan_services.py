"""Business logic layer: coordinates the PII scan workflow."""

import logging
import shutil
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import UploadFile

import config
from pii_discovery_v2 import discover_pii

logger = logging.getLogger(__name__)
IGNORED_SYSTEM_FILES = {
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
}

# ----------------------------------------------------------------------------
# Path helpers (private)
# ----------------------------------------------------------------------------

def _sanitize_relative_path(filename: str) -> Path:
    """Turn an untrusted UploadFile.filename into a safe, relative Path."""
    normalized = (filename or "").replace("\\", "/").lstrip("/")
    candidate = PurePosixPath(normalized)

    if not candidate.parts or any(part in ("", "..") for part in candidate.parts):
        raise ValueError(f"Invalid or unsafe file path: {filename!r}")

    return Path(*candidate.parts)


def _relative_filename(file_path: str, scan_dir: Path) -> str:
    """Best-effort conversion of an engine-reported absolute path back to a relative filename."""
    try:
        return str(Path(file_path).relative_to(scan_dir))
    except ValueError:
        return Path(file_path).name


# ----------------------------------------------------------------------------
# Helper functions
# ----------------------------------------------------------------------------

def create_scan_directory(scan_id: str) -> Path:
    """Create a unique temporary directory for this scan."""
    scan_dir = config.TEMP_UPLOAD_DIR / scan_id
    scan_dir.mkdir(parents=True, exist_ok=True)
    return scan_dir


def validate_file(relative_path: Path) -> None:
    """Reject file extensions the PII engine cannot parse."""
    extension = relative_path.suffix.lower()
    if extension not in config.ALLOWED_FILE_EXTENSIONS:
        allowed = ", ".join(sorted(config.ALLOWED_FILE_EXTENSIONS))
        raise ValueError(
            f"Unsupported file type '{extension or 'unknown'}' for '{relative_path}'. "
            f"Allowed types: {allowed}."
        )


async def save_uploaded_files(files: List[UploadFile], scan_dir: Path) -> List[Path]:
    """Persist uploaded files under scan_dir, preserving folder structure."""
    saved_paths: List[Path] = []

    for upload in files:
        content = await upload.read()
        if not content:
            logger.info("Skipping empty upload: %s", upload.filename)
            continue

        relative_path = _sanitize_relative_path(upload.filename or "")

        if relative_path.name in IGNORED_SYSTEM_FILES:
            logger.info("Skipping system metadata file: %s", relative_path)
            continue

        validate_file(relative_path)

        target_path = scan_dir / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(content)
        saved_paths.append(target_path)

    return saved_paths


def build_anchor_dict(anchors: Dict[str, Optional[str]]) -> Dict[str, str]:
    """Strip empty/whitespace-only values before they reach the engine."""
    return {
        key: value.strip()
        for key, value in anchors.items()
        if value and value.strip()
    }


def run_pii_scan(scan_dir: Path, anchors: Dict[str, str]) -> Dict[str, Any]:
    """Invoke the PII detection engine exactly once."""
    try:
        return discover_pii(folder_path=str(scan_dir), **anchors)
    except ValueError:
        raise
    except Exception as exc:
        logger.exception("PII engine failed for scan directory: %s", scan_dir)
        raise RuntimeError("PII detection failed unexpectedly.") from exc


def format_scan_results(
    engine_results: Dict[str, Any], scan_dir: Path
) -> Dict[str, Any]:
    """Reduce the engine's full output to what the frontend actually needs."""
    statistics = engine_results.get("statistics", {})
    detailed_instances = engine_results.get("detailed_instances", [])

    files = []
    for file_data in detailed_instances:
        entities = [
            {
                "type": entity_type,
                "value": item.get("value"),
                "context": item.get("context"),
                "score": item.get("score"),
            }
            for entity_type, items in file_data.get("pii_types", {}).items()
            for item in items
        ]

        files.append(
            {
                "filename": _relative_filename(file_data.get("file", ""), scan_dir),
                "entities": entities,
            }
        )

    return {
        "summary": {
            "files_scanned": statistics.get("total_files_scanned", 0),
            "files_with_pii": statistics.get("files_with_pii", 0),
            "total_entities": statistics.get("total_pii_instances", 0),
        },
        "files": files,
    }


def cleanup_scan_directory(scan_dir: Path) -> None:
    """Remove the temporary scan directory and everything under it."""
    shutil.rmtree(scan_dir, ignore_errors=True)
    logger.info("Cleaned up scan directory: %s", scan_dir)


# ----------------------------------------------------------------------------
# Public entrypoint
# ----------------------------------------------------------------------------

async def handle_scan(
    files: List[UploadFile], anchors: Dict[str, Optional[str]]
) -> Dict[str, Any]:
    """Coordinate a full scan."""
    if not files:
        raise ValueError("No files were provided for scanning.")

    clean_anchors = build_anchor_dict(anchors)
    if not clean_anchors:
        raise ValueError("At least one identifier must be provided.")

    scan_dir = create_scan_directory(str(uuid4()))

    try:
        saved_paths = await save_uploaded_files(files, scan_dir)
        if not saved_paths:
            raise ValueError("No valid, non-empty files were found to scan.")

        engine_results = run_pii_scan(scan_dir, clean_anchors)
        return format_scan_results(engine_results, scan_dir)
    finally:
        cleanup_scan_directory(scan_dir)
