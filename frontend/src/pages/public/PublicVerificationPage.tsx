import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { verificationService } from '../../services/verificationService';

export const PublicVerificationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'id' | 'link' | 'upload'>('id');
  const [certId, setCertId] = useState(searchParams.get('id') || 'CC-2024-89042-ENG');
  const [linkInput, setLinkInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      setCertId(idParam);
    }
  }, [searchParams]);

  const handleIdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certId.trim()) return;
    setIsVerifying(true);
    setTimeout(() => {
      navigate(`/verify/result?id=${encodeURIComponent(certId.trim())}&channel=ID_LOOKUP`);
    }, 400);
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) return;
    try {
      // Extract query param id if it's a URL
      const url = new URL(linkInput.trim());
      const idFromUrl = url.searchParams.get('id');
      if (idFromUrl) {
        navigate(`/verify/result?id=${encodeURIComponent(idFromUrl)}&channel=DIRECT_LINK`);
        return;
      }
    } catch {
      // Not a full URL, treat as ID
    }
    navigate(`/verify/result?id=${encodeURIComponent(linkInput.trim())}&channel=DIRECT_LINK`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadPreview(URL.createObjectURL(file));
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) return;
    setIsVerifying(true);
    try {
      const res = await verificationService.verifyUploadedFile(selectedFile);
      navigate(`/verify/result?id=${encodeURIComponent(res.certificateId)}&channel=DOCUMENT_UPLOAD`, {
        state: { verificationResult: res },
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-10 flex flex-col gap-10">
      {/* Header Notice & Breadcrumb */}
      <div className="flex flex-col items-center text-center gap-3">
        <nav className="flex items-center gap-1.5 text-on-surface-variant font-label-md text-xs mb-1">
          <Link to="/" className="hover:text-primary transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">home</span>
            <span>Home</span>
          </Link>
          <span>/</span>
          <span className="text-primary font-semibold">Verify Credential</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-surface-container text-primary font-label-sm text-xs uppercase tracking-wider font-semibold border border-slate-200/60">
          <span className="material-symbols-outlined text-[15px] text-secondary">verified_user</span>
          <span>Institutional Registry Public Portal</span>
        </div>
        <h1 className="font-display-lg text-3xl sm:text-4xl text-primary tracking-tight font-bold max-w-3xl">
          Verify an Academic Credential
        </h1>
        <p className="font-body-lg text-sm sm:text-base text-on-surface-variant max-w-2xl leading-relaxed">
          Confirm whether a credential is registered with the issuing institution and whether its details match the trusted institutional record.
        </p>
      </div>

      {/* Multi-Method Verification Container */}
      <div className="w-full flex flex-col gap-6">
        {/* Navigation Tabs Between Input Methods */}
        <div className="flex justify-center">
          <div className="bg-surface-container-low p-1.5 rounded-2xl shadow-xs inline-flex items-center gap-1 border border-slate-200/80">
            <button
              onClick={() => setActiveTab('id')}
              id="tab-id-btn"
              type="button"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeTab === 'id'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">pin</span>
              <span>Certificate ID</span>
            </button>

            <button
              onClick={() => setActiveTab('link')}
              id="tab-link-btn"
              type="button"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeTab === 'link'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">link</span>
              <span>Verification Link</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              id="tab-upload-btn"
              type="button"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                activeTab === 'upload'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span>Upload Document</span>
            </button>
          </div>
        </div>

        {/* METHOD 1: Certificate ID Search */}
        {activeTab === 'id' && (
          <div className="w-full bg-white rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200/80" id="method-id-panel">
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs uppercase tracking-wider text-secondary font-bold">Method 01</span>
                  <h2 className="text-xl font-bold text-primary mt-0.5">Institutional Identifier Lookup</h2>
                </div>
                <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-primary border border-slate-200">
                  <span className="material-symbols-outlined text-[22px]">badge</span>
                </div>
              </div>

              <form onSubmit={handleIdSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-primary flex items-center gap-1" htmlFor="certificate-id-input">
                    <span>Certificate ID</span>
                    <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[20px]">
                      tag
                    </span>
                    <input
                      id="certificate-id-input"
                      type="text"
                      required
                      value={certId}
                      onChange={(e) => setCertId(e.target.value)}
                      placeholder="Enter Certificate ID (e.g. CC-2024-89042-ENG)"
                      className="w-full h-12 pl-11 pr-4 rounded-xl bg-surface-container-low font-mono font-medium text-sm text-primary focus:outline-none focus:bg-white border border-slate-200 uppercase tracking-wide transition-all"
                    />
                  </div>
                  <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-1">
                    <span className="material-symbols-outlined text-[15px]">info</span>
                    <span>Enter the Certificate ID displayed on the physical or electronic credential.</span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-container transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-70"
                >
                  {isVerifying ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Querying Institutional Registry...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">search_check</span>
                      <span>Verify Credential</span>
                    </>
                  )}
                </button>
              </form>

              {/* Quick Test Identifiers */}
              <div className="pt-4 bg-surface-container-low/70 rounded-xl p-4 border border-slate-200/60">
                <span className="text-[11px] uppercase tracking-wider text-on-surface-variant block mb-2 font-semibold">
                  Test Registry Samples:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCertId('CC-2024-89042-ENG')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-xs font-semibold text-primary shadow-2xs hover:bg-slate-50 border border-slate-200"
                  >
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    <span>CC-2024-89042-ENG</span>
                    <span className="text-secondary font-semibold">(Genuine)</span>
                  </button>

                  <button
                    onClick={() => setCertId('CC-2024-99211-LAW')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-xs font-semibold text-primary shadow-2xs hover:bg-slate-50 border border-slate-200"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                    <span>CC-2024-99211-LAW</span>
                    <span className="text-rose-600 font-semibold">(Revoked)</span>
                  </button>

                  <button
                    onClick={() => setCertId('CC-2024-55120-MED')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-xs font-semibold text-primary shadow-2xs hover:bg-slate-50 border border-slate-200"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>CC-2024-55120-MED</span>
                    <span className="text-amber-700 font-semibold">(Review Required)</span>
                  </button>

                  <button
                    onClick={() => setCertId('CC-TAMPERED-SAMPLE')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-xs font-semibold text-primary shadow-2xs hover:bg-slate-50 border border-slate-200"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>CC-TAMPERED-SAMPLE</span>
                    <span className="text-rose-700 font-semibold">(Tampered)</span>
                  </button>

                  <button
                    onClick={() => setCertId('CC-UNKNOWN-RECORD')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-xs font-semibold text-primary shadow-2xs hover:bg-slate-50 border border-slate-200"
                  >
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span>CC-UNKNOWN-RECORD</span>
                    <span className="text-slate-600 font-semibold">(Not Found)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* METHOD 2: Direct Link Resolution */}
        {activeTab === 'link' && (
          <div className="w-full bg-white rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200/80" id="method-link-panel">
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs uppercase tracking-wider text-secondary font-bold">Method 02</span>
                  <h2 className="text-xl font-bold text-primary mt-0.5">Direct Verification Link</h2>
                </div>
                <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-primary border border-slate-200">
                  <span className="material-symbols-outlined text-[22px]">link</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-slate-200 flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary text-[24px]">qr_code_scanner</span>
                <div className="text-xs text-on-surface-variant">
                  Paste the official verification URL from an email, student share link, or QR code query string.
                </div>
              </div>

              <form onSubmit={handleLinkSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-primary" htmlFor="verification-url-input">
                    Verification URL / QR Link
                  </label>
                  <input
                    id="verification-url-input"
                    type="text"
                    required
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://chaincert.org/verify?id=CC-2024-89042-ENG"
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-low text-xs text-primary border border-slate-200 focus:bg-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-container transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <span className="material-symbols-outlined text-[20px]">search_check</span>
                  <span>Resolve & Verify Link</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* METHOD 3: Document Upload */}
        {activeTab === 'upload' && (
          <div className="w-full bg-white rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200/80" id="method-upload-panel">
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs uppercase tracking-wider text-secondary font-bold">Method 03</span>
                  <h2 className="text-xl font-bold text-primary mt-0.5">Verify by Uploading a Certificate</h2>
                </div>
                <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-primary border border-slate-200">
                  <span className="material-symbols-outlined text-[22px]">upload_file</span>
                </div>
              </div>

              <p className="text-xs text-on-surface-variant">
                Upload a digital PDF certificate or diploma image. The backend will parse the institutional seals, extract the Certificate ID, and verify authentic cryptographic concordance.
              </p>

              <label className="border-2 border-dashed border-slate-300 hover:border-primary rounded-2xl p-8 text-center transition-colors cursor-pointer bg-surface-container-low/50 flex flex-col items-center justify-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-white text-secondary flex items-center justify-center shadow-xs border border-slate-200">
                  <span className="material-symbols-outlined text-[32px]">cloud_upload</span>
                </div>
                <div>
                  <span className="text-sm font-semibold text-primary block">
                    {selectedFile ? selectedFile.name : 'Choose certificate file or drop here'}
                  </span>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    PDF, PNG, JPG up to 15MB
                  </span>
                </div>
              </label>

              {selectedFile && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-emerald-600 text-[24px]">task</span>
                    <div>
                      <span className="text-xs font-bold text-emerald-950 block">{selectedFile.name}</span>
                      <span className="text-[11px] text-emerald-700 block">Ready for automated OCR and cryptographic digest analysis</span>
                    </div>
                  </div>
                  <button
                    onClick={handleUploadSubmit}
                    disabled={isVerifying}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors"
                  >
                    {isVerifying ? 'Analyzing...' : 'Verify Uploaded Document →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Educational Section: How Verification Works */}
      <section className="bg-surface-container-low/60 rounded-2xl p-6 sm:p-8 border border-slate-200/80">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-secondary text-[24px]">verified</span>
          <h2 className="text-lg font-bold text-primary">How Verification Works</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-on-surface-variant leading-relaxed">
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h3 className="font-bold text-primary mb-1 text-sm">1. Registry Query</h3>
            <p>The Certificate ID is queried against the authoritative database in the issuing university’s custody.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h3 className="font-bold text-primary mb-1 text-sm">2. Signature Concordance</h3>
            <p>The institutional PKI signature and SHA-256 digest are evaluated to detect any post-issuance tampering.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h3 className="font-bold text-primary mb-1 text-sm">3. Transparent Results</h3>
            <p>Verification returns an unambiguous result: Genuine, Tampered, Review Required, Not Found, or Revoked.</p>
          </div>
        </div>
      </section>
    </div>
  );
};
