import React from 'react';

export default function PipelineTrace({ traces }) {
  if (!traces || traces.length === 0) return null;

  return (
    <div className="mt-10 animate-fade-in">
      <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">
        <svg className="w-6 h-6 text-plum-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        Pipeline Execution Trace
      </h3>
      <div className="relative border-l-2 border-slate-200 pl-8 ml-4 space-y-8">
        {traces.map((trace, index) => {
          const isSuccess = trace.status === 'SUCCESS';
          return (
            <div key={index} className="relative group">
              <span className={`absolute -left-[41px] top-1.5 w-5 h-5 rounded-full border-4 border-white shadow-sm transition-transform group-hover:scale-125 ${
                isSuccess ? 'bg-emerald-500' : 'bg-rose-500'
              }`} />
              
              <div className="glass p-5 rounded-2xl transition-all duration-300 hover:shadow-2xl hover:border-blue-200">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    {trace.agent_name}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${isSuccess ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {trace.status}
                    </span>
                  </h4>
                  <span className="text-xs text-slate-500 font-mono font-medium bg-slate-100/80 px-2 py-1 rounded-md">
                    {trace.execution_time_ms.toFixed(1)} ms
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">{trace.message}</p>
                
                {trace.errors && trace.errors.length > 0 && (
                  <div className="mt-3 bg-rose-50/80 p-3 rounded-xl border border-rose-100/50">
                    <span className="text-xs font-bold text-rose-800 block mb-1">Critical Errors:</span>
                    <ul className="list-disc pl-4 space-y-1">
                      {trace.errors.map((err, i) => (
                        <li key={i} className="text-xs text-rose-600 font-mono">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
