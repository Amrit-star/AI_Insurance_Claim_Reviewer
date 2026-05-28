import React from 'react';

export default function ClaimMetrics({ result }) {
  if (!result) return null;

  const getStatusStyle = (status) => {
    switch (status) {
      case 'APPROVED': return 'from-emerald-500 to-green-600 border-green-400 text-white shadow-green-500/30';
      case 'PARTIAL': return 'from-amber-400 to-orange-500 border-orange-400 text-white shadow-orange-500/30';
      case 'REJECTED': return 'from-rose-500 to-red-600 border-red-400 text-white shadow-red-500/30';
      default: return 'from-slate-600 to-slate-700 border-slate-500 text-white shadow-slate-500/30';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6 animate-fade-in">
      <div className={`p-6 rounded-2xl border bg-gradient-to-br shadow-lg ${getStatusStyle(result.decision)} transition-transform transform hover:scale-105`}>
        <span className="text-xs uppercase font-bold tracking-widest block opacity-80 mb-1">Decision</span>
        <span className="text-3xl font-extrabold drop-shadow-sm">{result.decision || "Early Exit"}</span>
      </div>

      <div className="glass p-6 rounded-2xl flex flex-col justify-center transition-transform transform hover:scale-105">
        <span className="text-xs uppercase font-bold tracking-widest text-slate-500 block mb-1">Approved Amount</span>
        <span className="text-3xl font-extrabold text-plum-blue">
          ₹{(result.approved_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="glass p-6 rounded-2xl flex flex-col justify-center transition-transform transform hover:scale-105">
        <span className="text-xs uppercase font-bold tracking-widest text-slate-500 block mb-1">System Confidence</span>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-extrabold text-plum-blue">
            {(result.confidence_score * 100).toFixed(0)}%
          </span>
          <div className="flex-1 mb-2 ml-2 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className={`h-full ${result.confidence_score > 0.8 ? 'bg-emerald-500' : result.confidence_score > 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${result.confidence_score * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
