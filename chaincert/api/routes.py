"""JSON API for the existing ChainCert backend (API version 1)."""
from __future__ import annotations
import json, os
from functools import wraps
from flask import Blueprint, current_app, jsonify, request
from chaincert.auth import AccessDenied, AuthenticationError, Permission, Role
from chaincert.hashing.exceptions import CertificateValidationError
from chaincert.verification.models import VerificationResult, VerificationStatus
from chaincert.ingestion import DocumentError

api_bp = Blueprint("chaincert_api_v1", __name__, url_prefix="/api/v1")


def _services():
    ext = current_app.extensions
    return ext["chaincert_services"]


def _certificate_db_path():
    return _services()["certificate_db"]


def _json_error(message, status=400, **extra):
    return jsonify({"success": False, "error": message, **extra}), status


def _bearer_token():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def _current_user(required=True):
    token = _bearer_token()
    if not token:
        if required: raise AuthenticationError("Bearer token required")
        return None
    return _services()["access"].authenticate(token)


def _require(permission: Permission):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                user = _current_user(required=True)
                _services()["access"].authorize(user, permission, target_institution_id=user.institution_id)
                request.chaincert_user = user
                return fn(*args, **kwargs)
            except AuthenticationError as exc:
                return _json_error(str(exc), 401)
            except AccessDenied as exc:
                return _json_error(str(exc), 403)
        return wrapper
    return decorator


def _record_fields(record):
    return {key: record.get(key) for key in ("certificate_id", "student_name", "roll_number", "course", "cgpa", "issue_date", "institution_id")}


def _history_institution_id(user, trusted_record):
    if user is not None and user.institution_id is not None:
        return user.institution_id
    if not trusted_record or not trusted_record.get("institution_id"):
        return None
    with _services()["access"].store.connect() as con:
        row = con.execute("SELECT id FROM institutions WHERE name=? COLLATE NOCASE", (str(trusted_record["institution_id"]),)).fetchone()
    return row["id"] if row else None


def _result_review(cid, explanation, fields=None):
    return VerificationResult(VerificationStatus.REVIEW_REQUIRED, cid, explanation,
        {"input_valid": False, "reference_found": bool(cid)}, [], integrity_details={"extraction_fields": fields or {}})


def _extract_values(payload):
    """Accept either raw certificate fields or the structured extraction schema."""
    fields = payload.get("fields", payload)
    if not isinstance(fields, dict): return {}, {}, True
    values, confidence = {}, {}
    structured = any(isinstance(v, dict) and "value" in v for v in fields.values())
    for key in ("certificate_id", "student_name", "roll_number", "course", "cgpa", "issue_date", "institution_id"):
        item = fields.get(key)
        if structured:
            if isinstance(item, dict):
                values[key] = item.get("value")
                confidence[key] = item.get("confidence")
            else:
                values[key] = None
                confidence[key] = None
        else:
            values[key] = item
            confidence[key] = None
    uncertain = bool(payload.get("requires_review", False))
    if any(v is None or (isinstance(v, str) and not v.strip()) for v in values.values()): uncertain = True
    # Low Tesseract token score is a review signal, never a fake/tampered decision.
    if any(isinstance(c, (int, float)) and c < 0.45 for c in confidence.values()): uncertain = True
    return values, confidence, uncertain


@api_bp.get("/health")
def health():
    return jsonify({"success": True, "service": "ChainCert API", "api_version": "v1"})


@api_bp.post("/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    try:
        token = _services()["access"].login(payload.get("email", ""), payload.get("password", ""), payload.get("mfa_code"))
        user = _services()["access"].authenticate(token)
        return jsonify({"success": True, "access_token": token, "token_type": "Bearer", "user": {
            "id": user.id, "email": user.email, "display_name": user.display_name,
            "role": user.role.value, "institution_id": user.institution_id,
            "roll_number": getattr(user, "roll_number", None)}})
    except (AuthenticationError, ValueError) as exc:
        return _json_error(str(exc), 401)


@api_bp.post("/auth/logout")
def logout():
    try:
        token = _bearer_token()
        if not token: raise AuthenticationError("Bearer token required")
        _services()["access"].logout(token)
        return jsonify({"success": True, "message": "Logged out"})
    except AuthenticationError as exc:
        return _json_error(str(exc), 401)


@api_bp.get("/auth/me")
def auth_me():
    try:
        user = _current_user()
        return jsonify({"success": True, "user": {"id": user.id, "email": user.email,
            "display_name": user.display_name, "role": user.role.value, "institution_id": user.institution_id,
            "roll_number": getattr(user, "roll_number", None)}})
    except AuthenticationError as exc:
        return _json_error(str(exc), 401)


@api_bp.get("/certificates")
@_require(Permission.ISSUE_CERTIFICATE)
def list_registry():
    from chaincert.records import list_certificates
    query = request.args.get("q", "").strip().casefold()
    status = request.args.get("status", "").strip().upper()
    records = list_certificates(db_path=_certificate_db_path())
    user = request.chaincert_user
    if user.role != Role.PLATFORM_ADMIN:
        # Institution names are stored in the access-control database; only return
        # records belonging to that institution to institution-scoped users.
        with _services()["access"].store.connect() as con:
            row = con.execute("SELECT name FROM institutions WHERE id=?", (user.institution_id,)).fetchone()
        institution_name = row["name"] if row else None
        records = [r for r in records if r.get("institution_id") in {str(user.institution_id), institution_name}]
    if query:
        records = [r for r in records if any(query in str(r.get(k, "")).casefold() for k in ("certificate_id", "student_name", "roll_number"))]
    if status:
        records = [r for r in records if str(r.get("status", "")).upper() == status]
    return jsonify({"success": True, "count": len(records), "certificates": records})


@api_bp.get("/certificates/<certificate_id>")
@_require(Permission.ISSUE_CERTIFICATE)
def get_registry_record(certificate_id):
    from chaincert.records import get_certificate
    record = get_certificate(certificate_id, db_path=_certificate_db_path())
    if not record: return _json_error("Certificate not found", 404)
    user = request.chaincert_user
    if user.role != Role.PLATFORM_ADMIN:
        with _services()["access"].store.connect() as con:
            row = con.execute("SELECT name FROM institutions WHERE id=?", (user.institution_id,)).fetchone()
        if not row or record.get("institution_id") not in {str(user.institution_id), row["name"]}:
            return _json_error("Institution boundary violation", 403)
    return jsonify({"success": True, "certificate": record})


@api_bp.post("/certificates")
@_require(Permission.ISSUE_CERTIFICATE)
def register_certificate():
    from chaincert.records import issue_certificate
    payload = request.get_json(silent=True) or {}
    raw_fields = payload.get("certificate", payload)
    if not isinstance(raw_fields, dict): return _json_error("JSON object with certificate fields required")
    fields = _record_fields(raw_fields)
    user = request.chaincert_user
    if user.role != Role.PLATFORM_ADMIN:
        with _services()["access"].store.connect() as con:
            row = con.execute("SELECT name FROM institutions WHERE id=?", (user.institution_id,)).fetchone()
        if not row: return _json_error("Institution is unavailable", 403)
        if fields.get("institution_id") not in {str(user.institution_id), row["name"]}:
            return _json_error("Submitted institution does not match your account", 403)
        fields["institution_id"] = row["name"]

    # Student lookup for stable association
    student_user_id = raw_fields.get("student_user_id")
    student_email = raw_fields.get("student_email")
    with _services()["access"].store.connect() as con:
        cols = {r["name"] for r in con.execute("PRAGMA table_info(users)").fetchall()}
        inst_id = user.institution_id
        student_row = None
        roll = (fields.get("roll_number") or "").strip()
        if roll and "roll_number" in cols:
            student_row = con.execute(
                "SELECT id, email, display_name FROM users WHERE role='STUDENT' AND (institution_id=? OR ? IS NULL) AND roll_number=? COLLATE NOCASE",
                (inst_id, inst_id, roll)
            ).fetchone()
        if not student_row and student_email:
            student_row = con.execute(
                "SELECT id, email, display_name FROM users WHERE role='STUDENT' AND (institution_id=? OR ? IS NULL) AND email=? COLLATE NOCASE",
                (inst_id, inst_id, str(student_email).strip().lower())
            ).fetchone()
        s_name = (fields.get("student_name") or "").strip()
        if not student_row and s_name:
            student_row = con.execute(
                "SELECT id, email, display_name FROM users WHERE role='STUDENT' AND (institution_id=? OR ? IS NULL) AND display_name=? COLLATE NOCASE",
                (inst_id, inst_id, s_name)
            ).fetchone()
        if student_row:
            student_user_id = student_row["id"]
            student_email = student_row["email"]

    fields_to_save = dict(fields)
    if student_user_id is not None:
        fields_to_save["student_user_id"] = student_user_id
    if student_email:
        fields_to_save["student_email"] = student_email

    try:
        chain = _services().get("chain")
        if chain is None:
            verification_service = _services().get("verification")
            chain = getattr(verification_service, "chain", None) if verification_service else None
        record = issue_certificate(fields_to_save, db_path=_certificate_db_path(), chain=chain)
        return jsonify({"success": True, "message": "Certificate registered", "certificate": record}), 201
    except CertificateValidationError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        current_app.logger.exception("Certificate registration failed")
        return _json_error("Certificate registration failed. Check fields and duplicate ID.", 400)


@api_bp.post("/certificates/extract")
def extract_document():
    upload = request.files.get("document") or request.files.get("file")
    if not upload: return _json_error("Multipart upload requires a 'document' file field")
    try:
        data = upload.read(_services()["max_upload_bytes"] + 1)
        result = _services()["extractor"].extract(upload.filename or "upload", data)
        return jsonify({"success": True, **result}), 200
    except DocumentError as exc:
        return _json_error(str(exc), 413 if "limit" in str(exc).lower() or "exceeds" in str(exc).lower() else 400)
    except Exception:
        current_app.logger.exception("Document extraction failed")
        return _json_error("Document extraction failed. Check file quality and server OCR setup.", 500)


@api_bp.get("/uploads/<upload_id>")
def get_upload(upload_id):
    result = _services()["extractor"].get(upload_id)
    if not result: return _json_error("Upload result not found or expired", 404)
    return jsonify({"success": True, **result})


@api_bp.post("/verification/verify")
@api_bp.post("/verify")
def verify_fields():
    from chaincert.records import get_certificate
    payload = request.get_json(silent=True) or {}
    values, confidence, uncertain = _extract_values(payload)
    cid = values.get("certificate_id")
    trusted = get_certificate(str(cid).strip(), db_path=_certificate_db_path()) if isinstance(cid, str) and cid.strip() else None
    supplied_fields = payload.get("fields", payload)
    supplied_non_id = any(supplied_fields.get(k) not in (None, "") for k in ("student_name", "roll_number", "course", "cgpa", "issue_date", "institution_id")) if isinstance(supplied_fields, dict) else False
    if isinstance(cid, str) and cid.strip() and not supplied_non_id and not payload.get("upload_id"):
        if not trusted:
            result = _services()["verification"].verify({"certificate_id": cid}, None)
        elif str(trusted.get("status", "")).upper() == "REVOKED":
            result = _services()["verification"].verify({"certificate_id": cid}, trusted)
        else:
            try:
                stored_record_hash_valid = __import__("chaincert.hashing", fromlist=["hash_certificate"]).hash_certificate(_record_fields(trusted)).certificate_hash == trusted.get("certificate_hash")
            except Exception:
                stored_record_hash_valid = False
            if stored_record_hash_valid:
                result = VerificationResult(VerificationStatus.GENUINE, cid.strip(),
                    "A trusted registry record exists for this ID. This ID-only lookup does not compare an uploaded document.",
                    {"registry_record_found": True, "registry_record_hash_consistent": True, "document_compared": False}, [],
                    trusted.get("certificate_hash"), trusted.get("certificate_hash"), {"verification_mode": "registry_lookup"})
            else:
                result = _result_review(cid.strip(), "The registry record fingerprint is inconsistent; manual review is required.")
    elif uncertain and not trusted:
        result = _result_review(cid.strip() if isinstance(cid, str) else None,
            "Extraction is incomplete or uncertain. Review the candidate fields before relying on a result.", payload.get("fields"))
    else:
        result = _services()["verification"].verify(
            values,
            trusted,
            extracted_fields=payload.get("fields") if isinstance(payload.get("fields"), dict) else None,
            uncertain=uncertain
        )
    result_dict = result.to_dict()
    upload_id = payload.get("upload_id")
    upload_result = _services()["extractor"].get(upload_id) if isinstance(upload_id, str) else None
    source_type = upload_result.get("source_type") if upload_result else payload.get("source_type")
    user = None
    try: user = _current_user(required=False)
    except AuthenticationError: user = None
    _services()["history"].record(result_dict, upload_id=upload_id, source_type=source_type,
        actor_user_id=user.id if user else None, institution_id=_history_institution_id(user, trusted))
    response = {"success": True, **result_dict}
    if trusted:
        if result.status == VerificationStatus.REVOKED:
            response["certificate"] = {"certificate_id": trusted.get("certificate_id"), "status": "REVOKED",
                                        "revocation_reason": trusted.get("revocation_reason")}
        else:
            response["certificate"] = _record_fields(trusted)
    return jsonify(response)


@api_bp.post("/verification/verify-upload")
def verify_upload():
    upload = request.files.get("document") or request.files.get("file")
    if not upload: return _json_error("Multipart upload requires a 'document' file field")
    try:
        data = upload.read(_services()["max_upload_bytes"] + 1)
        extracted = _services()["extractor"].extract(upload.filename or "upload", data)
    except DocumentError as exc:
        return _json_error(str(exc), 413 if "limit" in str(exc).lower() or "exceeds" in str(exc).lower() else 400)
    payload = {"fields": extracted["fields"], "requires_review": extracted["requires_review"],
               "upload_id": extracted["upload_id"], "source_type": extracted["source_type"]}
    values, confidence, uncertain = _extract_values(payload)
    from chaincert.records import get_certificate
    cid = values.get("certificate_id")
    trusted = get_certificate(str(cid).strip(), db_path=_certificate_db_path()) if isinstance(cid, str) and cid.strip() else None
    result = _services()["verification"].verify(
        values,
        trusted,
        extracted_fields=extracted.get("fields"),
        uncertain=uncertain
    )
    result_dict = result.to_dict()

    # Section 5: Debug log extraction & registry comparison
    current_app.logger.info("DOCUMENT VERIFICATION: %s -> %s", upload.filename or "upload", result.status.value)
    print("\nDOCUMENT VERIFICATION\n---------------------")
    print(f"File: {upload.filename or 'upload'}")
    print("\nExtracted:")
    for k in ("certificate_id", "student_name", "roll_number", "course", "cgpa", "issue_date", "institution_id"):
        print(f"  {k} = {values.get(k)}")
    print("\nRegistry:")
    if trusted:
        for k in ("certificate_id", "student_name", "roll_number", "course", "cgpa", "issue_date", "institution_id"):
            print(f"  {k} = {trusted.get(k)}")
    else:
        print("  (No record found in registry)")
    if result.status == VerificationStatus.TAMPERED:
        print("\nMismatch:")
        for m_key, m_info in (result.mismatches or {}).items():
            print(f"  {m_key}: expected '{m_info.get('expected')}', actual '{m_info.get('actual')}'")
    print(f"\nResult:\n  {result.status.value}\n---------------------\n")

    user = None
    try: user = _current_user(required=False)
    except AuthenticationError: user = None
    _services()["history"].record(result_dict, upload_id=extracted["upload_id"], source_type=extracted["source_type"],
        actor_user_id=user.id if user else None, institution_id=_history_institution_id(user, trusted))
    response = {"success": True, "extraction": extracted, **result_dict}
    if trusted:
        if result.status == VerificationStatus.REVOKED:
            response["certificate"] = {"certificate_id": trusted.get("certificate_id"), "status": "REVOKED",
                                        "revocation_reason": trusted.get("revocation_reason")}
        else:
            response["certificate"] = _record_fields(trusted)
    return jsonify(response)


@api_bp.get("/verification/history")
@_require(Permission.ISSUE_CERTIFICATE)
def verification_history():
    user = request.chaincert_user
    # Platform admin sees all records; institution-scoped users only see their institution.
    institution = None if user.role == Role.PLATFORM_ADMIN else user.institution_id
    items = _services()["history"].list(request.args.get("limit", 100), institution_id=institution)
    return jsonify({"success": True, "count": len(items), "attempts": items})


@api_bp.post("/certificates/<certificate_id>/revoke")
@_require(Permission.REVOKE_CERTIFICATE)
def revoke_certificate(certificate_id):
    from chaincert.records import get_certificate
    payload = request.get_json(silent=True) or {}
    reason = str(payload.get("reason", "")).strip()
    if not reason: return _json_error("A revocation reason is required")
    record = get_certificate(certificate_id, db_path=_certificate_db_path())
    if not record: return _json_error("Certificate not found", 404)
    user = request.chaincert_user
    if user.role != Role.PLATFORM_ADMIN:
        with _services()["access"].store.connect() as con:
            row = con.execute("SELECT name FROM institutions WHERE id=?", (user.institution_id,)).fetchone()
        if not row or record.get("institution_id") not in {str(user.institution_id), row["name"]}:
            return _json_error("Institution boundary violation", 403)
    import sqlite3
    db_path = _certificate_db_path()
    with sqlite3.connect(db_path) as con:
        columns = {r[1] for r in con.execute("PRAGMA table_info(certificates)")}
        if "revocation_reason" not in columns: con.execute("ALTER TABLE certificates ADD COLUMN revocation_reason TEXT")
        if "revoked_at" not in columns: con.execute("ALTER TABLE certificates ADD COLUMN revoked_at TEXT")
        from datetime import datetime, timezone
        con.execute("UPDATE certificates SET status='REVOKED', revocation_reason=?, revoked_at=?, updated_at=? WHERE certificate_id=?",
                    (reason, datetime.now(timezone.utc).isoformat(), datetime.now(timezone.utc).isoformat(), certificate_id))
    _services()["history"].record({"certificate_id": certificate_id, "status": "REVOKED", "explanation": f"Credential revoked: {reason}", "mismatched_fields": []},
        actor_user_id=user.id, institution_id=user.institution_id)
    return jsonify({"success": True, "message": "Certificate revoked", "certificate_id": certificate_id, "status": "REVOKED", "reason": reason})


@api_bp.get("/audit")
@_require(Permission.ISSUE_CERTIFICATE)
def audit_events():
    user = request.chaincert_user
    institution = None if user.role == Role.PLATFORM_ADMIN else user.institution_id
    items = _services()["history"].list(request.args.get("limit", 100), institution_id=institution)
    return jsonify({"success": True, "count": len(items), "events": items})


@api_bp.post("/audit/integrity-check")
@_require(Permission.ISSUE_CERTIFICATE)
def audit_integrity_check():
    import time
    from datetime import datetime, timezone
    start = time.time()
    chain = _services().get("chain")
    val_result = chain.validate_chain() if chain else None
    duration_ms = int((time.time() - start) * 1000)
    latest_root = chain.blocks[-1].merkle_root if chain and chain.blocks else "0" * 64
    block_count = len(chain.blocks) if chain else 0
    is_valid = val_result.is_valid if val_result else True

    return jsonify({
        "success": True,
        "status": "ALL_INTACT" if is_valid else "INTEGRITY_COMPROMISED",
        "verifiedCount": block_count,
        "merkleRoot": latest_root,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "executionTimeMs": max(1, duration_ms),
        "errors": list(val_result.errors) if val_result else []
    })


def _is_certificate_owned_by_student(r: dict, user) -> bool:
    target_id = user.id
    target_email = (user.email or "").strip().lower()
    target_name = (user.display_name or "").strip().casefold()
    target_roll = getattr(user, "roll_number", None)
    target_roll = target_roll.strip().casefold() if target_roll else None

    r_user_id = r.get("student_user_id")
    r_email = (r.get("student_email") or "").strip().lower()
    r_roll = (r.get("roll_number") or "").strip().casefold()
    r_name = str(r.get("student_name", "")).strip().casefold()

    # 1. Exact user_id association
    if r_user_id is not None:
        return r_user_id == target_id

    # 2. Exact email association
    if r_email:
        return r_email == target_email

    # 3. Roll number association (ensuring name doesn't conflict)
    if target_roll and r_roll:
        if r_roll == target_roll and (not r_name or r_name == target_name):
            return True

    # 4. Safe legacy fallback: match name only if no conflicting roll number and matching institution
    if r_name == target_name:
        if target_roll and r_roll and r_roll != target_roll:
            return False
        with _services()["access"].store.connect() as con:
            inst_row = con.execute("SELECT name FROM institutions WHERE id=?", (user.institution_id,)).fetchone()
        inst_name = inst_row["name"] if inst_row else None
        return r.get("institution_id") in {str(user.institution_id), inst_name}

    return False


@api_bp.get("/institution/stats")
@_require(Permission.ISSUE_CERTIFICATE)
def institution_stats():
    user = request.chaincert_user
    from chaincert.records import list_certificates
    records = list_certificates(db_path=_certificate_db_path())
    if user.role != Role.PLATFORM_ADMIN:
        with _services()["access"].store.connect() as con:
            row = con.execute("SELECT name FROM institutions WHERE id=?", (user.institution_id,)).fetchone()
        inst_name = row["name"] if row else None
        records = [r for r in records if r.get("institution_id") in {str(user.institution_id), inst_name}]

    total = len(records)
    revoked = sum(1 for r in records if str(r.get("status", "")).upper() == "REVOKED")
    valid = total - revoked
    review_required = sum(1 for r in records if str(r.get("status", "")).upper() == "REVIEW_REQUIRED")

    return jsonify({
        "success": True,
        "total_registered": total,
        "issued_credentials": total,
        "valid_credentials": valid,
        "revoked_credentials": revoked,
        "review_required": review_required,
    })


@api_bp.get("/students/me")
@_require(Permission.PUBLIC_VERIFY)
def student_profile():
    user = request.chaincert_user
    if user.role != Role.STUDENT:
        return _json_error("Student access required", 403)
    return jsonify({"success": True, "student": {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role.value,
        "institution_id": user.institution_id,
        "roll_number": getattr(user, "roll_number", None),
    }})


@api_bp.get("/students/me/stats")
@_require(Permission.PUBLIC_VERIFY)
def student_stats():
    user = request.chaincert_user
    if user.role != Role.STUDENT:
        return _json_error("Student access required", 403)
    from chaincert.records import list_certificates
    records = list_certificates(db_path=_certificate_db_path())
    own = [r for r in records if _is_certificate_owned_by_student(r, user)]
    total = len(own)
    revoked = sum(1 for r in own if str(r.get("status", "")).upper() == "REVOKED")
    valid = total - revoked

    return jsonify({
        "success": True,
        "total_credentials": total,
        "valid_credentials": valid,
        "revoked_credentials": revoked,
    })


@api_bp.get("/students/me/certificates")
@_require(Permission.PUBLIC_VERIFY)
def student_certificates():
    user = request.chaincert_user
    if user.role != Role.STUDENT:
        return _json_error("Student access required", 403)
    from chaincert.records import list_certificates
    records = list_certificates(db_path=_certificate_db_path())
    own = [r for r in records if _is_certificate_owned_by_student(r, user)]
    return jsonify({"success": True, "count": len(own), "certificates": own})


@api_bp.get("/students/me/certificates/<certificate_id>")
@_require(Permission.PUBLIC_VERIFY)
def student_certificate_detail(certificate_id):
    user = request.chaincert_user
    if user.role != Role.STUDENT:
        return _json_error("Student access required", 403)
    from chaincert.records import get_certificate
    record = get_certificate(certificate_id, db_path=_certificate_db_path())
    if not record:
        return _json_error("Certificate not found", 404)
    if not _is_certificate_owned_by_student(record, user):
        return _json_error("Certificate access denied", 403)
    return jsonify({"success": True, "certificate": record})
