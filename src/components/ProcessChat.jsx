import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { SendHorizonal, Pencil, Trash2, Check, X, MessageSquare, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const EDIT_WINDOW_SECONDS = 20;

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

function TimeAgo({ dateStr }) {
  const now = useNow();
  const diff = Math.floor((now - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return <span>{diff}s atrás</span>;
  if (diff < 3600) return <span>{Math.floor(diff / 60)}min atrás</span>;
  if (diff < 86400) return <span>{Math.floor(diff / 3600)}h atrás</span>;
  return <span>{new Date(dateStr).toLocaleDateString('pt-BR')}</span>;
}

function EditCountdown({ createdAt }) {
  const now = useNow();
  const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 1000);
  const remaining = EDIT_WINDOW_SECONDS - elapsed;
  if (remaining <= 0) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-amber-500">
      <Clock className="h-3 w-3" />
      {remaining}s para editar
    </span>
  );
}

export default function ProcessChat({ processId, currentUser, processData }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const bottomRef = useRef(null);
  const { toast } = useToast();
  const now = useNow();

  // Buscar perfil do usuário logado
  useEffect(() => {
    if (!currentUser?.id) return;
    supabase
      .from('user_profiles')
      .select('nome, grupo')
      .eq('user_id', currentUser.id)
      .single()
      .then(({ data }) => setCurrentUserProfile(data));
  }, [currentUser]);

  // Buscar mensagens
  const fetchMessages = async () => {
    if (!processId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('process_messages')
        .select('*')
        .eq('process_id', processId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`process_messages:${processId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_messages', filter: `process_id=eq.${processId}` },
        () => fetchMessages()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [processId]);

  // Scroll automático ao final
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const canEditOrDelete = (msg) => {
    if (!currentUser) return false;
    if (msg.user_id !== currentUser.id) return false;
    const elapsed = (now - new Date(msg.created_at).getTime()) / 1000;
    return elapsed <= EDIT_WINDOW_SECONDS;
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !currentUser) return;
    setSending(true);
    try {
      const userName = currentUserProfile?.nome || currentUser.email || 'Usuário';
      const userGroup = currentUserProfile?.grupo || '';
      const { error } = await supabase.from('process_messages').insert({
        process_id: processId,
        user_id: currentUser.id,
        user_name: userName,
        user_group: userGroup,
        user_cliente: userGroup,
        message: text,
      });
      if (error) throw error;
      setNewMessage('');

      // Notificar responsável por email (fire-and-forget, não bloqueia o chat)
      if (processData?.email && processData?.responsavel_nome) {
        const isOwnMessage = userName === processData.responsavel_nome;
        if (!isOwnMessage) {
          const { data: { session } } = await supabase.auth.getSession();
          fetch('/api/notify-responsavel', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              type: 'chat_message',
              data: {
                email: processData.email,
                responsavel: processData.responsavel_nome || processData.responsavel,
                tarefa: processData.tarefa,
                cliente: processData.grupo || processData.cliente,
                projeto: processData.projeto_nome || '',
                senderName: userName,
                message: text,
              },
            }),
          }).catch(emailErr => {
            console.error('Erro ao notificar responsável por chat:', emailErr);
          });
        }
      }
    } catch (err) {
      toast({ title: 'Erro ao enviar mensagem', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (msg) => {
    const text = editingText.trim();
    if (!text) return;
    try {
      const { error } = await supabase
        .from('process_messages')
        .update({ message: text, edited: true, updated_at: new Date().toISOString() })
        .eq('id', msg.id);
      if (error) throw error;
      setEditingId(null);
      setEditingText('');
    } catch (err) {
      toast({ title: 'Erro ao editar mensagem', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('process_messages').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      toast({ title: 'Erro ao excluir mensagem', description: err.message, variant: 'destructive' });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEditKeyDown = (e, msg) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit(msg);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditingText('');
    }
  };

  const isMyMessage = (msg) => currentUser && msg.user_id === currentUser.id;

  return (
    <div className="flex flex-col h-[420px] border rounded-xl bg-white/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-50 to-teal-50 border-b">
        <MessageSquare className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-semibold text-blue-700">Chat do Processo</span>
        <Badge variant="secondary" className="ml-auto text-xs bg-indigo-100 text-blue-700">
          {messages.length} mensagem{messages.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Carregando mensagens...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhuma mensagem ainda. Seja o primeiro!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const mine = isMyMessage(msg);
              const editable = canEditOrDelete(msg);
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}
                >
                  {/* Nome do remetente */}
                  <span className={`text-xs font-semibold px-1 ${mine ? 'text-blue-600' : 'text-gray-500'}`}>
                    {mine ? 'Você' : msg.user_name}
                  </span>

                  <div className={`flex items-end gap-2 max-w-[80%] ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Bubble */}
                    <div
                      className={`relative px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words ${
                        mine
                          ? 'bg-gradient-to-br from-blue-600 to-teal-500 text-white rounded-br-sm'
                          : 'bg-white border text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      {editingId === msg.id ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <Textarea
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => handleEditKeyDown(e, msg)}
                            className="text-sm text-gray-800 bg-white resize-none min-h-[60px] border-blue-300 focus:border-blue-500"
                            rows={2}
                          />
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 hover:bg-green-100 text-green-700"
                              onClick={() => handleEdit(msg)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 hover:bg-red-100 text-red-700"
                              onClick={() => { setEditingId(null); setEditingText(''); }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                          {msg.edited && (
                            <span className={`text-xs mt-1 block ${mine ? 'text-indigo-200' : 'text-gray-400'}`}>
                              (editado)
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Ações (editar/excluir) — apenas para mensagens próprias e dentro de 20s */}
                    {mine && editable && editingId !== msg.id && (
                      <div className="flex flex-col gap-1 pb-1">
                        <Button size="sm" variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-blue-100 text-blue-500"
                          title="Editar"
                          onClick={() => { setEditingId(msg.id); setEditingText(msg.message); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-red-100 text-red-400"
                          title="Excluir"
                          onClick={() => handleDelete(msg.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Hora + countdown */}
                  <div className={`flex items-center gap-2 px-1 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-xs text-gray-400">
                      <TimeAgo dateStr={msg.created_at} />
                    </span>
                    {mine && <EditCountdown createdAt={msg.created_at} />}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t bg-white/80 px-4 py-3">
        <div className="flex gap-2 items-end">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
            className="flex-1 resize-none text-sm min-h-[40px] max-h-[100px] border-blue-200 focus:border-blue-400"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={sending || !newMessage.trim()}
            className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 h-10 px-4 shrink-0 rounded-xl"
          >
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Mensagens podem ser editadas ou excluídas por {EDIT_WINDOW_SECONDS} segundos após o envio.
        </p>
      </div>
    </div>
  );
}
