import 'dotenv/config';
import nodemailer from 'nodemailer';

const SENDER_EMAIL = 'claudinojames1702@gmail.com';
const TEST_RECIPIENT = 'james.henrique@cepconsult.com.br';

async function testEmail() {
  console.log('--- Teste de Envio de Email ---\n');

  if (!process.env.GMAIL_APP_PASSWORD) {
    console.error('ERRO: GMAIL_APP_PASSWORD não encontrado no .env');
    process.exit(1);
  }

  console.log(`De: ${SENDER_EMAIL}`);
  console.log(`Para: ${TEST_RECIPIENT}`);
  console.log(`Senha de App: ${process.env.GMAIL_APP_PASSWORD.substring(0, 4)}****\n`);
  console.log('Conectando ao Gmail SMTP...');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SENDER_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.verify();
    console.log('Conexão SMTP OK!\n');
  } catch (err) {
    console.error('FALHA na conexão SMTP:', err.message);
    console.error('\n-> A senha de app provavelmente está inválida ou expirada.');
    console.error('-> Gere uma nova em: https://myaccount.google.com/apppasswords');
    process.exit(1);
  }

  try {
    const info = await transporter.sendMail({
      from: `"Teste Sistema" <${SENDER_EMAIL}>`,
      to: TEST_RECIPIENT,
      subject: '✅ Teste de Email — Sistema de Processos',
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;max-width:500px;">
          <h2 style="color:#7c3aed;">Teste de Email</h2>
          <p>Se você está lendo isto, o envio de email está funcionando corretamente!</p>
          <p style="color:#6b7280;font-size:13px;">Enviado em ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      `,
    });

    console.log('EMAIL ENVIADO COM SUCESSO!');
    console.log('Message ID:', info.messageId);
    console.log(`\nVerifique a caixa de entrada de ${TEST_RECIPIENT}`);
  } catch (err) {
    console.error('ERRO ao enviar email:', err.message);
    process.exit(1);
  }
}

testEmail();
