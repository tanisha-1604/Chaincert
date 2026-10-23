"""
Input Data Validation Engine for ChainCert Certificate Records.
"""

import re
from datetime import datetime
from typing import Dict, Any, Tuple
from chaincert.hashing.exceptions import CertificateValidationError
from chaincert.hashing.models import CANONICAL_FIELD_ORDER


SUPPORTED_DATE_FORMATS = [
    "%Y-%m-%d",      # 2026-10-23
    "%d/%m/%Y",      # 23/10/2026
    "%d-%m-%Y",      # 23-10-2026
    "%d.%m.%Y",      # 23.10.2026
    "%Y/%m/%d",      # 2026/10/23
    "%d %b %Y",      # 23 Oct 2026
    "%d %B %Y",      # 23 October 2026
    "%B %d, %Y",     # October 23, 2026
    "%b %d, %Y",     # Oct 23, 2026
    "%d-%b-%Y",      # 23-Oct-2026
    "%d-%B-%Y",      # 23-October-2026
]


def validate_cgpa(cgpa_input: Any) -> float:
    """
    Validate and parse CGPA input into float.
    Must be between 0.00 and 10.00 inclusive.
    """
    if cgpa_input is None or cgpa_input == "":
        raise CertificateValidationError("CGPA field cannot be null or empty.")

    try:
        val = float(str(cgpa_input).strip().replace(",", "."))
    except (ValueError, TypeError):
        raise CertificateValidationError(f"Invalid CGPA value '{cgpa_input}'. Must be numeric.")

    if val < 0.0 or val > 10.0:
        raise CertificateValidationError(f"CGPA '{val}' out of valid academic range [0.00, 10.00].")

    return val


def parse_and_validate_date(date_input: Any) -> str:
    """
    Validate and parse date input into canonical YYYY-MM-DD string.
    Raises CertificateValidationError if date is invalid or unparseable.
    """
    if date_input is None or str(date_input).strip() == "":
        raise CertificateValidationError("issue_date field cannot be null or empty.")

    date_str = str(date_input).strip()
    # Strip ordinal suffixes: 23rd -> 23, 1st -> 1, etc.
    cleaned_date = re.sub(r"(\d{1,2})(st|nd|rd|th)\b", r"\1", date_str, flags=re.IGNORECASE)
    cleaned_date = re.sub(r"\s+", " ", cleaned_date).strip()

    for fmt in SUPPORTED_DATE_FORMATS:
        try:
            parsed_dt = datetime.strptime(cleaned_date, fmt)
            return parsed_dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    raise CertificateValidationError(
        f"Invalid or unsupported date format '{date_str}'. Expected formats include YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, etc."
    )


def validate_certificate_data(cert_data: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """
    Validate raw certificate input dictionary.

    Returns:
        Tuple[Dict[str, Any], bool]: (Cleaned raw dict, True) if valid.
    Raises:
        CertificateValidationError if validation fails.
    """
    if not isinstance(cert_data, dict):
        raise CertificateValidationError(f"Expected certificate data as dict, got {type(cert_data).__name__}.")

    # Check missing required fields
    missing_fields = [f for f in CANONICAL_FIELD_ORDER if f not in cert_data or cert_data[f] is None]
    if missing_fields:
        raise CertificateValidationError(f"Missing mandatory certificate fields: {missing_fields}")

    # Validate individual field values
    validated_fields = {}

    for field_name in CANONICAL_FIELD_ORDER:
        raw_val = cert_data[field_name]
        
        if field_name == "cgpa":
            validated_fields["cgpa"] = validate_cgpa(raw_val)
        elif field_name == "issue_date":
            validated_fields["issue_date"] = parse_and_validate_date(raw_val)
        else:
            val_str = str(raw_val).strip()
            if not val_str:
                raise CertificateValidationError(f"Field '{field_name}' cannot be empty or blank whitespace.")
            validated_fields[field_name] = val_str

    return validated_fields, True
