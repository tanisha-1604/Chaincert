"""
SQLite Database Engine for Module 1 (Certificate & Record Management).

Manages storage of academic credentials, Module 2 hashes, Module 3 Merkle roots/proofs,
and Module 4 batch links.
"""

import sqlite3
import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

from chaincert.hashing import hash_certificate
from chaincert.hashing.validator import validate_certificate_data
from chaincert.hashing.exceptions import CertificateValidationError
from chaincert.merkle import build_merkle_tree, generate_proof_for_hash, proof_to_dicts

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "chaincert.db"


def get_db_path(db_path: Optional[str] = None) -> Path:
    """Return resolved database path."""
    if db_path:
        p = Path(db_path)
    else:
        p = DEFAULT_DB_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Get SQLite database connection with row factory configured."""
    conn = sqlite3.connect(get_db_path(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize database tables if they do not exist."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    # Certificates table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            certificate_id TEXT UNIQUE NOT NULL,
            student_name TEXT NOT NULL,
            roll_number TEXT NOT NULL,
            course TEXT NOT NULL,
            cgpa TEXT NOT NULL,
            issue_date TEXT NOT NULL,
            institution_id TEXT NOT NULL,
            status TEXT DEFAULT 'REGISTERED',
            canonical_data TEXT,
            certificate_hash TEXT,
            batch_id TEXT,
            merkle_root TEXT,
            merkle_proof TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Batches table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS batches (
            batch_id TEXT PRIMARY KEY,
            certificate_count INTEGER NOT NULL,
            merkle_root TEXT NOT NULL,
            block_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Lightweight additive migration for Module 6 revocation metadata and student association.
    existing_columns = {row[1] for row in cursor.execute("PRAGMA table_info(certificates)").fetchall()}
    if "revocation_reason" not in existing_columns:
        cursor.execute("ALTER TABLE certificates ADD COLUMN revocation_reason TEXT")
    if "revoked_at" not in existing_columns:
        cursor.execute("ALTER TABLE certificates ADD COLUMN revoked_at TEXT")
    if "student_user_id" not in existing_columns:
        cursor.execute("ALTER TABLE certificates ADD COLUMN student_user_id INTEGER")
    if "student_email" not in existing_columns:
        cursor.execute("ALTER TABLE certificates ADD COLUMN student_email TEXT")

    conn.commit()
    conn.close()


def add_certificate(cert_data: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Validate, add a new certificate record to SQLite database, and automatically call
    Module 2 to generate and store its SHA-256 hash.

    Raises:
        CertificateValidationError: If validation fails or certificate_id already exists.
    """
    init_db(db_path)
    canonical_dict, _ = validate_certificate_data(cert_data)

    # Check for existing record
    existing = get_certificate(canonical_dict["certificate_id"], db_path=db_path)
    if existing:
        raise CertificateValidationError(
            f"Certificate ID '{canonical_dict['certificate_id']}' already exists in database."
        )

    # CALL MODULE 2 (Single Source of Truth)
    hash_res = hash_certificate(canonical_dict)

    now = datetime.utcnow().isoformat() + "Z"
    conn = get_connection(db_path)
    cursor = conn.cursor()

    student_user_id = cert_data.get("student_user_id")
    student_email = cert_data.get("student_email")

    cursor.execute("""
        INSERT INTO certificates (
            certificate_id, student_name, roll_number, course, cgpa, issue_date,
            institution_id, status, canonical_data, certificate_hash, created_at, updated_at,
            student_user_id, student_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        canonical_dict["certificate_id"],
        canonical_dict["student_name"],
        canonical_dict["roll_number"],
        canonical_dict["course"],
        canonical_dict["cgpa"],
        canonical_dict["issue_date"],
        canonical_dict["institution_id"],
        "REGISTERED",
        hash_res.canonical_data,
        hash_res.certificate_hash,
        now,
        now,
        student_user_id,
        student_email
    ))

    conn.commit()
    conn.close()

    return get_certificate(canonical_dict["certificate_id"], db_path=db_path)


def get_certificate(certificate_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve certificate record by Certificate ID."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM certificates WHERE certificate_id = ?", (certificate_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    res = dict(row)
    if res.get("merkle_proof"):
        try:
            res["merkle_proof_parsed"] = json.loads(res["merkle_proof"])
        except Exception:
            res["merkle_proof_parsed"] = None
    return res


def list_certificates(batch_id: Optional[str] = None, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """List certificates in database, optionally filtered by batch_id."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    if batch_id:
        cursor.execute("SELECT * FROM certificates WHERE batch_id = ? ORDER BY id ASC", (batch_id,))
    else:
        cursor.execute("SELECT * FROM certificates ORDER BY id ASC")

    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        d = dict(r)
        if d.get("merkle_proof"):
            try:
                d["merkle_proof_parsed"] = json.loads(d["merkle_proof"])
            except Exception:
                d["merkle_proof_parsed"] = None
        results.append(d)
    return results


def update_certificate(certificate_id: str, updates: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Update certificate attributes (e.g. CGPA, Name) and re-invoke Module 2
    hashing engine to update the canonical_data and certificate_hash.
    """
    init_db(db_path)
    current = get_certificate(certificate_id, db_path=db_path)
    if not current:
        raise CertificateValidationError(f"Certificate ID '{certificate_id}' not found.")

    merged = current.copy()
    merged.update(updates)

    canonical_dict, _ = validate_certificate_data(merged)

    # Re-call Module 2
    hash_res = hash_certificate(canonical_dict)
    now = datetime.utcnow().isoformat() + "Z"

    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE certificates SET
            student_name = ?,
            roll_number = ?,
            course = ?,
            cgpa = ?,
            issue_date = ?,
            institution_id = ?,
            canonical_data = ?,
            certificate_hash = ?,
            updated_at = ?
        WHERE certificate_id = ?
    """, (
        canonical_dict["student_name"],
        canonical_dict["roll_number"],
        canonical_dict["course"],
        canonical_dict["cgpa"],
        canonical_dict["issue_date"],
        canonical_dict["institution_id"],
        hash_res.canonical_data,
        hash_res.certificate_hash,
        now,
        certificate_id
    ))

    conn.commit()
    conn.close()

    return get_certificate(certificate_id, db_path=db_path)


def assign_batch_and_proofs(
    batch_id: str,
    merkle_root: str,
    proof_map: Dict[str, List[Dict[str, str]]],
    db_path: Optional[str] = None
) -> None:
    """
    Store batch assignment, Merkle Root, and Merkle Proofs for a set of certificates.
    `proof_map` maps `certificate_id` -> list of proof step dicts.
    """
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"

    for cert_id, proof_steps in proof_map.items():
        proof_json = json.dumps(proof_steps)
        cursor.execute("""
            UPDATE certificates SET
                batch_id = ?,
                merkle_root = ?,
                merkle_proof = ?,
                status = 'BATCHED',
                updated_at = ?
            WHERE certificate_id = ?
        """, (batch_id, merkle_root, proof_json, now, cert_id))

    # Also record batch in batches table
    cursor.execute("""
        INSERT OR REPLACE INTO batches (batch_id, certificate_count, merkle_root, created_at)
        VALUES (?, ?, ?, ?)
    """, (batch_id, len(proof_map), merkle_root, now))

    conn.commit()
    conn.close()


def update_batch_block_id(batch_id: str, block_id: int, db_path: Optional[str] = None) -> None:
    """Update block_id for a batch after Module 4 block creation."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("UPDATE batches SET block_id = ? WHERE batch_id = ?", (block_id, batch_id))
    cursor.execute("UPDATE certificates SET status = 'CHAINED' WHERE batch_id = ?", (batch_id,))

    conn.commit()
    conn.close()


def delete_certificate(certificate_id: str, db_path: Optional[str] = None) -> bool:
    """Delete a certificate record by ID."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM certificates WHERE certificate_id = ?", (certificate_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def clear_database(db_path: Optional[str] = None) -> None:
    """Clear all records from database (for tests/reset)."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM certificates;")
    cursor.execute("DELETE FROM batches;")
    conn.commit()
    conn.close()


def issue_single_certificate_flow(
    cert_data: Dict[str, Any],
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    End-to-end flow for issuing a single certificate:
    1. Add certificate data and generate hash (Module 2).
    2. Assign to batch, generate Merkle proof (Module 3).
    3. Update batch with block ID (Module 4).
    """
    # Step 1: Add certificate and generate hash
    cert_record = add_certificate(cert_data, db_path=db_path)
    certificate_id = cert_record["certificate_id"]

    # Step 2: Generate Merkle proof and assign batch
    batch_id = "batch_" + certificate_id.split("_")[-1]  # Simple batch ID scheme
    merkle_root, proof_map = None, {}
    try:
        # Create a Merkle tree with the certificate hash
        leaves = [cert_record["certificate_hash"]]
        merkle_root, _ = build_merkle_tree(leaves)
        proof_map[certificate_id] = proof_to_dicts(generate_proof_for_hash(leaves, cert_record["certificate_hash"]))
    except Exception as e:
        raise CertificateValidationError(f"Merkle proof generation failed: {str(e)}")

    assign_batch_and_proofs(batch_id, merkle_root, proof_map, db_path=db_path)

    # Step 3: Update batch with block ID (simulated as incremental)
    block_id = 1  # In real scenario, this would be the actual block ID from the blockchain
    update_batch_block_id(batch_id, block_id, db_path=db_path)

    return get_certificate(certificate_id, db_path=db_path)


def issue_certificate(
    cert_data: Dict[str, Any],
    *,
    db_path: Optional[str] = None,
    chain: Optional[Any] = None,
    batch_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist a certificate and immediately attach it to a single-certificate batch.

    This creates the real issuance lifecycle used by the application: certificate
    record -> SHA-256 hash -> batch Merkle root -> proof -> chain block.
    """
    record = add_certificate(cert_data, db_path=db_path)
    if record is None:
        raise CertificateValidationError("Certificate registration failed before persistence.")

    try:
        leaf_hash = record["certificate_hash"]
        tree = build_merkle_tree([leaf_hash])
        proof = generate_proof_for_hash(tree, leaf_hash)
        chosen_batch_id = batch_id or f"BATCH-{record['certificate_id']}"
        proof_map = {record["certificate_id"]: proof_to_dicts(proof)}
        assign_batch_and_proofs(chosen_batch_id, tree.merkle_root, proof_map, db_path=db_path)

        if chain is not None:
            block = chain.add_batch(
                batch_id=chosen_batch_id,
                merkle_root=tree.merkle_root,
                certificate_count=1,
            )
            update_batch_block_id(chosen_batch_id, block.block_id, db_path=db_path)

        final_record = get_certificate(record["certificate_id"], db_path=db_path)
        if final_record is None:
            raise CertificateValidationError("Certificate was not retrievable after lifecycle creation.")
        return final_record
    except Exception:
        try:
            delete_certificate(record["certificate_id"], db_path=db_path)
        except Exception:
            pass
        raise
