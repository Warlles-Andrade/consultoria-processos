// Calculo das ocorrencias de uma tarefa recorrente (geracao em lote, sem cron).
// Cada ocorrencia vira uma linha real em `processos`, com o titulo sufixado pelo rotulo.

export const MAX_OCORRENCIAS = 366;

const ROTULOS = {
  diaria: 'Dia',
  semanal: 'Semana',
  mensal: 'Mês',
  personalizada: 'Ocorrência',
};

function toDateOnly(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function formatDateOnly(date) {
  return date.toISOString().split('T')[0];
}

function addMonthsClamped(baseDate, diaAncora, monthsToAdd) {
  const ano = baseDate.getFullYear();
  const mes = baseDate.getMonth() + monthsToAdd;
  const ultimoDiaDoMesAlvo = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(diaAncora, ultimoDiaDoMesAlvo);
  return new Date(ano, mes, dia);
}

/**
 * Calcula as datas de ocorrencia de uma recorrencia entre data_inicio e data_fim (inclusive).
 * Lanca erro se a frequencia for invalida, se faltar intervalo para 'personalizada',
 * ou se o total de ocorrencias ultrapassar MAX_OCORRENCIAS.
 *
 * @returns {Array<{ data: string, indice: number, rotulo: string }>}
 */
export function calcularOcorrencias({ frequencia, intervaloValor, intervaloUnidade, dataInicio, dataFim }) {
  if (!dataInicio || !dataFim) {
    throw new Error('Data de início e data fim são obrigatórias.');
  }
  const inicio = toDateOnly(dataInicio);
  const fim = toDateOnly(dataFim);
  if (fim <= inicio) {
    throw new Error('A data fim deve ser posterior à data de início.');
  }
  if (frequencia === 'personalizada' && (!intervaloValor || intervaloValor < 1 || !intervaloUnidade)) {
    throw new Error('Informe o intervalo (número + unidade) para recorrência personalizada.');
  }

  const rotuloBase = ROTULOS[frequencia];
  if (!rotuloBase) {
    throw new Error('Frequência de recorrência inválida.');
  }

  const ocorrencias = [];
  const diaAncora = inicio.getDate();
  let atual = new Date(inicio);
  let indice = 1;

  while (atual <= fim) {
    ocorrencias.push({
      data: formatDateOnly(atual),
      indice,
      rotulo: `${rotuloBase} ${indice}`,
    });

    if (ocorrencias.length > MAX_OCORRENCIAS) {
      throw new Error(
        `Esta recorrência geraria mais de ${MAX_OCORRENCIAS} tarefas. Encurte o período (data fim) e tente novamente.`
      );
    }

    if (frequencia === 'diaria') {
      atual = new Date(atual);
      atual.setDate(atual.getDate() + 1);
    } else if (frequencia === 'semanal') {
      atual = new Date(atual);
      atual.setDate(atual.getDate() + 7);
    } else if (frequencia === 'mensal') {
      atual = addMonthsClamped(inicio, diaAncora, indice);
    } else if (frequencia === 'personalizada') {
      if (intervaloUnidade === 'dias') {
        atual = new Date(atual);
        atual.setDate(atual.getDate() + intervaloValor);
      } else if (intervaloUnidade === 'semanas') {
        atual = new Date(atual);
        atual.setDate(atual.getDate() + intervaloValor * 7);
      } else {
        atual = addMonthsClamped(inicio, diaAncora, indice * intervaloValor);
      }
    }

    indice += 1;
  }

  return ocorrencias;
}
