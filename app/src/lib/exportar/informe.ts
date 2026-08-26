// Informe técnico — texto para compartir (WhatsApp/lo que sea) y el HTML
// que se convierte a PDF con expo-print. Portado de `textoInformeCompartir`
// y de la parte de texto/tabla de `SalidasView` del prototipo — sin los
// mini-mapas satelitales (ver nota en lib/geo/densidad.ts, mismo motivo:
// requiere contratar un proveedor de mapas pago, pendiente de decidir).

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export interface ZonaCebo {
  id: string;
  nombre: string;
  producto: string;
  dosis: number;
  superficie: number;
}

export function kgDeZona(z: ZonaCebo): number {
  return (Number(z.dosis) || 0) * (Number(z.superficie) || 0);
}

interface DatosInforme {
  loteNombre: string;
  establecimientoNombre?: string;
  situacion: string;
  zonas: ZonaCebo[];
}

/** Texto plano para compartir por WhatsApp/lo que sea — portado tal cual de
 * `textoInformeCompartir`. */
export function textoInformeCompartir({ loteNombre, establecimientoNombre, situacion, zonas }: DatosInforme): string {
  const lineasZonas = zonas
    .map((z) => `• ${z.nombre || "Zona"}: ${z.producto}, ${z.dosis} kg/ha × ${z.superficie} ha = ${kgDeZona(z).toFixed(0)} kg`)
    .join("\n");
  return (
    `*INFORME TÉCNICO — Zoom Agricultura*\n` +
    `${loteNombre}${establecimientoNombre ? " — " + establecimientoNombre : ""}\n\n` +
    `*Situación de plagas de suelo:*\n${situacion}\n\n` +
    `*Recomendación de aplicación de cebo:*\n${lineasZonas || "Sin zonas cargadas."}`
  );
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** HTML del informe, listo para pasarle a expo-print — mismo contenido que
 * el textarea/tabla editables de la pantalla, en formato imprimible. */
export function construirInformeHtml({ loteNombre, establecimientoNombre, situacion, zonas }: DatosInforme): string {
  const filasZonas = zonas
    .map(
      (z) =>
        `<tr><td>${escapeHtml(z.nombre || "Zona")}</td><td>${escapeHtml(z.producto)}</td><td>${z.dosis} kg/ha</td><td>${z.superficie} ha</td><td>${kgDeZona(z).toFixed(0)} kg</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1B2E1F; padding: 28px; }
  .eyebrow { color: #A9752E; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  h1 { font-size: 21px; margin: 4px 0 2px; }
  .sub { color: #6B5D2E; font-size: 13px; margin-bottom: 20px; }
  h2 { font-size: 14px; border-bottom: 1px solid #EDE0B8; padding-bottom: 6px; margin-top: 26px; }
  p { white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #EDE0B8; padding: 7px 9px; font-size: 12px; text-align: left; }
  th { background: #F3F7F2; }
</style>
</head>
<body>
  <div class="eyebrow">INFORME TÉCNICO</div>
  <h1>${escapeHtml(loteNombre)}</h1>
  ${establecimientoNombre ? `<div class="sub">${escapeHtml(establecimientoNombre)}</div>` : ""}

  <h2>Situación de plagas de suelo</h2>
  <p>${escapeHtml(situacion)}</p>

  <h2>Recomendación de aplicación de cebo</h2>
  <table>
    <thead><tr><th>Zona</th><th>Producto</th><th>Dosis</th><th>Superficie</th><th>Total</th></tr></thead>
    <tbody>${filasZonas || `<tr><td colspan="5">Sin zonas cargadas.</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

/** Genera el PDF con expo-print y abre la hoja de compartir nativa — el
 * equivalente real de "Guardar como PDF" del diálogo de impresión del
 * navegador que usaba el prototipo (`window.print()`, que no existe acá). */
export async function exportarInformePdf(html: string, nombreArchivoBase: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) throw new Error("Compartir no está disponible en este dispositivo.");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: nombreArchivoBase });
}
