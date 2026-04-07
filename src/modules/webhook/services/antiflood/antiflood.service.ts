// src/modules/webhook/services/antiflood.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { LoggerService } from 'src/core/logger/logger.service';

interface MessageTracker {
  timestamps: number[];
  /** Timestamp hasta el cual el contacto está bloqueado por cooldown */
  blockedUntil?: number;
}

@Injectable()
export class AntifloodService implements OnModuleDestroy {
  private messageMap: Map<string, MessageTracker> = new Map();

  // 🔧 Personalización — patrón sincronizado
  private readonly maxHistory = 20; // Suficiente para cubrir la ventana de alta frecuencia
  private readonly toleranceMs = 2000; // Tolerancia para considerar un patrón similar
  private readonly minRequired = 5; // Mínimo de mensajes requeridos para evaluación
  private readonly minSimilarCount = 7; // Cuántos deltas deben ser similares para marcar patrón

  // 🔧 Personalización — ventana de alta frecuencia (AI-to-AI)
  private readonly windowMs = 60_000; // Ventana de 60 segundos
  private readonly maxMsgInWindow = 10; // Más de 10 mensajes en 60s → loop AI-to-AI

  // 🔧 Personalización — cooldown tras detección
  private readonly cooldownMs = 5 * 60_000; // 5 minutos bloqueado tras detección

  // 🔧 Personalización — cleanup de entradas inactivas
  private readonly staleThresholdMs = 5 * 60_000; // Entrada inactiva si no hay msgs en 5 min
  private readonly cleanupIntervalMs = 10 * 60_000; // Limpieza cada 10 minutos

  private cleanupTimer: NodeJS.Timeout;

  constructor(private readonly logger: LoggerService) {
    this.cleanupTimer = setInterval(
      () => this.cleanupStaleEntries(),
      this.cleanupIntervalMs,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Guarda timestamp del mensaje entrante
   */
  registerMessageTimestamp(remoteJid: string) {
    const now = Date.now();
    const entry = this.messageMap.get(remoteJid) || { timestamps: [] };
    entry.timestamps.push(now);

    if (entry.timestamps.length > this.maxHistory) {
      entry.timestamps.shift();
    }

    this.messageMap.set(remoteJid, entry);
  }

  /**
   * Calcula la mediana de una lista de valores
   */
  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Comprueba si el contacto está en período de cooldown activo.
   * Se reutiliza en ambos detectores para bloquear rápido sin reanalizar.
   */
  private isInCooldown(entry: MessageTracker): boolean {
    return !!entry.blockedUntil && Date.now() < entry.blockedUntil;
  }

  /**
   * Detecta si los mensajes están siendo enviados con intervalos sincronizados.
   */
  isSynchronizedPattern(remoteJid: string): boolean {
    const entry = this.messageMap.get(remoteJid);
    if (!entry) return false;

    if (this.isInCooldown(entry)) return true;

    if (entry.timestamps.length < this.minRequired) return false;

    const deltas = entry.timestamps
      .map((t, i, arr) => (i === 0 ? 0 : t - arr[i - 1]))
      .filter((d) => d > 0);

    if (deltas.length < this.minRequired - 1) return false;

    const ref = this.median(deltas);

    const similares = deltas.filter(
      (delta) => Math.abs(delta - ref) <= this.toleranceMs,
    );

    if (similares.length >= this.minSimilarCount) {
      this.logger.warn(
        `🚨 Patrón IA sincronizado detectado para ${remoteJid} (${similares.length}/${deltas.length} deltas ≈ ${ref}ms)`,
        'AntifloodService',
      );
      return true;
    }

    return false;
  }

  /**
   * Detecta si un contacto está enviando mensajes a alta frecuencia dentro de
   * una ventana deslizante. Cubre loops AI-to-AI con intervalos variables que
   * escapan a isSynchronizedPattern.
   */
  isHighFrequencyContact(remoteJid: string): boolean {
    const entry = this.messageMap.get(remoteJid);
    if (!entry) return false;

    if (this.isInCooldown(entry)) return true;

    const now = Date.now();
    const recent = entry.timestamps.filter((t) => now - t <= this.windowMs);

    if (recent.length >= this.maxMsgInWindow) {
      this.logger.warn(
        `🚨 Alta frecuencia AI-to-AI detectada para ${remoteJid} (${recent.length} msgs en ${this.windowMs / 1000}s)`,
        'AntifloodService',
      );
      return true;
    }

    return false;
  }

  /**
   * Marca al contacto como bloqueado por cooldown tras una detección.
   * Los timestamps se conservan (no se borran) para que el cooldown funcione
   * incluso si el historial de ventana se renueva con nuevos mensajes.
   */
  markBlocked(remoteJid: string): void {
    const entry = this.messageMap.get(remoteJid) || { timestamps: [] };
    entry.blockedUntil = Date.now() + this.cooldownMs;
    this.messageMap.set(remoteJid, entry);
    this.logger.log(
      `AntifloodService: ${remoteJid} bloqueado por ${this.cooldownMs / 60_000} minutos.`,
      'AntifloodService',
    );
  }

  /**
   * Limpia entradas inactivas para evitar memory leak.
   * Una entrada se considera inactiva si su último timestamp supera staleThresholdMs
   * Y no tiene cooldown activo.
   */
  private cleanupStaleEntries(): void {
    const now = Date.now();
    let removed = 0;

    for (const [remoteJid, entry] of this.messageMap.entries()) {
      const lastTs = entry.timestamps[entry.timestamps.length - 1] ?? 0;
      const isCooldownActive = this.isInCooldown(entry);
      const isStale = now - lastTs > this.staleThresholdMs;

      if (isStale && !isCooldownActive) {
        this.messageMap.delete(remoteJid);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(
        `AntifloodService: limpiadas ${removed} entradas inactivas. Total activas: ${this.messageMap.size}`,
        'AntifloodService',
      );
    }
  }
}
