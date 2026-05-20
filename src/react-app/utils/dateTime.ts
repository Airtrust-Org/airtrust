export class DateTimeUtils {
  
  static parseDataBrasileira(dataStr: string): Date | null {
    if (!dataStr) return null;
    
    try {
      const [dia, mes, ano] = dataStr.split('/');
      return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    } catch (error) {
      console.error('Erro ao converter data brasileira:', error);
      return null;
    }
  }
  
  static formatDataBrasileira(date: Date): string {
    if (!date || !(date instanceof Date)) return '';
    
    const dia = date.getDate().toString().padStart(2, '0');
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    const ano = date.getFullYear();
    
    return `${dia}/${mes}/${ano}`;
  }
  
  static formatHora(date: Date): string {
    if (!date || !(date instanceof Date)) return '';
    
    const hora = date.getHours().toString().padStart(2, '0');
    const minuto = date.getMinutes().toString().padStart(2, '0');
    
    return `${hora}:${minuto}`;
  }
  
  static adicionarHoras(dataInicio: string, horaInicio: string, horasParaAdicionar: number) {
    try {
      const [dia, mes, ano] = dataInicio.split('/');
      const [hora, minuto] = horaInicio.split(':');
      
      const dataHora = new Date(
        parseInt(ano),
        parseInt(mes) - 1,
        parseInt(dia),
        parseInt(hora),
        parseInt(minuto)
      );
      
      dataHora.setHours(dataHora.getHours() + horasParaAdicionar);
      
      return {
        data: this.formatDataBrasileira(dataHora),
        hora: this.formatHora(dataHora),
        dateObj: dataHora
      };
    } catch (error) {
      console.error('Erro ao adicionar horas:', error);
      return null;
    }
  }
  
  static calcularDuracao(dataInicio: string, horaInicio: string, dataFim: string, horaFim: string): number {
    try {
      const inicio = this.parseDataBrasileira(dataInicio);
      if (!inicio) return 0;
      
      const [horaI, minutoI] = horaInicio.split(':');
      inicio.setHours(parseInt(horaI), parseInt(minutoI));
      
      const fim = this.parseDataBrasileira(dataFim);
      if (!fim) return 0;
      
      const [horaF, minutoF] = horaFim.split(':');
      fim.setHours(parseInt(horaF), parseInt(minutoF));
      
      const diferencaMs = fim.getTime() - inicio.getTime();
      const horasDuracao = diferencaMs / (1000 * 60 * 60);
      
      return horasDuracao;
    } catch (error) {
      console.error('Erro ao calcular duração:', error);
      return 0;
    }
  }
  
  static validarSequenciaDatetime(dataInicio: string, horaInicio: string, dataFim: string, horaFim: string): boolean {
    const duracao = this.calcularDuracao(dataInicio, horaInicio, dataFim, horaFim);
    return duracao > 0;
  }
  
  static toISOString(dataBrasileira: string, hora: string): string {
    try {
      const [dia, mes, ano] = dataBrasileira.split('/');
      const [h, m] = hora.split(':');
      
      const date = new Date(
        parseInt(ano),
        parseInt(mes) - 1,
        parseInt(dia),
        parseInt(h),
        parseInt(m)
      );
      
      return date.toISOString();
    } catch (error) {
      console.error('Erro ao converter para ISO string:', error);
      return '';
    }
  }
  
  static fromISOString(isoString: string): { data: string; hora: string } {
    try {
      const date = new Date(isoString);
      return {
        data: this.formatDataBrasileira(date),
        hora: this.formatHora(date)
      };
    } catch (error) {
      console.error('Erro ao converter de ISO string:', error);
      return { data: '', hora: '' };
    }
  }
  
  static validarFormatoDataBrasileira(data: string): boolean {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = data.match(regex);
    
    if (!match) return false;
    
    const [, dia, mes, ano] = match;
    const diaNum = parseInt(dia);
    const mesNum = parseInt(mes);
    const anoNum = parseInt(ano);
    
    if (mesNum < 1 || mesNum > 12) return false;
    if (diaNum < 1 || diaNum > 31) return false;
    if (anoNum < 1900 || anoNum > 2100) return false;
    
    const date = new Date(anoNum, mesNum - 1, diaNum);
    return date.getFullYear() === anoNum && 
           date.getMonth() === mesNum - 1 && 
           date.getDate() === diaNum;
  }
  
  static validarFormatoHora(hora: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return regex.test(hora);
  }
  
  static getDataAtualBrasileira(): string {
    return this.formatDataBrasileira(new Date());
  }
  
  static getHoraAtual(): string {
    return this.formatHora(new Date());
  }
}
