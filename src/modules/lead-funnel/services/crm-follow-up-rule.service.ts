import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';

import { PrismaService } from 'src/database/prisma.service';
import { CRM_FOLLOW_UP_RULE_DEFAULTS } from '../constants/lead-status.constants';
import {
  sanitizeTimeValue,
  sanitizeTimezone,
  sanitizeWeekdays,
} from '../utils/crm-follow-up-schedule';

export type ResolvedCrmFollowUpRule = {
  id: string | null;
  userId: string;
  leadStatus: LeadStatus;
  enabled: boolean;
  delayMinutes: number;
  maxAttempts: number;
  goal: string;
  prompt: string;
  fallbackMessage: string;
  allowedWeekdays: number[];
  sendStartTime: string;
  sendEndTime: string;
  ruleKey: string;
  timezone: string;
};

@Injectable()
export class CrmFollowUpRuleService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeRule(args: {
    userId: string;
    leadStatus: LeadStatus;
    timezone?: string | null;
    persisted?: {
      id: string;
      enabled: boolean;
      delayMinutes: number;
      maxAttempts: number;
      goal: string | null;
      prompt: string | null;
      fallbackMessage: string | null;
      allowedWeekdays: number[];
      sendStartTime: string;
      sendEndTime: string;
    } | null;
  }): ResolvedCrmFollowUpRule {
    const defaults = CRM_FOLLOW_UP_RULE_DEFAULTS[args.leadStatus];
    const persisted = args.persisted;

    return {
      id: persisted?.id ?? null,
      userId: args.userId,
      leadStatus: args.leadStatus,
      enabled: persisted?.enabled ?? defaults.enabled,
      delayMinutes: Math.max(persisted?.delayMinutes ?? defaults.delayMinutes, 0),
      maxAttempts: Math.max(persisted?.maxAttempts ?? defaults.maxAttempts, 0),
      goal: (persisted?.goal ?? defaults.goal).trim(),
      prompt: (persisted?.prompt ?? defaults.prompt).trim(),
      fallbackMessage: (persisted?.fallbackMessage ?? defaults.fallbackMessage).trim(),
      allowedWeekdays: sanitizeWeekdays(
        persisted?.allowedWeekdays ?? defaults.allowedWeekdays,
      ),
      sendStartTime: sanitizeTimeValue(
        persisted?.sendStartTime ?? defaults.sendStartTime,
        defaults.sendStartTime,
      ),
      sendEndTime: sanitizeTimeValue(
        persisted?.sendEndTime ?? defaults.sendEndTime,
        defaults.sendEndTime,
      ),
      ruleKey: defaults.ruleKey,
      timezone: sanitizeTimezone(args.timezone),
    };
  }

  async ensureRulesForUser(userId: string) {
    const cleanUserId = String(userId ?? '').trim();
    if (!cleanUserId) {
      return [];
    }

    const [user, existing] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: cleanUserId },
        select: {
          timezone: true,
        },
      }),
      this.prisma.crmFollowUpRule.findMany({
        where: { userId: cleanUserId },
        select: {
          id: true,
          leadStatus: true,
          enabled: true,
          delayMinutes: true,
          maxAttempts: true,
          goal: true,
          prompt: true,
          fallbackMessage: true,
          allowedWeekdays: true,
          sendStartTime: true,
          sendEndTime: true,
        },
      }),
    ]);

    const existingMap = new Map(existing.map((rule) => [rule.leadStatus, rule]));
    const missingStatuses = (Object.values(LeadStatus) as LeadStatus[]).filter(
      (leadStatus) => !existingMap.has(leadStatus),
    );

    if (missingStatuses.length) {
      await this.prisma.crmFollowUpRule.createMany({
        data: missingStatuses.map((leadStatus) => {
          const defaults = CRM_FOLLOW_UP_RULE_DEFAULTS[leadStatus];

          return {
            userId: cleanUserId,
            leadStatus,
            enabled: defaults.enabled,
            delayMinutes: defaults.delayMinutes,
            maxAttempts: defaults.maxAttempts,
            goal: defaults.goal,
            prompt: defaults.prompt,
            fallbackMessage: defaults.fallbackMessage,
            allowedWeekdays: defaults.allowedWeekdays,
            sendStartTime: defaults.sendStartTime,
            sendEndTime: defaults.sendEndTime,
          };
        }),
        skipDuplicates: true,
      });
    }

    const refreshed =
      missingStatuses.length > 0
        ? await this.prisma.crmFollowUpRule.findMany({
            where: { userId: cleanUserId },
            select: {
              id: true,
              leadStatus: true,
              enabled: true,
              delayMinutes: true,
              maxAttempts: true,
              goal: true,
              prompt: true,
              fallbackMessage: true,
              allowedWeekdays: true,
              sendStartTime: true,
              sendEndTime: true,
            },
          })
        : existing;

    return (Object.values(LeadStatus) as LeadStatus[]).map((leadStatus) =>
      this.normalizeRule({
        userId: cleanUserId,
        leadStatus,
        timezone: user?.timezone,
        persisted:
          refreshed.find((rule) => rule.leadStatus === leadStatus) ?? null,
      }),
    );
  }

  async getRuleForUser(userId: string, leadStatus: LeadStatus) {
    const rules = await this.ensureRulesForUser(userId);
    return (
      rules.find((rule) => rule.leadStatus === leadStatus)
      ?? this.normalizeRule({
        userId,
        leadStatus,
      })
    );
  }
}
