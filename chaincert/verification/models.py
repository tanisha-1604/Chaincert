from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any

class VerificationStatus(str, Enum):
    GENUINE = "GENUINE"
    TAMPERED = "TAMPERED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    NOT_FOUND = "NOT_FOUND"
    REVOKED = "REVOKED"

@dataclass
class VerificationResult:
    status: VerificationStatus
    certificate_id: str | None
    explanation: str
    checks: dict[str, Any]
    mismatched_fields: list[str]
    submitted_fingerprint: str | None = None
    trusted_fingerprint: str | None = None
    integrity_details: dict[str, Any] | None = None
    mismatches: dict[str, dict[str, Any]] | None = None

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["status"] = self.status.value
        if result.get("mismatches") is None:
            result["mismatches"] = {}
        return result
