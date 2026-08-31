import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { X as XIcon, PlusCircle } from 'lucide-react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const SettingsModal = ({ isOpen, onClose, view, responsaveis, setResponsaveis, empresas, setEmpresas }) => {
  const { toast } = useToast();
  
  // Usar chaves específicas para cada view
  const nameStorageKey = `settingsModal_${view}_itemName`;
  const emailStorageKey = `settingsModal_${view}_itemEmail`;
  
  const [newItemName, setNewItemName] = useLocalStorage(nameStorageKey, '');
  const [newItemEmail, setNewItemEmail] = useLocalStorage(emailStorageKey, '');
  const [items, setItems] = useState([]);
  
  let title, setData, placeholder, itemType;

  useEffect(() => {
    if (isOpen) {
      switch (view) {
        case 'responsaveis':
          setItems(responsaveis);
          break;
        case 'empresas':
          setItems(empresas);
          break;
        default:
          setItems([]);
      }
      // Não limpar os campos aqui - deixar os dados persistidos
    }
  }, [isOpen, view, responsaveis, empresas]);

  switch (view) {
    case 'responsaveis':
      title = 'Gerenciar Responsáveis';
      setData = setResponsaveis;
      placeholder = 'Nome do Responsável';
      itemType = 'Responsável';
      break;
    case 'empresas':
      title = 'Gerenciar Empresas';
      setData = setEmpresas;
      placeholder = 'Nome da Empresa';
      itemType = 'Empresa';
      break;
    default:
      return null;
  }

  const handleAddItem = () => {
    const trimmedName = newItemName.trim();
    const trimmedEmail = newItemEmail.trim();
    if (trimmedName === '' || (view === 'responsaveis' && trimmedEmail === '')) {
      toast({ title: 'Erro', description: `O nome e o email do ${itemType.toLowerCase()} não podem ser vazios.`, variant: 'destructive' });
      return;
    }
    if (items.some(item => (item.name || item) && (item.name || item).toLowerCase() === trimmedName.toLowerCase())) {
      toast({ title: 'Erro', description: `${itemType} já existe.`, variant: 'destructive' });
      return;
    }
    
    let newItems;
    if (view === 'responsaveis') {
      // Preservar emails existentes dos responsáveis
      const existingItemsWithEmails = items.map(item => ({
        ...item,
        email: item.email || null // Garantir que email seja preservado
      }));
      newItems = [...existingItemsWithEmails, { name: trimmedName, email: trimmedEmail }];
    } else {
      newItems = [...items, { name: trimmedName }];
    }
    setItems(newItems);
    setData(newItems);
    setNewItemName('');
    setNewItemEmail('');
  };

  const handleRemoveItem = (itemToRemove) => {
    const newItems = items.filter(item => item.id !== itemToRemove.id);
    setItems(newItems);
    setData(newItems);
  };

  // Limpar dados quando o modal for fechado
  const handleClose = () => {
    // Limpar dados do localStorage ao fechar
    localStorage.removeItem(nameStorageKey);
    localStorage.removeItem(emailStorageKey);
    setNewItemName('');
    setNewItemEmail('');
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg glass-effect">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{title}</DialogTitle>
          <DialogDescription>Adicione ou remova {itemType.toLowerCase()}s.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <Label htmlFor="newItemInput" className="text-sm font-medium text-gray-700">Novo(a) {itemType}</Label>
            <div className="flex flex-col md:flex-row items-center gap-2 mt-1">
              <Input
                id="newItemInput"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={placeholder}
                className="flex-grow"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem();}}}
              />
              {view === 'responsaveis' && (
                <Input
                  id="newItemEmail"
                  value={newItemEmail}
                  onChange={(e) => setNewItemEmail(e.target.value)}
                  placeholder="Email do Responsável"
                  className="flex-grow"
                  type="email"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem();}}}
                />
              )}
              <Button onClick={handleAddItem} size="sm" className="bg-blue-500 hover:bg-blue-600 text-white">
                <PlusCircle className="h-4 w-4 mr-1.5"/> Adicionar
              </Button>
            </div>
          </div>

          {items && items.length > 0 && (
            <div className="space-y-2 pt-3">
              <h3 className="text-sm font-medium text-gray-600">Lista de {itemType.toLowerCase()}s existentes:</h3>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <Badge key={item.id || item.name || item} variant="secondary" className="flex items-center gap-1.5 pr-1.5 py-1 text-sm bg-slate-100 text-slate-700 border-slate-300">
                    {item.name || item}
                    {view === 'responsaveis' && item.email && (
                      <span className="ml-2 text-xs text-gray-500">({item.email})</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item)}
                      className="ml-1 p-0.5 rounded-full hover:bg-red-200 transition-colors"
                      aria-label={`Remover ${item.name || item}`}
                    >
                      <XIcon className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {items && items.length === 0 && (
             <p className="text-sm text-gray-500 text-center py-4">Nenhum(a) {itemType.toLowerCase()} cadastrado(a) ainda.</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;


// Altere para mim a aba de Tabela de Processos  na visão de Lista de Processos para quando cadastrar uma empresa ele agrupa elas em quadros separados

// Exemplo: Cadastrei um novo processo e já tem uma empresa cadastrada, então ele cria um quadro para aquela empresa e coloca o processo dentro desse quadro. Se eu cadastrar outra empresa, ele cria outro quadro para essa nova empresa e assim por diante.

// Na aba de Dashboard nos quadros de resumo Não iniciado Em andamento Paralisado e Concluidos, preciso que toda vez que eu clilcar nesses quadroes ele me mostre um modal com as informações contidadas em cada uma dessas opções
// Exemplo: Se eu clicar no quadro "Não iniciado", ele deve abrir um modal mostrando todos os processos que estão nessa categoria, com detalhes como nome do processo, responsável, data de início, etc. Isso deve ser feito para todos os quadros: "Em andamento", "Paralisado" e "Concluídos".