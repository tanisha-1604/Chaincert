export type UserRole = 'institution' | 'student' | 'public';

export type CredentialStatus = 'ACTIVE' | 'CONFERRED' | 'REVOKED' | 'REVIEW_REQUIRED';

export type VerificationState = 'GENUINE' | 'TAMPERED' | 'REVIEW_REQUIRED' | 'NOT_FOUND' | 'REVOKED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  institutionId?: string;
  institutionName?: string;
  studentId?: string;
  avatarUrl?: string;
  /** Bearer token stored alongside user so apiConfig can send Authorization header */
  token?: string;
}

export interface Credential {
  id: string; // e.g. CC-2024-89042-ENG
  studentName: string;
  studentRoll: string;
  studentEmail?: string;
  course: string;
  degreeType: string;
  institution: string;
  institutionId: string;
  issueDate: string;
  conferralDate?: string;
  batch: string;
  grade: string;
  cgpa?: string;
  status: CredentialStatus;
  sha256Hash: string;
  merkleRoot: string;
  merkleLeafIndex?: number;
  qrCodeUrl?: string;
  revocationReason?: string;
  revokedAt?: string;
  revokedBy?: string;
  metadata?: {
    facultyDean?: string;
    registrarSignature?: string;
    accreditationBody?: string;
    creditsCompleted?: number;
  };
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface VerificationResult {
  state: VerificationState;
  certificateId: string;
  timestamp: string;
  summaryMessage: string;
  detailedMessage: string;
  credential?: Credential;
  checks: VerificationCheck[];
  channel: 'ID_LOOKUP' | 'DIRECT_LINK' | 'DOCUMENT_UPLOAD' | 'QR_SCAN';
  issuerVerification?: {
    institutionName: string;
    accreditationStatus: string;
    registryId: string;
    pkiKeyFingerprint: string;
  };
  integrityProof?: {
    sha256: string;
    merkleRoot: string;
    batchId: string;
    leafIndex: number;
  };
  mismatches?: Record<string, { expected: string; actual: string }>;
  mismatchedFields?: string[];
  missingFields?: string[];
  extractionDetails?: Record<string, any>;
}

export interface AuditEvent {
  id: string;
  eventType: 'CREDENTIAL_ISSUED' | 'BATCH_ISSUANCE' | 'CREDENTIAL_REVOKED' | 'RECORD_CORRECTED' | 'INTEGRITY_CHECK_PASSED';
  actor: string;
  actorRole: string;
  targetCertificateId: string;
  hash: string;
  timestamp: string;
  status: 'VERIFIED' | 'RECORDED' | 'FLAGGED';
  details: string;
}

export interface VerificationHistoryItem {
  id: string;
  requester: string;
  queryId: string;
  result: VerificationState;
  verifiedAt: string;
  channel: string;
}

export interface BulkRecordItem {
  id: string;
  name: string;
  roll: string;
  course: string;
  grade: string;
  batch: string;
  date: string;
  status: 'VALID' | 'ERROR' | 'DUPLICATE';
  errorMessage?: string;
}

export interface BulkIssuanceBatch {
  batchId: string;
  fileName: string;
  totalRecords: number;
  validRecords: number;
  errorRecords: number;
  duplicateRecords: number;
  status: 'PENDING' | 'VALIDATED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_FAILED';
  records: BulkRecordItem[];
  createdAt: string;
}
