"""Comprehensive automated test suite for ChainCert backend & cryptography.

Tests:
1. Access control & authentication (institution, student, admin, wrong credentials)
2. Canonicalization & hashing determinism (Module 2)
3. Merkle tree & Merkle proof verification (Module 3)
4. Local hash-linked chain block creation & chain validation (Module 4)
5. Certificate registration & lifecycle issuance (Module 1-4)
6. Verification: GENUINE, TAMPERED, NOT_FOUND, REVOKED (Module 5)
"""

import os
import tempfile
import pytest
from pathlib import Path

from chaincert.auth import AccessControlService, Role, AuthenticationError
from chaincert.hashing import hash_certificate
from chaincert.merkle import (
    build_merkle_tree,
    generate_proof_for_hash,
    verify_merkle_proof,
    proof_to_dicts,
)
from chaincert.chain import Chain
from chaincert.records import (
    init_db,
    issue_certificate,
)
from chaincert.verification import VerificationEngine
from chaincert.verification.models import VerificationStatus


@pytest.fixture
def temp_dir():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        yield Path(td)


def test_auth_lifecycle(temp_dir):
    db_path = str(temp_dir / "auth_test.db")
    secret = "test-secret-at-least-32-characters-long-2026"
    access = AccessControlService(db_path, secret)

    inst_id = access.create_institution("MMCOE")
    assert inst_id > 0

    # 1. Bootstrap platform admin
    admin_id = access.provision_user(
        email="admin@test.local",
        display_name="Test Admin",
        password="AdminPassword12345",
        role=Role.PLATFORM_ADMIN,
        institution_id=None,
    )
    assert admin_id > 0

    # 2. Login as admin
    token = access.login("admin@test.local", "AdminPassword12345")
    assert token
    actor = access.authenticate(token)
    assert actor.email == "admin@test.local"
    assert actor.role == Role.PLATFORM_ADMIN

    # 3. Provision institution admin & student
    inst_admin_id = access.provision_user(
        email="inst@test.local",
        display_name="Test Registrar",
        password="InstPassword12345",
        role=Role.INSTITUTION_ADMIN,
        institution_id=inst_id,
        actor=actor,
    )
    assert inst_admin_id > 0

    student_id = access.provision_user(
        email="student@test.local",
        display_name="Alice Example",
        password="StudentPassword12345",
        role=Role.STUDENT,
        institution_id=inst_id,
        actor=actor,
    )
    assert student_id > 0

    access.logout(token)

    # 4. Failed login
    with pytest.raises(AuthenticationError):
        access.login("admin@test.local", "WrongPassword123")


def test_canonicalization_and_hashing():
    raw_cert = {
        "certificate_id": "TEST-CC-001",
        "student_name": "Alice Example",
        "roll_number": "ROLL-001",
        "course": "Bachelor of Technology in AI",
        "cgpa": "9.80",
        "issue_date": "2026-10-23",
        "institution_id": "MMCOE",
    }

    res1 = hash_certificate(raw_cert)
    res2 = hash_certificate(raw_cert)

    # Determinism
    assert res1.certificate_hash == res2.certificate_hash
    assert len(res1.certificate_hash) == 64  # SHA-256 hex string

    # CGPA sensitivity
    tampered_cert = dict(raw_cert, cgpa="9.99")
    tampered_res = hash_certificate(tampered_cert)
    assert tampered_res.certificate_hash != res1.certificate_hash


def test_merkle_tree_and_proofs():
    hashes = [
        "a" * 64,
        "b" * 64,
        "c" * 64,
        "d" * 64,
    ]
    tree = build_merkle_tree(hashes)
    assert tree.merkle_root
    assert len(tree.merkle_root) == 64

    # Generate proof for the second hash
    target_hash = hashes[1]
    proof = generate_proof_for_hash(tree, target_hash)
    proof_dicts = proof_to_dicts(proof)

    # Verify proof against root
    is_valid = verify_merkle_proof(target_hash, proof_dicts, tree.merkle_root)
    assert is_valid is True

    # Tampered hash must fail
    fake_hash = "f" * 64
    assert verify_merkle_proof(fake_hash, proof_dicts, tree.merkle_root) is False


def test_chain_block_linkage(temp_dir):
    chain_file = temp_dir / "chain.json"
    chain = Chain(storage_path=chain_file, autoload=False)

    root1 = "1" * 64
    root2 = "2" * 64

    b1 = chain.add_batch(batch_id="BATCH-001", merkle_root=root1, certificate_count=1)
    b2 = chain.add_batch(batch_id="BATCH-002", merkle_root=root2, certificate_count=1)

    assert b1.block_id == 1
    assert b2.block_id == 2
    assert b2.previous_root == b1.merkle_root
    assert b2.block_hash
    assert len(b2.block_hash) == 64

    val = chain.validate_chain()
    assert val.is_valid is True
    assert len(val.errors) == 0


def test_certificate_issuance_and_verification_states(temp_dir):
    db_file = str(temp_dir / "test_certs.db")
    chain_file = temp_dir / "test_chain.json"
    init_db(db_file)
    chain = Chain(storage_path=chain_file, autoload=False)

    cert_data = {
        "certificate_id": "CERT-E2E-001",
        "student_name": "Alice Example",
        "roll_number": "DEMO-ROLL-001",
        "course": "Bachelor of Technology in Artificial Intelligence",
        "cgpa": "9.80",
        "issue_date": "2026-10-23",
        "institution_id": "MMCOE",
    }

    # 1. Issue certificate into SQLite & chain
    record = issue_certificate(cert_data, db_path=db_file, chain=chain)
    assert record["certificate_id"] == "CERT-E2E-001"
    assert record["status"] in ("REGISTERED", "CHAINED")
    assert record["certificate_hash"]
    assert record["merkle_root"]
    assert record["batch_id"]

    engine = VerificationEngine(chain=chain)

    # 2. Test GENUINE verification
    genuine_res = engine.verify(cert_data, record)
    assert genuine_res.status == VerificationStatus.GENUINE
    assert genuine_res.checks["fields_match"] is True
    assert genuine_res.checks["chain_valid"] is True

    # 3. Test TAMPERED verification (CGPA modified from 9.80 to 9.99)
    tampered_data = dict(cert_data, cgpa="9.99")
    tampered_res = engine.verify(tampered_data, record)
    assert tampered_res.status == VerificationStatus.TAMPERED
    assert "cgpa" in tampered_res.mismatched_fields

    # 4. Test NOT_FOUND
    unknown_res = engine.verify({"certificate_id": "UNKNOWN-999"}, None)
    assert unknown_res.status == VerificationStatus.NOT_FOUND

    # 5. Test REVOKED
    revoked_record = dict(record, status="REVOKED", revocation_reason="Integrity violation")
    revoked_res = engine.verify(cert_data, revoked_record)
    assert revoked_res.status == VerificationStatus.REVOKED
