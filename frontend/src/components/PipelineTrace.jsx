import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Clock, ChevronDown, Activity } from 'lucide-react';

const AGENT_ICONS = {
  VerificationAgent: '🔍',
  ExtractionAgent:   '📄',
  AdjudicationAgent: '⚖️',
  FraudAgent:        '🚨',
};

function statusStyle(status) {
  switch (status) {
    case 'SUCCESS':  return { bar: 'bg-emerald-500', dot: 'bg-emerald-500', badge: 'badge-emerald', Icon: CheckCircle2 };
    case 'FAILED':   return { bar: 'bg-rose-500',    dot: 'bg-rose-500',    badge: 'badge-rose',    Icon: XCircle };
    case 'DEGRADED': return { bar: 'bg-amber-500',   dot: 'bg-amber-500',   badge: 'badge-amber',   Icon: AlertTriangle };
    default:         return { bar: 'bg-slate-400',   dot: 'bg-slate-400',   badge: 'badge-slate',   Icon: Clock };
  }
}

function TraceCard({ trace, index, maxTime }) {
  const [open, setOpen] = useState(false);
  const sty = statusStyle(trace.status);
  const Icon = sty.Icon;
  const barWidth = maxTime > 0 ? Math.max(4, (trace.execution_time_ms / maxTime) * 100) : 50;
  const emoji = AGENT_ICONS[trace.agent_name] || '🤖';

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.25 }}
      className="glass glass-hover rounded-2xl overflow-hidden"
    >
      {/* Status bar at top */}
      <div className={`h-0.5 ${sty.bar} opacity-70`} style={{ width: `${barWidth}%` }} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] flex items-center justify-center text-lg shrink-0">
            {emoji}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{trace.agent_name}</span>
              <span className={`badge ${sty.badge}`}>
                <Icon className="w-3 h-3" /> {trace.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed truncate">
              {trace.message}
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className="flex items-center gap-1 text-[11px] font-mono font-semibold
              text-slate-400 bg-black/[0.04] dark:bg-white/[0.05] px-2.5 py-1 rounded-lg border border-black/[0.06] dark:border-white/[0.06]">
              <Clock className="w-3 h-3" /> {trace.execution_time_ms.toFixed(1)}ms
            </span>
            {(trace.errors?.length > 0 || trace.warnings?.length > 0) && (
              <button onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-brand-accent transition-colors">
                Details <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Expanded errors/warnings */}
        <AnimatePresence>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.05] space-y-3">
                {trace.errors?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2">Error Codes</p>
                    <div className="flex flex-wrap gap-2">
                      {trace.errors.map((e, i) => (
                        <code key={i} className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20
                          text-[11px] text-rose-400 font-mono break-all">
                          {e}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {trace.warnings?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2">Warnings</p>
                    <div className="flex flex-wrap gap-2">
                      {trace.warnings.map((w, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20
                          text-[11px] text-amber-400 font-mono">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function PipelineTrace({ traces }) {
  if (!traces?.length) return null;

  const maxTime = Math.max(...traces.map(t => t.execution_time_ms), 1);
  const totalMs = traces.reduce((sum, t) => sum + t.execution_time_ms, 0);
  const successCount = traces.filter(t => t.status === 'SUCCESS').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-accent" />
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Execution Pipeline
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {successCount}/{traces.length} passed
          </span>
          <span className="font-mono">{totalMs.toFixed(1)}ms total</span>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {traces.map((trace, i) => (
          <TraceCard key={i} trace={trace} index={i} maxTime={maxTime} />
        ))}
      </div>
    </div>
  );
}
