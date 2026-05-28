import React, { useState, useEffect } from 'react';
import ClaimMetrics from './components/ClaimMetrics';
import PipelineTrace from './components/PipelineTrace';

export default function App() {
  const [testCases, setTestCases] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

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
      const response = await fetch('http://127.0.0.1:8000/api/v1/claims/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...activeCase.input, case_id: activeCase.case_id }),
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex space-x-4">
          <div className="rounded-full bg-slate-300 h-12 w-12"></div>
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-slate-300 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-slate-300 rounded"></div>
              <div className="h-4 bg-slate-300 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-plum-blue to-blue-500 drop-shadow-sm">
              Plum Adjudication Engine
            </h1>
            <p className="text-sm text-slate-500 mt-2 font-medium">Enterprise Health Claims Processing System</p>
          </div>
          <div className="glass px-4 py-2 rounded-full border-blue-200 shadow-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-700">
              Policy: PLUM_GHI_2024
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div className="glass p-6 rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>
              
              <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-4">Control Panel</h2>
              
              <div className="relative z-10">
                <label className="block text-xs font-semibold text-slate-500 mb-2">Select Evaluation Scenario</label>
                <select 
                  className="w-full p-3 bg-white/80 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-plum-blue/50 focus:border-plum-blue/50 transition-shadow shadow-sm cursor-pointer"
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
                
                <button
                  onClick={runPipeline}
                  disabled={loading}
                  className="w-full mt-6 py-3.5 px-4 bg-gradient-to-r from-plum-blue to-blue-600 hover:from-blue-700 hover:to-blue-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg hover:shadow-blue-500/30 disabled:from-slate-400 disabled:to-slate-300 disabled:shadow-none transform active:scale-[0.98] flex justify-center items-center gap-2"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : 'Run Neural Adjudication'}
                </button>
              </div>
            </div>

            <div className="glass-dark p-6 rounded-2xl relative overflow-hidden">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                Input Payload
              </h2>
              <div className="relative z-10">
                <pre className="text-[11px] text-emerald-400 p-4 rounded-xl bg-black/40 overflow-x-auto max-h-96 custom-scrollbar border border-slate-700/50 shadow-inner">
                  {JSON.stringify(activeCase.input, null, 2)}
                </pre>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            {result ? (
              <div className="space-y-6 animate-fade-in">
                <ClaimMetrics result={result} />
                
                {result.notes && (
                  <div className="glass p-6 rounded-2xl border-l-4 border-l-plum-blue bg-blue-50/30">
                    <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-widest">Engine Explanation</h3>
                    <p className="text-sm text-slate-700 leading-relaxed font-mono font-medium">
                      {result.notes}
                    </p>
                  </div>
                )}

                <PipelineTrace traces={result.agent_traces} />
              </div>
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-3xl bg-slate-50/50 p-8 shadow-sm">
                <div className="w-20 h-20 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">Awaiting Instructions</h3>
                <p className="text-slate-500 text-sm max-w-sm text-center font-medium leading-relaxed">
                  Select a test scenario from the control panel and execute the pipeline to view step-by-step trace telemetry.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
