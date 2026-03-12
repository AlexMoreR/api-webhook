export function isLegacyWorkflowSeguimiento(input: {
  idNodo?: string | null;
  tipo?: string | null;
}) {
  const nodeId = String(input.idNodo ?? '').trim();
  const tipo = String(input.tipo ?? '').trim().toLowerCase();

  return nodeId.length > 0 || tipo.startsWith('seguimiento-');
}
