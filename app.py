"""
ChainCert Flask Web Dashboard Application.

Integrates Module 1 (Records), Module 2 (Hashing), Module 3 (Merkle Tree), and Module 4 (Block Chaining).
"""

import os
import sys
import dataclasses
from pathlib import Path

# Load local .env configuration when python-dotenv is installed.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

# Add vendor_packages to sys.path if present
vendor_pkg_path = Path(__file__).resolve().parent / "vendor_packages"
if vendor_pkg_path.exists() and str(vendor_pkg_path) not in sys.path:
    sys.path.insert(0, str(vendor_pkg_path))

from flask import Flask, render_template, request, redirect, url_for, flash

from chaincert.records import (
    init_db,
    add_certificate,
    get_certificate,
    list_certificates,
    update_certificate,
    assign_batch_and_proofs,
    update_batch_block_id,
    parse_certificate_text,
    parse_certificate_file,
    clear_database,
)
from chaincert.hashing import (
    hash_certificate,
    canonicalize_certificate,
    compare_hashes,
    compute_avalanche_effect,
    format_avalanche_report,
    CertificateValidationError,
)
from chaincert.merkle import (
    build_merkle_tree,
    generate_proof_for_hash,
    verify_merkle_proof,
    proof_to_dicts,
)
from chaincert.chain import Chain

app = Flask(__name__)
app.secret_key = os.environ.get("CHAINCERT_SECRET_KEY", "dev-only-change-this-chaincert-secret-key-2026")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Persistent Chain storage
CHAIN_STORAGE_PATH = Path(__file__).resolve().parent / "data" / "chain.json"
chain_instance = Chain(storage_path=CHAIN_STORAGE_PATH, autoload=True)

# Ensure DB initialized
init_db()

# API services are kept in the Flask extension registry so routes share the same
# persistent backend state as the existing Module 1–4 application.
from chaincert.auth import AccessControlService
from chaincert.ingestion import ExtractionService
from chaincert.verification import VerificationEngine, VerificationHistory
from chaincert.api import api_bp

DATA_DIR = Path(__file__).resolve().parent / "data"
ACCESS_DB_PATH = DATA_DIR / "access_control.db"
INGESTION_DB_PATH = DATA_DIR / "ingestion.db"
TOKEN_SECRET = os.environ.get("CHAINCERT_TOKEN_SECRET", "dev-only-change-this-token-secret-chaincert-2026-keep-it-long")
app.extensions["chaincert_services"] = {
    "access": AccessControlService(str(ACCESS_DB_PATH), TOKEN_SECRET),
    "extractor": ExtractionService(str(INGESTION_DB_PATH)),
    "verification": VerificationEngine(chain_instance),
    "history": VerificationHistory(str(Path(__file__).resolve().parent / "data" / "chaincert.db")),
    "certificate_db": str(Path(__file__).resolve().parent / "data" / "chaincert.db"),
    "max_upload_bytes": 10 * 1024 * 1024,
}
app.extensions["chaincert_services"]["chain"] = chain_instance
app.register_blueprint(api_bp)

from werkzeug.exceptions import RequestEntityTooLarge

@app.errorhandler(RequestEntityTooLarge)
def upload_too_large(_error):
    from flask import jsonify
    return jsonify({"success": False, "error": "Upload exceeds the 10 MB limit."}), 413

_ALLOWED_ORIGINS = {origin.strip() for origin in os.environ.get(
    "CHAINCERT_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175"
).split(",") if origin.strip()}

@app.after_request
def add_api_cors_headers(response):
    origin = request.headers.get("Origin")
    if request.path.startswith("/api/") and origin:
        is_allowed = (
            origin in _ALLOWED_ORIGINS
            or "*" in _ALLOWED_ORIGINS
            or origin.startswith("http://localhost:")
            or origin.startswith("http://127.0.0.1:")
        )
        if is_allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
            response.headers["Access-Control-Max-Age"] = "600"
    return response


def ensure_default_accounts():
    """Ensure baseline accounts and institutions exist in access_control.db if empty."""
    try:
        from chaincert.auth import Role
        access = app.extensions["chaincert_services"]["access"]
        with access.store.connect() as con:
            user_count = con.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
            if user_count > 0:
                return
            inst_row = con.execute("SELECT id FROM institutions WHERE name='MMCOE'").fetchone()
            inst_id = inst_row["id"] if inst_row else access.create_institution("MMCOE")

        # Initial platform admin bootstrap
        access.provision_user(
            email="demo.admin@chaincert.local",
            display_name="ChainCert Demo Admin",
            password="ChainCertDemo!2026",
            role=Role.PLATFORM_ADMIN,
            institution_id=None,
        )
        token = access.login("demo.admin@chaincert.local", "ChainCertDemo!2026")
        actor = access.authenticate(token)

        # Baseline accounts documented in README & DEMO_RUNBOOK
        access.provision_user(
            email="institute@chaincert.local",
            display_name="MMCOE Registrar",
            password="Institute12345",
            role=Role.INSTITUTION_ADMIN,
            institution_id=inst_id,
            actor=actor,
        )
        access.provision_user(
            email="issuer@chaincert.local",
            display_name="Demo Issuer",
            password="IssuerDemo!2026",
            role=Role.INSTITUTION_ADMIN,
            institution_id=inst_id,
            actor=actor,
        )
        access.provision_user(
            email="student@chaincert.local",
            display_name="Demo Student",
            password="Student123456",
            role=Role.STUDENT,
            institution_id=inst_id,
            actor=actor,
        )
        access.provision_user(
            email="student@mmcoe.local",
            display_name="Demo Student",
            password="Student123456",
            role=Role.STUDENT,
            institution_id=inst_id,
            actor=actor,
        )
        access.provision_user(
            email="alice@chaincert.local",
            display_name="Alice Example",
            password="AliceExample123",
            role=Role.STUDENT,
            institution_id=inst_id,
            actor=actor,
        )
        access.logout(token)
    except Exception as exc:
        app.logger.warning("ensure_default_accounts skipped: %s", exc)

ensure_default_accounts()



def ensure_sample_certificates():
    """Return the current certificate set without auto-seeding demo records."""
    return list_certificates()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/module1")
def module1():
    certs = list_certificates()
    registered_id = request.args.get("registered_id")
    registered_cert = None
    if registered_id:
        registered_cert = get_certificate(registered_id)
    elif certs:
        registered_cert = certs[-1]
    return render_template("module1.html", certificates=certs, registered_cert=registered_cert)


@app.route("/module1/register", methods=["POST"])
def module1_register():
    cert_id = request.form.get("certificate_id")
    student_name = request.form.get("student_name")
    roll_number = request.form.get("roll_number")
    course = request.form.get("course")
    cgpa = request.form.get("cgpa")
    issue_date = request.form.get("issue_date")
    institution_id = request.form.get("institution_id")

    cert_dict = {
        "certificate_id": cert_id,
        "student_name": student_name,
        "roll_number": roll_number,
        "course": course,
        "cgpa": cgpa,
        "issue_date": issue_date,
        "institution_id": institution_id,
    }

    # Fallback to raw cert_text if form fields were empty
    cert_text = request.form.get("cert_text")
    if cert_text and not cert_id:
        try:
            cert_dict = parse_certificate_text(cert_text)
        except Exception:
            pass

    try:
        stored_rec = add_certificate(cert_dict)
        flash(f"Certificate '{stored_rec['certificate_id']}' registered successfully!", "success")
        return redirect(url_for("module1", registered_id=stored_rec["certificate_id"]))
    except CertificateValidationError as e:
        certs = list_certificates()
        return render_template("module1.html", message=f"Validation Error: {str(e)}", msg_type="danger", certificates=certs, form_data=cert_dict)
    except Exception as e:
        certs = list_certificates()
        return render_template("module1.html", message=f"Error: {str(e)}", msg_type="danger", certificates=certs, form_data=cert_dict)


@app.route("/module1/sample/<int:sample_id>")
def module1_load_sample(sample_id):
    sample_file = Path(__file__).resolve().parent / "test_certificates" / f"certificate{sample_id}.txt"
    form_data = None
    if sample_file.exists():
        form_data = parse_certificate_file(str(sample_file))
    certs = list_certificates()
    return render_template("module1.html", form_data=form_data, certificates=certs)


@app.route("/module2")
def module2():
    certs = ensure_sample_certificates()
    selected_id = request.args.get("cert_id")
    if not selected_id and certs:
        selected_id = certs[0]["certificate_id"]

    selected_cert = get_certificate(selected_id) if selected_id else certs[0]
    hash_result = hash_certificate(selected_cert) if selected_cert else None

    return render_template(
        "module2.html",
        certificates=certs,
        selected_cert=selected_cert,
        hash_result=hash_result,
        selected_id=selected_id
    )


@app.route("/module2/tamper", methods=["POST"])
def module2_tamper():
    cert_id = request.form.get("cert_id", "CC001")
    field_name = request.form.get("field_name", "cgpa")
    new_value = request.form.get("new_value", "9.99")

    cert = get_certificate(cert_id)
    if not cert:
        cert = {
            "certificate_id": "CC001",
            "student_name": "Rahul Sharma",
            "roll_number": "A101",
            "course": "AI & DS",
            "cgpa": "9.20",
            "issue_date": "2026-08-20",
            "institution_id": "MMCOE"
        }

    res_a = hash_certificate(cert)

    tampered_dict = cert.copy()
    tampered_dict[field_name] = new_value
    try:
        res_b = hash_certificate(tampered_dict)
        hash_changed = not compare_hashes(res_a.certificate_hash, res_b.certificate_hash)
        avalanche = compute_avalanche_effect(res_a.certificate_hash, res_b.certificate_hash)

        tamper_result = {
            "hash_a": res_a.certificate_hash,
            "canonical_a": res_a.canonical_data,
            "hash_b": res_b.certificate_hash,
            "canonical_b": res_b.canonical_data,
            "hash_changed": hash_changed,
            "avalanche": avalanche
        }
    except CertificateValidationError as e:
        flash(f"Validation Error in tampered input: {str(e)}", "danger")
        tamper_result = None

    certs = list_certificates()
    return render_template(
        "module2.html",
        certificates=certs,
        selected_cert=cert,
        hash_result=res_a,
        selected_id=cert_id,
        field_name=field_name,
        new_value=new_value,
        tamper_result=tamper_result
    )


@app.route("/module3")
def module3():
    batch_id = request.args.get("batch_id", "SEM1_2026")
    return _render_module3(batch_id)


def _render_module3(batch_id, selected_cert_id=None, proof_verification=None):
    certs = ensure_sample_certificates()

    if batch_id == "ODD_BATCH_2026":
        f5 = Path(__file__).resolve().parent / "test_certificates" / "certificate5.txt"
        if f5.exists() and not get_certificate("CC005"):
            add_certificate(parse_certificate_file(str(f5)))
        certs = list_certificates()

    batch_certs = certs if batch_id == "ODD_BATCH_2026" else certs[:4]
    leaf_hashes = [c["certificate_hash"] for c in batch_certs]

    tree = build_merkle_tree(leaf_hashes)

    # Save proofs for batch in database so M3 -> M4 is saved
    proof_map = {}
    for c in batch_certs:
        p = generate_proof_for_hash(tree, c["certificate_hash"])
        proof_map[c["certificate_id"]] = proof_to_dicts(p)
    assign_batch_and_proofs(batch_id, tree.merkle_root, proof_map)

    batch_cert_ids = [c["certificate_id"] for c in batch_certs]
    if not selected_cert_id and batch_cert_ids:
        selected_cert_id = batch_cert_ids[0]

    return render_template(
        "module3.html",
        batch_id=batch_id,
        tree=tree,
        batch_certs=batch_certs,
        batch_cert_ids=batch_cert_ids,
        selected_cert_id=selected_cert_id,
        proof_verification=proof_verification
    )


@app.route("/module3/build", methods=["POST"])
def module3_build():
    batch_id = request.form.get("selected_batch", "SEM1_2026")
    return _render_module3(batch_id)


@app.route("/module3/verify_proof", methods=["POST"])
def module3_verify_proof():
    batch_id = request.form.get("batch_id", "SEM1_2026")
    selected_cert_id = request.form.get("selected_cert_id", "CC001")

    target_cert = get_certificate(selected_cert_id)
    certs = list_certificates()
    batch_certs = certs if batch_id == "ODD_BATCH_2026" else certs[:4]
    leaf_hashes = [c["certificate_hash"] for c in batch_certs]
    tree = build_merkle_tree(leaf_hashes)

    if target_cert:
        target_hash = target_cert["certificate_hash"]
        proof = generate_proof_for_hash(tree, target_hash)
        is_valid = verify_merkle_proof(target_hash, proof, tree.merkle_root)
        proof_verification = {
            "cert": target_cert,
            "leaf_hash": target_hash,
            "proof_steps": proof_to_dicts(proof),
            "is_valid": is_valid
        }
    else:
        proof_verification = None

    return _render_module3(batch_id, selected_cert_id=selected_cert_id, proof_verification=proof_verification)


@app.route("/module4")
def module4():
    certs = ensure_sample_certificates()

    # If chain is empty, initialize Block 1 from SEM1_2026
    if len(chain_instance) == 0:
        leaf_hashes = [c["certificate_hash"] for c in certs[:4]]
        tree = build_merkle_tree(leaf_hashes)
        b1 = chain_instance.add_batch(batch_id="SEM1_2026", merkle_root=tree.merkle_root, certificate_count=4)
        update_batch_block_id("SEM1_2026", b1.block_id)

    # Attach certificate lists to blocks for visual tracking
    block_records = []
    for block in chain_instance.blocks:
        b_certs = list_certificates(batch_id=block.batch_id)
        if not b_certs:
            b_certs = certs[:block.certificate_count]
        block_records.append({
            "block": block,
            "certificates": b_certs
        })

    validation = chain_instance.validate_chain()
    return render_template("module4.html", block_records=block_records, validation=validation)


@app.route("/module4/add_batch", methods=["POST"])
def module4_add_batch():
    batch_id = request.form.get("batch_id", "SEM2_2026")
    certs = ensure_sample_certificates()
    batch_certs = certs if len(certs) > 4 else certs[:4]
    leaf_hashes = [c["certificate_hash"] for c in batch_certs]
    tree = build_merkle_tree(leaf_hashes)

    proof_map = {}
    for c in batch_certs:
        p = generate_proof_for_hash(tree, c["certificate_hash"])
        proof_map[c["certificate_id"]] = proof_to_dicts(p)

    assign_batch_and_proofs(batch_id, tree.merkle_root, proof_map)

    new_block = chain_instance.add_batch(batch_id=batch_id, merkle_root=tree.merkle_root, certificate_count=len(batch_certs))
    update_batch_block_id(batch_id, new_block.block_id)

    flash(f"Batch '{batch_id}' chained into Block #{new_block.block_id}!", "success")
    return redirect(url_for("module4"))


@app.route("/tamper-test")
def tamper_test():
    return render_template("tamper_test.html")


@app.route("/tamper-test/cert", methods=["POST"])
def run_cert_tamper_test():
    cert_a = {
        "certificate_id": "CC001",
        "student_name": "Rahul Sharma",
        "roll_number": "A101",
        "course": "AI & DS",
        "cgpa": "9.20",
        "issue_date": "2026-08-20",
        "institution_id": "MMCOE"
    }
    cert_b = cert_a.copy()
    cert_b["cgpa"] = "9.99"

    res_a = hash_certificate(cert_a)
    res_b = hash_certificate(cert_b)

    cert_tamper = {
        "hash_a": res_a.certificate_hash,
        "hash_b": res_b.certificate_hash,
        "hash_changed": res_a.certificate_hash != res_b.certificate_hash
    }
    return render_template("tamper_test.html", cert_tamper=cert_tamper)


@app.route("/tamper-test/block", methods=["POST"])
def run_block_tamper_test():
    test_chain = Chain()
    tree_1 = build_merkle_tree(["a" * 64, "b" * 64])
    tree_2 = build_merkle_tree(["c" * 64, "d" * 64])

    block_1 = test_chain.add_batch(batch_id="SEM1_2026", merkle_root=tree_1.merkle_root, certificate_count=2)
    block_2 = test_chain.add_batch(batch_id="SEM2_2026", merkle_root=tree_2.merkle_root, certificate_count=2)

    val_before = test_chain.validate_chain()

    fake_root = "f" * 64
    tampered_b2 = dataclasses.replace(block_2, previous_root=fake_root)
    test_chain.replace_block(2, tampered_b2)

    val_after = test_chain.validate_chain()

    block_tamper = {
        "before_valid": val_before.is_valid,
        "after_valid": val_after.is_valid,
        "errors": val_after.errors
    }
    return render_template("tamper_test.html", block_tamper=block_tamper)


@app.route("/demo")
def complete_demo():
    step = int(request.args.get("step", 1))
    return _render_demo_step(step)


@app.route("/demo/run", methods=["POST", "GET"])
def run_complete_demo():
    step = int(request.args.get("step", 1))
    return _render_demo_step(step)


def _render_demo_step(step: int):
    # Ensure sample certificates exist in DB
    certs = ensure_sample_certificates()
    batch_certs = certs[:4]

    # Compute M2 hashes
    hash_results = [hash_certificate(c) for c in batch_certs]
    leaf_hashes = [h.certificate_hash for h in hash_results]

    # Build M3 tree
    tree = build_merkle_tree(leaf_hashes)

    # Proof for first cert
    p0 = generate_proof_for_hash(tree, leaf_hashes[0])
    proof_p0 = {
        "cert": batch_certs[0],
        "leaf_hash": leaf_hashes[0],
        "proof_steps": proof_to_dicts(p0),
        "is_valid": verify_merkle_proof(leaf_hashes[0], p0, tree.merkle_root)
    }

    # Assign proofs
    proof_map = {}
    for c in batch_certs:
        p = generate_proof_for_hash(tree, c["certificate_hash"])
        proof_map[c["certificate_id"]] = proof_to_dicts(p)
    assign_batch_and_proofs("SEM1_2026", tree.merkle_root, proof_map)

    # M4 block chain
    demo_chain = Chain()
    b1 = demo_chain.add_batch(batch_id="SEM1_2026", merkle_root=tree.merkle_root, certificate_count=len(batch_certs))
    update_batch_block_id("SEM1_2026", b1.block_id)

    block_records = [{
        "block": b1,
        "certificates": batch_certs
    }]

    validation = demo_chain.validate_chain()

    demo_data = {
        "step": step,
        "batch_certs": batch_certs,
        "hash_results": hash_results,
        "tree": tree,
        "proof_p0": proof_p0,
        "block_records": block_records,
        "validation": validation,
        "merkle_root": tree.merkle_root
    }

    return render_template("complete_demo.html", demo=demo_data)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=os.environ.get("FLASK_DEBUG", "0") == "1")
