import React, { useState } from 'react';
import { credentialService } from '../../services/credentialService';
import { BulkRecordItem } from '../../types';

export const BulkIssuancePage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>('Graduation_Batch_2024_CohortA.csv');
  const [fileSize, setFileSize] = useState<string>('184 KB');
  const [hasErrors, setHasErrors] = useState<boolean>(true);
  const [conferralConfirmed, setConferralConfirmed] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [issuedBatchId, setIssuedBatchId] = useState<string>('');

  // Sample Records
  const [records, setRecords] = useState<BulkRecordItem[]>([
    {
      id: 'CC-2024-89101-ENG',
      name: 'Rohan Sharma',
      roll: 'WSU-2020-CS-101',
      course: 'Bachelor of Technology in Artificial Intelligence',
      grade: 'First Class with Distinction',
      batch: 'Class of 2024',
      date: '2024-05-24',
      status: 'VALID'
    },
    {
      id: 'CC-2024-89102-ENG',
      name: 'Maya Lin',
      roll: 'WSU-2020-CS-102',
      course: 'Bachelor of Technology in Artificial Intelligence',
      grade: 'First Class',
      batch: 'Class of 2024',
      date: '2024-05-24',
      status: 'VALID'
    },
    {
      id: 'CC-2024-89103-ENG',
      name: 'Tariq Al-Mansoor',
      roll: 'WSU-2020-CS-103',
      course: 'Bachelor of Technology in Artificial Intelligence',
      grade: 'First Class with Distinction',
      batch: 'Class of 2024',
      date: '2024-05-24',
      status: 'VALID'
    },
    {
      id: 'CC-2024-89104-ENG',
      name: 'Kavita Patel',
      roll: '',
      course: 'Bachelor of Technology in Artificial Intelligence',
      grade: 'Distinction',
      batch: 'Class of 2024',
      date: '2024-05-24',
      status: 'ERROR',
      errorMessage: 'Missing mandatory Student Roll / Matriculation Number'
    },
    {
      id: 'CC-2024-89042-ENG',
      name: 'Ananya Patil',
      roll: 'WSU-2020-CS-042',
      course: 'Bachelor of Technology in Artificial Intelligence',
      grade: 'First Class Distinction',
      batch: 'Class of 2024',
      date: '2024-05-24',
      status: 'DUPLICATE',
      errorMessage: 'Certificate ID already exists in registry ledger'
    }
  ]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
      setCurrentStep(2);
    }
  };

  const handleResolveErrors = () => {
    // Resolve errors by correcting the missing field and updating duplicate ID
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id === 'CC-2024-89104-ENG') {
          return {
            ...r,
            roll: 'WSU-2020-CS-104',
            status: 'VALID',
            errorMessage: undefined
          };
        }
        if (r.id === 'CC-2024-89042-ENG') {
          return {
            ...r,
            id: 'CC-2024-89105-ENG',
            status: 'VALID',
            errorMessage: undefined
          };
        }
        return r;
      })
    );
    setHasErrors(false);
  };

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStartProcessing = async () => {
    if (!conferralConfirmed) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setProgress(20);

    try {
      const result = await credentialService.processBulkIssuance({
        batchId: `BATCH-2024-COHORT-${Math.floor(100 + Math.random() * 900)}`,
        fileName,
        totalRecords: records.length,
        validRecords: records.filter((r) => r.status === 'VALID').length,
        errorRecords: records.filter((r) => r.status === 'ERROR').length,
        duplicateRecords: records.filter((r) => r.status === 'DUPLICATE').length,
        status: 'COMPLETED',
        records,
        createdAt: new Date().toISOString()
      });
      setProgress(100);
      setIsCompleted(true);
      setIssuedBatchId(result.batchId);
    } catch (err: unknown) {
      setProgress(0);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Bulk issuance is not currently supported by the backend API. Please use individual Certificate Registration.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const totalRecords = records.length;
  const validRecords = records.filter((r) => r.status === 'VALID').length;
  const errorRecords = records.filter((r) => r.status === 'ERROR').length;
  const duplicateRecords = records.filter((r) => r.status === 'DUPLICATE').length;

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Top Header & Workspace Summary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface-variant">
              Batch Registry Portal
            </span>
            <span className="text-on-surface-variant text-[12px]">•</span>
            <span className="text-xs text-on-surface-variant">Westminster Academic Records #402</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
            Bulk Issuance
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Issue multiple academic credentials efficiently using a structured file.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            Cohort Standard: CSV / XLSX v2.1
          </span>
        </div>
      </div>

      {/* Backend Capability Notice */}
      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-amber-700 shrink-0 mt-0.5">info</span>
        <div>
          <span className="font-bold block">Backend Feature Status: Individual Registration Active</span>
          <span>
            Automated batch upload is planned for an upcoming release. To issue official tamper-evident credentials in the current version, please use individual certificate registration from the Registrar Dashboard.
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Stepper Navigation */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm" id="stepperNav">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Step 1 */}
          <button
            onClick={() => setCurrentStep(1)}
            id="step-btn-1"
            className={`p-3 rounded-xl text-left border transition-all flex items-center gap-3 ${
              currentStep === 1
                ? 'bg-primary-container text-white border-primary-container shadow-sm'
                : currentStep > 1
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-surface-container-low text-slate-500 border-slate-200'
            }`}
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              currentStep === 1 ? 'bg-white text-primary' : currentStep > 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {currentStep > 1 ? '✓' : '1'}
            </span>
            <div>
              <span className="text-xs font-bold block">1. Upload File</span>
              <span className="text-[11px] opacity-80 block truncate">CSV / XLSX</span>
            </div>
          </button>

          {/* Step 2 */}
          <button
            onClick={() => setCurrentStep(2)}
            id="step-btn-2"
            className={`p-3 rounded-xl text-left border transition-all flex items-center gap-3 ${
              currentStep === 2
                ? 'bg-primary-container text-white border-primary-container shadow-sm'
                : currentStep > 2
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-surface-container-low text-slate-500 border-slate-200'
            }`}
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              currentStep === 2 ? 'bg-white text-primary' : currentStep > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {currentStep > 2 ? '✓' : '2'}
            </span>
            <div>
              <span className="text-xs font-bold block">2. Preview</span>
              <span className="text-[11px] opacity-80 block truncate">Inspect records</span>
            </div>
          </button>

          {/* Step 3 */}
          <button
            onClick={() => setCurrentStep(3)}
            id="step-btn-3"
            className={`p-3 rounded-xl text-left border transition-all flex items-center gap-3 ${
              currentStep === 3
                ? 'bg-primary-container text-white border-primary-container shadow-sm'
                : currentStep > 3
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-surface-container-low text-slate-500 border-slate-200'
            }`}
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              currentStep === 3 ? 'bg-white text-primary' : currentStep > 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {currentStep > 3 ? '✓' : '3'}
            </span>
            <div>
              <span className="text-xs font-bold block">3. Validate</span>
              <span className="text-[11px] opacity-80 block truncate">Check errors</span>
            </div>
          </button>

          {/* Step 4 */}
          <button
            onClick={() => setCurrentStep(4)}
            id="step-btn-4"
            className={`p-3 rounded-xl text-left border transition-all flex items-center gap-3 ${
              currentStep === 4
                ? 'bg-primary-container text-white border-primary-container shadow-sm'
                : isCompleted
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-surface-container-low text-slate-500 border-slate-200'
            }`}
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              currentStep === 4 ? 'bg-white text-primary' : isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              {isCompleted ? '✓' : '4'}
            </span>
            <div>
              <span className="text-xs font-bold block">4. Confirm & Issue</span>
              <span className="text-[11px] opacity-80 block truncate">Cryptographic sign</span>
            </div>
          </button>
        </div>
      </div>

      {/* STEP 1: UPLOAD */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/80 shadow-sm space-y-6" id="step-panel-1">
          <div className="max-w-xl mx-auto text-center space-y-2">
            <h2 className="text-xl font-bold text-primary">Upload Certificate Batch File</h2>
            <p className="text-xs text-on-surface-variant">
              Upload an authorized CSV or XLSX spreadsheet containing student conferral details.
            </p>
          </div>

          <div
            className="border-2 border-dashed border-slate-300 hover:border-primary rounded-2xl p-10 text-center transition-colors cursor-pointer bg-surface-container-low/40 max-w-xl mx-auto flex flex-col items-center justify-center gap-3"
            id="dropzoneBox"
            onClick={() => document.getElementById('realFileInput')?.click()}
          >
            <div className="w-16 h-16 rounded-2xl bg-white text-primary flex items-center justify-center shadow-sm border border-slate-200">
              <span className="material-symbols-outlined text-[36px] text-secondary">cloud_upload</span>
            </div>
            <div>
              <span className="text-sm font-semibold text-primary block">
                Click to browse or drop file here
              </span>
              <span className="text-xs text-slate-500 block mt-1">
                Supports CSV, XLSX up to 10MB (Standard Schema: id, name, roll, course, grade, batch, date)
              </span>
            </div>
            <input
              type="file"
              id="realFileInput"
              accept=".csv,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="max-w-xl mx-auto p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary text-[24px]">description</span>
              <div>
                <span className="text-xs font-bold text-primary block">{fileName}</span>
                <span className="text-[11px] text-slate-500 block">{fileSize} • 5 records loaded</span>
              </div>
            </div>
            <button
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-colors"
            >
              Preview Records →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW */}
      {currentStep === 2 && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6" id="step-panel-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold text-secondary uppercase tracking-wider">Step 2: Preview</span>
              <h2 className="text-xl font-bold text-primary mt-0.5">Review Certificate Records</h2>
              <p className="text-xs text-on-surface-variant">
                Previewing records from <strong className="text-primary font-mono" id="fileNameDisplay">{fileName}</strong>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
              >
                ← Back
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <span>Validate Data</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[11px] font-semibold">
                <tr>
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Certificate ID</th>
                  <th className="py-3 px-3">Student Name</th>
                  <th className="py-3 px-3">Roll Number</th>
                  <th className="py-3 px-3">Conferred Course</th>
                  <th className="py-3 px-3">Grade</th>
                  <th className="py-3 px-3">Conferral Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {records.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 text-slate-400">{i + 1}</td>
                    <td className="py-3 px-3 font-mono font-bold text-primary">{r.id}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">{r.name}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{r.roll || <span className="text-rose-500 italic">Empty</span>}</td>
                    <td className="py-3 px-3 text-slate-700">{r.course}</td>
                    <td className="py-3 px-3 text-slate-600">{r.grade}</td>
                    <td className="py-3 px-3 text-slate-600">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 3: VALIDATE */}
      {currentStep === 3 && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6" id="step-panel-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold text-secondary uppercase tracking-wider">Step 3: Validation Engine</span>
              <h2 className="text-xl font-bold text-primary mt-0.5">Pre-Issuance Data Validation</h2>
              <p className="text-xs text-on-surface-variant">
                Syntactic, duplicate, and institutional constraint audit.
              </p>
            </div>
            {hasErrors && (
              <button
                onClick={handleResolveErrors}
                id="resolveDemoErrorsBtn"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">build</span>
                <span id="resolveBtnLabel">Resolve Demo Errors Automatically</span>
              </button>
            )}
          </div>

          {/* Validation Metrics Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-surface-container-low border border-slate-200">
              <span className="text-xs text-on-surface-variant block">Total Records</span>
              <span className="text-2xl font-bold text-primary mt-1 block" id="totalRecordsCount">
                {totalRecords}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-xs text-emerald-800 font-medium block">Valid Records</span>
              <span className="text-2xl font-bold text-emerald-700 mt-1 block" id="validRecordsCount">
                {validRecords}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200" id="errorBadge">
              <span className="text-xs text-rose-800 font-medium block">Missing Fields</span>
              <span className="text-2xl font-bold text-rose-700 mt-1 block" id="errorRecordsCount">
                {errorRecords}
              </span>
              <span className="text-[11px] text-rose-600 mt-0.5 block" id="errorSubtext">
                {errorRecords > 0 ? 'Requires correction' : 'All clear'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200" id="duplicateBadge">
              <span className="text-xs text-amber-800 font-medium block">Duplicate IDs</span>
              <span className="text-2xl font-bold text-amber-700 mt-1 block" id="duplicateRecordsCount">
                {duplicateRecords}
              </span>
              <span className="text-[11px] text-amber-600 mt-0.5 block" id="duplicateSubtext">
                {duplicateRecords > 0 ? 'Conflict detected' : 'Unique'}
              </span>
            </div>
          </div>

          {/* Quarantine / Records Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3.5 bg-surface-container-low font-semibold text-xs text-primary flex items-center justify-between border-b border-slate-200">
              <span>Validation Records Breakdown</span>
              <span className="text-[11px] font-normal text-slate-500">
                {errorRecords + duplicateRecords === 0
                  ? 'All records passed integrity checks'
                  : 'Action required before issuing'}
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-100" id="quarantineTableBody">
                {records.map((r, i) => (
                  <tr key={i} className={r.status !== 'VALID' ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-mono font-bold text-primary">{r.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{r.name}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{r.roll || '—'}</td>
                    <td className="py-3 px-4">
                      {r.status === 'VALID' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-semibold text-[11px] border border-emerald-200">
                          <span className="material-symbols-outlined text-[14px]">check</span> Valid
                        </span>
                      ) : r.status === 'ERROR' ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full font-semibold text-[11px]">
                          <span className="material-symbols-outlined text-[14px]">error</span> {r.errorMessage}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full font-semibold text-[11px]">
                          <span className="material-symbols-outlined text-[14px]">warning</span> {r.errorMessage}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
            >
              ← Back to Preview
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              id="step3ContinueBtn"
              disabled={errorRecords + duplicateRecords > 0}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Continue to Final Confirmation</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: CONFIRM & ISSUE */}
      {currentStep === 4 && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6" id="step-panel-4">
          {!isCompleted ? (
            <div className="space-y-6" id="state-pre-submission">
              <div>
                <span className="text-xs font-bold text-secondary uppercase tracking-wider">Step 4: Final Sign-off</span>
                <h2 className="text-xl font-bold text-primary mt-0.5">Ready to Issue Batch</h2>
                <p className="text-xs text-on-surface-variant">
                  You are about to cryptographically sign and confer <strong>{validRecords} verified academic certificates</strong> into the Westminster State University Registry.
                </p>
              </div>

              {/* Summary Confirmation Box */}
              <div className="p-5 rounded-xl bg-surface-container-low border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Issuing Authority:</span>
                  <span className="font-semibold text-primary">Westminster State University Registrar</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Total Valid Certificates:</span>
                  <span className="font-semibold text-emerald-700">{validRecords} Credentials</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Cryptographic Algorithm:</span>
                  <span className="font-mono text-slate-700">SHA-256 + Merkle Leaf Insertion</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Authorized Signatory:</span>
                  <span className="font-semibold text-primary">Dr. Arthur Pendelton (Chief Registrar)</span>
                </div>
              </div>

              {/* Conferral Checkbox */}
              <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100/80 transition-colors">
                <input
                  type="checkbox"
                  id="conferralCheckbox"
                  checked={conferralConfirmed}
                  onChange={(e) => setConferralConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-primary focus:ring-primary border-slate-300"
                />
                <span className="text-xs text-slate-800 leading-relaxed">
                  I hereby certify as an authorized university registrar that all conferred degrees and qualifications listed in this batch have completed all academic accreditation requirements and are eligible for institutional sealing.
                </span>
              </label>

              {isProcessing && (
                <div className="p-6 rounded-xl bg-primary-container text-white space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold" id="processingStatusText">
                      Generating SHA-256 digests and Merkle Tree anchors...
                    </span>
                    <span className="font-mono font-bold" id="processingPercent">
                      {progress}%
                    </span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-2.5 rounded-full transition-all duration-300"
                      id="progressBarFill"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
                >
                  ← Back to Validation
                </button>
                <button
                  onClick={handleStartProcessing}
                  disabled={!conferralConfirmed || isProcessing}
                  id="finalConfirmBtn"
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span>Confirm & Issue Batch Now</span>
                </button>
              </div>
            </div>
          ) : (
            // Completion Result
            <div className="text-center py-8 space-y-4" id="state-post-submission">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                <span className="material-symbols-outlined text-[36px]">check_circle</span>
              </div>
              <h2 className="text-2xl font-bold text-primary">Batch Issuance Complete!</h2>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                <strong>{validRecords} academic certificates</strong> have been cryptographically sealed and published to the institutional directory.
              </p>

              <div className="max-w-md mx-auto p-4 rounded-xl bg-surface-container-low border border-slate-200 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Batch Reference:</span>
                  <span className="font-bold text-primary">{issuedBatchId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Timestamp:</span>
                  <span className="text-slate-700">{new Date().toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Verification Status:</span>
                  <span className="text-emerald-700 font-bold font-sans">ACTIVE & QUERYABLE</span>
                </div>
              </div>

              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setIsCompleted(false);
                    setCurrentStep(1);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-semibold text-xs border border-slate-200"
                >
                  Issue Another Batch
                </button>
                <a
                  href="/institution/certificates"
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-xs shadow-sm"
                >
                  View Certificates Catalog →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
