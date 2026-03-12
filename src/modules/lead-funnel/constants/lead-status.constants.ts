import { CrmFollowUpStatus, LeadStatus } from '@prisma/client';

export const LEAD_STATUS_VALUES = Object.values(LeadStatus);

export const ACTIVE_LEAD_STATUSES = [
  LeadStatus.FRIO,
  LeadStatus.TIBIO,
  LeadStatus.CALIENTE,
] as const;

export const ACTIVE_CRM_FOLLOW_UP_STATUSES = [
  CrmFollowUpStatus.PENDING,
  CrmFollowUpStatus.PROCESSING,
] as const;

export type CrmFollowUpRuleDefaults = {
  enabled: boolean;
  ruleKey: string;
  delayMinutes: number;
  maxAttempts: number;
  goal: string;
  prompt: string;
  fallbackMessage: string;
  allowedWeekdays: number[];
  sendStartTime: string;
  sendEndTime: string;
};

export const CRM_FOLLOW_UP_RULE_DEFAULTS: Record<
  LeadStatus,
  CrmFollowUpRuleDefaults
> = {
  [LeadStatus.FRIO]: {
    enabled: true,
    ruleKey: 'lead-status-frio',
    delayMinutes: 24 * 60,
    maxAttempts: 1,
    goal: 'Reactivar la conversacion sin presionar y detectar si sigue habiendo interes real.',
    prompt:
      'Escribe breve, cordial y sin insistencia. Menciona valor util, evita sonar automatizado y termina con una pregunta simple.',
    fallbackMessage:
      'Hola, te escribo para saber si aun te interesa retomar esta conversacion.',
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: '09:00',
    sendEndTime: '18:00',
  },
  [LeadStatus.TIBIO]: {
    enabled: true,
    ruleKey: 'lead-status-tibio',
    delayMinutes: 6 * 60,
    maxAttempts: 2,
    goal: 'Mover al lead al siguiente paso comercial con claridad y una llamada a la accion concreta.',
    prompt:
      'Usa un tono consultivo. Resume el punto mas util del contexto y cierra con una pregunta concreta para avanzar.',
    fallbackMessage:
      'Hola, sigo atento para ayudarte a avanzar con la informacion que necesitas.',
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: '09:00',
    sendEndTime: '18:00',
  },
  [LeadStatus.CALIENTE]: {
    enabled: true,
    ruleKey: 'lead-status-caliente',
    delayMinutes: 60,
    maxAttempts: 2,
    goal: 'Cerrar el siguiente paso comercial cuanto antes con urgencia medida y claridad.',
    prompt:
      'Se directo, humano y comercial. Prioriza cierre o agendamiento. No des demasiadas opciones.',
    fallbackMessage:
      'Hola, si quieres lo dejamos listo ahora mismo. Dime y avanzamos con el siguiente paso.',
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: '09:00',
    sendEndTime: '18:00',
  },
  [LeadStatus.FINALIZADO]: {
    enabled: false,
    ruleKey: 'lead-status-finalizado',
    delayMinutes: 0,
    maxAttempts: 0,
    goal: '',
    prompt: '',
    fallbackMessage: '',
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: '09:00',
    sendEndTime: '18:00',
  },
  [LeadStatus.DESCARTADO]: {
    enabled: false,
    ruleKey: 'lead-status-descartado',
    delayMinutes: 0,
    maxAttempts: 0,
    goal: '',
    prompt: '',
    fallbackMessage: '',
    allowedWeekdays: [1, 2, 3, 4, 5],
    sendStartTime: '09:00',
    sendEndTime: '18:00',
  },
};
