import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

import { PrismaClient } from '@prisma/client';

import { isLegacyWorkflowSeguimiento } from '../modules/seguimientos/legacy-workflow-follow-up.helper';

type CliOptions = {
  cleanup: boolean;
  userId?: string;
  archiveFile?: string;
};

type SessionPatch = {
  id: number;
  userId: string;
  remoteJid: string;
  instanceId: string;
  beforeSeguimientos: string;
  afterSeguimientos: string;
  beforeInactividad: string;
  afterInactividad: string;
};

function parseArgs(argv: string[]): CliOptions {
  const cleanup = argv.includes('--cleanup');
  const userIdArg = argv.find((arg) => arg.startsWith('--user-id='));
  const archiveFileArg = argv.find((arg) => arg.startsWith('--archive-file='));

  return {
    cleanup,
    userId: userIdArg?.slice('--user-id='.length).trim() || undefined,
    archiveFile: archiveFileArg?.slice('--archive-file='.length).trim() || undefined,
  };
}

function parseStoredIds(value?: string | null) {
  return String(value ?? '')
    .split('-')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function buildStoredIds(ids: number[]) {
  return Array.from(new Set(ids)).sort((a, b) => a - b).join('-');
}

function getDefaultArchiveFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(process.cwd(), 'legacy-archives', `legacy-workflow-follow-up-${stamp}.json`);
}

async function main() {
  const prisma = new PrismaClient();
  const options = parseArgs(process.argv.slice(2));
  const archiveFile = resolve(options.archiveFile || getDefaultArchiveFile());

  try {
    const userSessions = options.userId
      ? await prisma.session.findMany({
          where: { userId: options.userId },
          select: {
            id: true,
            userId: true,
            remoteJid: true,
            instanceId: true,
          },
        })
      : [];

    const legacyNodes = await prisma.workflowNode.findMany({
      where: {
        tipo: {
          startsWith: 'seguimiento-',
        },
        ...(options.userId
          ? {
              workflow: {
                userId: options.userId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        tipo: true,
        workflowId: true,
        createdAt: true,
        updatedAt: true,
        workflow: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
      },
      orderBy: [{ workflowId: 'asc' }, { createdAt: 'asc' }],
    });

    const followUpCandidates = await prisma.seguimiento.findMany({
      where: options.userId
        ? userSessions.length
          ? {
              OR: userSessions.map((session) => ({
                remoteJid: session.remoteJid,
                instancia: session.instanceId,
              })),
            }
          : {
              id: {
                in: [],
              },
            }
        : {
            OR: [
              {
                idNodo: {
                  not: null,
                },
              },
              {
                tipo: {
                  startsWith: 'seguimiento-',
                },
              },
            ],
          },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const legacyFollowUps = followUpCandidates.filter((item) =>
      isLegacyWorkflowSeguimiento(item),
    );
    const legacyNodeIds = legacyNodes.map((node) => node.id);
    const legacyFollowUpIds = legacyFollowUps.map((item) => item.id);
    const legacyFollowUpIdSet = new Set(legacyFollowUpIds);

    const candidateSessions = await prisma.session.findMany({
      where: options.userId
        ? {
            userId: options.userId,
          }
        : {
            OR: [
              {
                seguimientos: {
                  not: '',
                },
              },
              {
                inactividad: {
                  not: '',
                },
              },
            ],
          },
      select: {
        id: true,
        userId: true,
        remoteJid: true,
        instanceId: true,
        seguimientos: true,
        inactividad: true,
      },
      orderBy: { id: 'asc' },
    });

    const sessionPatches: SessionPatch[] = candidateSessions
      .map((session) => {
        const nextSeguimientos = parseStoredIds(session.seguimientos).filter(
          (id) => !legacyFollowUpIdSet.has(id),
        );
        const nextInactividad = parseStoredIds(session.inactividad).filter(
          (id) => !legacyFollowUpIdSet.has(id),
        );

        const beforeSeguimientos = String(session.seguimientos ?? '');
        const beforeInactividad = String(session.inactividad ?? '');
        const afterSeguimientos = buildStoredIds(nextSeguimientos);
        const afterInactividad = buildStoredIds(nextInactividad);

        if (
          beforeSeguimientos === afterSeguimientos
          && beforeInactividad === afterInactividad
        ) {
          return null;
        }

        return {
          id: session.id,
          userId: session.userId,
          remoteJid: session.remoteJid,
          instanceId: session.instanceId,
          beforeSeguimientos,
          afterSeguimientos,
          beforeInactividad,
          afterInactividad,
        };
      })
      .filter((item): item is SessionPatch => item !== null);

    const blockedStates = legacyNodeIds.length
      ? await prisma.sessionWorkflowState.findMany({
          where: {
            currentNodeId: {
              in: legacyNodeIds,
            },
          },
          select: {
            id: true,
            sessionId: true,
            workflowId: true,
            currentNodeId: true,
            intentionStatus: true,
          },
        })
      : [];

    const archivePayload = {
      generatedAt: new Date().toISOString(),
      mode: options.cleanup ? 'cleanup' : 'dry-run',
      userId: options.userId ?? null,
      summary: {
        legacyWorkflowNodes: legacyNodes.length,
        legacySeguimientos: legacyFollowUps.length,
        sessionsToPatch: sessionPatches.length,
        blockedWorkflowStates: blockedStates.length,
      },
      workflowNodes: legacyNodes,
      seguimientos: legacyFollowUps,
      sessionPatches,
      blockedWorkflowStates: blockedStates,
    };

    await mkdir(dirname(archiveFile), { recursive: true });
    await writeFile(archiveFile, JSON.stringify(archivePayload, null, 2), 'utf8');

    if (!options.cleanup) {
      console.log(
        JSON.stringify(
          {
            success: true,
            mode: 'dry-run',
            archiveFile,
            summary: archivePayload.summary,
          },
          null,
          2,
        ),
      );
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (legacyNodeIds.length) {
        await tx.sessionWorkflowState.updateMany({
          where: {
            currentNodeId: {
              in: legacyNodeIds,
            },
          },
          data: {
            currentNodeId: null,
            intentionStatus: 'idle',
          },
        });
      }

      for (const patch of sessionPatches) {
        await tx.session.update({
          where: { id: patch.id },
          data: {
            seguimientos: patch.afterSeguimientos,
            inactividad: patch.afterInactividad,
          },
        });
      }

      if (legacyFollowUpIds.length) {
        await tx.seguimiento.deleteMany({
          where: {
            id: {
              in: legacyFollowUpIds,
            },
          },
        });
      }

      if (legacyNodeIds.length) {
        await tx.workflowNode.deleteMany({
          where: {
            id: {
              in: legacyNodeIds,
            },
          },
        });
      }
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          mode: 'cleanup',
          archiveFile,
          summary: archivePayload.summary,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
