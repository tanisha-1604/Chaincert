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


def test_full_certificate_lifecycle_and_verification_workflow(client):
    # 1. Institution login
    res_login = client.post("/api/v1/auth/login", json={
        "email": "institute@chaincert.local",
        "password": "Institute12345"
    })
    token = res_login.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Register new certificate
    cert_id = "DEMO-CC-2026-API-001"
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
