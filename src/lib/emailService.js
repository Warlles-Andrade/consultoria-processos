// Serviço de email alternativo usando EmailJS ou similar
// Você pode configurar este serviço para enviar emails sem depender do Supabase Functions

export const sendProcessNotification = async (processData) => {
  try {
    // Aqui você pode integrar com serviços como:
    // - EmailJS
    // - SendGrid
    // - Resend
    // - Ou qualquer outra API de email
    
    // console.log('Dados do processo para envio:', processData); // Removido por segurança
    
    // Por enquanto, vamos simular o envio
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: processData.responsavelEmail,
        subject: `Notificação de Processo - ${processData.cliente}`,
        processData: processData
      })
    });
    
    if (!response.ok) {
      throw new Error('Falha ao enviar email');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Erro no serviço de email:', error);
    throw error;
  }
};

// Template do email em texto simples para fallback
export const getEmailTemplate = (processData) => {
  return `
NOTIFICAÇÃO DO PROCESSO 

Detalhes do Processo:
- Tarefa: ${processData.cliente}
- Empresa: ${processData.empresa}
- Tipo de Crédito: ${processData.tipoCredito}
- Status: ${processData.status}
- Responsável: ${processData.responsavel}
- Período: ${processData.periodo || 'Não informado'}
${processData.observacoes ? `- Observações: ${processData.observacoes}` : ''}


Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
Sistema de Gestão de Processos
  `.trim();
}; 