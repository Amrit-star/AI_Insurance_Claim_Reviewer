import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export default function ClaimMetrics({ result }) {
  if (!result) return null;

  const getStatusConfig = (status) => {
    switch (status) {
      case 'APPROVED': 
        return { 
          icon: <CheckCircle2 className="w-8 h-8 text-emerald-400" />,
          glow: 'shadow-[0_0_40px_-10px_rgba(16,185,129,0.4)]',
          text: 'text-emerald-500 dark:text-emerald-400',
          border: 'border-emerald-500/30'
        };
      case 'PARTIAL': 
        return {
          icon: <AlertCircle className="w-8 h-8 text-amber-400" />,
          glow: 'shadow-[0_0_40px_-10px_rgba(245,158,11,0.4)]',
          text: 'text-amber-500 dark:text-amber-400',
          border: 'border-amber-500/30'
        };
      case 'REJECTED': 
        return {
          icon: <XCircle className="w-8 h-8 text-rose-400" />,
          glow: 'shadow-[0_0_40px_-10px_rgba(244,63,94,0.4)]',
          text: 'text-rose-500 dark:text-rose-400',
          border: 'border-rose-500/30'
        };
      default: 
        return {
          icon: <AlertCircle className="w-8 h-8 text-slate-400" />,
          glow: 'shadow-[0_0_40px_-10px_rgba(148,163,184,0.4)]',
          text: 'text-slate-500 dark:text-slate-400',
          border: 'border-slate-500/30'
        };
    }
  };

  const config = getStatusConfig(result.decision);
  const strokeDashoffset = 125.6 - (125.6 * result.confidence_score);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
      {/* Decision Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`glass p-6 rounded-3xl relative overflow-hidden ${config.border} ${config.glow}`}
      >
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 block mb-2">Final Decision</span>
            <span className={`text-4xl font-extrabold tracking-tight ${config.text}`}>
              {result.decision || "Early Exit"}
            </span>
          </div>
          {config.icon}
        </div>
        {/* Subtle background glow */}
        <div className={`absolute -bottom-10 -right-10 w-32 h-32 blur-3xl opacity-20 rounded-full ${config.text.split(' ')[0].replace('text-', 'bg-')}`} />
      </motion.div>

      {/* Amount Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass p-6 rounded-3xl flex flex-col justify-center relative overflow-hidden"
      >
        <span className="text-xs uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 block mb-2">Approved Amount</span>
        <span className="text-4xl font-extrabold text-slate-800 dark:text-white font-mono tracking-tight">
          ₹{(result.approved_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
        {result.breakdown && result.breakdown.original_claimed_amount && result.breakdown.original_claimed_amount > result.approved_amount && (
           <span className="text-sm font-medium text-rose-500 mt-2 block">
             - ₹{(result.breakdown.original_claimed_amount - result.approved_amount).toLocaleString('en-IN')} Deducted
           </span>
        )}
      </motion.div>

      {/* Confidence Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass p-6 rounded-3xl flex items-center justify-between"
      >
        <div>
          <span className="text-xs uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 block mb-2">System Confidence</span>
          <span className="text-4xl font-extrabold text-brand-accent font-mono tracking-tight text-glow">
            {(result.confidence_score * 100).toFixed(0)}%
          </span>
        </div>
        
        {/* Circular Progress Gauge */}
        <div className="relative w-16 h-16">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="20" className="fill-none stroke-slate-200 dark:stroke-slate-700" strokeWidth="4" />
            <motion.circle 
              initial={{ strokeDashoffset: 125.6 }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.4 }}
              cx="22" cy="22" r="20" 
              className={`fill-none stroke-current ${result.confidence_score > 0.8 ? 'text-brand-accent' : result.confidence_score > 0.5 ? 'text-amber-500' : 'text-rose-500'}`}
              strokeWidth="4"
              strokeLinecap="round"
              style={{ strokeDasharray: 125.6 }}
            />
          </svg>
        </div>
      </motion.div>
    </div>
  );
}
