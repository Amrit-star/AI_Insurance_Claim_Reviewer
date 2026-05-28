import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Play, FileJson, ShieldAlert, Cpu } from 'lucide-react';
import ClaimMetrics from './components/ClaimMetrics';
import PipelineTrace from './components/PipelineTrace';

export default function App() {
  const [testCases, setTestCases] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // Toggle Dark Mode
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const loadSuite = async () => {
      try {
        const response = await fetch('/data/test_cases.json');
        if (response.ok) {
          const raw = await response.json();
          setTestCases(raw.test_cases);
          setActiveCase(raw.test_cases[0]);
        }
      } catch (err) {
        console.error("Local schema import failure.", err);
      }
    };
    loadSuite();
  }, []);

  const runPipeline = async () => {
    if (!activeCase) return;
    setLoading(true);
    setResult(null);
    try {
      const payload = { ...activeCase.input, case_id: activeCase.case_id };
      const response = await fetch('http://127.0.0.1:8000/api/v1/claims/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setResult(data);
    } catch (err) {
      console.error("Pipeline failure:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!activeCase) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'mesh-bg-dark' : 'mesh-bg-light'}`}>
        <div className="animate-spin-slow">
          <Cpu className="w-12 h-12 text-brand-accent opacity-50" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'mesh-bg-dark' : 'mesh-bg-light'} font-sans relative overflow-x-hidden transition-colors duration-500`}>
      {/* Background Decorators */}
      <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-brand-accent/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-plum-blue/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto p-4 md:p-8 relative z-10">
        
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-accent to-blue-500 dark:from-brand-accent dark:to-indigo-400 drop-shadow-sm tracking-tight mb-2">
              Plum Neural Adjudication
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Multi-Agent Enterprise Engine v2.0</p>
          </motion.div>
          
          <div className="flex items-center gap-4">
            <div className="glass px-4 py-2 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                Policy: PLUM_GHI_2024
              </span>
            </div>
            <button 
              onClick={() => setIsDark(!isDark)}
              className="glass p-2 rounded-full text-slate-600 dark:text-slate-300 hover:text-brand-accent transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT SIDEBAR - CONTROL PANEL */}
          <div className="lg:col-span-4 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="glass p-6 rounded-3xl"
            >
              <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Scenario Injector
              </h2>
              
              <div className="space-y-6">
                <div>
                  <select 
                    className="w-full p-3.5 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 transition-all cursor-pointer appearance-none"
                    value={activeCase.case_id}
                    onChange={(e) => {
                      const selected = testCases.find(tc => tc.case_id === e.target.value);
                      setActiveCase(selected);
                      setResult(null);
                    }}
                  >
                    {testCases.map(tc => (
                      <option key={tc.case_id} value={tc.case_id}>{tc.case_id} - {tc.case_name}</option>
                    ))}
                  </select>
                </div>
                
                <button
                  onClick={runPipeline}
                  disabled={loading}
                  className="w-full py-4 px-4 bg-slate-800 dark:bg-slate-100 hover:bg-slate-900 dark:hover:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-brand-accent/20 disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-3 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  {loading ? (
                    <Cpu className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Execute Adjudication
                    </>
                  )}
                </button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="glass p-6 rounded-3xl"
            >
              <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FileJson className="w-4 h-4" />
                Raw Payload
              </h2>
              <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto max-h-[400px] custom-scrollbar border border-slate-800 shadow-inner relative">
                <div className="absolute top-0 right-0 p-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  </div>
                </div>
                <pre className="text-[11px] text-brand-accent/90 font-mono mt-4 leading-relaxed">
                  {JSON.stringify(activeCase.input, null, 2)}
                </pre>
              </div>
            </motion.div>
          </div>

          {/* RIGHT MAIN AREA */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="space-y-8"
                >
                  <ClaimMetrics result={result} />
                  
                  {result.notes && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="glass p-6 rounded-3xl border-l-4 border-l-brand-accent bg-brand-accent/5"
                    >
                      <h3 className="font-bold text-slate-800 dark:text-white mb-2 text-sm uppercase tracking-widest">Reasoning Engine</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-mono">
                        {result.notes}
                      </p>
                    </motion.div>
                  )}

                  <PipelineTrace traces={result.agent_traces} />
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[600px] flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl bg-slate-50/20 dark:bg-slate-900/20 p-8"
                >
                  <div className="w-24 h-24 rounded-full glass flex items-center justify-center mb-8 relative">
                    <div className="absolute inset-0 rounded-full border border-brand-accent/20 animate-[ping_3s_ease-out_infinite]" />
                    <Cpu className="w-10 h-10 text-brand-accent opacity-80" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-3 tracking-tight">System Standby</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm text-center leading-relaxed">
                    Select a scenario from the injector panel and initiate the neural adjudication sequence to observe agent behavior.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
