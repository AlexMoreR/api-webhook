import { Injectable } from '@nestjs/common';
import { RegistroService } from '../registro/registro.service';

@Injectable()
export class ReporteSintesisService {
  constructor(private readonly registroService: RegistroService) {}

  /**
   * Guarda/actualiza la síntesis acumulada en Registro(tipo=REPORTE)
   * sin tocar Session.seguimientos.
   */
  async updateSintesis(sessionId: number, sintesis: string) {
    return this.registroService.upsertReporte(sessionId, sintesis);
  }
}
