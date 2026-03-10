export function buildChatHistorySessionId(instanceName: string, remoteJid: string) {
  return `${(instanceName ?? '').trim()}-${(remoteJid ?? '').trim()}`;
}
