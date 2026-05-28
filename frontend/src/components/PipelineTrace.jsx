import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Check, XCircle, Clock } from 'lucide-react';

export default function PipelineTrace({ traces }) {
  if (!traces || traces.length === 0) return null;

  return (
    <div className="mt-12">
      <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-3">
        <Activity className="w-5 h-5 text-brand-accent" />
        Execution Telemetry
      </h3>
      
      <div className="relative pl-6 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:to-transparent dark:before:from-slate-700">
        {traces.map((trace, index) => {
          const isSuccess = trace.status === 'SUCCESS';
          return (
            <motion.div 
              key={index} 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15 }}
              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group"
            >
              {/* Icon Marker */}
              <div className={`flex items-center justify-center w-6 h-6 rounded-full border-4 border-slate-50 dark:border-slate-900 absolute left-0 md:left-1/2 -translate-x-1/2 ${isSuccess ? 'bg-emerald-500' : 'bg-rose-500'} shadow-[0_0_15px_rgba(0,0,0,0.2)] z-10`}>
                {isSuccess ? <Check className="w-3 h-3 text-white" /> : <XCircle className="w-3 h-3 text-white" />}
              </div>
              
              {/* Card */}
              <div className="w-full ml-6 md:w-[calc(50%-2rem)] md:ml-0 glass p-5 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-brand-accent/50 dark:hover:border-brand-accent/30 group">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm tracking-wide">
                    {trace.agent_name}
                  </h4>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                    <Clock className="w-3 h-3" />
                    {trace.execution_time_ms.toFixed(1)} ms
                  </span>
                </div>
                
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  {trace.message}
                </p>
                
                {trace.errors && trace.errors.length > 0 && (
                  <div className="mt-4 bg-rose-50/50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900/50">
                    <span className="text-[10px] uppercase font-bold text-rose-800 dark:text-rose-400 block mb-1.5 tracking-wider">Exception Trace</span>
                    <ul className="space-y-1">
                      {trace.errors.map((err, i) => (
                        <li key={i} className="text-xs text-rose-600 dark:text-rose-300 font-mono break-all">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
