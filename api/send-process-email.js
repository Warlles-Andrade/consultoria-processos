import nodemailer from 'nodemailer';

const SENDER_EMAIL = 'claudinojames1702@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { processData } = req.body;

  if (!processData?.responsavelEmail) {
    return res.status(400).json({ error: 'responsavelEmail é obrigatório' });
  }

  if (!process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'GMAIL_APP_PASSWORD não configurado no servidor.' });
  }

  const prazo = processData.prazo
    ? new Date(processData.prazo).toLocaleDateString('pt-BR')
    : 'Não informado';

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;padding:20px;border-radius:8px 8px 0 0;margin:0;">
      📋 Notificação de Processo
    </h2>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      <p>Olá, <strong>${processData.responsavel}</strong>!</p>
      <p>Segue abaixo as informações do processo sob sua responsabilidade:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Tarefa:</td><td style="padding:8px;">${processData.tarefa || ''}</td></tr>
        ${processData.cliente ? `<tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Cliente:</td><td style="padding:8px;">${processData.cliente}</td></tr>` : ''}
        ${processData.projeto ? `<tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Projeto:</td><td style="padding:8px;">${processData.projeto}</td></tr>` : ''}
        <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Status:</td><td style="padding:8px;">${processData.status}</td></tr>
        <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Responsável:</td><td style="padding:8px;">${processData.responsavel}</td></tr>
        <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Prazo:</td><td style="padding:8px;">${prazo}</td></tr>
        ${processData.observacoes ? `<tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Observações:</td><td style="padding:8px;">${processData.observacoes}</td></tr>` : ''}
      </table>
      <p style="margin-top:20px;font-size:12px;color:#6b7280;">
        Enviado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}<br/>
        Sistema de Gestão de Processos
      </p>
    </div>
  </div>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SENDER_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Sistema de Processos" <${SENDER_EMAIL}>`,
      to: processData.responsavelEmail,
      subject: `📋 Atualização de Processo — ${processData.tarefa || 'Processo'}`,
      html,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send-process-email]', err.message);
    res.status(500).json({ error: err.message });
  }
}
