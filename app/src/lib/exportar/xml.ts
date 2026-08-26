/** Escapa texto para meterlo adentro de un tag o atributo XML/KML/GPX —
 * hace falta para que un nombre de lote con "&", "<", etc. no rompa el
 * archivo generado. */
export function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
