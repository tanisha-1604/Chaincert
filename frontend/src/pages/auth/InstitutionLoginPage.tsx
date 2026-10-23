import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';

export const InstitutionLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await authService.loginInstitution(email, password);
      navigate('/institution/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to authenticate with registrar registry. Please verify your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 py-8">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        {/* Top Bar with Navigation & Security Telemetry */}
        <header className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 pb-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold group"
          >
            <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">
              arrow_back
            </span>
            <span>Back to Home</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container rounded-full text-on-surface-variant text-xs font-medium border border-slate-200/60 shadow-sm">
            <span className="material-symbols-outlined text-[14px] text-secondary">lock</span>
            <span>Institutional Access Gateway • TLS 1.3 256-bit Encrypted</span>
          </div>
        </header>

        {/* Main Card Container */}
        <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Left Decorative Institutional Panel */}
          <div className="md:col-span-5 bg-primary-container p-8 text-on-primary flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white text-primary flex items-center justify-center font-bold shadow-md">
                  <span className="material-symbols-outlined text-[24px]">verified</span>
                </div>
                <div>
                  <span className="font-headline-sm text-lg font-bold tracking-tight block">ChainCert</span>
                  <span className="text-[11px] text-[#7991af] uppercase tracking-wider block">Registrar Authority</span>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Accredited Portal
                </span>
                <h2 className="text-2xl font-bold leading-snug">
                  Official Academic Registrar System
                </h2>
                <p className="text-xs text-[#7991af] leading-relaxed">
                  Authorized access for university provosts, registrars, and certification officers to register, manage, and verify degree credentials.
                </p>
              </div>
            </div>

            <div className="relative z-10 pt-8 border-t border-white/10 space-y-2 text-xs text-[#7991af]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">check</span>
                <span>Cryptographic Digest Verification</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">check</span>
                <span>FERPA Compliant Record Isolation</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">check</span>
                <span>Multi-Registrar Dual Sign-off</span>
              </div>
            </div>
          </div>

          {/* Right Login Form */}
          <div className="md:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
            <div className="mb-6">
              <span className="font-label-sm text-xs text-secondary font-bold uppercase tracking-widest">
                Registrar Authentication
              </span>
              <h1 className="text-2xl font-bold text-primary tracking-tight mt-1">
                Institution Login
              </h1>
              <p className="text-xs text-on-surface-variant mt-1">
                Enter your authorized university credentials to access the issuance ledger.
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-primary" htmlFor="inst-email">
                    Institution Email
                  </label>
                  <span className="text-[11px] text-on-surface-variant">.edu or institutional domain</span>
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[20px] pointer-events-none">
                    mail
                  </span>
                  <input
                    id="inst-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your institution email"
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-container-low text-primary text-sm focus:bg-white focus:ring-2 focus:ring-primary-container focus:outline-none border border-slate-200 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-primary" htmlFor="inst-password">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(true)}
                    className="text-[11px] text-secondary hover:underline font-medium"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[20px] pointer-events-none">
                    key
                  </span>
                  <input
                    id="inst-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-11 pl-10 pr-10 rounded-xl bg-surface-container-low text-primary text-sm focus:bg-white focus:ring-2 focus:ring-primary-container focus:outline-none border border-slate-200 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-slate-400 hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Authenticating PKI Session...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Institution Portal</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-on-surface-variant">
              <span>Are you a student?</span>
              <Link to="/student/login" className="text-secondary font-semibold hover:underline">
                Student Portal Login →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-primary mb-2">Reset Registrar Password</h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Enter your official accredited .edu email address to receive a secure PKI password reset link.
            </p>

            {resetSuccess ? (
              <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl mb-4 border border-emerald-200">
                A verification link has been sent to your registrar inbox.
              </div>
            ) : (
              <input
                type="email"
                defaultValue={email}
                className="w-full h-11 px-3 rounded-xl bg-surface-container-low text-sm border border-slate-200 mb-4"
                placeholder="registrar@institution.edu"
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setForgotModalOpen(false);
                  setResetSuccess(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              {!resetSuccess && (
                <button
                  onClick={() => setResetSuccess(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary-container"
                >
                  Send Reset Link
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
