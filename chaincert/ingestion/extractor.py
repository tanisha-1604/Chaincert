"""PDF/image ingestion and candidate academic-field extraction.

Supports robust extraction from PDFs (direct native text extraction with OCR fallback)
and images (PNG, JPG, JPEG via Tesseract OCR).
"""
from __future__ import annotations
import io, re, uuid, json, sqlite3, time
from pathlib import Path
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

try:
    import fitz  # PyMuPDF
except ImportError:
    import pymupdf as fitz  # Alternative import

from PIL import Image, ImageOps
import pytesseract
from pytesseract import Output

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PAGES = 10
RETENTION_SECONDS = 24 * 60 * 60

FIELD_ALIASES = {
    "certificate_id": [
        "certificate id", "certificateid", "certificate id:", "certificate no", "certificate no.",
        "certificate number", "cert id", "cert no", "cert no.", "credential id", "credential no",
        "credential no.", "credential number", "certificate identifier", "cert identifier", "certificate #"
    ],
    "student_name": [
        "student full name", "student name", "name of candidate", "candidate name",
        "name of student", "student's name", "name", "student"
    ],
    "roll_number": [
        "enrollment number", "enrollment no", "enrollment no.", "enrolment number", "enrolment no",
        "enrolment no.", "roll number", "roll no", "roll no.", "roll #", "registration number",
        "registration no", "registration no.", "student number", "student id", "matriculation id",
        "matriculation no", "roll"
    ],
    "course": [
        "course / academic degree", "academic degree", "course name", "degree",
        "programme", "program", "course", "qualification", "branch"
    ],
    "cgpa": [
        "cumulative grade point average", "grade point average", "cumulative grade",
        "c.g.p.a.", "cgpa", "s.g.p.a.", "sgpa", "g.p.a.", "gpa", "grade"
    ],
    "issue_date": [
        "conferal / issue date", "conferral / issue date", "date of issue", "date of award",
        "date issued", "issue date", "conferal date", "conferral date", "award date"
    ],
    "institution_id": [
        "conferring institution", "institution id", "institution code", "university id",
        "college id", "institution", "university", "college", "issued by"
    ],
}

# Flattened list of (field, alias) sorted by alias length descending
# This guarantees longer, more specific aliases (e.g. 'student id') are matched
# before shorter prefixes (e.g. 'student').
FLAT_ALIASES = []
for _f, _aliases in FIELD_ALIASES.items():
    for _a in _aliases:
        FLAT_ALIASES.append((_f, _a))
FLAT_ALIASES.sort(key=lambda x: len(x[1]), reverse=True)


class DocumentError(ValueError):
    """Raised for unsupported, malformed, or over-limit documents."""


class ExtractionService:
    def __init__(self, database_path: str | Path, *, max_upload_bytes=MAX_UPLOAD_BYTES,
                 max_pages=MAX_PAGES, retention_seconds=RETENTION_SECONDS):
        self.database_path = str(database_path)
        self.max_upload_bytes = int(max_upload_bytes)
        self.max_pages = int(max_pages)
        self.retention_seconds = int(retention_seconds)
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as con:
            con.execute('''CREATE TABLE IF NOT EXISTS upload_results (
                upload_id TEXT PRIMARY KEY, result_json TEXT NOT NULL,
                created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
            )''')

    def connect(self):
        con = sqlite3.connect(self.database_path, timeout=10)
        con.row_factory = sqlite3.Row
        return con

    def _cleanup(self):
        now = int(time.time())
        with self.connect() as con:
            con.execute("DELETE FROM upload_results WHERE expires_at < ?", (now,))

    def get(self, upload_id: str):
        self._cleanup()
        with self.connect() as con:
            row = con.execute("SELECT result_json FROM upload_results WHERE upload_id=? AND expires_at>=?", (upload_id, int(time.time()))).fetchone()
        return json.loads(row["result_json"]) if row else None

    def extract(self, filename: str, data: bytes) -> dict[str, Any]:
        self._cleanup()
        if not data:
            raise DocumentError("The uploaded document is empty.")
        if len(data) > self.max_upload_bytes:
            raise DocumentError(f"File exceeds the {self.max_upload_bytes // (1024*1024)} MB upload limit.")
        suffix = Path(filename or "").suffix.lower()
        if suffix not in {".pdf", ".png", ".jpg", ".jpeg"}:
            raise DocumentError("Unsupported file type. Upload PDF, PNG, JPG, or JPEG.")

        pages_text: list[str] = []
        pages_conf: dict[str, float] = {}
        source_type = "unknown"

        if suffix == ".pdf":
            if not data.startswith(b"%PDF-"):
                raise DocumentError("The file extension says PDF, but the file signature is invalid.")
            try:
                document = fitz.open(stream=data, filetype="pdf")
            except Exception:
                raise DocumentError("The PDF is malformed or encrypted and could not be opened.") from None

            try:
                if document.page_count < 1:
                    raise DocumentError("The PDF contains no pages.")
                if document.page_count > self.max_pages:
                    raise DocumentError(f"PDF has {document.page_count} pages; the limit is {self.max_pages}.")

                native_text_list = []
                for page in document:
                    rect = page.rect
                    if rect.width > 2000 or rect.height > 3000 or rect.width * rect.height > 3_000_000:
                        raise DocumentError("A PDF page has unsafe dimensions and cannot be rendered.")
                    t = page.get_text("text") or ""
                    native_text_list.append(t)

                combined_native = "\n".join(native_text_list)
                usable_native = len(re.sub(r"\W", "", combined_native, flags=re.UNICODE)) >= 20

                # Try native text extraction first
                fields_native, _ = extract_fields(combined_native, native_text_used=True)
                core_found = all(fields_native[k]["value"] is not None for k in ("certificate_id", "student_name", "roll_number", "course", "cgpa", "issue_date"))

                if usable_native and core_found:
                    pages_text = native_text_list
                    source_type = "text_pdf"
                else:
                    # Native text missing core fields or empty: perform OCR rasterization
                    ocr_texts = []
                    for page in document:
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                        image = Image.open(io.BytesIO(pix.tobytes("png")))
                        ocr_txt, conf_map = self._ocr(image)
                        ocr_texts.append(ocr_txt)
                        pages_conf.update(conf_map)
                    
                    # If native text had some content, combine with OCR text to maximize coverage
                    if usable_native:
                        combined_all = combined_native + "\n" + "\n".join(ocr_texts)
                        pages_text = [combined_all]
                        source_type = "mixed_pdf"
                    else:
                        pages_text = ocr_texts
                        source_type = "scanned_pdf"
            finally:
                document.close()
        else:
            # Image file: PNG, JPG, JPEG
            try:
                image = Image.open(io.BytesIO(data))
                if image.format not in {"PNG", "JPEG"}:
                    raise DocumentError("Image content must be PNG or JPEG.")
                image.verify()
                image = Image.open(io.BytesIO(data))
                if image.width * image.height > 40_000_000:
                    raise DocumentError("Image dimensions are too large to process safely.")
                ocr_txt, conf_map = self._ocr(ImageOps.exif_transpose(image).convert("RGB"))
                pages_text.append(ocr_txt)
                pages_conf.update(conf_map)
                source_type = "image"
            except DocumentError:
                raise
            except Exception:
                raise DocumentError("The image is malformed or unsupported.") from None

        full_text = "\n".join(pages_text)
        fields, warnings = extract_fields(full_text, line_confidence=pages_conf,
                                          native_text_used=(source_type == "text_pdf"))

        # Determine if required fields are missing
        core_fields = ("certificate_id", "student_name", "roll_number", "course", "cgpa", "issue_date")
        missing_core = [k for k in core_fields if fields[k]["value"] is None]
        if missing_core:
            warnings.append(f"Required fields not reliably extracted: {', '.join(missing_core)}.")

        requires_review = bool(missing_core) or any("ambiguous" in w.lower() or "invalid" in w.lower() for w in warnings)

        result = {
            "upload_id": str(uuid.uuid4()),
            "source_type": source_type,
            "pages_processed": len(pages_text),
            "fields": fields,
            "warnings": list(dict.fromkeys(warnings)),
            "requires_review": requires_review,
            "extraction_note": "Extraction parsed document text. Cryptographic verification establishes authenticity against the trusted registry."
        }
        now = int(time.time())
        with self.connect() as con:
            con.execute("INSERT INTO upload_results(upload_id,result_json,created_at,expires_at) VALUES(?,?,?,?)",
                        (result["upload_id"], json.dumps(result, ensure_ascii=False), now, now + self.retention_seconds))
        return result

    @staticmethod
    def _ocr(image: Image.Image) -> tuple[str, dict[str, float]]:
        try:
            # Extract plain text string directly
            plain_text = pytesseract.image_to_string(image, config="--psm 6")
        except Exception as exc:
            try:
                plain_text = pytesseract.image_to_string(image)
            except Exception as exc2:
                raise DocumentError("OCR is unavailable. Ensure Tesseract OCR and pytesseract are configured.") from exc2

        confidence_map: dict[str, float] = {}
        try:
            data = pytesseract.image_to_data(image, output_type=Output.DICT, config="--psm 6")
            grouped: dict[tuple[str, str, str], list[str]] = {}
            scores: dict[tuple[str, str, str], list[float]] = {}
            for i, token in enumerate(data.get("text", [])):
                token = str(token).strip()
                if not token:
                    continue
                key = (str(data["block_num"][i]), str(data["par_num"][i]), str(data["line_num"][i]))
                grouped.setdefault(key, []).append(token)
                try:
                    val = float(data["conf"][i])
                    if val >= 0:
                        scores.setdefault(key, []).append(max(0.0, min(100.0, val)) / 100.0)
                except (ValueError, TypeError, IndexError):
                    pass
            for key, tokens in grouped.items():
                line = " ".join(tokens)
                values = scores.get(key, [])
                if values:
                    confidence_map[line] = sum(values) / len(values)
        except Exception:
            pass

        return plain_text, confidence_map


def _field_label_match(line: str) -> tuple[str | None, str | None]:
    """Matches a line against all recognized aliases in order of specificity."""
    stripped = line.strip()
    for field, alias in FLAT_ALIASES:
        # Match alias ignoring internal spaces/dots and case
        esc = re.escape(alias).replace(r"\ ", r"\s*").replace(r"\.", r"\.?")
        # 1. Label followed by separator and value on the same line
        pat_val = r"^\s*" + esc + r"\s*(?:[:：\-–—|=]\s*|\s{2,}|\s+)(.*?)\s*$"
        match = re.match(pat_val, stripped, flags=re.IGNORECASE)
        if match:
            return field, match.group(1).strip()
        # 2. Label alone on line (value on next line)
        pat_label_only = r"^\s*" + esc + r"\s*[:：\-–—|=]?\s*$"
        if re.match(pat_label_only, stripped, flags=re.IGNORECASE):
            return field, ""
    return None, None


def _normalize_date(value: str) -> tuple[str | None, str | None]:
    """Normalizes date strings (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, 23 Oct 2026, etc.) to YYYY-MM-DD."""
    if not value or not str(value).strip():
        return None, "Empty date value"
    val = value.strip().replace(",", " ").replace(".", "-")
    # Clean up ordinals: 23rd -> 23
    cleaned = re.sub(r"(\d{1,2})(st|nd|rd|th)\b", r"\1", val, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d.%m.%Y",
        "%Y/%m/%d",
        "%d %B %Y",
        "%d %b %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%d-%B-%Y",
        "%d-%b-%Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%Y-%m-%d"), None
        except ValueError:
            pass

    # Regex fallback for DD-MM-YYYY or YYYY-MM-DD
    iso = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", cleaned)
    if iso:
        try:
            return datetime(int(iso.group(1)), int(iso.group(2)), int(iso.group(3))).strftime("%Y-%m-%d"), None
        except ValueError:
            pass

    dmy = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", cleaned)
    if dmy:
        a, b, y = int(dmy.group(1)), int(dmy.group(2)), int(dmy.group(3))
        # In academic credentials, DD-MM-YYYY is standard
        day, month = (a, b) if a > 12 or b <= 12 else (b, a)
        try:
            return datetime(y, month, day).strftime("%Y-%m-%d"), None
        except ValueError:
            pass

    return None, f"Unrecognized issue date: {value}"


def _normalize_cgpa(value: str) -> tuple[str | None, str | None]:
    """Normalizes CGPA string (9.40, 9.4, 9,40, 9.40/10) to 2-decimal string '9.40'."""
    if not value or not str(value).strip():
        return None, "Empty CGPA value"
    cleaned = value.strip().replace(",", ".")
    match = re.search(r"(?<!\d)(\d{1,2}(?:\.\d{1,3})?)(?:\s*(?:/|out of)\s*10(?:\.0+)?)?(?!\d)", cleaned, flags=re.IGNORECASE)
    if not match:
        return None, f"Invalid CGPA value '{value}'; expected numeric CGPA between 0 and 10."
    try:
        score = Decimal(match.group(1))
    except InvalidOperation:
        return None, f"Invalid CGPA value '{value}'."
    if not score.is_finite() or score < 0 or score > 10:
        return None, f"Invalid CGPA value '{value}'; expected 0 to 10."
    return f"{score:.2f}", None


def extract_fields(text: str, *, line_confidence: dict[str, float] | None = None,
                   native_text_used: bool = False) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """
    Extracts structured academic credential fields from raw text.
    Uses multi-pass extraction:
    1. Line-by-line label matching (handles multi-field lines and multi-line values).
    2. Full-text targeted regex pattern search for any missing fields.
    """
    raw_lines = (text or "").splitlines()
    lines = []
    # Split multi-field lines (e.g. separated by '|' or 3+ spaces before another label)
    for raw in raw_lines:
        line_clean = re.sub(r"\s+", " ", raw).strip()
        if not line_clean:
            continue
        parts = re.split(r"\s*[|]\s*", line_clean)
        for part in parts:
            part = part.strip()
            if part:
                lines.append(part)

    candidates: dict[str, tuple[str, str, float | None]] = {}
    warnings: list[str] = []

    # Pass 1: Line-by-line label matching
    for idx, line in enumerate(lines):
        field, value = _field_label_match(line)
        if not field or field in candidates:
            continue
        source = line
        confidence_line = line
        if not value:
            # Value on the next line
            for next_line in lines[idx + 1: idx + 4]:
                if _field_label_match(next_line)[0]:
                    break
                value = next_line
                source = f"{line} | {next_line}"
                confidence_line = next_line
                break
        if value:
            conf = (line_confidence or {}).get(confidence_line)
            candidates[field] = (value.strip(), source, conf)

    # Pass 2: Targeted regex patterns for any missing fields across full text
    REGEX_FALLBACKS = {
        "certificate_id": [
            r"(?i)\b(?:certificate\s*id|credential\s*(?:id|no)|cert\s*(?:id|no)|certificate\s*#)\b\s*[:：\-–—=]?\s*([A-Za-z0-9\-]+)",
        ],
        "roll_number": [
            r"(?i)\b(?:roll\s*(?:number|no|\#)|enrollment\s*(?:number|no)|registration\s*(?:number|no)|student\s*id|matriculation\s*(?:id|no))\b\s*[:：\-–—=]?\s*([A-Za-z0-9\-]+)",
        ],
        "cgpa": [
            r"(?i)\b(?:cgpa|c\.g\.p\.a\.?|gpa|grade\s*point\s*average|cumulative\s*grade)\b\s*[:：\-–—=]?\s*([0-9]+(?:\.[0-9]+)?(?:\s*(?:/|out of)\s*10(?:\.0+)?)?)",
        ],
        "issue_date": [
            r"(?i)\b(?:issue\s*date|date\s*of\s*issue|confer(?:r?al)?\s*(?:/\s*issue\s*)?date|date\s*issued|award\s*date)\b\s*[:：\-–—=]?\s*([0-9]{1,4}[-/.][0-9A-Za-z]{1,9}[-/.][0-9]{1,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4}|[A-Za-z]+\s+[0-9]{1,2}(?:st|nd|rd|th)?,?\s+[0-9]{4})",
        ],
        "student_name": [
            r"(?i)\b(?:student\s*(?:full\s*)?name|candidate\s*name|name\s*of\s*(?:student|candidate))\b\s*[:：\-–—=]?\s*([A-Za-z\s.'-]+?)(?=\n|$|[|])",
        ],
        "course": [
            r"(?i)\b(?:course(?:\s*/\s*academic\s*degree)?|academic\s*degree|degree|program(?:me)?)\b\s*[:：\-–—=]?\s*([A-Za-z0-9\s&.',()-]+?)(?=\n|$|[|])",
        ],
        "institution_id": [
            r"(?i)\b(?:institution\s*(?:id|code)?|conferring\s*institution|university|college|issued\s*by)\b\s*[:：\-–—=]?\s*([A-Za-z0-9\s&.',-]+?)(?=\n|$|[|])",
        ],
    }

    for f_name, patterns in REGEX_FALLBACKS.items():
        if f_name not in candidates:
            for pat in patterns:
                m = re.search(pat, text)
                if m:
                    val = m.group(1).strip()
                    if val:
                        candidates[f_name] = (val, f"regex_fallback: {val}", None)
                        break

    # Build output and normalize values
    output: dict[str, dict[str, Any]] = {}
    for field in FIELD_ALIASES:
        candidate = candidates.get(field)
        if not candidate:
            output[field] = {
                "value": None,
                "confidence": None,
                "confidence_method": "unavailable",
                "source_text": None,
            }
            continue

        value, source, conf = candidate
        normalized = value.strip()
        warning = None

        if field == "cgpa":
            normalized, warning = _normalize_cgpa(value)
        elif field == "issue_date":
            normalized, warning = _normalize_date(value)
        elif field == "student_name":
            # Clean extraneous punctuation and whitespace
            normalized = re.sub(r"\s+", " ", re.sub(r"^[^\w]+|[^\w]+$", "", normalized)).strip()
        elif field == "roll_number":
            normalized = re.sub(r"\s+", "", normalized).strip()
        elif field == "certificate_id":
            normalized = re.sub(r"\s+", "", normalized).strip()

        method = "mean_tesseract_token_score_proxy" if conf is not None else ("native_pdf_text" if native_text_used else "not_provided_by_extractor")

        output[field] = {
            "value": normalized,
            "confidence": round(conf, 4) if conf is not None else None,
            "confidence_method": method,
            "source_text": source,
        }
        if warning:
            warnings.append(warning)

    return output, warnings
