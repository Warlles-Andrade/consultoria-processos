import React from 'react';
import { motion } from 'framer-motion';

/**
 * Card de indicador usado no topo das telas fiscais.
 * `cor` recebe as classes de borda/fundo/texto (ex.: as paletas de fiscalDomain).
 */
const KpiCard = ({ titulo, valor, detalhe, icone: Icone, cor = 'border-slate-200 bg-white text-slate-800', delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{ scale: 1.02 }}
    className={`rounded-2xl border p-4 ${cor}`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{titulo}</p>
        <p className="text-2xl font-bold tabular-nums mt-1 truncate">{valor}</p>
        {detalhe && <p className="text-xs opacity-75 mt-0.5">{detalhe}</p>}
      </div>
      {Icone && <Icone className="h-5 w-5 opacity-60 flex-shrink-0" />}
    </div>
  </motion.div>
);

export { KpiCard };
export default KpiCard;
