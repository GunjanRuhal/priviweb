# PII Discovery

A self-hosted tool that scans uploaded files or folders for **personally identifiable information (PII)** belonging to a specific person. You provide at least one identifier for that person (name, email, phone, Aadhaar, or PAN), upload files, and the service reports every PII value it finds that is connected to that person — file by file, with the surrounding context and a confidence score.

It is a **discovery / reporting** tool: it returns a JSON report of what it found. It does not redact, mask, or modify the uploaded documents, and nothing is persisted after a scan — uploads are processed in a temporary directory that is deleted once the scan completes.

---

## Table of contents

- [How it works](#how-it-works)
- [Key features](#key-features)
- [Detected PII types](#detected-pii-types)
- [Supported file types](#supported-file-types)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Docker / deployment](#docker--deployment)
- [Known issues / notes](#known-issues--notes)

---

## How it works

1. **Upload** — one or more files, or a whole folder (drag-and-drop or file picker), plus at least one *anchor* identifier for the person you're searching for.
2. **Text extraction** — each file is parsed into text "records" (a PDF text/OCR block, a DOCX paragraph, a spreadsheet row, a windowed group of lines for `.txt`). Scanned/image-only PDF pages are OCR'd with Tesseract.
3. **Anchor pre-filter** — a file is only analyzed further if one of the supplied identifiers actually appears in it (exact match, or a fuzzy name match as a fallback), so unrelated files are skipped cheaply.
4. **PII detection** — each surviving text record is run through Microsoft Presidio (rule-based recognizers + custom recognizers for Indian ID formats) plus spaCy NER as a secondary signal for name matching.
5. **Anchor-proximity filtering** — detected PII is only kept if it is graph-connected to an actual anchor match within the same file (via co-occurrence in the same record), so a phone number on an unrelated page of a large document isn't misattributed to the person you're searching for.
6. **Clustering & reconciliation** — matched PII is clustered with a confidence score, and name variants across documents (e.g. "Mohammed Asif Khan" vs "M.A. Khan") are reconciled into a canonical name.
7. **Report** — the API returns a JSON summary: files scanned, files containing PII, total PII entities, and a per-file breakdown of every detected entity (type, value, surrounding context, confidence score).
8. **Cleanup** — the temporary scan directory is deleted once the response is built, regardless of success or failure.

## Key features

- Upload single files, multiple files, or an entire folder (including drag-and-drop, with folder structure preserved).
- Anchors on any combination of name, email, phone, Aadhaar, or PAN — only PII connected to that person is reported, not everything in the document.
- Purpose-built recognizers for Indian identity documents (Aadhaar, PAN, Passport, Voter ID, Driving License, Vehicle Registration, GSTIN) in addition to Presidio's general-purpose recognizers.
- Handles both digital-text and scanned/image-based PDFs (automatic OCR fallback per page).
- Fuzzy name matching and cross-document name-variant reconciliation.
- Stateless: nothing is written to a database and no files are retained after a scan.

## Detected PII types

| Category | Entity types |
|---|---|
| Indian government IDs | `IN_AADHAAR`, `IN_PAN`, `IN_PASSPORT`, `IN_VOTER_ID`, `IN_DRIVING_LICENSE`, `IN_VEHICLE_REGISTRATION`, `IN_GSTIN` |
| Contact | `IN_PHONE`, `EMAIL_ADDRESS` |
| Financial | `BANK_ACCOUNT`, `IFSC_CODE`, `UPI_ID` |
| Personal details | `DATE_OF_BIRTH`, `GENDER` |
| Document dates | `CARD_EXPIRY_DATE`, `DOCUMENT_ISSUE_DATE`, `DOCUMENT_EXPIRY_DATE` |
| Digital footprint | `IP_ADDRESS`, `MAC_ADDRESS` |
| Medical | `MEDICAL_RECORD` |
| Names | `LABEL_MATCHED_NAME` (e.g. "Name:", "Account Holder:"), `KIN_NAME` (father/mother/guardian/spouse via labels or S/o, D/o, W/o, C/o markers) |
| Anchor matches | `ANCHOR_NAME`, `ANCHOR_NAME_FUZZY`, `ANCHOR_EMAIL`, `ANCHOR_PHONE`, `ANCHOR_AADHAAR`, `ANCHOR_PAN` — generated per identifier you supply |

Recognizer patterns and context logic live in `backend/pii_discovery_v2.py` (`create_comprehensive_recognizers`, `create_anchor_recognizers`).

## Supported file types

`.txt` `.pdf` `.docx` `.xls` `.xlsx` `.csv`

(Configurable via the `ALLOWED_FILE_EXTENSIONS` environment variable — see [Configuration](#configuration).)

## Tech stack

- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) + Uvicorn
- **PII detection**: [Microsoft Presidio](https://microsoft.github.io/presidio/) (`presidio-analyzer`) with custom pattern recognizers
- **NLP**: [spaCy](https://spacy.io/) (`en_core_web_sm` / `en_core_web_lg`) for name entity recognition
- **OCR**: [Tesseract](https://github.com/tesseract-ocr/tesseract) via `pytesseract`, with `pdf2image`/`poppler` for rasterizing scanned PDF pages
- **Document parsing**: `pdfplumber` (PDF text + layout), `python-docx` (Word), `pandas`/`openpyxl` (Excel/CSV)
- **Fuzzy matching & graph analysis**: `rapidfuzz`, `networkx`
- **Frontend**: plain HTML/CSS/JavaScript (no framework) served by FastAPI via Jinja2 templates and `StaticFiles`

## Project structure

```
priviweb/
├── Dockerfile              # Container build (Python 3.13-slim + Tesseract/Poppler)
├── render.yaml              # Render deployment config
├── backend/
│   ├── app.py                # FastAPI app instantiation, CORS, static/template mounting
│   ├── config.py              # All configuration, env-var driven
│   ├── page_routes.py         # Serves the frontend (GET /)
│   ├── routes.py              # API routes: /api/health, /api/scan
│   ├── scan_services.py       # Upload staging, cleanup, result shaping
│   ├── pii_discovery_v2.py    # The PII detection engine
│   ├── requirements.txt
│   └── runtime.txt            # Python version pin (for Render)
└── frontend/
    ├── template/index.html    # Single-page UI
    └── static/
        ├── css/style.css
        └── js/app.js           # Upload handling, API calls, results rendering
```

## Getting started

### Prerequisites

- Python 3.13.x
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) installed and on your `PATH`
- [Poppler](https://poppler.freedesktop.org/) (for `pdf2image`) installed and on your `PATH`

On macOS:
```bash
brew install tesseract poppler
```
On Debian/Ubuntu:
```bash
apt-get install tesseract-ocr poppler-utils
```

### Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Run

```bash
cd backend
source venv/bin/activate
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000` in a browser, or hit the API directly (see [API reference](#api-reference)).

## Configuration

All settings are environment variables with sensible defaults, defined in `backend/config.py`.

| Variable | Default | Purpose |
|---|---|---|
| `STATIC_URL_PATH` | `/static` | URL prefix for static assets |
| `API_PREFIX` | `/api` | URL prefix for API routes |
| `TEMP_UPLOAD_DIR` | system temp dir + `/pii_discovery_uploads` | Where uploads are staged per-scan before being deleted |
| `APP_TITLE` | `PII Discovery API` | FastAPI app title |
| `APP_DESCRIPTION` | *(see config.py)* | FastAPI app description |
| `APP_VERSION` | `1.0.0` | FastAPI app version |
| `CORS_ALLOW_ORIGINS` | `*` | Comma-separated list of allowed CORS origins |
| `CORS_ALLOW_METHODS` | `*` | Comma-separated list of allowed CORS methods |
| `CORS_ALLOW_HEADERS` | `*` | Comma-separated list of allowed CORS headers |
| `CORS_ALLOW_CREDENTIALS` | `false` | Whether to allow credentialed CORS requests |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `LOG_FORMAT` | *(see config.py)* | Python logging format string |
| `MAX_UPLOAD_FILES` | `500` | Max number of files per scan (not currently enforced in code — reserved) |
| `MAX_UPLOAD_FILE_SIZE_MB` | `25` | Max size per file (not currently enforced in code — reserved) |
| `MAX_UPLOAD_TOTAL_SIZE_MB` | `250` | Max total upload size (not currently enforced in code — reserved) |
| `ALLOWED_FILE_EXTENSIONS` | `.txt,.pdf,.docx,.xls,.xlsx,.csv` | Comma-separated list of file extensions the engine will scan |

## API reference

Base URL: `/api` (configurable via `API_PREFIX`)

Every JSON response uses the same envelope:
```json
{ "success": true, "message": "...", "data": { ... } }
```

### `GET /`
Serves the frontend (`frontend/template/index.html`).

### `GET /api/health`
Health check.

**Response**
```json
{
  "success": true,
  "message": "Service is healthy.",
  "data": { "status": "ok", "version": "1.0.0" }
}
```

### `POST /api/scan`
Scan uploaded files for PII belonging to the person described by the supplied identifiers.

**Request** — `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---|---|
| `files` | file(s) | Yes | One or more files, or a folder upload (relative paths preserved) |
| `name` | string | At least one of these five | Full name |
| `email` | string | | Email address |
| `phone` | string | | Phone number |
| `aadhaar` | string | | Aadhaar number |
| `pan` | string | | PAN number |

**Response** — `data` shape
```json
{
  "summary": {
    "files_scanned": 3,
    "files_with_pii": 1,
    "total_entities": 4
  },
  "files": [
    {
      "filename": "documents/pan_card.pdf",
      "entities": [
        {
          "type": "IN_PAN",
          "value": "ABCDE1234F",
          "context": "... PAN: ABCDE1234F Name: ...",
          "score": 0.95
        }
      ]
    }
  ]
}
```

**Errors** — `400` if no files are uploaded or no identifier is provided; `500` on unexpected engine failures. Error bodies use the same envelope with `success: false`.

## Docker / deployment

The project ships with a `Dockerfile` (Python 3.13-slim base, installs `tesseract-ocr` and `poppler-utils`, plus `gcc`/`g++`/`libglib2.0-0`/`libgl1` for native wheel builds) and a `render.yaml` for deployment on [Render](https://render.com/).

```bash
docker build -t pii-discovery .
docker run -p 10000:10000 pii-discovery
```

The app listens on port `10000` inside the container (matching Render's default).

## Known issues / notes

- **This is a discovery tool, not a redaction tool.** It reports where PII was found; it does not modify, mask, or return an anonymized copy of any document.
- **Stateless by design.** Uploaded files exist only for the duration of a single scan, in a per-scan temp directory that is always cleaned up (even on error).
