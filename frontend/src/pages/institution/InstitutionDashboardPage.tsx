import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { credentialService } from '../../services/credentialService';
import { auditService } from '../../services/auditService';
import { Credential, VerificationHistoryItem } from '../../types';
import { VerificationBadge } from '../../components/common/VerificationBadge';

export const InstitutionDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [history, setHistory] = useState<VerificationHistoryItem[]>([]);
  const [stats, setStats] = useState({
    totalRegistered: 0,
    issuedCredentials: 0,
    validCredentials: 0,
    revokedCredentials: 0,
    reviewRequired: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [creds, hist, liveStats] = await Promise.all([
        credentialService.getAll(),
        auditService.getVerificationHistory(),
        credentialService.getInstitutionStats(),
      ]);
      setCredentials(creds);
      setHistory(hist);
      setStats(liveStats);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = credentialService.subscribe(() => {
      loadData();
    });
    return unsubscribe;
  }, []);

  const totalRegistered = stats.totalRegistered;
  const issuedCredentials = stats.issuedCredentials;
  const activeCredentials = stats.validCredentials;
  const revokedCredentials = stats.revokedCredentials;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <span className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></span>
        <span className="text-sm font-medium text-on-surface-variant">Loading registrar dashboard telemetry...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full space-y-8">
      {/* SECTION 1: OVERVIEW METRIC TILES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Registered Certificates */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-md text-xs text-on-surface-variant font-medium tracking-wide">
                Registered Certificates
              </span>
              <span className="font-display-lg text-3xl font-bold text-on-surface tracking-tight mt-1 leading-none">
                {totalRegistered.toLocaleString()}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shadow-inner">
              <span className="material-symbols-outlined text-[24px]">history_edu</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4 pt-3 bg-surface-container-low rounded-lg px-2.5 py-1.5 w-fit text-xs text-on-surface font-medium border border-slate-200/40">
            <span className="material-symbols-outlined text-secondary text-[16px]">trending_up</span>
            <span>{credentials.length === 0 ? 'No records yet' : `${credentials.length} record(s) available`}</span>
          </div>
        </div>

        {/* Card 2: Issued Credentials */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-md text-xs text-on-surface-variant font-medium tracking-wide">
                Issued Credentials
              </span>
              <span className="font-display-lg text-3xl font-bold text-on-surface tracking-tight mt-1 leading-none">
                {issuedCredentials.toLocaleString()}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-surface-container-high text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">school</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4 pt-3 bg-surface-container-low rounded-lg px-2.5 py-1.5 w-fit text-xs text-on-surface font-medium border border-slate-200/40">
            <span className="material-symbols-outlined text-primary text-[16px]">pie_chart</span>
            <span>{credentials.length === 0 ? 'Awaiting issuance data' : 'Based on registry records'}</span>
          </div>
        </div>

        {/* Card 3: Active Credentials */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-md text-xs text-on-surface-variant font-medium tracking-wide">
                Active Credentials
              </span>
              <span className="font-display-lg text-3xl font-bold text-on-surface tracking-tight mt-1 leading-none">
                {activeCredentials.toLocaleString()}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-inner">
              <span className="material-symbols-outlined text-[24px]">verified</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4 pt-3 bg-emerald-50 rounded-lg px-2.5 py-1.5 w-fit text-xs text-emerald-800 font-semibold border border-emerald-200">
            <span className="material-symbols-outlined text-emerald-600 text-[16px]">check_circle</span>
            <span>{activeCredentials === 0 ? 'No active credentials' : 'Active in registry'}</span>
          </div>
        </div>

        {/* Card 4: Revoked Credentials */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-md text-xs text-on-surface-variant font-medium tracking-wide">
                Revoked Credentials
              </span>
              <span className="font-display-lg text-3xl font-bold text-rose-700 tracking-tight mt-1 leading-none">
                {revokedCredentials}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shadow-inner">
              <span className="material-symbols-outlined text-[24px]">block</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4 pt-3 bg-rose-50 rounded-lg px-2.5 py-1.5 w-fit text-xs text-rose-800 font-medium border border-rose-200">
            <span className="material-symbols-outlined text-rose-600 text-[16px]">gavel</span>
            <span>{revokedCredentials === 0 ? 'No revoked records' : 'Published on revocation ledger'}</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: QUICK ACTIONS & INTEGRITY STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Quick Actions Panel */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
            <div>
              <h2 className="text-lg font-bold text-primary tracking-tight">Quick Registrar Actions</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">Manage, issue, and verify student records instantly</p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-surface-container text-xs font-semibold text-primary">
              Standard Tools
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => navigate('/institution/certificates?action=register')}
              className="p-5 rounded-xl bg-surface-container-low hover:bg-surface-container transition-all border border-slate-200/80 text-left flex flex-col justify-between group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center mb-3 shadow-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">add_circle</span>
              </div>
              <div>
                <span className="block font-bold text-sm text-primary group-hover:text-secondary transition-colors">
                  Register Certificate
                </span>
                <span className="block text-xs text-on-surface-variant mt-1">
                  Issue an individual verified degree or diploma
                </span>
              </div>
            </button>

            <button
              onClick={() => navigate('/institution/bulk-issuance')}
              className="p-5 rounded-xl bg-surface-container-low hover:bg-surface-container transition-all border border-slate-200/80 text-left flex flex-col justify-between group"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary text-white flex items-center justify-center mb-3 shadow-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">upload_file</span>
              </div>
              <div>
                <span className="block font-bold text-sm text-primary group-hover:text-secondary transition-colors">
                  Bulk Issue
                </span>
                <span className="block text-xs text-on-surface-variant mt-1">
                  Upload CSV/XLSX for graduated cohort batches
                </span>
              </div>
            </button>

            <button
              onClick={() => navigate('/institution/verification')}
              className="p-5 rounded-xl bg-surface-container-low hover:bg-surface-container transition-all border border-slate-200/80 text-left flex flex-col justify-between group"
            >
              <div className="w-10 h-10 rounded-lg bg-tertiary-container text-white flex items-center justify-center mb-3 shadow-sm group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[22px]">fact_check</span>
              </div>
              <div>
                <span className="block font-bold text-sm text-primary group-hover:text-secondary transition-colors">
                  Verify Credential
                </span>
                <span className="block text-xs text-on-surface-variant mt-1">
                  Query Certificate ID or validate document hash
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Node Cryptographic Status Widget */}
        <div className="lg:col-span-4 bg-primary-container text-on-primary rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-emerald-300 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Registry Status
              </span>
              <span className="material-symbols-outlined text-white/40 text-[20px]">security</span>
            </div>

            <div>
              <h3 className="text-xl font-bold">{credentials.length === 0 ? 'No records available' : 'Registry data loaded'}</h3>
              <p className="text-xs text-[#7991af] mt-1 leading-relaxed">
                {credentials.length === 0
                  ? 'The registry is currently empty; integrity cannot be claimed until records are present.'
                  : 'The dashboard reflects actual certificate records in the backend database.'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5 text-xs font-mono text-[#b0c9e8]">
              <div className="flex justify-between">
                <span className="text-white/60">Record Count:</span>
                <span className="truncate max-w-[140px]">{credentials.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Verification:</span>
                <span>{credentials.length === 0 ? 'Unknown' : 'Available'}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 mt-4">
            <button
              onClick={() => navigate('/institution/audit')}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
            >
              <span>View Audit & Integrity Ledger</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-primary tracking-tight">Recent Verification Activity</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Authoritative inquiries logged across admissions and employer portals</p>
          </div>
          <button
            onClick={() => navigate('/institution/verification')}
            className="text-xs font-semibold text-secondary hover:underline flex items-center gap-1"
          >
            <span>Open Verification Workspace</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-sm text-slate-500 py-6">No verification events recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[11px] font-semibold">
                <tr>
                  <th className="py-3 px-3">Query ID</th>
                  <th className="py-3 px-3">Requester</th>
                  <th className="py-3 px-3">Result</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {history.slice(0, 5).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-3 font-mono font-semibold text-primary">{item.queryId}</td>
                    <td className="py-3.5 px-3">{item.requester}</td>
                    <td className="py-3.5 px-3"><VerificationBadge state={item.result} size="sm" /></td>
                    <td className="py-3.5 px-3">{item.channel}</td>
                    <td className="py-3.5 px-3">{item.verifiedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
