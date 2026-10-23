import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';

export const StudentLoginPage: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await authService.loginStudent(identifier, password);
      navigate('/student/credentials');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to authenticate. Please check your Student ID or Email.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 sm:px-6 py-12">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Top Back Link */}
        <div className="w-full flex items-center justify-between mb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Home</span>
          </Link>
          <span className="text-xs text-on-surface-variant">ChainCert v2.4</span>
        </div>

        {/* Main Card */}
        <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-lg p-6 sm:p-8 relative overflow-hidden">
          {/* Top Subtle Portal Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-surface-container-low text-primary border border-slate-200/80 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              <span className="font-label-sm text-xs tracking-wide font-semibold uppercase text-slate-700">
                Student Credential Portal • Verified Access
              </span>
            </div>
          </div>

          {/* Icon & Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-surface-container-low text-primary flex items-center justify-center mb-3 shadow-inner border border-slate-200/60">
              <span className="material-symbols-outlined text-[32px] text-secondary">school</span>
            </div>
            <h1 className="font-headline-lg text-2xl font-bold text-primary tracking-tight">
              Student Login
            </h1>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant mt-1 max-w-xs">
              Access your official verified academic diplomas, transcripts, and credentials.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700" htmlFor="student-email">
                  Student Email or ID
                </label>
                <span className="text-[11px] text-slate-500">e.g. STU-2024-89042</span>
              </div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-[18px] text-slate-400 pointer-events-none">
                  alternate_email
                </span>
                <input
                  id="student-email"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your student email or ID"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 text-slate-900 bg-white placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none shadow-sm transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700" htmlFor="student-password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-primary hover:underline font-medium transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-[18px] text-slate-400 pointer-events-none">
                  lock
                </span>
                <input
                  id="student-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-300 text-slate-900 bg-white placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none shadow-sm transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Accessing Student Ledger...</span>
                </>
              ) : (
                <>
                  <span>Access My Credentials</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Alternate links */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2 text-center text-xs text-slate-600">
            <div>
              Are you a university registrar?{' '}
              <Link to="/institution/login" className="text-secondary font-semibold hover:underline">
                Institution Login
              </Link>
            </div>
            <div>
              Looking to verify a student diploma?{' '}
              <Link to="/verify" className="text-primary font-semibold hover:underline">
                Public Verification Portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
