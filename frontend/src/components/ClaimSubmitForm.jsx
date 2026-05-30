import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, Image as ImageIcon, FileScan, Loader2,
  CheckCircle2, XCircle, AlertTriangle, User, Calendar,
  IndianRupee, Hospital, ShieldCheck, ChevronDown,
  FileCheck, Eye,
} from 'lucide-react';
import ClaimMetrics from './ClaimMetrics';
import PipelineTrace from './PipelineTrace';
import API_URL from '../api';

// ── CSS-only color mapping for doc type badges (labels come from API) ─────────

const DOC_TYPE_COLORS = {
  PRESCRIPTION:      'badge-violet',
  HOSPITAL_BILL:     'badge-slate',
  LAB_REPORT:        'badge-amber',
  PHARMACY_BILL:     'badge-emerald',
  DIAGNOSTIC_REPORT: 'badge-amber',
  DENTAL_REPORT:     'badge-slate',
  DISCHARGE_SUMMARY: 'badge-slate',
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// ── Sub-components ────────────────────────────────────────────────────────────

function FileTypeIcon({ mime }) {
  if (mime === 'application/pdf') return <FileScan className="w-5 h-5 text-rose-400" />;
  return <ImageIcon className="w-5 h-5 text-blue-400" />;
}

function FileCard({ file, onRemove }) {
  const sizeMB    = (file.size / 1024 / 1024).toFixed(2);
  const isImage   = file.type.startsWith('image/');
  const objectUrl = React.useMemo(() => URL.createObjectURL(file), [file]);

  const handleView = () => {
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl glass-inset border"
    >
      {/* Thumbnail for images, icon for PDF */}
      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-black/10 dark:border-white/10 bg-slate-100 dark:bg-white/5 flex items-center justify-center">
        {isImage
          ? <img src={objectUrl} alt={file.name} className="w-full h-full object-cover" />
          : <FileScan className="w-5 h-5 text-rose-400" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight">{file.name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{sizeMB} MB · {file.type.split('/')[1]?.toUpperCase()}</p>
      </div>

      <span className="badge badge-emerald shrink-0">
        <CheckCircle2 className="w-3 h-3" /> Ready
      </span>

      {/* View button */}
      <button
        type="button"
        onClick={handleView}
        title="Preview document"
        className="p-1.5 rounded-lg hover:bg-brand-accent/10 text-slate-400 hover:text-brand-accent transition-colors"
      >
        <Eye className="w-4 h-4" />
      </button>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(file)}
        title="Remove"
        className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-300 hover:text-rose-500 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

function RequiredDocsList({ requiredDocs, categoryLabel, fileCount, docTypeLabels }) {
  if (!requiredDocs?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
        Required for {categoryLabel}
      </p>
      {requiredDocs.map(type => {
        const label = docTypeLabels?.[type] ?? type.replace(/_/g, ' ');
        return (
          <div key={type} className="flex items-center gap-2.5">
            <FileCheck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">{label}</span>
          </div>
        );
      })}
      <div className="pt-2 border-t border-black/5 dark:border-white/5 mt-3">
        <div className={`flex items-center gap-2 text-xs font-semibold ${fileCount >= requiredDocs.length ? 'text-emerald-500' : 'text-amber-500'}`}>
          {fileCount >= requiredDocs.length
            ? <><CheckCircle2 className="w-4 h-4" /> {fileCount} document{fileCount !== 1 ? 's' : ''} uploaded — looks complete</>
            : <><AlertTriangle className="w-4 h-4" /> {fileCount} / {requiredDocs.length} documents uploaded</>
          }
        </div>
      </div>
    </div>
  );
}

function DropZone({ files, onAdd, onRemove, docTypeChips, docTypeLabels }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter(f => ACCEPTED_TYPES.includes(f.type));
    if (valid.length) onAdd(valid);
  }, [onAdd]);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-2xl
          border-2 border-dashed cursor-pointer transition-all duration-200 select-none
          ${dragging
            ? 'border-brand-accent bg-brand-accent/8 scale-[1.01]'
            : 'border-slate-200 dark:border-white/10 hover:border-brand-accent/50 bg-black/[0.01] dark:bg-white/[0.02] hover:bg-brand-accent/[0.03]'
          }`}
      >
        <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
          ${dragging ? 'bg-brand-accent text-white' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400'}`}>
          <Upload className="w-6 h-6" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {dragging ? 'Release to upload' : 'Drop files here, or click to browse'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">JPG · PNG · WEBP · PDF &nbsp;·&nbsp; Up to 20 MB per file</p>
        </div>
        {/* Doc type chips — derived from policy required_docs, not hardcoded */}
        {docTypeChips.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {docTypeChips.map(type => {
              const label = docTypeLabels?.[type] ?? type.replace(/_/g, ' ');
              return (
                <span key={type} className="px-2.5 py-1 rounded-full text-[10px] font-semibold
                  bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <AnimatePresence>
        {files.map((f, i) => <FileCard key={`${f.name}-${i}`} file={f} onRemove={onRemove} />)}
      </AnimatePresence>
    </div>
  );
}

function FieldLabel({ icon: Icon, label }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </label>
  );
}

const inputCls = `w-full px-4 py-3 rounded-xl text-sm font-medium
  bg-black/[0.03] dark:bg-white/[0.04]
  border border-black/[0.08] dark:border-white/[0.08]
  text-slate-800 dark:text-slate-100
  placeholder:text-slate-400 dark:placeholder:text-slate-600
  focus:outline-none focus:ring-2 focus:ring-brand-accent/35 focus:border-brand-accent/50
  transition-all`;

const selectCls = `${inputCls} appearance-none pr-9 cursor-pointer
  [&>option]:bg-[#1e0d30] [&>option]:text-slate-100`;

// ── Main component ────────────────────────────────────────────────────────────

export default function ClaimSubmitForm() {
  const [members,    setMembers]    = useState([]);
  const [hospitals,  setHospitals]  = useState([]);
  const [policy,     setPolicy]     = useState(null);   // all dynamic values from API
  const [files,      setFiles]      = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const resultRef                   = useRef(null);

  const [form, setForm] = useState({
    member_id: '', policy_id: '',           // policy_id set once API responds
    claim_category: '', treatment_date: '',
    claimed_amount: '', hospital_name: '',
    pre_authorization_approved: false,
  });

  useEffect(() => {
    // Fetch members
    fetch(`${API_URL}/api/v1/members`)
      .then(r => r.json())
      .then(data => {
        setMembers(data);
        if (data.length) setForm(f => ({ ...f, member_id: data[0].member_id }));
      })
      .catch(() => {});

    // Fetch network hospitals
    fetch(`${API_URL}/api/v1/hospitals`)
      .then(r => r.json()).then(setHospitals).catch(() => {});

    // Fetch policy summary → categories, required_docs, policy_id
    fetch(`${API_URL}/api/v1/policy/summary`)
      .then(r => r.json())
      .then(data => {
        setPolicy(data);
        // Set policy_id and default category from API response
        const firstCat = data.categories?.[0]?.value ?? '';
        setForm(f => ({
          ...f,
          policy_id:      data.policy_id ?? '',
          claim_category: firstCat,
        }));
      })
      .catch(() => {});
  }, []);

  const field    = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const addFiles = useCallback((incoming) => {
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...incoming.filter(f => !names.has(f.name))];
    });
  }, []);
  const removeFile = useCallback((target) => setFiles(prev => prev.filter(f => f !== target)), []);

  // All values derived from API — zero hardcoded UI data
  const categories        = policy?.categories   ?? [];
  const requiredDocs      = policy?.required_docs ?? {};
  const currentCat        = categories.find(c => c.value === form.claim_category) ?? {};
  const currentRequired   = requiredDocs[form.claim_category] ?? [];
  const currentCatLabel   = currentCat.label ?? form.claim_category;
  const preAuthThreshold  = currentCat.pre_auth_threshold;   // null for non-diagnostic
  const highValueTests    = currentCat.high_value_tests ?? [];
  const isNetworkHospital = hospitals.includes(form.hospital_name);

  // Collect all unique doc types across ALL categories for the drop-zone chips
  const allDocTypes    = [...new Set(Object.values(requiredDocs).flat())];
  const docTypeLabels  = policy?.doc_type_labels ?? {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) { setError('Please upload at least one medical document.'); return; }
    setSubmitting(true); setResult(null); setError(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    files.forEach(f => fd.append('documents', f));
    try {
      const res = await fetch(`${API_URL}/api/v1/claims/submit`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submission failed');
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally { setSubmitting(false); }
  };

  const memberOptions = members.map(m => ({ value: m.member_id, label: `${m.name} (${m.member_id})` }));

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT: Claim details ──────────────────────────────── */}
          <div className="lg:col-span-5 space-y-5">

            {/* Section 1: Claimant */}
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="glass rounded-3xl p-6 space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-brand-accent/15 flex items-center justify-center">
                  <span className="text-[10px] font-black text-brand-accent">1</span>
                </div>
                <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Claimant Information
                </h2>
              </div>

              {/* Member */}
              <div>
                <FieldLabel icon={User} label="Member" />
                <div className="relative">
                  <select value={form.member_id} onChange={(e) => field('member_id')(e.target.value)}
                    className={selectCls}>
                    {memberOptions.length
                      ? memberOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                      : <option value="">Loading members…</option>}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Category — from policy API */}
              <div>
                <FieldLabel label="Claim Category" />
                <div className="relative">
                  <select value={form.claim_category} onChange={(e) => field('claim_category')(e.target.value)}
                    className={selectCls}>
                    {categories.length
                      ? categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                      : <option value="">Loading categories…</option>}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </motion.section>

            {/* Section 2: Claim details */}
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
              className="glass rounded-3xl p-6 space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-brand-accent/15 flex items-center justify-center">
                  <span className="text-[10px] font-black text-brand-accent">2</span>
                </div>
                <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Claim Details</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel icon={Calendar} label="Treatment Date" />
                  <input type="date" value={form.treatment_date}
                    onChange={(e) => field('treatment_date')(e.target.value)}
                    required className={inputCls} />
                </div>
                <div>
                  <FieldLabel icon={IndianRupee} label="Claimed Amount" />
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                    <input type="number" min="0" step="0.01" value={form.claimed_amount}
                      onChange={(e) => field('claimed_amount')(e.target.value)}
                      placeholder="0.00" required className={`${inputCls} pl-7`} />
                  </div>
                </div>
              </div>

              {/* Hospital */}
              <div>
                <FieldLabel icon={Hospital} label="Hospital / Clinic Name" />
                <input list="hospital-list" value={form.hospital_name}
                  onChange={(e) => field('hospital_name')(e.target.value)}
                  placeholder="Type to search network hospitals…" className={inputCls} />
                <datalist id="hospital-list">
                  {hospitals.map(h => <option key={h} value={h} />)}
                </datalist>
                <AnimatePresence>
                  {isNetworkHospital && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Network hospital — preferential discount applies
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Pre-auth — shown only when current category has a pre_auth_threshold (from API) */}
              <AnimatePresence>
                {preAuthThreshold && (
                  <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/8 border border-amber-500/20 cursor-pointer">
                    <input type="checkbox" checked={form.pre_authorization_approved}
                      onChange={(e) => field('pre_authorization_approved')(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-brand-accent" />
                    <div>
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> Pre-authorization obtained
                      </p>
                      <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                        Required for {highValueTests.join(' · ')} above ₹{Number(preAuthThreshold).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </motion.label>
                )}
              </AnimatePresence>
            </motion.section>

            {/* Required docs — from policy API */}
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="glass rounded-3xl p-6">
              <RequiredDocsList
                requiredDocs={currentRequired}
                categoryLabel={currentCatLabel}
                fileCount={files.length}
                docTypeLabels={docTypeLabels}
              />
            </motion.section>
          </div>

          {/* ── RIGHT: Document upload ───────────────────────────── */}
          <div className="lg:col-span-7 space-y-5">
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
              className="glass rounded-3xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-brand-accent/15 flex items-center justify-center">
                    <span className="text-[10px] font-black text-brand-accent">3</span>
                  </div>
                  <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Medical Documents
                  </h2>
                </div>
                {files.length > 0 && (
                  <span className="badge badge-emerald">
                    <CheckCircle2 className="w-3 h-3" /> {files.length} file{files.length !== 1 ? 's' : ''} ready
                  </span>
                )}
              </div>
              <DropZone files={files} onAdd={addFiles} onRemove={removeFile} docTypeChips={allDocTypes} docTypeLabels={docTypeLabels} />
            </motion.section>

            {/* Gemini notice */}
            <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-violet-500/8 border border-violet-500/15">
              <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-black text-violet-400">AI</span>
              </div>
              <div>
                <p className="text-xs font-bold text-violet-600 dark:text-violet-400">Gemini Vision Processing</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                  Documents are processed in-memory via Gemini Vision. No files are stored — analysed and discarded within the request.
                </p>
              </div>
            </div>

            {/* Submit */}
            <motion.button type="submit" disabled={submitting || !files.length} whileTap={{ scale: 0.985 }}
              className="w-full py-4 px-6 rounded-2xl font-bold text-base text-white
                bg-brand-accent hover:bg-[#e01f48]
                disabled:opacity-35 disabled:cursor-not-allowed
                shadow-[0_4px_28px_rgba(252,43,86,0.35)] hover:shadow-[0_6px_36px_rgba(252,43,86,0.5)]
                transition-all duration-200 flex items-center justify-center gap-3">
              {submitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /><span>Analysing with Gemini Vision…</span></>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>Submit Claim for Adjudication</span>
                  {files.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-bold">
                      {files.length} doc{files.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </>
              )}
            </motion.button>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40">
                  <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Submission Error</p>
                    <p className="text-sm text-rose-600 dark:text-rose-400 mt-0.5">{error}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>

      {/* ── Results ── */}
      <AnimatePresence>
        {result && (
          <motion.div ref={resultRef} key="result"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-6 pt-8">
            <div className="flex items-center justify-between border-t border-black/6 dark:border-white/[0.06] pt-6">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjudication Complete</p>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">{result.case_id}</h3>
              </div>
              <button onClick={() => { setResult(null); setFiles([]); setError(null); }}
                className="text-xs font-semibold text-slate-400 hover:text-brand-accent transition-colors px-3 py-2 rounded-xl hover:bg-brand-accent/10">
                ← Submit another claim
              </button>
            </div>
            <ClaimMetrics result={result} />
            {result.notes && (
              <div className="glass gradient-border rounded-3xl p-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Reasoning Engine Output</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-mono">{result.notes}</p>
              </div>
            )}
            <PipelineTrace traces={result.agent_traces} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
