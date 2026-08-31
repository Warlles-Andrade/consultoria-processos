import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import AndamentosPanel from '@/components/AndamentosPanel';
import { History } from 'lucide-react';
import { entidadeTipoLabel } from '@/data/fiscalDomain';

/**
 * Envelope de diálogo para a linha do tempo de uma entidade fiscal.
 * Usado por e-CredAc, PER/DCOMP e contencioso; o crédito tem o painel
 * embutido na própria aba de detalhes.
 */
const AndamentosModal = ({
  isOpen, onClose, entidadeTipo, entidadeId, projetoId,
  titulo, subtitulo, usuario, userProfile, tipoPadrao, onChanged,
}) => {
  if (!entidadeId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <History className="h-5 w-5 text-indigo-600" />
            <span>Andamentos</span>
            <Badge variant="outline" className="border-slate-300 text-slate-600">
              {entidadeTipoLabel[entidadeTipo] || entidadeTipo}
            </Badge>
          </DialogTitle>
          {(titulo || subtitulo) && (
            <div className="pt-1">
              {titulo && <p className="text-sm font-medium text-slate-800">{titulo}</p>}
              {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
            </div>
          )}
        </DialogHeader>

        <AndamentosPanel
          entidadeTipo={entidadeTipo}
          entidadeId={entidadeId}
          projetoId={projetoId}
          usuario={usuario}
          userProfile={userProfile}
          tipoPadrao={tipoPadrao}
          onChanged={onChanged}
        />
      </DialogContent>
    </Dialog>
  );
};

export default AndamentosModal;
