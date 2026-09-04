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

/** KML pide el color como AABBGGRR (alfa, azul, verde, rojo) en hex — al
 * revés del "#RRGGBB" que usa el resto de la app. */
export function colorKml(hexRRGGBB: string, alfaHex = "ff"): string {
  const limpio = hexRRGGBB.replace("#", "");
  const r = limpio.slice(0, 2);
  const g = limpio.slice(2, 4);
  const b = limpio.slice(4, 6);
  return `${alfaHex}${b}${g}${r}`;
}
