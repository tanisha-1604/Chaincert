"""Module 5 verification engine wired to ChainCert Modules 1–4.

Verification is based on trusted database records and the existing Module 2 hash
format. When a stored Merkle proof exists, it is checked with Module 3; the local
Module 4 chain is validated when the proof is available. This is not an external
blockchain anchor or consensus claim.
"""
from typing import Any
from chaincert.hashing import hash_certificate
from chaincert.hashing.validator import validate_certificate_data
from chaincert.hashing.exceptions import CertificateValidationError
from chaincert.merkle import verify_merkle_proof
from chaincert.chain import Chain
from .models import VerificationResult, VerificationStatus

FIELDS = ("certificate_id", "student_name", "roll_number", "course", "cgpa", "issue_date", "institution_id")

class VerificationEngine:
    def __init__(self, chain: Chain | None = None):
        self.chain = chain

    @staticmethod
    def _record_fields(record: dict[str, Any]) -> dict[str, Any]:
        return {key: record.get(key) for key in FIELDS}

    def verify(
        self,
        submitted: dict[str, Any],
        trusted_record: dict[str, Any] | None,
        *,
        extracted_fields: dict[str, Any] | None = None,
        uncertain: bool = False,
    ) -> VerificationResult:
        cid = submitted.get("certificate_id") if isinstance(submitted, dict) else None
        if not isinstance(submitted, dict) or not isinstance(cid, str) or not cid.strip():
            return VerificationResult(
                VerificationStatus.REVIEW_REQUIRED,
                None,
                "A certificate ID is required to verify the submitted fields.",
                {"input_valid": False, "reference_found": None},
                [],
                integrity_details={},
            )
        cid = cid.strip()

        # Case D — Unknown certificate
        if trusted_record is None:
            return VerificationResult(
                VerificationStatus.NOT_FOUND,
                cid,
                f"No trusted certificate record was found for ID '{cid}'.",
                {"input_valid": True, "reference_found": False},
                [],
                integrity_details={},
            )

        # Case E — Revoked credential
        if str(trusted_record.get("status", "")).upper() == "REVOKED":
            return VerificationResult(
                VerificationStatus.REVOKED,
                cid,
                "This credential has been revoked by the issuing institution.",
                {"input_valid": True, "reference_found": True, "revoked": True},
                [],
                trusted_fingerprint=trusted_record.get("certificate_hash"),
                integrity_details={"revocation_reason": trusted_record.get("revocation_reason")},
            )

        submitted_fields = self._record_fields(submitted)
        trusted_fields = self._record_fields(trusted_record)

        # Check for confirmed field mismatches across reliably provided/extracted fields (Case B)
        mismatches_dict: dict[str, dict[str, str]] = {}
        for field in ("student_name", "roll_number", "course", "cgpa", "issue_date", "institution_id"):
            sub_val = submitted_fields.get(field)
            tru_val = trusted_fields.get(field)

            # Skip if field was not extracted / not provided
            if sub_val is None or str(sub_val).strip() == "":
                continue

            # If structured extraction metadata is available, ensure field is not marked unreadable
            if extracted_fields and isinstance(extracted_fields.get(field), dict):
                f_meta = extracted_fields[field]
                if f_meta.get("value") is None:
                    continue

            # Normalized comparisons
            if field == "cgpa":
                try:
                    # Parse numeric values to compare logically (9.40 vs 9.90, 9.2 vs 9.20)
                    s_cgpa = float(str(sub_val).strip().replace(",", "."))
                    t_cgpa = float(str(tru_val).strip().replace(",", "."))
                    if abs(s_cgpa - t_cgpa) > 0.001:
                        mismatches_dict[field] = {
                            "expected": f"{t_cgpa:.2f}",
                            "actual": f"{s_cgpa:.2f}",
                        }
                except (ValueError, TypeError):
                    if str(sub_val).strip() != str(tru_val).strip():
                        mismatches_dict[field] = {
                            "expected": str(tru_val).strip(),
                            "actual": str(sub_val).strip(),
                        }
            elif field == "issue_date":
                try:
                    from chaincert.hashing.validator import parse_and_validate_date
                    s_date = parse_and_validate_date(sub_val)
                    t_date = parse_and_validate_date(tru_val)
                    if s_date != t_date:
                        mismatches_dict[field] = {
                            "expected": t_date,
                            "actual": s_date,
                        }
                except Exception:
                    if str(sub_val).strip() != str(tru_val).strip():
                        mismatches_dict[field] = {
                            "expected": str(tru_val).strip(),
                            "actual": str(sub_val).strip(),
                        }
            elif field == "institution_id":
                s_inst = str(sub_val).strip().casefold()
                t_inst = str(tru_val).strip().casefold()
                if s_inst != t_inst:
                    mismatches_dict[field] = {
                        "expected": str(tru_val).strip(),
                        "actual": str(sub_val).strip(),
                    }
            else:
                # String comparison with case-folding and normalized whitespace
                import re
                s_norm = re.sub(r"\s+", " ", str(sub_val)).strip().casefold()
                t_norm = re.sub(r"\s+", " ", str(tru_val)).strip().casefold()
                if s_norm != t_norm:
                    mismatches_dict[field] = {
                        "expected": str(tru_val).strip(),
                        "actual": str(sub_val).strip(),
                    }

        # Case B: Confirmed field tampering
        if mismatches_dict:
            mismatched_keys = sorted(mismatches_dict.keys())
            return VerificationResult(
                VerificationStatus.TAMPERED,
                cid,
                f"The submitted certificate fields differ from the trusted registered record: {', '.join(mismatched_keys)}.",
                {
                    "input_valid": True,
                    "reference_found": True,
                    "fields_match": False,
                    "mismatched_fields": mismatched_keys,
                    "stored_record_hash_consistent": True,
                },
                mismatched_keys,
                trusted_fingerprint=trusted_record.get("certificate_hash"),
                integrity_details={"tampered_fields": mismatched_keys, "mismatches": mismatches_dict},
                mismatches=mismatches_dict,
            )

        # If institution_id was not explicitly labeled in uploaded document, but all 6 student credential
        # fields match and the trusted institution name appears in extracted fields/text, populate it.
        if not submitted_fields.get("institution_id") and trusted_fields.get("institution_id"):
            trusted_inst = str(trusted_fields["institution_id"]).strip()
            # Check if trusted_inst appears in extracted_fields
            inst_found = False
            if extracted_fields and isinstance(extracted_fields, dict):
                inst_cand = extracted_fields.get("institution_id")
                if isinstance(inst_cand, dict) and inst_cand.get("value"):
                    if str(inst_cand.get("value")).strip().casefold() == trusted_inst.casefold():
                        inst_found = True
                for f_data in extracted_fields.values():
                    if isinstance(f_data, dict) and trusted_inst.casefold() in str(f_data.get("source_text", "")).casefold():
                        inst_found = True
                        break
            if inst_found or not extracted_fields:
                submitted_fields["institution_id"] = trusted_inst

        # Case C: Uncertain extraction (missing fields or low confidence with no confirmed mismatch)
        missing = [f for f in FIELDS if submitted_fields.get(f) is None or str(submitted_fields.get(f)).strip() == ""]
        if missing or uncertain:
            reason = (
                f"One or more required fields could not be extracted reliably ({', '.join(missing)}); manual review is required."
                if missing
                else "Extraction is incomplete or uncertain. Review the candidate fields before relying on a result."
            )
            return VerificationResult(
                VerificationStatus.REVIEW_REQUIRED,
                cid,
                reason,
                {"input_valid": False, "reference_found": True, "missing_fields": missing, "uncertain": uncertain},
                [],
                trusted_fingerprint=trusted_record.get("certificate_hash"),
                integrity_details={"extraction_fields": extracted_fields or {}},
                mismatches={},
            )

        # Cryptographic verification (Case A)
        try:
            submitted_hash = hash_certificate(submitted_fields).certificate_hash
            trusted_hash_calc = hash_certificate(trusted_fields).certificate_hash
        except (CertificateValidationError, ValueError, TypeError) as exc:
            return VerificationResult(
                VerificationStatus.REVIEW_REQUIRED,
                cid,
                f"The extracted fields could not be validated: {exc}",
                {"input_valid": False, "reference_found": True},
                [],
                trusted_fingerprint=trusted_record.get("certificate_hash"),
                integrity_details={},
            )

        trusted_hash_stored = trusted_record.get("certificate_hash")
        stored_record_consistent = bool(trusted_hash_stored and trusted_hash_calc == trusted_hash_stored)
        hash_match = (submitted_hash == trusted_hash_stored)

        details: dict[str, Any] = {
            "stored_record_hash_consistent": stored_record_consistent,
            "merkle_proof_available": bool(trusted_record.get("merkle_proof") and trusted_record.get("merkle_root")),
            "merkle_proof_valid": None,
            "chain_valid": None,
            "chain_errors": [],
            "evidence_note": "Local application evidence only; no external blockchain anchoring is asserted.",
        }
        proof_available = details["merkle_proof_available"]
        if proof_available:
            try:
                proof = trusted_record.get("merkle_proof_parsed") or trusted_record.get("merkle_proof")
                if isinstance(proof, str):
                    import json
                    proof = json.loads(proof)
                details["merkle_proof_valid"] = bool(
                    verify_merkle_proof(trusted_hash_stored, proof, trusted_record["merkle_root"])
                )
                if self.chain is not None:
                    if getattr(self.chain, "storage_path", None):
                        try:
                            from pathlib import Path
                            from chaincert.chain.storage import load_chain
                            if Path(self.chain.storage_path).exists():
                                self.chain._blocks = load_chain(self.chain.storage_path)
                        except Exception:
                            pass
                    chain_result = self.chain.validate_chain()
                    batch_blocks = [b for b in self.chain.blocks if b.batch_id == trusted_record.get("batch_id")]
                    batch_root_matches = any(b.merkle_root == trusted_record.get("merkle_root") for b in batch_blocks)
                    details["batch_block_found"] = bool(batch_blocks)
                    details["batch_root_matches_block"] = bool(batch_root_matches) if batch_blocks else None
                    details["chain_valid"] = bool(chain_result.is_valid and batch_root_matches)
                    details["chain_errors"] = list(chain_result.errors)
                    if not batch_blocks:
                        details["chain_errors"].append("No chain block was found for the certificate batch.")
                    elif not batch_root_matches:
                        details["chain_errors"].append("Certificate Merkle root does not match its batch block.")
            except Exception as exc:
                details["merkle_proof_valid"] = False
                details["integrity_error"] = str(exc)

        checks = {
            "input_valid": True,
            "reference_found": True,
            "fields_match": True,
            "submitted_hash_matches_trusted_hash": hash_match,
            "stored_record_hash_consistent": stored_record_consistent,
            "merkle_proof_valid": details["merkle_proof_valid"],
            "chain_valid": details["chain_valid"],
        }

        if not stored_record_consistent:
            status = VerificationStatus.REVIEW_REQUIRED
            explanation = "The trusted record does not match its stored fingerprint. The institution must inspect the registry integrity."
        elif not hash_match:
            status = VerificationStatus.TAMPERED
            explanation = "The submitted certificate fingerprint does not match the trusted record."
        elif details["merkle_proof_valid"] is False or details["chain_valid"] is False:
            status = VerificationStatus.REVIEW_REQUIRED
            explanation = "The certificate fields match, but available batch integrity evidence failed validation."
        else:
            status = VerificationStatus.GENUINE
            explanation = "The submitted fields match the trusted certificate record and its stored SHA-256 fingerprint."
            if not proof_available:
                explanation += " No stored Merkle proof was available for this record."

        return VerificationResult(
            status,
            cid,
            explanation,
            checks,
            [],
            submitted_hash,
            trusted_hash_stored,
            details,
        )
