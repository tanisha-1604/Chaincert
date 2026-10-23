import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { credentialService } from '../../services/credentialService';
import { Credential, CredentialStatus } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';

export const CertificatesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCourse, setFilterCourse] = useState('ALL');
  const [filterBatch, setFilterBatch] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Modals & Drawer State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedCred, setSelectedCred] = useState<Credential | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Credential | null>(null);
  const [revokeReason, setRevokeReason] = useState('Academic Ethics Board resolution');
  const [revokeCustomNotes, setRevokeCustomNotes] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // New Certificate Form
  const [newCert, setNewCert] = useState({
    id: `CC-2024-${Math.floor(10000 + Math.random() * 90000)}-WSU`,
    studentName: '',
    studentRoll: '',
    studentEmail: '',
    course: 'Bachelor of Technology in Artificial Intelligence',
    degreeType: 'Undergraduate Degree',
    institution: 'Westminster State University',
    institutionId: 'inst_wsu_01',
    issueDate: new Date().toISOString().split('T')[0],
    batch: 'Class of 2024',
    grade: 'First Class with Distinction',
    cgpa: '9.80'
  });

  // Edit Certificate Form
  const [editFormData, setEditFormData] = useState({
    studentName: '',
    studentRoll: '',
    course: '',
    grade: '',
    batch: '',
    issueDate: ''
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await credentialService.getAll();
      setCredentials(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (searchParams.get('action') === 'register') {
      setIsRegisterOpen(true);
    }
  }, [searchParams]);

  // Open Details Drawer
  const openDetails = (cred: Credential) => {
    setSelectedCred(cred);
    setEditFormData({
      studentName: cred.studentName,
      studentRoll: cred.studentRoll,
      course: cred.course,
      grade: cred.grade,
      batch: cred.batch,
      issueDate: cred.issueDate
    });
    setIsEditing(false);
    setIsDrawerOpen(true);
  };

  // Handle Register
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCert.studentName || !newCert.studentRoll) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const created = await credentialService.register(newCert);
      setIsRegisterOpen(false);
      showToast(`Certificate ${created.id} successfully registered in institutional ledger.`);
      await loadData();
    } catch (error) {
      if (error instanceof Error) setSubmitError(error.message);
      showToast('Error registering certificate.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit/Correction
  const handleSaveCorrection = async () => {
    if (!selectedCred) return;
    try {
      const updated = await credentialService.update(selectedCred.id, editFormData);
      setSelectedCred(updated);
      setIsEditing(false);
      showToast(`Certificate ${updated.id} records corrected and re-hashed.`);
      await loadData();
    } catch {
      showToast('Error updating record.');
    }
  };

  // Handle Revoke
  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      const fullReason = revokeCustomNotes ? `${revokeReason}: ${revokeCustomNotes}` : revokeReason;
      await credentialService.revoke(revokeTarget.id, fullReason);
      setIsRevokeOpen(false);
      setIsDrawerOpen(false);
      showToast(`Certificate ${revokeTarget.id} has been revoked.`);
      await loadData();
    } catch {
      showToast('Error revoking certificate.');
    }
  };

  // Filtered List
  const filteredCredentials = credentials.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      c.id.toLowerCase().includes(q) ||
      c.studentName.toLowerCase().includes(q) ||
      c.studentRoll.toLowerCase().includes(q) ||
      c.course.toLowerCase().includes(q);

    const matchesCourse = filterCourse === 'ALL' || c.course === filterCourse;
    const matchesBatch = filterBatch === 'ALL' || c.batch === filterBatch;
    const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus;

    return matchesSearch && matchesCourse && matchesBatch && matchesStatus;
  });

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-[100] bg-primary text-white text-xs px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <span className="material-symbols-outlined text-[18px] text-emerald-400">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-xs uppercase tracking-wider mb-1">
            <span>Academic Records</span>
            <span>•</span>
            <span>Credential Directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
            Institutional Certificates
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Authoritative institutional catalog of conferred degrees, diplomas, and certifications.
          </p>
        </div>

        <button
          onClick={() => {
            setNewCert(prev => ({
              ...prev,
              id: `CC-2024-${Math.floor(10000 + Math.random() * 90000)}-WSU`
            }));
            setIsRegisterOpen(true);
          }}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-primary hover:bg-primary-container text-white text-sm font-semibold shadow-sm transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span>Register Certificate</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              id="searchInput"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, student, roll no..."
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-surface-container-low border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Filter Course */}
          <div>
            <select
              id="filterCourse"
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-slate-200 text-xs focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Disciplines / Courses</option>
              <option value="Bachelor of Technology in Artificial Intelligence">B.Tech in Artificial Intelligence</option>
              <option value="Honors Specialization in Distributed Machine Learning">Honors in Distributed ML</option>
              <option value="Master of Science in Computer Science">M.S. in Computer Science</option>
              <option value="Bachelor of Science in Molecular Biochemistry">B.S. in Molecular Biochemistry</option>
              <option value="Juris Doctor in Comparative Corporate Law">Juris Doctor</option>
              <option value="Doctor of Medicine (Clinical Cardiology)">Doctor of Medicine</option>
            </select>
          </div>

          {/* Filter Batch */}
          <div>
            <select
              id="filterBatch"
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-slate-200 text-xs focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Batches</option>
              <option value="Class of 2024">Class of 2024</option>
              <option value="Class of 2023">Class of 2023</option>
              <option value="Class of 2022">Class of 2022</option>
            </select>
          </div>

          {/* Filter Status */}
          <div>
            <select
              id="filterStatus"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-slate-200 text-xs focus:bg-white focus:outline-none font-semibold text-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active & Conferred</option>
              <option value="REVOKED">Revoked Only</option>
              <option value="REVIEW_REQUIRED">Under Review</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-on-surface-variant flex flex-col items-center gap-2">
            <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
            <span>Loading registry certificates...</span>
          </div>
        ) : filteredCredentials.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <span className="material-symbols-outlined text-slate-300 text-[48px]">school</span>
            <h3 className="font-bold text-sm text-primary">No credentials found</h3>
            <p className="text-xs text-on-surface-variant">Try resetting your filters or search keywords.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[11px] font-semibold tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Certificate ID</th>
                  <th className="py-3.5 px-4">Student Name & Roll</th>
                  <th className="py-3.5 px-4">Degree / Program</th>
                  <th className="py-3.5 px-4">Issue Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100" id="certificateTableBody">
                {filteredCredentials.map((cred) => (
                  <tr key={cred.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-primary">
                      {cred.id}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{cred.studentName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{cred.studentRoll}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-medium">{cred.course}</div>
                      <div className="text-[11px] text-slate-500">{cred.batch} • {cred.grade}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {cred.issueDate}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={cred.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => openDetails(cred)}
                          className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-semibold text-xs transition-colors"
                        >
                          View Details
                        </button>
                        {cred.status !== 'REVOKED' && (
                          <button
                            onClick={() => {
                              setRevokeTarget(cred);
                              setIsRevokeOpen(true);
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 font-semibold text-xs transition-colors"
                            title="Revoke Credential"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-on-surface-variant">
          <span>
            Showing <strong className="text-primary">{filteredCredentials.length}</strong> of{' '}
            <strong className="text-primary">{credentials.length}</strong> records
          </span>
          <span className="font-mono text-[11px]">Westminster State University Registrar Registry</span>
        </div>
      </div>

      {/* REGISTER CERTIFICATE MODAL */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/70 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <span className="font-label-sm text-xs text-secondary font-bold uppercase tracking-wider">
                  Accredited Issuance
                </span>
                <h2 className="text-xl font-bold text-primary mt-1">Register Academic Certificate</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Confer a permanent credential record to the university institutional registry.
                </p>
              </div>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-4" id="registerForm">
              {submitError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {submitError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    Certificate ID
                  </label>
                  <input
                    id="regId"
                    type="text"
                    required
                    value={newCert.id}
                    onChange={(e) => setNewCert({ ...newCert, id: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-slate-200 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    Conferral / Issue Date
                  </label>
                  <input
                    id="regDate"
                    type="date"
                    required
                    value={newCert.issueDate}
                    onChange={(e) => setNewCert({ ...newCert, issueDate: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    Student Full Name
                  </label>
                  <input
                    id="regName"
                    type="text"
                    required
                    placeholder="e.g. Liam Christopher Taylor"
                    value={newCert.studentName}
                    onChange={(e) => setNewCert({ ...newCert, studentName: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    Student Roll / ID
                  </label>
                  <input
                    id="regRoll"
                    type="text"
                    required
                    placeholder="e.g. WSU-2020-CS-112"
                    value={newCert.studentRoll}
                    onChange={(e) => setNewCert({ ...newCert, studentRoll: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-primary block mb-1">
                  Course / Academic Degree
                </label>
                <select
                  id="regCourse"
                  value={newCert.course}
                  onChange={(e) => setNewCert({ ...newCert, course: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="Bachelor of Technology in Artificial Intelligence">Bachelor of Technology in Artificial Intelligence</option>
                  <option value="Master of Science in Computer Science">Master of Science in Computer Science</option>
                  <option value="Bachelor of Science in Molecular Biochemistry">Bachelor of Science in Molecular Biochemistry</option>
                  <option value="Juris Doctor in Comparative Corporate Law">Juris Doctor in Comparative Corporate Law</option>
                  <option value="Doctor of Medicine (Clinical Cardiology)">Doctor of Medicine (Clinical Cardiology)</option>
                  <option value="Bachelor of Business Administration">Bachelor of Business Administration</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    Batch
                  </label>
                  <input
                    id="regBatch"
                    type="text"
                    value={newCert.batch}
                    onChange={(e) => setNewCert({ ...newCert, batch: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    Grade / Classification
                  </label>
                  <input
                    id="regGrade"
                    type="text"
                    value={newCert.grade}
                    onChange={(e) => setNewCert({ ...newCert, grade: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    CGPA / Cumulative Grade (0.00 – 10.00) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="regCgpa"
                    type="text"
                    required
                    placeholder="e.g. 9.80"
                    value={newCert.cgpa}
                    onChange={(e) => setNewCert({ ...newCert, cgpa: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">
                    Issuing Authority (Bound Account)
                  </label>
                  <div className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center text-slate-700 font-medium">
                    <span className="material-symbols-outlined text-[16px] text-emerald-600 mr-1.5">verified</span>
                    <span>Authenticated Institutional Account</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">{isSubmitting ? 'sync' : 'verified'}</span>
                  <span>{isSubmitting ? 'Registering...' : 'Register & Sign Credential'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CERTIFICATE DETAILS / EDIT DRAWER */}
      {isDrawerOpen && selectedCred && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-primary/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          ></div>
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between">
              {/* Drawer Top */}
              <div className="p-6 border-b border-slate-100 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-secondary">{selectedCred.id}</span>
                    <StatusBadge status={selectedCred.status} size="sm" />
                  </div>
                  <h2 className="text-xl font-bold text-primary">
                    {isEditing ? 'Correct Certificate Record' : 'Certificate Details'}
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {isEditing
                      ? 'Authorized corrections create a new cryptographic digest while maintaining provenance.'
                      : 'Authoritative registrar record stored in institutional registry.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Drawer Content */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {!isEditing ? (
                  // Read-only view
                  <div className="space-y-6" id="drawerReadView">
                    <div className="p-4 rounded-xl bg-surface-container-low border border-slate-200/80 space-y-3">
                      <div>
                        <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Student Name</span>
                        <span className="text-base font-bold text-primary">{selectedCred.studentName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                        <div>
                          <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Roll Number</span>
                          <span className="font-mono font-semibold text-xs text-slate-800">{selectedCred.studentRoll}</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Conferral Date</span>
                          <span className="text-xs text-slate-800 font-medium">{selectedCred.issueDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Degree / Major</span>
                        <span className="text-sm font-semibold text-primary">{selectedCred.course}</span>
                        <div className="text-xs text-slate-600 mt-1">Batch: {selectedCred.batch} • {selectedCred.grade}</div>
                      </div>

                      <div className="p-3.5 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Issuing Authority</span>
                        <span className="text-sm font-semibold text-primary">{selectedCred.institution}</span>
                        <span className="text-xs text-slate-500 block mt-0.5">HLC Accredited Institutional Registry</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono text-xs">
                        <span className="text-[11px] text-slate-500 uppercase tracking-wider font-sans block">Cryptographic Digest</span>
                        <div className="text-[11px] text-slate-700 break-all bg-white p-2 rounded border border-slate-200">
                          SHA-256: {selectedCred.sha256Hash}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          Merkle Root: {selectedCred.merkleRoot} (Leaf #{selectedCred.merkleLeafIndex || 1})
                        </div>
                      </div>

                      {selectedCred.status === 'REVOKED' && (
                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                          <span className="font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">gavel</span>
                            Revocation Notice
                          </span>
                          <p>{selectedCred.revocationReason}</p>
                          <span className="text-[11px] text-rose-600 block">
                            Revoked by {selectedCred.revokedBy} on {selectedCred.revokedAt ? new Date(selectedCred.revokedAt).toLocaleDateString() : 'Official Session'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Authorized Edit/Correction form
                  <div className="space-y-4" id="drawerEditView">
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">info</span>
                      <span>Modifications will be logged in the immutable institutional audit trail.</span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-primary block mb-1">Student Full Name</label>
                      <input
                        type="text"
                        value={editFormData.studentName}
                        onChange={(e) => setEditFormData({ ...editFormData, studentName: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-primary block mb-1">Student Roll Number</label>
                      <input
                        type="text"
                        value={editFormData.studentRoll}
                        onChange={(e) => setEditFormData({ ...editFormData, studentRoll: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-primary block mb-1">Course / Degree Title</label>
                      <input
                        type="text"
                        value={editFormData.course}
                        onChange={(e) => setEditFormData({ ...editFormData, course: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-primary block mb-1">Batch</label>
                        <input
                          type="text"
                          value={editFormData.batch}
                          onChange={(e) => setEditFormData({ ...editFormData, batch: e.target.value })}
                          className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-primary block mb-1">Grade</label>
                        <input
                          type="text"
                          value={editFormData.grade}
                          onChange={(e) => setEditFormData({ ...editFormData, grade: e.target.value })}
                          className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                {!isEditing ? (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-primary text-xs font-semibold hover:bg-slate-100 transition-colors shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      <span>Correct Information</span>
                    </button>
                    {selectedCred.status !== 'REVOKED' && (
                      <button
                        onClick={() => {
                          setRevokeTarget(selectedCred);
                          setIsRevokeOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">block</span>
                        <span>Revoke Certificate</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveCorrection}
                      className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-container shadow-sm flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      <span>Save Authorized Correction</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVOKE CERTIFICATE CONFIRMATION MODAL */}
      {isRevokeOpen && revokeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-primary/70 backdrop-blur-sm" id="revokeModal">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[28px]">warning</span>
            </div>

            <h2 className="text-xl font-bold text-primary">Revoke Certificate?</h2>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              This action will publish a permanent revocation notice on the public verification portal. The Certificate ID will remain queryable, but its status will be displayed as REVOKED.
            </p>

            <div className="my-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-mono font-bold text-primary">{revokeTarget.id}</div>
              <div className="text-slate-800">{revokeTarget.studentName} ({revokeTarget.studentRoll})</div>
              <div className="text-slate-500">{revokeTarget.course}</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-primary block mb-1">
                  Revocation Authority / Reason
                </label>
                <select
                  id="revokeReasonSelect"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-xs"
                >
                  <option value="Academic Ethics & Integrity Board resolution">Academic Ethics & Integrity Board resolution</option>
                  <option value="Conferral error or transcript irregularity">Conferral error or transcript irregularity</option>
                  <option value="Administrative re-issuance under revised credential program">Administrative re-issuance under revised program</option>
                  <option value="Student record falsification identified post-graduation">Student record falsification identified</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-primary block mb-1">
                  Additional Internal Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={revokeCustomNotes}
                  onChange={(e) => setRevokeCustomNotes(e.target.value)}
                  placeholder="Enter resolution number or dean approval reference..."
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRevokeOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">gavel</span>
                <span>Confirm Revocation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
