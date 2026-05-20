/**
 * 🇧🇷 BIBLIOTECA CENTRALIZADA DE DATAS BRASILEIRAS - AIRTRUST
 *
 * Padrão obrigatório: dd/mm/aaaa em TODO o sistema
 *
 * Esta biblioteca deve ser usada em TODOS os módulos para garantir
 * 100% de consistência no formato brasileiro de datas.
 */

export class DatesBrasil {
  private static parseToDate(input: string | Date): Date {
    if (input instanceof Date) return input;

    // IMPORTANT: date-only strings (YYYY-MM-DD) must be treated as local dates.
    // `new Date('YYYY-MM-DD')` is interpreted as UTC and can display as the previous day in Brazil.
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(input);
    if (m) {
      const ano = Number(m[1]);
      const mes = Number(m[2]);
      const dia = Number(m[3]);
      return new Date(ano, mes - 1, dia);
    }

    return new Date(input);
  }

  /**
   * Converte data ISO para formato brasileiro
   * 2025-09-20 → 20/09/2025
   */
  static isoParaBrasil(dataISO: string | Date): string {
    if (!dataISO) return '';

    try {
      const date = this.parseToDate(dataISO);

      if (isNaN(date.getTime())) return '';

      const dia = date.getDate().toString().padStart(2, '0');
      const mes = (date.getMonth() + 1).toString().padStart(2, '0');
      const ano = date.getFullYear().toString();

      return `${dia}/${mes}/${ano}`;
    } catch (error) {
      return '';
    }
  }

  /**
   * Converte data brasileira para Date object
   * 20/09/2025 → Date(2025, 8, 20)
   */
  static brasilParaDate(dataBrasil: string): Date | null {
    if (!dataBrasil || !this.validarFormatoBrasil(dataBrasil)) return null;

    try {
      const [dia, mes, ano] = dataBrasil.split('/').map(Number);
      return new Date(ano, mes - 1, dia);
    } catch (error) {
      return null;
    }
  }

  /**
   * Converte data brasileira para ISO
   * 20/09/2025 → 2025-09-20
   */
  static brasilParaISO(dataBrasil: string): string {
    const date = this.brasilParaDate(dataBrasil);
    return date ? date.toISOString().split('T')[0] : '';
  }

  /**
   * Valida se a data está no formato brasileiro correto
   * dd/mm/aaaa
   */
  static validarFormatoBrasil(dataBrasil: string): boolean {
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;

    if (!regex.test(dataBrasil)) return false;

    const [dia, mes, ano] = dataBrasil.split('/').map(Number);

    if (dia < 1 || dia > 31) return false;
    if (mes < 1 || mes > 12) return false;
    if (ano < 1900 || ano > 2100) return false;

    const date = new Date(ano, mes - 1, dia);
    return date.getDate() === dia && date.getMonth() === mes - 1 && date.getFullYear() === ano;
  }

  /**
   * Obtem data atual no formato brasileiro
   */
  static hoje(): string {
    return this.isoParaBrasil(new Date());
  }

  /**
   * Adiciona dias a uma data brasileira
   */
  static adicionarDias(dataBrasil: string, dias: number): string {
    const date = this.brasilParaDate(dataBrasil);
    if (!date) return '';

    date.setDate(date.getDate() + dias);
    return this.isoParaBrasil(date);
  }

  /**
   * Calcula diferença em dias entre duas datas brasileiras
   */
  static diferencaEmDias(data1Brasil: string, data2Brasil: string): number {
    const date1 = this.brasilParaDate(data1Brasil);
    const date2 = this.brasilParaDate(data2Brasil);

    if (!date1 || !date2) return 0;

    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Formata data com hora no padrão brasileiro
   * 20/09/2025 14:30:00
   */
  static formatarComHora(dateTime: string | Date): string {
    if (!dateTime) return '';

    try {
      const date = this.parseToDate(dateTime);

      if (isNaN(date.getTime())) return '';

      const dataBrasil = this.isoParaBrasil(date);
      const hora = date.toTimeString().substring(0, 8);

      return `${dataBrasil} ${hora}`;
    } catch (error) {
      return '';
    }
  }

  /**
   * Converte data brasileira + hora para ISO string completo
   * 20/09/2025 + 14:30 → 2025-09-20T14:30:00.000Z
   */
  static brasilHoraParaISO(dataBrasil: string, hora: string): string {
    if (!dataBrasil || !hora) return '';

    const date = this.brasilParaDate(dataBrasil);
    if (!date) return '';

    const [h, m] = hora.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';

    date.setHours(h, m, 0, 0);
    return date.toISOString();
  }

  /**
   * Converte ISO string para data brasileira + hora
   * 2025-09-20T14:30:00.000Z → { data: "20/09/2025", hora: "14:30" }
   */
  static isoParaBrasilHora(isoString: string): { data: string; hora: string } {
    try {
      const date = this.parseToDate(isoString);
      return {
        data: this.isoParaBrasil(date),
        hora: date.toTimeString().substring(0, 5),
      };
    } catch (error) {
      return { data: '', hora: '' };
    }
  }

  /**
   * Valida formato de hora HH:mm
   */
  static validarHora(hora: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return regex.test(hora);
  }

  /**
   * Obtem hora atual no formato HH:mm
   */
  static horaAtual(): string {
    const date = new Date();
    return date.toTimeString().substring(0, 5);
  }

  /**
   * Converte qualquer formato de data para brasileiro
   * Aceita: ISO, americana, timestamp, etc.
   */
  static converterParaBrasil(dataQualquer: any): string {
    if (!dataQualquer) return '';

    if (typeof dataQualquer === 'string' && this.validarFormatoBrasil(dataQualquer)) {
      return dataQualquer;
    }

    try {
      const date = this.parseToDate(dataQualquer);
      if (!isNaN(date.getTime())) {
        return this.isoParaBrasil(date);
      }
    } catch (error) {}

    return '';
  }

  /**
   * Aplicar máscara brasileira em tempo real
   * "20092025" → "20/09/2025"
   */
  static aplicarMascaraBrasil(texto: string): string {
    const apenasNumeros = texto.replace(/\D/g, '');

    if (apenasNumeros.length <= 2) {
      return apenasNumeros;
    } else if (apenasNumeros.length <= 4) {
      return `${apenasNumeros.slice(0, 2)}/${apenasNumeros.slice(2)}`;
    } else if (apenasNumeros.length <= 8) {
      return `${apenasNumeros.slice(0, 2)}/${apenasNumeros.slice(2, 4)}/${apenasNumeros.slice(4)}`;
    } else {
      return `${apenasNumeros.slice(0, 2)}/${apenasNumeros.slice(2, 4)}/${apenasNumeros.slice(
        4,
        8,
      )}`;
    }
  }

  /**
   * Comparar duas datas brasileiras
   * Retorna: -1 (data1 < data2), 0 (iguais), 1 (data1 > data2)
   */
  static compararDatas(data1Brasil: string, data2Brasil: string): number {
    const date1 = this.brasilParaDate(data1Brasil);
    const date2 = this.brasilParaDate(data2Brasil);

    if (!date1 || !date2) return 0;

    if (date1 < date2) return -1;
    if (date1 > date2) return 1;
    return 0;
  }

  /**
   * Verificar se data brasileira está no futuro
   */
  static ehFutura(dataBrasil: string): boolean {
    const date = this.brasilParaDate(dataBrasil);
    if (!date) return false;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return date > hoje;
  }

  /**
   * Verificar se data brasileira está no passado
   */
  static ehPassada(dataBrasil: string): boolean {
    const date = this.brasilParaDate(dataBrasil);
    if (!date) return false;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return date < hoje;
  }

  /**
   * Obter nome do mês por extenso
   */
  static obterNomeMes(numeroMes: number): string {
    const meses = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];

    return meses[numeroMes - 1] || '';
  }

  /**
   * Formatar data por extenso
   * 20/09/2025 → "20 de Setembro de 2025"
   */
  static formatarPorExtenso(dataBrasil: string): string {
    if (!this.validarFormatoBrasil(dataBrasil)) return '';

    const [dia, mes, ano] = dataBrasil.split('/').map(Number);
    const nomeMes = this.obterNomeMes(mes);

    return `${dia} de ${nomeMes} de ${ano}`;
  }
}
