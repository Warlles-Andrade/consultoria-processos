import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { getSupabaseServerEnv } from './_lib/supabaseServer.js';

const GENERIC_RESPONSE = {
  success: true,
  message: 'Se o email estiver cadastrado e ativo, voce recebera um link para redefinir a senha.',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const buildRecoveryEmail = ({ name, recoveryLink }) => `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f7fb;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe4ee;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px 32px;background:#155e75;color:#ffffff;">
          <h1 style="margin:0;font-size:24px;">Redefinicao de senha</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;">Ola, <strong>${escapeHtml(name)}</strong>.</p>
          <p style="margin:0 0 24px;line-height:1.6;color:#475569;">Recebemos uma solicitacao para redefinir sua senha no Workive. Use o botao abaixo para continuar.</p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${escapeHtml(recoveryLink)}" style="display:inline-block;padding:12px 22px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">Redefinir minha senha</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">Se voce nao solicitou a redefinicao, ignore este email. O link e temporario e deve ser usado somente por voce.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

async function findUserByEmail(supabaseAdmin, email) {
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const user = users.find((item) => normalizeEmail(item.email) === email);
    if (user || users.length < perPage) return user || null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = normalizeEmail(req.body?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um email valido.' });
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[request-password-reset] Variaveis do Supabase ausentes.');
    return res.status(503).json({ error: 'Servico de recuperacao temporariamente indisponivel.' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const user = await findUserByEmail(supabaseAdmin, email);
    if (!user) {
      return res.status(200).json(GENERIC_RESPONSE);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('ativo')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.ativo === false) {
      return res.status(200).json(GENERIC_RESPONSE);
    }

    const siteUrl = process.env.VITE_SITE_URL || 'https://www.workive.com.br/';
    const redirectTo = new URL('/', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString();
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (linkError) throw linkError;

    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) {
      throw new Error('Supabase nao retornou o token de recuperacao.');
    }

    const recoveryUrl = new URL('/', redirectTo);
    recoveryUrl.searchParams.set('token_hash', hashedToken);
    recoveryUrl.searchParams.set('type', 'recovery');
    const recoveryLink = recoveryUrl.toString();

    const gmailUser = process.env.GMAIL_USER || process.env.EMAIL || 'claudinojames1702@gmail.com';
    if (!process.env.GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_APP_PASSWORD nao configurada.');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Workive" <${gmailUser}>`,
      to: email,
      subject: 'Redefina sua senha no Workive',
      html: buildRecoveryEmail({
        name: user.user_metadata?.nome || email,
        recoveryLink,
      }),
    });
  } catch (error) {
    console.error('[request-password-reset] Falha ao processar recuperacao:', error?.message || error);
    // Nao diferenciar publicamente falhas vinculadas a existencia da conta.
  }

  return res.status(200).json(GENERIC_RESPONSE);
}
