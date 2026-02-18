import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { LoggerService } from 'src/core/logger/logger.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService
  ) { }

  /**
   * Crea o actualiza una sesión.
   * Evita sesiones duplicadas cuando el mismo contacto aparece con dos JIDs distintos
   * (por ejemplo: 573001234567@jid y 573001234567@s.whatsapp.net).
   *
   * @param userId        ID del usuario dueño de la instancia
   * @param remoteJid     JID "prioritario" que vas a usar (según tu diagrama)
   * @param pushName      Nombre que llega del evento
   * @param instanceId    ID de la instancia de Evolution
   * @param remoteJidAlt  JID alternativo (ej: el otro dominio). Puede ser undefined.
   */
  async registerSession(
    userId: string,
    remoteJid: string,
    pushName: string,
    instanceId: string,
    remoteJidAlt?: string | null,
  ) {
    const clean = (s?: string | null) => (s ?? '').trim();
    const isBadName = (n: string) =>
      n === '' || n === '.' || n.toLowerCase() === 'desconocido';

    const rj = clean(remoteJid);
    const rjAlt = clean(remoteJidAlt);
    const pn = clean(pushName);

    const jidsToSearch: string[] = [rj];
    if (rjAlt) jidsToSearch.push(rjAlt);

    const existingSession = await this.prisma.session.findFirst({
      where: {
        userId,
        instanceId,
        remoteJid: { in: jidsToSearch },
      },
    });

    if (existingSession) {
      // Solo mejoramos el nombre si llega uno “bueno”
      const nextPushName = !isBadName(pn) ? pn : existingSession.pushName;

      // Si estamos cambiando el remoteJid principal, guardamos el anterior como alt
      const nextAlt =
        rjAlt ||
        existingSession.remoteJidAlt ||
        (existingSession.remoteJid !== rj ? existingSession.remoteJid : null);

      return this.prisma.session.update({
        where: { id: existingSession.id },
        data: {
          remoteJid: rj,
          remoteJidAlt: nextAlt,
          pushName: nextPushName,
          instanceId,
          updatedAt: new Date(),
        },
      });
    }

    return this.prisma.session.create({
      data: {
        userId,
        remoteJid: rj,
        remoteJidAlt: rjAlt || null,
        pushName: !isBadName(pn) ? pn : 'Desconocido',
        instanceId,
        status: true,
        updatedAt: new Date(),
      },
    });
  }

  // Nuevo método para obtener el estado de agentDisabled
  async getAgentDisabled(remoteJid: string, instanceName: string, userId: string): Promise<boolean> {
    const rj = remoteJid.trim();
    const inst = instanceName.trim();
    const uid = userId.trim();

    // this.logger.error(`Buscando session para remoteJid: "${rj}", instanceId: "${inst}", userId: "${uid}"`, 'SessionService');

    const session = await this.prisma.session.findFirst({
      where: { remoteJid: rj, instanceId: inst, userId: uid },
    });

    // this.logger.error(`Session encontrada: ${session ? 'Sí' : 'No'}`, 'SessionService');
    // this.logger.error(`Session encontrada: ${JSON.stringify(session)}`, 'SessionService');

    return !!session?.agentDisabled;
  }

  // Get a specific session by remoteJid and instanceId
  async getSession(remoteJid: string, instanceId: string, userId: string) {
    return this.prisma.session.findFirst({
      where: {
        remoteJid,
        userId,
        instanceId
      },
    });
  }

  async updateSessionRemoteJid(id: number, newRemoteJid: string) {
    const current = await this.prisma.session.findUnique({
      where: { id },
      select: { remoteJid: true, remoteJidAlt: true },
    });

    return this.prisma.session.update({
      where: { id },
      data: {
        remoteJid: newRemoteJid,
        remoteJidAlt: current?.remoteJidAlt ?? current?.remoteJid ?? null,
      },
    });
  }

  // Update state session by remoteJid y instanceId
  async updateSessionStatus(remoteJid: string, instanceId: string, status: boolean, userId: string) {
    return this.prisma.session.updateMany({
      where: { remoteJid, userId, instanceId },
      data: { status },
    });
  }

  // Consulta el estado del chat
  async isSessionActive(remoteJid: string, userId: string, instanceId: string): Promise<boolean> {
    const session = await this.prisma.session.findFirst({
      where: { remoteJid, userId },
      select: { status: true },
    });
    return session?.status ?? false;
  }

  async registerSeguimientos(
    seguimientos: string,
    remoteJid: string,
    instanceId: string,
    userId: string,
  ) {
    try {
      const updatedSession = await this.prisma.session.updateMany({
        where: {
          remoteJid,
          instanceId,
          userId,
        },
        data: { seguimientos },
      });

      if (updatedSession.count === 0) {
        return null;
      }

      const session = await this.prisma.session.findFirst({
        where: { remoteJid, instanceId, userId },
      });

      return session;
    } catch (error) {
      return null;
    }
  }

  async registerWorkflow(
    flujos: string,
    remoteJid: string,
    instanceId: string,
    userId: string,
  ) {
    try {
      const updatedSession = await this.prisma.session.updateMany({
        where: {
          remoteJid,
          instanceId,
          userId,
        },
        data: { flujos },
      });

      if (updatedSession.count === 0) {
        return null;
      }

      const session = await this.prisma.session.findFirst({
        where: { remoteJid, instanceId, userId },
      });

      return session;
    } catch (error) {
      return null;
    }
  }

  /**
   * Limpia los seguimientos de INACTIVIDAD cuando el usuario ya respondió
   * y el agente ya envió su respuesta.
   *
   * Se ejecuta de ÚLTIMO después de responder al cliente.
   */
  async clearInactividadAfterAgentReply(
    userId: string,
    remoteJid: string,
    instanceId: string,
  ): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { userId, remoteJid, instanceId },
    });

    if (!session || !session.inactividad) {
      // No hay inactividad registrada para esta sesión
      return;
    }

    const parseIds = (value?: string | null): number[] => {
      if (!value || !value.trim()) return [];
      return value
        // soporta ambos formatos: "1-2-3" o "1,2,3"
        .split(/[-,]/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
    };

    const buildString = (ids: number[]) =>
      ids.length ? ids.map((id) => id.toString()).join('-') : '';

    const inactividadIds = parseIds(session.inactividad);
    if (!inactividadIds.length) return;

    const todosSeguimientos = parseIds(session.seguimientos);

    // IDs que permanecerán como seguimientos normales (no eran de inactividad)
    const restantes = todosSeguimientos.filter((id) => !inactividadIds.includes(id));

    // 1) Eliminar o marcar los seguimientos de inactividad
    // Si tienes un campo estado en Seguimiento, cámbialo a updateMany
    await this.prisma.seguimiento.deleteMany({
      where: { id: { in: inactividadIds } },
    });

    // 2) Actualizar la sesión: limpiar inactividad y ajustar seguimientos
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        inactividad: '',
        seguimientos: buildString(restantes),
      },
    });

    this.logger.log(
      `Inactividad limpiada para ${remoteJid} (instanceId: ${instanceId}). Eliminados seguimientos: [${inactividadIds.join(
        ', ',
      )}]`,
      'SessionService',
    );
  }
}
