import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, XCircle, Clock, TrendingDown, Percent } from 'lucide-react';

const STATUS = {
  APPROVED: {
    icon: CheckCircle2,
    label: 'Approved',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    text: 'text-emerald-500 dark:text-emerald-400',
    badge: 'badge-emerald',
    bar: 'bg-emerald-500',
    glow: '0 0 40px rgba(16,185,129,0.2)',
  },
  PARTIAL: {
    icon: AlertCircle,
    label: 'Partially Approved',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    text: 'text-amber-500 dark:text-amber-400',
    badge: 'badge-amber',
    bar: 'bg-amber-500',
    glow: '0 0 40px rgba(245,158,11,0.2)',
  },
  REJECTED: {
    icon: XCircle,
    label: 'Rejected',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    text: 'text-rose-500 dark:text-rose-400',
    badge: 'badge-rose',
    bar: 'bg-rose-500',
    glow: '0 0 40px rgba(244,63,94,0.2)',
  },
  MANUAL_REVIEW: {
    icon: Clock,
    label: 'Manual Review',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/25',
    text: 'text-violet-500 dark:text-violet-400',
    badge: 'badge-violet',
    bar: 'bg-violet-500',
    glow: '0 0 40px rgba(139,92,246,0.2)',
  },
};

const DEFAULT_STATUS = {
  icon: AlertCircle, label: 'Unknown', bg: 'bg-slate-500/10',
  border: 'border-slate-500/20', text: 'text-slate-500', badge: 'badge-slate',
  bar: 'bg-slate-500', glow: 'none',
};

function confidenceLabel(score) {
  if (score >= 0.95) return { text: 'Very High',   cls: 'text-emerald-500' };
  if (score >= 0.80) return { text: 'High',         cls: 'text-emerald-400' };
  if (score >= 0.60) return { text: 'Moderate',     cls: 'text-amber-400' };
  return                     { text: 'Low',          cls: 'text-rose-400' };
}

export default function ClaimMetrics({ result }) {
  if (!result) return null;

  const cfg    = STATUS[result.decision] || DEFAULT_STATUS;
  const Icon   = cfg.icon;
  const conf   = result.confidence_score ?? 0;
  const confPct = Math.round(conf * 100);
  const confInfo = confidenceLabel(conf);
  const circ   = 2 * Math.PI * 18;   // r=18 → circumference ≈ 113.1
  const dash   = circ - circ * conf;
  const bd     = result.breakdown;

  return (
    <div className="space-y-4">
      {/* ── Top 3 cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Decision */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={`glass rounded-3xl p-6 border ${cfg.border} relative overflow-hidden`}
          style={{ boxShadow: cfg.glow }}>
          <div className={`absolute inset-0 ${cfg.bg} pointer-events-none`} />
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Decision</span>
              <div className={`w-9 h-9 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${cfg.text}`} />
              </div>
            </div>
            <p className={`text-3xl font-black tracking-tight leading-tight ${cfg.text}`}>
              {cfg.label}
            </p>
            {result.rejection_reasons?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.rejection_reasons.map(r => (
                  <span key={r} className="badge badge-rose text-[9px]">{r.replace(/_/g, ' ')}</span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Amount */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass rounded-3xl p-6 relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4">
            Approved Amount
          </span>
          <p className="text-3xl font-black text-slate-800 dark:text-white font-mono tracking-tight">
            ₹{(result.approved_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          {bd && bd.original_claimed_amount > (result.approved_amount || 0) && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Claimed</span>
                <span className="font-semibold text-slate-600 dark:text-slate-300 font-mono">
                  ₹{bd.original_claimed_amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-rose-400" /> Deducted
                </span>
                <span className="font-semibold text-rose-500 font-mono">
                  −₹{(bd.original_claimed_amount - (result.approved_amount || 0)).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Confidence */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass rounded-3xl p-6 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">
              AI Confidence
            </span>
            <p className={`text-3xl font-black font-mono text-glow ${cfg.text}`}>{confPct}%</p>
            <p className={`text-xs font-bold mt-1.5 ${confInfo.cls}`}>{confInfo.text}</p>
          </div>
          {/* Circular gauge */}
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" className="fill-none stroke-slate-200 dark:stroke-white/10" strokeWidth="3.5" />
              <motion.circle
                cx="22" cy="22" r="18"
                initial={{ strokeDashoffset: circ }}
                animate={{ strokeDashoffset: dash }}
                transition={{ duration: 1.6, ease: 'easeOut', delay: 0.3 }}
                className={`fill-none stroke-current ${cfg.text}`}
                strokeWidth="3.5" strokeLinecap="round"
                style={{ strokeDasharray: circ }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xs font-black font-mono ${cfg.text}`}>{confPct}%</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Breakdown table ── */}
      {bd && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass rounded-3xl p-6">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Calculation Breakdown</p>
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05] text-sm">
            {[
              { label: 'Original Claimed Amount',   value: bd.original_claimed_amount,   cls: '' },
              bd.network_discount_applied > 0 && { label: 'Network Hospital Discount', value: -bd.network_discount_applied, cls: 'text-emerald-500' },
              bd.network_discount_applied > 0 && { label: 'Amount After Discount',     value: bd.amount_after_discount,     cls: '' },
              bd.copay_deducted > 0 && { label: 'Co-pay Deducted',           value: -bd.copay_deducted,            cls: 'text-rose-500' },
            ].filter(Boolean).map((row, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
                <span className={`font-bold font-mono ${row.cls || 'text-slate-800 dark:text-slate-100'}`}>
                  {row.value < 0 ? '−' : ''}₹{Math.abs(row.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 pb-1">
              <span className="font-bold text-slate-800 dark:text-white">Final Approved</span>
              <span className={`text-lg font-black font-mono ${cfg.text}`}>
                ₹{bd.final_approved_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Applied rules */}
          {bd.applied_rules?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.05] flex flex-wrap gap-2">
              {bd.applied_rules.map(rule => (
                <span key={rule} className="badge badge-slate text-[10px]">
                  <Percent className="w-2.5 h-2.5" /> {rule}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
