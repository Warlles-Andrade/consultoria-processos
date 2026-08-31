import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { getSupabaseServerEnv } from './_lib/supabaseServer.js';

const SENDER_EMAIL = 'claudinojames1702@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const token = authHeader.split(' ')[1];
  const { supabaseUrl, supabaseAnonKey } = getSupabaseServerEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Servidor não configurado para validar autenticação.' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  const { type, data } = req.body;

  if (!type || !data?.email) {
    return res.status(400).json({ error: 'type e data.email são obrigatórios' });
  }

  if (!process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'GMAIL_APP_PASSWORD não configurado no servidor.' });
  }

  let subject = '';
  let html = '';

  if (type === 'assignment') {
    // Notificação de atribuição de responsável
    const prazo = data.prazo
      ? new Date(data.prazo + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'Não informado';

    subject = `📌 Você foi atribuído a um processo — ${data.tarefa || 'Processo'}`;
    html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;padding:20px;border-radius:8px 8px 0 0;margin:0;">
        📌 Nova Atribuição de Processo
      </h2>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p>Olá, <strong>${data.responsavel}</strong>!</p>
        <p>Você foi atribuído como responsável em um processo. Confira os detalhes abaixo:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
          <tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;width:35%;">Tarefa</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.tarefa || '—'}</td></tr>
          ${data.cliente ? `<tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Cliente</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.cliente}</td></tr>` : ''}
          ${data.projeto ? `<tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Projeto</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.projeto}</td></tr>` : ''}
          <tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Status</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.status || '—'}</td></tr>
          <tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Prazo</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${prazo}</td></tr>
          ${data.observacoes ? `<tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Observações</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.observacoes}</td></tr>` : ''}
        </table>
        <p style="margin-top:16px;font-size:12px;color:#6b7280;">
          Enviado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}<br/>
          Sistema de Gestão de Processos
        </p>
      </div>
    </div>`;
  } else if (type === 'recurring_batch') {
    // Notificação de criação de tarefa recorrente (lote de ocorrências)
    const dataInicio = data.dataInicio
      ? new Date(data.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'Não informado';
    const dataFim = data.dataFim
      ? new Date(data.dataFim + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'Não informado';

    subject = `🔁 Nova tarefa recorrente atribuída — ${data.tarefa || 'Tarefa'}`;
    html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;padding:20px;border-radius:8px 8px 0 0;margin:0;">
        🔁 Nova Tarefa Recorrente
      </h2>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p>Olá, <strong>${data.responsavel}</strong>!</p>
        <p>Uma tarefa recorrente foi cadastrada com você como responsável. <strong>${data.totalOcorrencias || ''} tarefa(s)</strong> já foram geradas conforme o cronograma abaixo:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
          <tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;width:35%;">Tarefa</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.tarefa || '—'}</td></tr>
          ${data.cliente ? `<tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Cliente</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.cliente}</td></tr>` : ''}
          ${data.projeto ? `<tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Projeto</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.projeto}</td></tr>` : ''}
          <tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Frequência</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.frequenciaLabel || '—'}</td></tr>
          <tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Período</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${dataInicio} até ${dataFim}</td></tr>
          ${data.observacoes ? `<tr><td style="padding:10px 12px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;">Observações</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${data.observacoes}</td></tr>` : ''}
        </table>
        <p style="font-size:13px;color:#6b7280;">As tarefas geradas já aparecem na Tabela, Kanban e Cronograma do sistema.</p>
        <p style="margin-top:16px;font-size:12px;color:#6b7280;">
          Enviado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}<br/>
          Sistema de Gestão de Processos
        </p>
      </div>
    </div>`;
  } else if (type === 'chat_message') {
    // Notificação de nova mensagem no chat
    subject = `💬 Nova mensagem no processo — ${data.tarefa || 'Processo'}`;
    html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:20px;border-radius:8px 8px 0 0;margin:0;">
        💬 Nova Mensagem no Processo
      </h2>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p>Olá, <strong>${data.responsavel}</strong>!</p>
        <p>Uma nova mensagem foi enviada no processo <strong>"${data.tarefa || 'Processo'}"</strong>:</p>
        <div style="background:#f3f4f6;border-left:4px solid #7c3aed;padding:16px;margin:16px 0;border-radius:0 8px 8px 0;">
          <p style="margin:0 0 8px;font-weight:600;color:#4f46e5;">${data.senderName || 'Usuário'}:</p>
          <p style="margin:0;color:#374151;">${data.message}</p>
        </div>
        ${data.cliente ? `<p style="font-size:14px;color:#6b7280;margin:4px 0;"><strong>Cliente:</strong> ${data.cliente}</p>` : ''}
        ${data.projeto ? `<p style="font-size:14px;color:#6b7280;margin:4px 0;"><strong>Projeto:</strong> ${data.projeto}</p>` : ''}
        <p style="margin-top:20px;font-size:12px;color:#6b7280;">
          Enviado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}<br/>
          Sistema de Gestão de Processos
        </p>
      </div>
    </div>`;
  } else {
    return res.status(400).json({ error: `Tipo de notificação inválido: ${type}` });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SENDER_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Sistema de Processos" <${SENDER_EMAIL}>`,
      to: data.email,
      subject,
      html,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notify-responsavel]', err.message);
    res.status(500).json({ error: err.message });
  }
}
