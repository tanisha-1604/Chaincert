import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { credentialService } from '../../services/credentialService';
import { authService } from '../../services/authService';
import { Credential } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';

export const StudentCredentialsPage: React.FC = () => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'revoked' | 'review'>('all');
  const [search, setSearch] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    credentialService.getAll().then((data) => {
      setCredentials(data);
      setLoading(false);
    }).catch(() => {
      setCredentials([]);
      setLoading(false);
    });
  }, [currentUser?.email, currentUser?.name]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Credential ID ${text} copied to clipboard!`);
  };

  const filtered = credentials.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.id.toLowerCase().includes(q) ||
      c.course.toLowerCase().includes(q) ||
      c.batch.toLowerCase().includes(q);

    if (filter === 'active') return matchSearch && c.status === 'ACTIVE';
    if (filter === 'revoked') return matchSearch && c.status === 'REVOKED';
    if (filter === 'review') return matchSearch && c.status === 'REVIEW_REQUIRED';
    return matchSearch;
  });

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <span className="material-symbols-outlined text-[18px] text-emerald-400">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Context Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-on-surface-variant font-label-md text-xs mb-1 tracking-wide uppercase">
            <span className="font-semibold text-primary">Student Portal</span>
            <span className="text-outline-variant">•</span>
            <span>Academic Records Repository</span>
          </div>
          <h1 className="font-headline-lg text-2xl sm:text-3xl text-primary tracking-tight font-bold">
            My Credentials
          </h1>
          <p className="font-body-md text-xs sm:text-sm text-on-surface-variant mt-0.5">
            View, inspect, and share official verifiable academic records sealed under your enrollment ledger.
          </p>
        </div>

        {/* Conferred Count Badge */}
        <div className="flex items-center gap-3 bg-surface-container-low px-4 py-2 rounded-xl shadow-xs border border-slate-200 self-start md:self-auto">
          <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center text-secondary">
            <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
          </div>
          <div className="flex flex-col">
            <span className="font-title-md text-xs font-bold text-primary leading-tight">
              {credentials.length} Records Conferred
            </span>
            <span className="text-[11px] text-on-surface-variant">Authenticated & Issued</span>
          </div>
        </div>
      </div>

      {/* Student Profile Summary Card */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              AP
            </div>
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-primary tracking-tight">
                  {currentUser?.name || 'Ananya Patil'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary text-xs font-semibold">
                  ID: {currentUser?.studentId || 'STU-2024-89042'}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-medium text-slate-800 mt-0.5">
                Bachelor of Technology in Artificial Intelligence
              </p>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-1">
                <span className="material-symbols-outlined text-[16px]">school</span>
                <span>Westminster State University</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-surface-container-low p-2.5 px-3.5 rounded-xl border border-slate-200/60">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span className="text-xs font-semibold text-secondary">Verified Enrolled Student</span>
            </div>
            <span className="hidden sm:inline text-slate-400">•</span>
            <span className="text-xs text-on-surface-variant font-medium">Class of 2024</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <span className="material-symbols-outlined text-[18px]">search</span>
          </div>
          <input
            id="credential-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search credentials by ID, course, or conferral year..."
            className="w-full h-10 pl-10 pr-3 rounded-xl bg-surface-container-low text-xs border border-slate-200 focus:outline-none focus:bg-white"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'bg-primary text-white shadow-xs'
                : 'text-on-surface-variant hover:bg-slate-100'
            }`}
          >
            All Statuses
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filter === 'active'
                ? 'bg-secondary text-white shadow-xs'
                : 'text-on-surface-variant hover:bg-slate-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            <span>Active ({credentials.filter((c) => c.status === 'ACTIVE').length})</span>
          </button>
        </div>
      </div>

      {/* Credentials Cards Container */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500">Loading student credentials...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
          <span className="material-symbols-outlined text-[48px] text-slate-300">school</span>
          <h3 className="text-base font-bold text-primary mt-2">No credentials found</h3>
          <p className="text-xs text-on-surface-variant mt-1">Try resetting your filters or search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="credentials-grid">
          {filtered.map((cred) => (
            <div
              key={cred.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-200/80 transition-all flex flex-col justify-between overflow-hidden"
            >
              <div className="p-6 flex-1 flex flex-col justify-between">
                {/* Top ID & Badge */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-primary-container text-white text-[11px] font-semibold tracking-wider uppercase w-fit">
                      <span className="material-symbols-outlined text-[13px]">verified</span>
                      {cred.degreeType}
                    </span>
                    <span className="text-[11px] text-on-surface-variant tracking-wider uppercase mt-1">
                      Conferral Serial ID
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code className="font-mono font-bold text-xs text-primary bg-surface-container-low px-2 py-0.5 rounded-lg border border-slate-200">
                        {cred.id}
                      </code>
                      <button
                        onClick={() => copyToClipboard(cred.id)}
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors"
                        title="Copy Credential ID"
                      >
                        <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      </button>
                    </div>
                  </div>
                  <StatusBadge status={cred.status} size="sm" />
                </div>

                {/* Course & Institution */}
                <div className="py-4">
                  <h3 className="text-lg font-bold text-primary leading-snug">
                    {cred.course}
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">account_balance</span>
                    <span>{cred.institution}</span>
                  </p>
                </div>

                {/* Grid Attributes */}
                <div className="grid grid-cols-2 gap-3 py-3 border-t border-slate-100 text-xs">
                  <div className="bg-surface-container-low p-2.5 rounded-xl">
                    <span className="text-[11px] text-slate-500 block uppercase tracking-wide">Conferral Date</span>
                    <span className="font-semibold text-primary mt-0.5 block">{cred.issueDate}</span>
                  </div>
                  <div className="bg-surface-container-low p-2.5 rounded-xl">
                    <span className="text-[11px] text-slate-500 block uppercase tracking-wide">Academic Batch</span>
                    <span className="font-semibold text-primary mt-0.5 block">{cred.batch}</span>
                  </div>
                  <div className="col-span-2 bg-surface-container-low p-2.5 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-500 block uppercase tracking-wide">Performance Standing</span>
                      <span className="font-bold text-secondary text-sm mt-0.5 block">{cred.cgpa || cred.grade}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-surface-container-high text-primary text-[11px] font-semibold">
                      {cred.grade}
                    </span>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => navigate(`/student/credentials/${encodeURIComponent(cred.id)}`)}
                    className="flex-1 h-10 px-4 rounded-xl bg-primary-container hover:bg-primary text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                    <span>View Credential Details</span>
                  </button>
                  <button
                    onClick={() => {
                      showToast(`Downloading certified PDF for ${cred.id}...`);
                    }}
                    className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary flex items-center justify-center transition-colors border border-slate-200"
                    title="Download Official Certificate"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                  </button>
                  <button
                    onClick={() => {
                      const shareUrl = `${window.location.origin}/verify?id=${encodeURIComponent(cred.id)}`;
                      navigator.clipboard.writeText(shareUrl);
                      showToast('Public verification link copied to clipboard!');
                    }}
                    className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary flex items-center justify-center transition-colors border border-slate-200"
                    title="Share Verification Link"
                  >
                    <span className="material-symbols-outlined text-[18px]">share</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Advisory Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
            <span className="material-symbols-outlined text-[20px]">security</span>
          </div>
          <div>
            <span className="font-bold text-xs sm:text-sm text-primary block leading-tight">
              Institutional Record Governance
            </span>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Student access is strictly read-only for verified credential records. Records are cryptographically sealed by Westminster State University Registrar Office.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-primary text-xs font-semibold whitespace-nowrap">
          <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
          Immutable Vault
        </span>
      </div>
    </div>
  );
};
