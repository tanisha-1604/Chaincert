import { VerificationResult, VerificationState, VerificationCheck } from '../types';
import { API_BASE_URL } from './apiConfig';

// ---------------------------------------------------------------------------
// Backend response shape from /api/v1/verify and /api/v1/verification/verify-upload
// ---------------------------------------------------------------------------
interface BackendVerifyResponse {
  success: boolean;
  status: string;          // GENUINE | TAMPERED | NOT_FOUND | REVOKED | REVIEW_REQUIRED
  explanation?: string;
  certificate_id?: string;
  certificate?: {
    certificate_id: string;
    student_name?: string;
    roll_number?: string;
    course?: string;
    cgpa?: string;
    issue_date?: string;
    institution_id?: string;
  };
  checks?: Record<string, unknown> | Array<{ name: string; passed: boolean; detail?: string }>;
  submitted_fingerprint?: string | null;
  trusted_fingerprint?: string | null;
  sha256?: string;
  merkle_root?: string;
  mismatched_fields?: string[];
  mismatches?: Record<string, { expected: string; actual: string }>;
  extraction?: Record<string, unknown>;
  integrity_details?: Record<string, unknown>;
}

function mapState(status: string): VerificationState {
  switch ((status || '').toUpperCase()) {
    case 'GENUINE': return 'GENUINE';
    case 'TAMPERED': return 'TAMPERED';
    case 'REVOKED': return 'REVOKED';
    case 'REVIEW_REQUIRED': return 'REVIEW_REQUIRED';
    default: return 'NOT_FOUND';
  }
}

function parseChecks(checksData: unknown, state: VerificationState, mismatchedFields: string[]): VerificationCheck[] {
  if (Array.isArray(checksData)) {
    return checksData.map(c => ({
      name: c.name || 'Check',
      passed: Boolean(c.passed),
      message: c.detail || c.message || (c.passed ? 'Check verified' : 'Check failed'),
    }));
  }
  if (checksData && typeof checksData === 'object') {
    const list: VerificationCheck[] = Object.entries(checksData as Record<string, unknown>).map(([key, val]) => {
      const name = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const passed = Boolean(val);
      return {
        name,
        passed,
        message: passed ? 'Passed' : 'Failed or not satisfied',
      };
    });
    if (list.length > 0) return list;
  }
  return buildDefaultChecks(state, mismatchedFields);
}

function buildDefaultChecks(state: VerificationState, mismatchedFields: string[]): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  if (state === 'GENUINE') {
    checks.push(
      { name: 'Certificate Found', passed: true, message: 'Record found in institutional registry' },
      { name: 'All Required Fields Matched', passed: true, message: 'Extracted certificate fields match registered record' },
      { name: 'Cryptographic Verification Passed', passed: true, message: 'SHA-256 canonical hash matches trusted archive' },
    );
  } else if (state === 'TAMPERED') {
    checks.push(
      { name: 'Registry Lookup', passed: true, message: 'Record found in institutional registry' },
      { name: 'Field Comparison', passed: false, message: `Mismatched fields: ${mismatchedFields.join(', ') || 'discrepancy detected'}` },
    );
  } else if (state === 'REVOKED') {
    checks.push(
      { name: 'Registry Lookup', passed: true, message: 'Record found' },
      { name: 'Revocation Check', passed: false, message: 'Credential has been revoked' },
    );
  } else if (state === 'NOT_FOUND') {
    checks.push(
      { name: 'Registry Lookup', passed: false, message: 'No record found for this identifier' },
    );
  } else {
    checks.push(
      { name: 'Extraction Review', passed: false, message: 'Extraction incomplete or uncertain; manual review required' },
    );
  }
  return checks;
}

function buildResult(data: BackendVerifyResponse, channel: VerificationResult['channel']): VerificationResult {
  const state = mapState(data.status);
  const certId = data.certificate_id || data.certificate?.certificate_id || 'UNKNOWN';

  const summaryMap: Record<VerificationState, string> = {
    GENUINE: 'Certificate verified successfully. All required fields match the registered academic credential.',
    TAMPERED: 'Certificate data does not match the trusted registry. Field mismatch detected.',
    REVOKED: 'This certificate was previously issued but has been revoked by the issuing institution.',
    REVIEW_REQUIRED: 'The document could not be reliably extracted. Secondary review required.',
    NOT_FOUND: 'No trusted certificate exists for this certificate ID.',
  };

  const checks = parseChecks(data.checks, state, data.mismatched_fields ?? []);

  const sha256 =
    data.submitted_fingerprint ||
    data.trusted_fingerprint ||
    data.sha256 ||
    '';

  const merkleRoot =
    (data.integrity_details?.merkle_root as string) ||
    data.merkle_root ||
    '';

  const missingList = (data.checks && typeof data.checks === 'object' && !Array.isArray(data.checks))
    ? ((data.checks as any).missing_fields as string[] | undefined)
    : undefined;

  const result: VerificationResult = {
    state,
    certificateId: certId,
    timestamp: new Date().toISOString(),
    summaryMessage: summaryMap[state],
    detailedMessage: data.explanation ?? summaryMap[state],
    checks,
    channel,
    mismatches: data.mismatches,
    mismatchedFields: data.mismatched_fields,
    missingFields: missingList,
    extractionDetails: data.extraction,
  };

  if (data.certificate) {
    const c = data.certificate;
    result.credential = {
      id: c.certificate_id,
      studentName: c.student_name ?? '',
      studentRoll: c.roll_number ?? '',
      course: c.course ?? '',
      degreeType: 'Academic Degree',
      institution: c.institution_id ?? '',
      institutionId: c.institution_id ?? '',
      issueDate: c.issue_date ?? '',
      batch: '',
      grade: '',
      cgpa: c.cgpa,
      status: state === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
      sha256Hash: sha256,
      merkleRoot: merkleRoot,
    };
  }

  if (sha256 || merkleRoot) {
    result.integrityProof = {
      sha256,
      merkleRoot,
      batchId: (data.integrity_details?.batch_id as string) || '',
      leafIndex: 0,
    };
  }

  return result;
}

export const verificationService = {
  async verifyById(rawId: string, channel: VerificationResult['channel'] = 'ID_LOOKUP'): Promise<VerificationResult> {
    try {
      const res = await fetch(`${API_BASE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificate_id: rawId.trim() }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: BackendVerifyResponse = await res.json();
      return buildResult(data, channel);
    } catch (err) {
      console.error('verifyById error:', err);
      return {
        state: 'NOT_FOUND',
        certificateId: rawId,
        timestamp: new Date().toISOString(),
        summaryMessage: 'Verification service unavailable. Please ensure the backend is running.',
        detailedMessage: String(err),
        checks: [{ name: 'Backend Connection', passed: false, message: 'Could not reach the verification service' }],
        channel,
      };
    }
  },

  async verifyWithFields(
    fields: Record<string, any>,
    channel: VerificationResult['channel'] = 'ID_LOOKUP'
  ): Promise<VerificationResult> {
    const cid = fields.certificate_id || fields.id;
    try {
      const res = await fetch(`${API_BASE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_id: cid,
          fields: {
            certificate_id: cid,
            student_name: fields.student_name || fields.studentName,
            roll_number: fields.roll_number || fields.studentRoll,
            course: fields.course,
            cgpa: fields.cgpa,
            issue_date: fields.issue_date || fields.issueDate,
            institution_id: fields.institution_id || fields.institution || 'MMCOE',
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: BackendVerifyResponse = await res.json();
      return buildResult(data, channel);
    } catch (err) {
      console.error('verifyWithFields error:', err);
      return {
        state: 'NOT_FOUND',
        certificateId: cid || 'UNKNOWN',
        timestamp: new Date().toISOString(),
        summaryMessage: 'Verification failed. Could not communicate with backend.',
        detailedMessage: String(err),
        checks: [{ name: 'Backend Connection', passed: false, message: 'Could not reach the verification service' }],
        channel,
      };
    }
  },

  async verifyUploadedFile(file: File): Promise<VerificationResult> {
    try {
      const formData = new FormData();
      formData.append('document', file);

      const res = await fetch(`${API_BASE_URL}/verification/verify-upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: BackendVerifyResponse = await res.json();
      return buildResult(data, 'DOCUMENT_UPLOAD');
    } catch (err) {
      console.error('verifyUploadedFile error:', err);
      return {
        state: 'NOT_FOUND',
        certificateId: 'UPLOAD_ERROR',
        timestamp: new Date().toISOString(),
        summaryMessage: 'Document verification failed. Please ensure the backend is running.',
        detailedMessage: String(err),
        checks: [{ name: 'Backend Connection', passed: false, message: 'Could not reach the verification service' }],
        channel: 'DOCUMENT_UPLOAD',
      };
    }
  },
};
