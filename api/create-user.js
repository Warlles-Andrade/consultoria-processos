import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { getSupabaseServerEnv } from './_lib/supabaseServer.js';

const SENDER_EMAIL = 'claudinojames1702@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar token de autorização — apenas admin autenticado pode criar usuários
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  const token = authHeader.split(' ')[1];

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerEnv();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return res.status(500).json({
      error: 'Servidor não configurado. Adicione SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente do Vercel.',
    });
  }

  // Verificar se quem está chamando é um usuário ADM autenticado
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  const { data: callerProfile } = await supabase
    .from('user_profiles')
    .select('grupo')
    .eq('user_id', user.id)
    .single();
  if (callerProfile?.grupo !== 'adm') {
    return res.status(403).json({ error: 'Apenas administradores podem criar usuários.' });
  }

  // Criar usuário via Admin API (sem envio de email pelo Supabase)
  const { email, password, nome, grupo } = req.body;
  if (!email || !password || !nome) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, password, nome' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome, grupo },
  });

  if (createErr) {
    const msg =
      createErr.message?.includes('already been registered') ||
      createErr.message?.includes('already registered')
        ? 'Este email já está cadastrado no sistema.'
        : createErr.message;
    return res.status(400).json({ error: msg });
  }

  // Enviar email de boas-vindas via Gmail SMTP (sem contar no limite do Supabase)
  try {
    if (!process.env.GMAIL_APP_PASSWORD) {
      console.warn('[create-user] GMAIL_APP_PASSWORD não configurado — email não enviado.');
    } else {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: SENDER_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
      });

      const appUrl = 'https://projeto-processos.vercel.app';

      await transporter.sendMail({
        from: `"Sistema de Processos" <${SENDER_EMAIL}>`,
        to: email,
        subject: '🎉 Seu acesso ao Sistema de Gestão de Processos',
        html: buildWelcomeEmail({ nome, email, password, grupo, appUrl }),
      });
    }
  } catch (emailErr) {
    // Não falhar a criação do usuário se o email falhar
    console.error('[create-user] Erro ao enviar email:', emailErr.message);
  }

  return res.status(200).json({ success: true, userId: data.user.id });
}

function buildWelcomeEmail({ nome, email, password, grupo, appUrl }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#db2777);padding:36px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">🎉 Bem-vindo ao Sistema de Processos!</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Seu acesso foi criado com sucesso</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 16px;color:#374151;font-size:16px;">Olá, <strong>${nome}</strong>!</p>
            <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.6;">
              Suas credenciais de acesso ao <strong>Sistema de Gestão de Processos</strong> estão prontas.
              Você já pode fazer login usando os dados abaixo.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:28px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:700;text-transform:uppercase;
                  letter-spacing:0.8px;color:#9ca3af;">Dados de Acesso</p>
                <table width="100%" cellpadding="6" cellspacing="0">
                  <tr>
                    <td style="color:#6b7280;font-size:14px;width:90px;white-space:nowrap;">📧 E-mail:</td>
                    <td style="color:#111827;font-size:14px;font-weight:600;">${email}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;font-size:14px;">🔑 Senha:</td>
                    <td style="color:#7c3aed;font-size:15px;font-weight:700;letter-spacing:0.5px;">${password}</td>
                  </tr>
                  ${grupo ? `<tr>
                    <td style="color:#6b7280;font-size:14px;">🏢 Grupo:</td>
                    <td style="color:#111827;font-size:14px;font-weight:600;">${grupo}</td>
                  </tr>` : ''}
                </table>
              </td></tr>
            </table>
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${appUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);
                color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;
                padding:14px 36px;border-radius:50px;letter-spacing:0.3px;">
                Acessar o Sistema →
              </a>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;">
              <tr><td style="padding:14px 18px;">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
                  ⚠️ <strong>Recomendamos alterar sua senha</strong> no primeiro acesso.
                  Vá em <em>Configurações → Alterar Senha</em> após entrar no sistema.
                </p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              Este email foi enviado automaticamente pelo Sistema de Gestão de Processos.<br/>
              Não responda a esta mensagem.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
