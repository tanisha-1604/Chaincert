"""Integration tests for ChainCert Flask REST API endpoints."""

import json
import pytest
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_api_health(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["api_version"] == "v1"


def test_api_auth_and_rbac(client):
    # 1. Successful Institution Login
    res = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "access_token" in data
    assert data["user"]["role"] == "INSTITUTION_ADMIN"
    assert data["user"]["institution_id"] == 1
    token = data["access_token"]

    # 2. Check /auth/me
    res_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    assert res_me.get_json()["user"]["email"] == "institute@chaincert.local"

    # 3. Invalid credentials
    res_bad = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "WrongPassword123"
    })
    assert res_bad.status_code == 401
    assert res_bad.get_json()["success"] is False

    # 4. Successful Student Login
    res_stud = client.post("/api/v1/auth/login", json={
        "email": "student@chaincert.local",
        "password": "Student123456"
    })
    assert res_stud.status_code == 200
    stud_data = res_stud.get_json()
    assert stud_data["user"]["role"] == "STUDENT"


import uuid

def test_full_certificate_lifecycle_and_verification_workflow(client):
    # 1. Institution login
    res_login = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res_login.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Register new certificate
    cert_id = f"DEMO-CC-2026-API-{uuid.uuid4().hex[:6]}"
    cert_payload = {
        "certificate": {
            "certificate_id": cert_id,
            "student_name": "Alice Example",
            "roll_number": "DEMO-ROLL-001",
            "course": "Bachelor of Technology in Artificial Intelligence",
            "cgpa": "9.80",
            "issue_date": "2026-10-23",
            "institution_id": "1"
        }
    }
    res_reg = client.post("/api/v1/certificates", json=cert_payload, headers=headers)
    assert res_reg.status_code in (200, 201)
    reg_data = res_reg.get_json()
    assert reg_data["success"] is True
    assert reg_data["certificate"]["certificate_id"] == cert_id

    # 3. Public verification by ID (GENUINE)
    res_verify_id = client.post("/api/v1/verify", json={"certificate_id": cert_id})
    assert res_verify_id.status_code == 200
    v_data = res_verify_id.get_json()
    assert v_data["success"] is True
    assert v_data["status"] == "GENUINE"

    # 4. Public verification with TAMPERED fields (CGPA altered to 9.99)
    tampered_fields = {
        "certificate_id": cert_id,
        "student_name": "Alice Example",
        "roll_number": "DEMO-ROLL-001",
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.99",
        "issue_date": "2026-10-23",
        "institution_id": "MMCOE"
    }
    res_tampered = client.post("/api/v1/verify", json={"certificate_id": cert_id, "fields": tampered_fields})
    assert res_tampered.status_code == 200
    t_data = res_tampered.get_json()
    assert t_data["status"] == "TAMPERED"
    assert "cgpa" in t_data.get("mismatched_fields", [])

    # 5. Public verification with UNKNOWN ID (NOT_FOUND)
    res_unknown = client.post("/api/v1/verify", json={"certificate_id": "UNKNOWN-123"})
    assert res_unknown.status_code == 200
    assert res_unknown.get_json()["status"] == "NOT_FOUND"

    # 6. Revoke certificate
    res_revoke = client.post(f"/api/v1/certificates/{cert_id}/revoke", json={
        "reason": "Academic integrity review"
    }, headers=headers)
    assert res_revoke.status_code == 200
    assert res_revoke.get_json()["status"] == "REVOKED"

    # 7. Public verification after revocation (REVOKED)
    res_verify_rev = client.post("/api/v1/verify", json={"certificate_id": cert_id})
    assert res_verify_rev.status_code == 200
    assert res_verify_rev.get_json()["status"] == "REVOKED"

    # 8. Student view: login as Alice and verify visibility
    res_alice = client.post("/api/v1/auth/login", json={
        "email": "alice@chaincert.local",
        "password": "AliceExample123"
    })
    alice_token = res_alice.get_json()["access_token"]
    res_certs = client.get("/api/v1/students/me/certificates", headers={"Authorization": f"Bearer {alice_token}"})
    assert res_certs.status_code == 200
    alice_certs = res_certs.get_json()["certificates"]
    assert any(c["certificate_id"] == cert_id for c in alice_certs)

    # 9. Student isolation: Demo Student cannot see Alice's certificate
    res_demo = client.post("/api/v1/auth/login", json={
        "email": "student@chaincert.local",
        "password": "Student123456"
    })
    demo_token = res_demo.get_json()["access_token"]
    res_demo_certs = client.get("/api/v1/students/me/certificates", headers={"Authorization": f"Bearer {demo_token}"})
    assert res_demo_certs.status_code == 200
    demo_certs = res_demo_certs.get_json()["certificates"]
    assert not any(c["certificate_id"] == cert_id for c in demo_certs)


def test_audit_integrity_check(client):
    res = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res.get_json()["access_token"]

    res_check = client.post("/api/v1/audit/integrity-check", headers={"Authorization": f"Bearer {token}"})
    assert res_check.status_code == 200
    data = res_check.get_json()
    assert data["success"] is True
    assert data["status"] == "ALL_INTACT"
    assert "verifiedCount" in data
    assert "merkleRoot" in data


def test_robert_evans_scenario_and_isolation(client):
    # 1. Login as institution
    res_inst = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    assert res_inst.status_code == 200
    inst_token = res_inst.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {inst_token}", "Content-Type": "application/json"}

    # 2. Issue Robert Evans certificate
    cert_id = f"DEMO-ROBERT-2026-{uuid.uuid4().hex[:6]}"
    payload = {
        "certificate": {
            "certificate_id": cert_id,
            "student_name": "Robert Evans",
            "roll_number": "DEMO-ROLL-ROBERT-001",
            "student_email": "robert.evans@chaincert.local",
            "course": "Bachelor of Technology in Artificial Intelligence",
            "cgpa": "9.40",
            "issue_date": "2026-08-20",
            "institution_id": "1"
        }
    }
    res_issue = client.post("/api/v1/certificates", json=payload, headers=headers)
    assert res_issue.status_code == 201
    cert_data = res_issue.get_json()["certificate"]
    assert cert_data["certificate_id"] == cert_id
    assert cert_data["student_name"] == "Robert Evans"

    # 3. Login as Robert Evans
    res_robert = client.post("/api/v1/auth/login", json={
        "email": "robert.evans@chaincert.local",
        "password": "RobertEvans123"
    })
    assert res_robert.status_code == 200
    robert_data = res_robert.get_json()
    assert robert_data["user"]["role"] == "STUDENT"
    assert robert_data["user"]["roll_number"] == "DEMO-ROLL-ROBERT-001"
    robert_token = robert_data["access_token"]
    robert_headers = {"Authorization": f"Bearer {robert_token}"}

    # 4. Robert sees his certificate immediately
    res_robert_certs = client.get("/api/v1/students/me/certificates", headers=robert_headers)
    assert res_robert_certs.status_code == 200
    robert_certs = res_robert_certs.get_json()["certificates"]
    assert any(c["certificate_id"] == cert_id for c in robert_certs)

    # 5. Robert certificate detail
    res_detail = client.get(f"/api/v1/students/me/certificates/{cert_id}", headers=robert_headers)
    assert res_detail.status_code == 200
    assert res_detail.get_json()["certificate"]["certificate_id"] == cert_id

    # 6. Another student (Alice) cannot see Robert's certificate
    res_alice = client.post("/api/v1/auth/login", json={
        "email": "alice@chaincert.local",
        "password": "AliceExample123"
    })
    assert res_alice.status_code == 200
    alice_token = res_alice.get_json()["access_token"]
    alice_headers = {"Authorization": f"Bearer {alice_token}"}

    res_alice_certs = client.get("/api/v1/students/me/certificates", headers=alice_headers)
    assert res_alice_certs.status_code == 200
    alice_certs = res_alice_certs.get_json()["certificates"]
    assert not any(c["certificate_id"] == cert_id for c in alice_certs)

    res_alice_detail = client.get(f"/api/v1/students/me/certificates/{cert_id}", headers=alice_headers)
    assert res_alice_detail.status_code == 403


def test_dashboard_stats_endpoints(client):
    # Institution stats
    res_inst = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res_inst.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res_stats = client.get("/api/v1/institution/stats", headers=headers)
    assert res_stats.status_code == 200
    data = res_stats.get_json()
    assert data["success"] is True
    assert "total_registered" in data
    assert "issued_credentials" in data
    assert "valid_credentials" in data
    assert "revoked_credentials" in data

    # Student stats
    res_robert = client.post("/api/v1/auth/login", json={
        "email": "robert.evans@chaincert.local",
        "password": "RobertEvans123"
    })
    r_token = res_robert.get_json()["access_token"]
    r_headers = {"Authorization": f"Bearer {r_token}"}

    res_r_stats = client.get("/api/v1/students/me/stats", headers=r_headers)
    assert res_r_stats.status_code == 200
    r_data = res_r_stats.get_json()
    assert r_data["success"] is True
    assert r_data["total_credentials"] >= 1
    assert r_data["valid_credentials"] >= 1


def test_verification_decision_rules(client):
    # Create baseline certificate
    res_inst = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res_inst.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    cid = f"TEST-DECISION-{uuid.uuid4().hex[:6]}"
    base_payload = {
        "certificate_id": cid,
        "student_name": "Robert Evans",
        "roll_number": "DEMO-ROLL-ROBERT-001",
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.40",
        "issue_date": "2026-08-20",
        "institution_id": "1"
    }
    res_reg = client.post("/api/v1/certificates", json={"certificate": base_payload}, headers=headers)
    assert res_reg.status_code == 201

    # Case A: Genuine
    res_gen = client.post("/api/v1/verify", json={"certificate_id": cid, "fields": {
        "certificate_id": cid,
        "student_name": "Robert Evans",
        "roll_number": "DEMO-ROLL-ROBERT-001",
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.40",
        "issue_date": "2026-08-20",
        "institution_id": "MMCOE"
    }})
    assert res_gen.status_code == 200
    assert res_gen.get_json()["status"] == "GENUINE"

    # Case B1: Confirmed field tampering (CGPA 9.90 instead of 9.40)
    res_tamper_cgpa = client.post("/api/v1/verify", json={"certificate_id": cid, "fields": {
        "certificate_id": cid,
        "student_name": "Robert Evans",
        "roll_number": "DEMO-ROLL-ROBERT-001",
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.90",
        "issue_date": "2026-08-20",
        "institution_id": "MMCOE"
    }})
    assert res_tamper_cgpa.status_code == 200
    t_data = res_tamper_cgpa.get_json()
    assert t_data["status"] == "TAMPERED"
    assert "cgpa" in t_data.get("mismatched_fields", [])

    # Case B2: Confirmed field tampering (student name)
    res_tamper_name = client.post("/api/v1/verify", json={"certificate_id": cid, "fields": {
        "certificate_id": cid,
        "student_name": "Fake Student Name",
        "roll_number": "DEMO-ROLL-ROBERT-001",
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.40",
        "issue_date": "2026-08-20",
        "institution_id": "MMCOE"
    }})
    assert res_tamper_name.status_code == 200
    assert res_tamper_name.get_json()["status"] == "TAMPERED"
    assert "student_name" in res_tamper_name.get_json().get("mismatched_fields", [])

    # Case B3: Confirmed field tampering (roll number)
    res_tamper_roll = client.post("/api/v1/verify", json={"certificate_id": cid, "fields": {
        "certificate_id": cid,
        "student_name": "Robert Evans",
        "roll_number": "FAKE-ROLL-999",
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.40",
        "issue_date": "2026-08-20",
        "institution_id": "MMCOE"
    }})
    assert res_tamper_roll.status_code == 200
    assert res_tamper_roll.get_json()["status"] == "TAMPERED"
    assert "roll_number" in res_tamper_roll.get_json().get("mismatched_fields", [])

    # Case C: Uncertain extraction (missing field with no confirmed mismatch)
    res_uncertain = client.post("/api/v1/verify", json={"certificate_id": cid, "fields": {
        "certificate_id": cid,
        "student_name": "Robert Evans",
        # roll_number missing
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.40",
        "issue_date": "2026-08-20",
        "institution_id": "MMCOE"
    }})
    assert res_uncertain.status_code == 200
    assert res_uncertain.get_json()["status"] == "REVIEW_REQUIRED"

    # Case D: Unknown certificate
    res_unknown = client.post("/api/v1/verify", json={"certificate_id": "UNKNOWN-NOT-FOUND-999"})
    assert res_unknown.status_code == 200
    assert res_unknown.get_json()["status"] == "NOT_FOUND"

    # Case E: Revoked credential
    client.post(f"/api/v1/certificates/{cid}/revoke", json={"reason": "Academic Ethics Review"}, headers=headers)
    res_revoked = client.post("/api/v1/verify", json={"certificate_id": cid})
    assert res_revoked.status_code == 200
    assert res_revoked.get_json()["status"] == "REVOKED"


# ---------------------------------------------------------------------------
# Section 21 & Workflow Comprehensive Integration Tests (Priya & Neha)
# ---------------------------------------------------------------------------

import io
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "certificates"


def _ensure_priya_certificate_registered(client):
    """Helper to ensure Priya Sharma's certificate is registered and active."""
    import sqlite3
    from chaincert.records.database import DEFAULT_DB_PATH
    with sqlite3.connect(DEFAULT_DB_PATH) as con:
        con.execute("UPDATE certificates SET status='REGISTERED', revocation_reason=NULL, revoked_at=NULL WHERE certificate_id='CC-PRIYA-2026-001'")
        con.commit()

    res_login = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res_login.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    cert_payload = {
        "certificate": {
            "certificate_id": "CC-PRIYA-2026-001",
            "student_name": "Priya Sharma",
            "roll_number": "AD2026-001",
            "course": "B.Tech Artificial Intelligence and Data Science",
            "cgpa": "9.40",
            "issue_date": "2026-10-23",
            "institution_id": "MMCOE",
            "student_email": "priya.sharma@chaincert.local"
        }
    }
    client.post("/api/v1/certificates", json=cert_payload, headers=headers)
    return headers


def test_genuine_document_verification(client):
    """Test genuine document upload returns GENUINE status with matching fields."""
    _ensure_priya_certificate_registered(client)

    pdf_path = FIXTURES_DIR / "priya_genuine.pdf"
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    res = client.post(
        "/api/v1/verification/verify-upload",
        data={"document": (io.BytesIO(pdf_bytes), "priya_genuine.pdf")},
        content_type="multipart/form-data"
    )
    assert res.status_code == 200
    genuine_result = res.get_json()
    assert genuine_result["success"] is True
    assert genuine_result["status"] == "GENUINE"
    assert genuine_result["certificate_id"] == "CC-PRIYA-2026-001"
    assert genuine_result["checks"]["fields_match"] is True
    assert genuine_result["checks"]["input_valid"] is True


def test_tampered_cgpa_detection(client):
    """Test tampered document (CGPA 9.90 vs 9.40) deterministically returns TAMPERED with mismatch values."""
    _ensure_priya_certificate_registered(client)

    pdf_path = FIXTURES_DIR / "priya_tampered_cgpa.pdf"
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    res = client.post(
        "/api/v1/verification/verify-upload",
        data={"document": (io.BytesIO(pdf_bytes), "priya_tampered_cgpa.pdf")},
        content_type="multipart/form-data"
    )
    assert res.status_code == 200
    tampered_result = res.get_json()
    assert tampered_result["success"] is True
    assert tampered_result["status"] == "TAMPERED"
    assert "cgpa" in tampered_result["mismatches"]
    assert tampered_result["mismatches"]["cgpa"]["expected"] == "9.40"
    assert tampered_result["mismatches"]["cgpa"]["actual"] == "9.90"


def test_unknown_certificate(client):
    """Test unknown document upload returns NOT_FOUND rather than REVIEW_REQUIRED."""
    pdf_path = FIXTURES_DIR / "priya_unknown.pdf"
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    res = client.post(
        "/api/v1/verification/verify-upload",
        data={"document": (io.BytesIO(pdf_bytes), "priya_unknown.pdf")},
        content_type="multipart/form-data"
    )
    assert res.status_code == 200
    unknown_result = res.get_json()
    assert unknown_result["success"] is True
    assert unknown_result["status"] == "NOT_FOUND"
    assert unknown_result["certificate_id"] == "CC-UNKNOWN-2026-999"


def test_revoked_certificate(client):
    """Test revoking certificate causes subsequent verification to return REVOKED."""
    headers = _ensure_priya_certificate_registered(client)

    # Revoke
    res_revoke = client.post(
        "/api/v1/certificates/CC-PRIYA-2026-001/revoke",
        json={"reason": "Degree Revocation - Honor Code Violation"},
        headers=headers
    )
    assert res_revoke.status_code == 200
    assert res_revoke.get_json()["status"] == "REVOKED"

    # Verify upload of genuine document
    pdf_path = FIXTURES_DIR / "priya_genuine.pdf"
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    res_verify = client.post(
        "/api/v1/verification/verify-upload",
        data={"document": (io.BytesIO(pdf_bytes), "priya_genuine.pdf")},
        content_type="multipart/form-data"
    )
    assert res_verify.status_code == 200
    revoked_result = res_verify.get_json()
    assert revoked_result["status"] == "REVOKED"
    assert "revocation_reason" in revoked_result["certificate"]


def test_missing_required_field(client):
    """Test incomplete fields return REVIEW_REQUIRED."""
    res_login = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res_login.get_json()["access_token"]
    inst_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    cid = "CC-PRIYA-ACTIVE-TEST-001"
    client.post("/api/v1/certificates", json={
        "certificate": {
            "certificate_id": cid,
            "student_name": "Priya Sharma",
            "roll_number": "AD2026-001",
            "course": "B.Tech Artificial Intelligence and Data Science",
            "cgpa": "9.40",
            "issue_date": "2026-10-23",
            "institution_id": "MMCOE"
        }
    }, headers=inst_headers)

    res = client.post("/api/v1/verify", json={
        "certificate_id": cid,
        "fields": {
            "certificate_id": cid,
            "student_name": "Priya Sharma",
            # roll_number missing
            # cgpa missing
            "course": "B.Tech Artificial Intelligence and Data Science",
            "issue_date": "2026-10-23",
            "institution_id": "MMCOE"
        }
    })
    assert res.status_code == 200
    res_data = res.get_json()
    assert res_data["status"] == "REVIEW_REQUIRED"
    assert "missing_fields" in res_data["checks"]


def test_student_certificate_isolation(client):
    """Test Priya can view her certificate, while Neha is completely isolated and cannot."""
    # Ensure fresh certificate
    res_login = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res_login.get_json()["access_token"]
    inst_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    cid = "CC-PRIYA-ISOLATION-001"
    client.post("/api/v1/certificates", json={
        "certificate": {
            "certificate_id": cid,
            "student_name": "Priya Sharma",
            "roll_number": "AD2026-001",
            "course": "B.Tech Artificial Intelligence and Data Science",
            "cgpa": "9.40",
            "issue_date": "2026-10-23",
            "institution_id": "MMCOE",
            "student_email": "priya.sharma@chaincert.local"
        }
    }, headers=inst_headers)

    # 1. Login as Priya
    res_priya = client.post("/api/v1/auth/login", json={
        "email": "priya.sharma@chaincert.local",
        "password": "PriyaStudent123"
    })
    assert res_priya.status_code == 200
    priya_token = res_priya.get_json()["access_token"]

    # Priya sees her certificate
    res_priya_certs = client.get(
        "/api/v1/students/me/certificates",
        headers={"Authorization": f"Bearer {priya_token}"}
    )
    assert res_priya_certs.status_code == 200
    priya_cids = [c["certificate_id"] for c in res_priya_certs.get_json()["certificates"]]
    assert cid in priya_cids

    # 2. Login as Neha
    res_neha = client.post("/api/v1/auth/login", json={
        "email": "neha.patil@chaincert.local",
        "password": "NehaStudent123"
    })
    assert res_neha.status_code == 200
    neha_token = res_neha.get_json()["access_token"]

    # Neha cannot see Priya's certificate
    res_neha_certs = client.get(
        "/api/v1/students/me/certificates",
        headers={"Authorization": f"Bearer {neha_token}"}
    )
    assert res_neha_certs.status_code == 200
    neha_cids = [c["certificate_id"] for c in res_neha_certs.get_json()["certificates"]]
    assert cid not in neha_cids

    # Neha directly requesting detail of Priya's certificate receives 403 Forbidden
    res_neha_detail = client.get(
        f"/api/v1/students/me/certificates/{cid}",
        headers={"Authorization": f"Bearer {neha_token}"}
    )
    assert res_neha_detail.status_code == 403


def test_institution_authorization(client):
    """Test RBAC authorization preventing students from accessing institution-only endpoints."""
    # Login as student
    res_login = client.post("/api/v1/auth/login", json={
        "email": "priya.sharma@chaincert.local",
        "password": "PriyaStudent123"
    })
    token = res_login.get_json()["access_token"]
    student_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Attempt to register certificate as student -> 403
    res_forbidden = client.post("/api/v1/certificates", json={
        "certificate": {
            "certificate_id": "UNAUTHORIZED-001",
            "student_name": "Test",
            "roll_number": "ROLL-01",
            "course": "Engineering",
            "cgpa": "8.00",
            "issue_date": "2026-10-23",
            "institution_id": "MMCOE"
        }
    }, headers=student_headers)
    assert res_forbidden.status_code == 403

    # Unauthenticated request -> 401
    res_unauth = client.post("/api/v1/certificates", json={})
    assert res_unauth.status_code == 401


def test_certificate_hash_integrity(client):
    """Test canonical certificate SHA-256 fingerprint generation."""
    from chaincert.hashing import hash_certificate, canonicalize_certificate

    cert_data = {
        "certificate_id": "CC-PRIYA-2026-001",
        "student_name": "Priya Sharma",
        "roll_number": "AD2026-001",
        "course": "B.Tech Artificial Intelligence and Data Science",
        "cgpa": "9.40",
        "issue_date": "2026-10-23",
        "institution_id": "MMCOE"
    }
    canon = canonicalize_certificate(cert_data)
    assert "certificate_id=CC-PRIYA-2026-001" in canon
    assert "cgpa=9.40" in canon

    h = hash_certificate(cert_data)
    assert len(h.certificate_hash) == 64
    assert all(c in "0123456789abcdef" for c in h.certificate_hash)


def test_merkle_proof_validation(client):
    """Test Merkle tree construction and proof verification."""
    from chaincert.merkle import build_merkle_tree, generate_proof_for_hash, verify_merkle_proof
    from chaincert.hashing import generate_sha256

    leaves = [generate_sha256(f"leaf_{i}") for i in range(4)]
    tree = build_merkle_tree(leaves)
    assert tree.merkle_root is not None
    assert len(tree.merkle_root) == 64

    # Verify proof for leaf 0
    proof = generate_proof_for_hash(tree, leaves[0])
    valid = verify_merkle_proof(leaves[0], proof, tree.merkle_root)
    assert valid is True

    # Tampered leaf proof fails
    invalid = verify_merkle_proof(generate_sha256("tampered_leaf"), proof, tree.merkle_root)
    assert invalid is False


