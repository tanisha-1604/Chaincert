import { Credential } from '../types';
import { apiRequest } from './apiConfig';

// ---------------------------------------------------------------------------
// Backend certificate record shape
// ---------------------------------------------------------------------------
interface BackendCert {
  certificate_id: string;
  student_name?: string;
  roll_number?: string;
  course?: string;
  cgpa?: string;
  issue_date?: string;
  institution_id?: string;
  certificate_hash?: string;
  merkle_root?: string;
  merkle_leaf_index?: number;
  batch_id?: string;
  status?: string;
  revocation_reason?: string;
  revoked_at?: string;
}

// ---------------------------------------------------------------------------
// Authentication user shape
// ---------------------------------------------------------------------------
interface StoredAuth {
  access_token?: string;
  token?: string;

  user?: {
    id?: string;
    email?: string;
    display_name?: string;
    role?: string;
    institution_id?: string;
    institutionId?: string;
  };

  id?: string;
  email?: string;
  display_name?: string;
  role?: string;
  institution_id?: string;
  institutionId?: string;
}

// ---------------------------------------------------------------------------
// Map backend certificate → frontend Credential
// ---------------------------------------------------------------------------
function mapCert(r: BackendCert): Credential {
  const status = (r.status?.toUpperCase() ?? 'ACTIVE') as Credential['status'];

  return {
    id: r.certificate_id,
    studentName: r.student_name ?? '',
    studentRoll: r.roll_number ?? '',
    course: r.course ?? '',
    degreeType: 'Academic Degree',
    institution: r.institution_id ?? '',
    institutionId: r.institution_id ?? '',
    issueDate: r.issue_date ?? '',
    batch: r.batch_id ?? '',
    grade: '',
    cgpa: r.cgpa,
    status: [
      'ACTIVE',
      'CONFERRED',
      'REVOKED',
      'REVIEW_REQUIRED',
    ].includes(status)
      ? status
      : 'ACTIVE',
    sha256Hash: r.certificate_hash ?? '',
    merkleRoot: r.merkle_root ?? '',
    merkleLeafIndex: r.merkle_leaf_index,
    revocationReason: r.revocation_reason,
    revokedAt: r.revoked_at,

    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
      `${window.location.origin}/verify?id=${encodeURIComponent(
        r.certificate_id
      )}`
    )}`,
  };
}

// ---------------------------------------------------------------------------
// Get institution ID from the currently authenticated account
// ---------------------------------------------------------------------------
function getAuthenticatedInstitutionId(): string {
  const storedAuth = localStorage.getItem('chaincert_auth_user');

  if (!storedAuth) {
    throw new Error(
      'You are not logged in. Please log in as an institution user.'
    );
  }

  let auth: StoredAuth;

  try {
    auth = JSON.parse(storedAuth) as StoredAuth;
  } catch {
    throw new Error(
      'Your authentication session is invalid. Please log in again.'
    );
  }

  // The authenticated User stores institutionId (mapped from backend institution_id)
  const rawId =
    auth.institutionId ??
    auth.institution_id ??
    auth.user?.institutionId ??
    auth.user?.institution_id;

  const institutionId = rawId !== undefined && rawId !== null ? String(rawId).trim() : '';

  if (!institutionId) {
    // If logged in as PLATFORM_ADMIN or institution role without explicit id, default to MMCOE (1)
    if (auth.role === 'institution' || auth.role === 'PLATFORM_ADMIN') {
      return '1';
    }
    throw new Error(
      'Institution ID is missing from your logged-in account.'
    );
  }

  return institutionId;
}

// ---------------------------------------------------------------------------
// Credential service
// ---------------------------------------------------------------------------
export const credentialService = {
  async getAll(): Promise<Credential[]> {
    const raw = localStorage.getItem('chaincert_auth_user');
    let isStudent = false;
    if (raw) {
      try {
        const u = JSON.parse(raw);
        isStudent = u.role === 'student' || u.role === 'STUDENT';
      } catch {
        // ignore
      }
    }
    const endpoint = isStudent ? '/students/me/certificates' : '/certificates';
    const data = await apiRequest<{ certificates: BackendCert[] }>(endpoint);
    return (data.certificates ?? []).map(mapCert);
  },

  async getById(id: string): Promise<Credential | null> {
    const raw = localStorage.getItem('chaincert_auth_user');
    let isStudent = false;
    if (raw) {
      try {
        const u = JSON.parse(raw);
        isStudent = u.role === 'student' || u.role === 'STUDENT';
      } catch {
        // ignore
      }
    }
    const endpoint = isStudent
      ? `/students/me/certificates/${encodeURIComponent(id)}`
      : `/certificates/${encodeURIComponent(id)}`;
    try {
      const data = await apiRequest<{ certificate: BackendCert }>(endpoint);
      return data.certificate ? mapCert(data.certificate) : null;
    } catch {
      return null;
    }
  },

  // -------------------------------------------------------------------------
  // Register a new certificate
  //
  // IMPORTANT:
  // The institution is NOT taken from the form.
  // It is automatically obtained from the authenticated institution account.
  // -------------------------------------------------------------------------
  async register(newCred: {
    id: string;
    studentName: string;
    studentRoll: string;
    course: string;
    issueDate: string;

    // Kept optional for compatibility with the existing form.
    // This value is intentionally NOT used.
    institution?: string;

    cgpa?: string;
  }): Promise<Credential> {
    // Get institution from the logged-in account.
    const institutionId = getAuthenticatedInstitutionId();

    const payload = {
      certificate: {
        certificate_id: newCred.id.trim(),
        student_name: newCred.studentName.trim(),
        roll_number: newCred.studentRoll.trim(),
        course: newCred.course.trim(),
        cgpa: (newCred.cgpa && newCred.cgpa.trim()) ? newCred.cgpa.trim() : '9.80',
        issue_date: newCred.issueDate.trim(),

        // IMPORTANT:
        // Always use the authenticated user's institution.
        // Do not trust the institution entered/selected in the form.
        institution_id: institutionId,
      },
    };

    console.log(
      'Registering certificate for authenticated institution:',
      institutionId
    );

    const data = await apiRequest<{ certificate: BackendCert }>(
      '/certificates',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    return mapCert(data.certificate);
  },

  // -------------------------------------------------------------------------
  // Revoke certificate
  // -------------------------------------------------------------------------
  async revoke(id: string, reason: string): Promise<Credential> {
    await apiRequest<unknown>(
      `/certificates/${encodeURIComponent(id)}/revoke`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );

    // Fetch updated record
    const updated = await this.getById(id);

    if (!updated) {
      throw new Error('Certificate not found after revoke');
    }

    return updated;
  },

  // -------------------------------------------------------------------------
  // Update certificate
  // Backend does not currently expose a PATCH endpoint.
  // -------------------------------------------------------------------------
  async update(
    id: string,
    updates: Partial<Credential>
  ): Promise<Credential> {
    console.warn(
      'credentialService.update: no backend endpoint; changes are display-only.',
      id,
      updates
    );

    const existing = await this.getById(id);

    if (!existing) {
      throw new Error('Certificate not found');
    }

    return { ...existing, ...updates };
  },

  // -------------------------------------------------------------------------
  // Bulk issuance
  // Backend does not currently support this.
  // -------------------------------------------------------------------------
  async processBulkIssuance(
    _batch: unknown
  ): Promise<{ issuedCount: number; batchId: string }> {
    throw new Error(
      'Bulk issuance is not implemented by the backend API.'
    );
  },
};