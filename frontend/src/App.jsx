import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon, Sun, Play, FileJson, ShieldCheck, Cpu, Upload, Layers,
} from 'lucide-react';
import ClaimMetrics from './components/ClaimMetrics';
import PipelineTrace from './components/PipelineTrace';
import ClaimSubmitForm from './components/ClaimSubmitForm';
import API_URL from './api';

const TABS = [
  { id: 'submit', label: 'Submit Claim', icon: Upload, desc: 'Upload real documents' },
  { id: 'suite',  label: 'Test Suite',  icon: Layers,  desc: 'Run scenario cases' },
];

function formatINR(n) {
  if (!n) return '—';
  return '₹' + Number(n).toLocaleString('en-IN');
}

export default function App() {
  const [activeTab, setActiveTab]   = useState('submit');
  const [testCases, setTestCases]   = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [result, setResult]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [isDark, setIsDark]         = useState(true);
  const [policySummary, setPolicySummary] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    fetch('/data/test_cases.json')
      .then(r => r.ok ? r.json() : null)
      .then(raw => { if (raw) { setTestCases(raw.test_cases); setActiveCase(raw.test_cases[0]); } })
      .catch(() => {});

    fetch(`${API_URL}/api/v1/policy/summary`)
      .then(r => r.json())
      .then(setPolicySummary)
      .catch(() => {});
  }, []);

  const runPipeline = async () => {
    if (!activeCase) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/claims/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...activeCase.input, case_id: activeCase.case_id }),
      });
      setResult(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <div className={`min-h-screen ${isDark ? 'mesh-bg-dark' : 'mesh-bg-light'} font-sans overflow-x-hidden transition-colors duration-500`}>
      {/* Ambient glows */}
      <div className="fixed top-0 right-0 w-[800px] h-[600px] bg-brand-accent/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-purple-900/10 rounded-full blur-[150px] pointer-events-none" />

      {/* ── Top Nav ───────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-white/60 dark:bg-[#100720]/90 backdrop-blur-2xl border-b border-black/5 dark:border-white/[0.06]">
        {/* Primary bar */}
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-brand-accent tracking-tight leading-none">plum</span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2 border-l border-slate-200 dark:border-slate-700 pl-2">
                Claims Engine
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-glow" />
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                {policySummary?.policy_id ?? 'Loading…'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden lg:block text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              Multi-Agent Adjudication System
            </span>
            <button onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-xl text-slate-400 dark:text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 transition-all">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 relative z-10">

        {/* ── Page header ─────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="mb-7">
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
            {activeTab === 'submit' ? 'Submit a New Claim' : 'Adjudication Test Suite'}
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            {activeTab === 'submit'
              ? 'Upload medical documents — Gemini Vision classifies and extracts, policy rules adjudicate.'
              : 'Run pre-built scenarios against the live pipeline and inspect the full agent trace.'}
          </p>
        </motion.div>

        {/* ── Tab bar ─────────────────────────────────────────────── */}
        <div className="mb-7 flex gap-2 border-b border-black/[0.06] dark:border-white/[0.06] pb-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-150 relative
                  ${active
                    ? 'text-brand-accent'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {active && (
                  <motion.div layoutId="tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ─────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === 'submit' && (
            <motion.div key="submit"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            >
              <ClaimSubmitForm />
            </motion.div>
          )}

          {activeTab === 'suite' && (
            <motion.div key="suite"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            >
              {!activeCase ? (
                <div className="flex items-center justify-center h-64">
                  <Cpu className="w-10 h-10 text-brand-accent opacity-40 animate-spin-slow" />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Sidebar */}
                  <div className="lg:col-span-4 space-y-5">
                    {/* Scenario selector */}
                    <div className="glass rounded-3xl p-6 space-y-5">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-brand-accent" />
                        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                          Scenario Injector
                        </h2>
                      </div>
                      <div className="relative">
                        <select
                          className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl text-sm font-semibold
                            bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08]
                            text-slate-800 dark:text-slate-100
                            [&>option]:bg-[#1e0d30] [&>option]:text-slate-100
                            focus:outline-none focus:ring-2 focus:ring-brand-accent/40 cursor-pointer transition-all"
                          value={activeCase.case_id}
                          onChange={(e) => { setActiveCase(testCases.find(tc => tc.case_id === e.target.value)); setResult(null); }}
                        >
                          {testCases.map(tc => (
                            <option key={tc.case_id} value={tc.case_id}>{tc.case_id} — {tc.case_name}</option>
                          ))}
                        </select>
                        <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>

                      <button
                        onClick={runPipeline}
                        disabled={loading}
                        className="w-full py-3.5 rounded-xl font-bold text-sm text-white
                          bg-brand-accent hover:bg-[#e01f48] disabled:opacity-40
                          shadow-[0_4px_20px_rgba(252,43,86,0.35)] hover:shadow-[0_6px_28px_rgba(252,43,86,0.5)]
                          transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        {loading
                          ? <><Cpu className="w-4 h-4 animate-spin" /> Processing…</>
                          : <><Play className="w-4 h-4 fill-current" /> Execute Adjudication</>
                        }
                      </button>
                    </div>

                    {/* Raw payload */}
                    <div className="glass rounded-3xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <FileJson className="w-4 h-4 text-brand-accent" />
                        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                          Raw Payload
                        </h2>
                      </div>
                      <div className="relative bg-[#0a0418] rounded-2xl border border-white/5 overflow-hidden">
                        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5">
                          {['bg-rose-500','bg-amber-400','bg-emerald-500'].map(c => (
                            <span key={c} className={`w-2.5 h-2.5 rounded-full ${c}`} />
                          ))}
                          <span className="ml-2 text-[10px] text-slate-600 font-mono">claim_payload.json</span>
                        </div>
                        <pre className="p-4 text-[11px] text-brand-accent/80 font-mono leading-relaxed overflow-x-auto max-h-[340px]">
                          {JSON.stringify(activeCase.input, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* Results panel */}
                  <div className="lg:col-span-8">
                    <AnimatePresence mode="wait">
                      {result ? (
                        <motion.div key="results" initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                          <ClaimMetrics result={result} />
                          {result.notes && (
                            <div className="glass gradient-border rounded-3xl p-6">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Reasoning Engine Output</p>
                              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-mono">{result.notes}</p>
                            </div>
                          )}
                          <PipelineTrace traces={result.agent_traces} />
                        </motion.div>
                      ) : (
                        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="h-full min-h-[480px] flex flex-col items-center justify-center
                            border-2 border-dashed border-slate-200 dark:border-white/[0.06]
                            rounded-3xl p-10 text-center"
                        >
                          <div className="relative mb-6">
                            <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center">
                              <Cpu className="w-9 h-9 text-brand-accent/60" />
                            </div>
                            <div className="absolute -inset-2 rounded-3xl border border-brand-accent/15 animate-[ping_3s_ease-out_infinite]" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">System Standby</h3>
                          <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
                            Select a test scenario and click Execute to run the full adjudication pipeline.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
