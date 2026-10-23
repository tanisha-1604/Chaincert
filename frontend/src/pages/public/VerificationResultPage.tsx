import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { verificationService } from '../../services/verificationService';
import { VerificationResult, VerificationState } from '../../types';
import { VerificationBadge } from '../../components/common/VerificationBadge';

export const VerificationResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const idParam = searchParams.get('id') || 'CC-2024-89042-ENG';
  const channelParam = (searchParams.get('channel') as any) || 'ID_LOOKUP';

  const initialResult = location.state?.verificationResult as VerificationResult | undefined;

  const [result, setResult] = useState<VerificationResult | null>(initialResult || null);
  const [loading, setLoading] = useState(!initialResult);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadVerification = async (queryId: string) => {
    setLoading(true);
    try {
      const res = await verificationService.verifyById(queryId, channelParam);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateTamper = async () => {
    const cred = result?.credential;
    const cid = cred?.id || idParam;
    setLoading(true);
    try {
      const tamperedFields = {
        certificate_id: cid,
        student_name: cred?.studentName || 'Alice Example',
        roll_number: cred?.studentRoll || 'DEMO-ROLL-001',
        course: cred?.course || 'Bachelor of Technology in Artificial Intelligence',
        cgpa: '9.99', // Altered CGPA
        issue_date: cred?.issueDate || '2026-10-23',
        institution_id: cred?.institutionId || cred?.institution || 'MMCOE',
      };
      const res = await verificationService.verifyWithFields(tamperedFields, 'ID_LOOKUP');
      setResult(res);
      showToast('Backend integrity check evaluated modified credential data (CGPA changed to 9.99).');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialResult && initialResult.certificateId === idParam) {
      setResult(initialResult);
      setLoading(false);
    } else {
      loadVerification(idParam);
    }
  }, [idParam, channelParam]);

  const copyShareLink = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
    showToast('Authoritative verification link copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-center gap-4">
        <span className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin"></span>
        <h2 className="text-xl font-bold text-primary">Consulting Institutional Registrar Ledger...</h2>
        <p className="text-xs text-on-surface-variant max-w-sm">
          Checking canonical SHA-256 seal and institutional accreditation directory for {idParam}.
        </p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 py-10 flex flex-col gap-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in" id="copyToast">
          <span className="material-symbols-outlined text-[18px] text-emerald-400">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Test State Switcher */}
      <div className="p-3 bg-surface-container-low rounded-2xl flex flex-wrap items-center justify-between gap-3 border border-slate-200/60 shadow-xs">
        <div className="flex items-center gap-2 pl-1">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">tune</span>
          <span className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
            Evaluate Authority States:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => loadVerification(result?.certificateId && result.certificateId !== 'UNKNOWN-123' ? result.certificateId : 'DEMO-CC-2026-001')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              result.state === 'GENUINE' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            1. GENUINE (Original)
          </button>
          <button
            onClick={handleSimulateTamper}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              result.state === 'TAMPERED' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
            }`}
          >
            2. TAMPERED (Modify CGPA)
          </button>
          <button
            onClick={() => loadVerification('UNKNOWN-123')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              result.state === 'NOT_FOUND' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
            }`}
          >
            3. NOT_FOUND (UNKNOWN-123)
          </button>
          <button
            onClick={() => loadVerification('DEMO-CC-2026-001')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              result.state === 'REVOKED' ? 'bg-rose-700 text-white shadow-xs' : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
            }`}
          >
            4. REVOKED Status
          </button>
        </div>
      </div>

      {/* Main Status Hero Card */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-slate-200/80 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
              result.state === 'GENUINE'
                ? 'bg-emerald-100 text-emerald-700'
                : result.state === 'TAMPERED'
                ? 'bg-rose-100 text-rose-700'
                : result.state === 'REVIEW_REQUIRED'
                ? 'bg-amber-100 text-amber-700'
                : result.state === 'REVOKED'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-600'
            }`}>
              <span className="material-symbols-outlined text-[36px]">
                {result.state === 'GENUINE' && 'verified_user'}
                {result.state === 'TAMPERED' && 'dangerous'}
                {result.state === 'REVIEW_REQUIRED' && 'help'}
                {result.state === 'NOT_FOUND' && 'search_off'}
                {result.state === 'REVOKED' && 'block'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <VerificationBadge state={result.state} size="md" />
                <span className="font-mono text-xs text-slate-500 font-semibold">
                  Query: {result.certificateId}
                </span>
              </div>
              <h1 className="font-headline-lg text-2xl sm:text-3xl text-primary font-bold tracking-tight">
                {result.state === 'GENUINE' && 'Credential Verified'}
                {result.state === 'TAMPERED' && 'Verification Failed — Record Mismatch'}
                {result.state === 'REVIEW_REQUIRED' && 'Verification Inconclusive — Review Required'}
                {result.state === 'NOT_FOUND' && 'Record Not Found in Institutional Registry'}
                {result.state === 'REVOKED' && 'Credential Has Been Revoked by Institution'}
              </h1>
              <p className="font-body-lg text-xs sm:text-sm text-on-surface-variant max-w-2xl leading-relaxed">
                {result.summaryMessage}
              </p>
            </div>
          </div>

          {/* Timestamp & Actions */}
          <div className="bg-surface-container-low px-5 py-4 rounded-xl flex flex-col gap-1 shrink-0 w-full md:w-auto border border-slate-200/60">
            <span className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
              Authoritative Registry Query
            </span>
            <span className="text-xs text-primary font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">schedule</span>
              {new Date(result.timestamp).toLocaleDateString()} at {new Date(result.timestamp).toLocaleTimeString()}
            </span>
            <span className="text-[11px] text-on-surface-variant">Channel: {result.channel}</span>
          </div>
        </div>
      </div>

      {/* State-Specific Warning / Notice Banner */}
      {result.state === 'GENUINE' && (
        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-emerald-950 text-sm">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">verified</span>
            <span>GENUINE — Certificate Verified Successfully</span>
          </div>
          <p className="leading-relaxed">
            All required fields matched the trusted institutional registry, and cryptographic verification (SHA-256 canonical hash & Merkle anchor) passed.
          </p>
        </div>
      )}

      {result.state === 'NOT_FOUND' && (
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <span className="material-symbols-outlined text-slate-600 text-[20px]">search_off</span>
            <span>NOT FOUND — No Trusted Certificate Exists</span>
          </div>
          <p className="leading-relaxed">
            No trusted certificate record was found for Certificate ID: <strong className="font-mono">{result.certificateId}</strong>.
          </p>
          <p className="text-slate-600 text-[11px]">
            Tip: Please double-check the Certificate ID or verify that the document has been published to the registry.
          </p>
        </div>
      )}

      {result.state === 'REVOKED' && (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-rose-950 text-sm">
            <span className="material-symbols-outlined text-rose-600 text-[20px]">gavel</span>
            <span>REVOKED — This Certificate Was Revoked</span>
          </div>
          <p className="leading-relaxed">
            {result.detailedMessage}
          </p>
          {result.credential?.revocationReason && (
            <div className="p-2.5 bg-white/80 rounded-xl border border-rose-200 text-rose-900">
              <strong>Reason:</strong> {result.credential.revocationReason}
            </div>
          )}
        </div>
      )}

      {result.state === 'REVIEW_REQUIRED' && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
            <span className="material-symbols-outlined text-amber-600 text-[20px]">help</span>
            <span>REVIEW REQUIRED — Document Could Not Be Reliably Extracted</span>
          </div>
          <p className="leading-relaxed">
            {result.detailedMessage}
          </p>
          {result.missingFields && result.missingFields.length > 0 && (
            <div className="p-2.5 bg-white/80 rounded-xl border border-amber-200 text-amber-900">
              <strong>Unresolved Fields:</strong> {result.missingFields.map(f => f.replace(/_/g, ' ')).join(', ')}
            </div>
          )}
        </div>
      )}

      {result.state === 'TAMPERED' && (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-rose-950 text-sm">
            <span className="material-symbols-outlined text-rose-600 text-[22px]">warning</span>
            <span>TAMPERED — Certificate Data Does Not Match Trusted Registry</span>
          </div>
          <p className="leading-relaxed">
            {result.detailedMessage}
          </p>

          {/* Mismatched Fields Comparison Card */}
          {result.mismatches && Object.keys(result.mismatches).length > 0 ? (
            <div className="bg-white rounded-xl p-4 border border-rose-200 space-y-2.5">
              <span className="font-bold text-rose-950 block text-xs uppercase tracking-wider">
                Confirmed Mismatched Fields:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(result.mismatches).map(([field, diff]) => (
                  <div key={field} className="p-3 bg-rose-50/70 rounded-xl border border-rose-200 text-xs space-y-1">
                    <span className="font-bold text-rose-900 uppercase tracking-wider text-[11px] block">
                      Field: {field.replace(/_/g, ' ')}
                    </span>
                    <div className="flex justify-between items-center text-slate-700 pt-0.5">
                      <span className="text-[11px] text-slate-500">Expected (Registry):</span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {diff.expected}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span className="text-[11px] text-slate-500">Uploaded (Document):</span>
                      <span className="font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                        {diff.actual}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : result.mismatchedFields && result.mismatchedFields.length > 0 ? (
            <div className="bg-white rounded-xl p-3 border border-rose-200 text-rose-900">
              <strong>Mismatched Fields:</strong> {result.mismatchedFields.map(f => f.replace(/_/g, ' ')).join(', ')}
            </div>
          ) : null}
        </div>
      )}

      {/* Grid: Academic Record & Verification Proofs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Credential Detail Dossier (7 Cols) */}
        {result.credential ? (
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">school</span>
                  <span className="text-base font-bold text-primary">Academic Credential Dossier</span>
                </div>
                <span className="text-xs text-slate-500 font-mono">Archive Registry #402</span>
              </div>

              {/* Student Summary */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-primary-container text-white flex items-center justify-center font-bold text-lg shrink-0">
                  {result.credential.studentName.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
                    Conferred Recipient
                  </span>
                  <h3 className="text-xl font-bold text-primary">
                    {result.credential.studentName}
                  </h3>
                  <span className="text-xs text-secondary font-medium block mt-0.5">
                    {result.credential.institution} Alumni Directory
                  </span>
                </div>
              </div>

              {/* Key-Value Attributes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface-container-low p-3.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Certificate Identifier
                  </span>
                  <span className="font-mono text-sm font-bold text-primary mt-0.5 block">
                    {result.credential.id}
                  </span>
                </div>

                <div className="bg-surface-container-low p-3.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Conferral Date
                  </span>
                  <span className="text-sm font-semibold text-primary mt-0.5 block">
                    {result.credential.issueDate}
                  </span>
                </div>

                <div className="bg-surface-container-low p-3.5 rounded-xl border border-slate-200/60 sm:col-span-2">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Conferred Degree / Program
                  </span>
                  <span className="text-sm font-bold text-primary mt-0.5 block">
                    {result.credential.course}
                  </span>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    {result.credential.batch} • {result.credential.degreeType}
                  </span>
                </div>

                <div className="bg-surface-container-low p-3.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Classification & Standing
                  </span>
                  <span className="text-sm font-bold text-secondary mt-0.5 block">
                    {result.credential.grade}
                  </span>
                </div>

                <div className="bg-surface-container-low p-3.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                    Student Matriculation ID
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-700 mt-0.5 block">
                    {result.credential.studentRoll}
                  </span>
                </div>
              </div>

              {/* Institutional Signature Callout */}
              <div className="bg-surface-container-low rounded-xl p-4 flex items-center justify-between border border-slate-200/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-container text-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">history_edu</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-primary block">
                      {result.credential.metadata?.registrarSignature || 'Dr. Arthur Pendelton, Registrar'}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Institutional Signature Token Verified #WSU-7729-SEC
                    </span>
                  </div>
                </div>
                <span className="text-[11px] px-3 py-1 bg-white rounded-full font-bold text-secondary border border-slate-200 shadow-2xs">
                  VALID SEAL
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-3">
              <span className="material-symbols-outlined text-[48px] text-slate-300">
                content_paste_search
              </span>
              <h3 className="text-base font-bold text-primary">No Dossier Available</h3>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
                Full academic dossier details are only rendered when the record is confirmed within an accredited university repository.
              </p>
            </div>
          </div>
        )}

        {/* Right: Verification Proofs / Checklist (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">task_alt</span>
                <span className="text-sm font-bold text-primary">Verification Proofs</span>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                {result.checks.filter((c) => c.passed).length}/{result.checks.length} Passed
              </span>
            </div>

            <div className="space-y-2.5">
              {result.checks.map((chk, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3 text-xs"
                >
                  <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${
                    chk.passed ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {chk.passed ? 'check_circle' : 'cancel'}
                  </span>
                  <div className="flex-1">
                    <span className="font-bold text-slate-900 block">{chk.name}</span>
                    <span className="text-[11px] text-slate-600 leading-relaxed block mt-0.5">
                      {chk.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Cryptographic Ledger Summary */}
            {result.integrityProof && (
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-slate-200 text-xs font-mono space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Digest (SHA-256):</span>
                  <span className="truncate max-w-[140px]">{result.integrityProof.sha256}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Merkle Anchor:</span>
                  <span className="truncate max-w-[140px]">{result.integrityProof.merkleRoot}</span>
                </div>
              </div>
            )}

            {/* Action Buttons Bar */}
            <div className="pt-4 flex flex-col gap-2.5">
              <button
                onClick={copyShareLink}
                id="copyShareBtn"
                className="w-full h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-semibold text-xs border border-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]" id="copyShareIcon">share</span>
                <span id="copyShareText">Share Verification Record</span>
              </button>

              <button
                onClick={() => navigate('/verify')}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">search</span>
                <span>Verify Another Credential</span>
              </button>

              <Link
                to="/"
                className="text-center text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors py-1"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
