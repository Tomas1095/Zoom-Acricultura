// Informe técnico — el HTML que se convierte a PDF con expo-print. Portado
// de la parte de texto/tabla de `SalidasView` del prototipo, con dos
// diferencias reales: acá SÍ van los mapas de densidad poblacional (como
// SVG embebido, ver lib/exportar/mapa-svg.ts — el prototipo no los tenía
// en el PDF) y cada "zona" ahora es un LOTE con posibilidad de varios
// productos distintos aplicados a la vez (a dosis distintas cada uno), no
// un producto único como antes.

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// dosis/superficie quedan como TEXTO (lo que la persona tecleó tal cual),
// no como number — si se guardara ya convertido, el campo controlado
// redondea/pisa el "." apenas se escribe (con `Number("5.")` → 5 → el
// input vuelve a mostrar "5", así nunca se puede terminar de escribir
// "5.5") — mismo motivo por el que `SubirKmz` guarda `haPorPunto` como
// string. Se convierte a número recién al calcular kg (acá abajo).
// La superficie va POR PRODUCTO, no una sola compartida por todo el lote —
// dos productos del mismo lote pueden cubrir superficies distintas (por
// ej. crustacicida en 20ha y molusquicida en las otras 15ha de un lote de
// 35ha), no necesariamente el lote entero cada uno.
export interface ProductoAplicado {
  id: string;
  producto: string;
  dosis: string; // kg/ha, tal cual lo tecleó la persona
  superficie: string; // ha, tal cual lo tecleó la persona
}

export interface ZonaCebo {
  id: string;
  loteNombre: string;
  productos: ProductoAplicado[];
}

function numero(texto: string): number {
  const n = Number(String(texto).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function kgDeProducto(p: ProductoAplicado): number {
  return numero(p.dosis) * numero(p.superficie);
}

/** Total de kg a comprar por producto, sumado entre TODOS los lotes/zonas
 * del informe — esto es lo que le sirve al cliente para hacer el pedido,
 * no el detalle lote por lote. "No aplicar" no suma (no es un producto
 * real). */
export function resumenPorProducto(zonas: ZonaCebo[]): Array<{ producto: string; totalKg: number }> {
  const totales = new Map<string, number>();
  for (const z of zonas) {
    for (const p of z.productos) {
      if (p.producto === "No aplicar") continue;
      totales.set(p.producto, (totales.get(p.producto) ?? 0) + kgDeProducto(p));
    }
  }
  return Array.from(totales.entries()).map(([producto, totalKg]) => ({ producto, totalKg }));
}

interface DatosInforme {
  loteNombre: string;
  establecimientoNombre?: string;
  situacion: string;
  zonas: ZonaCebo[];
  /** Bloque de mapa ya armado (título/norte/leyenda/escala incluidos, ver
   * lib/exportar/mapa-svg.ts) — informe.ts no calcula densidad, solo arma
   * el documento. */
  mapaBichoHtml: string;
  mapaBabosaHtml: string;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** HTML del informe, listo para pasarle a expo-print. Orden pedido: mapas
 * de densidad (bichos bolita, después babosas) → situación de plagas →
 * recomendación de aplicación de cebo (lote por lote, con todos los
 * productos de cada uno) → resumen de compra por producto. */
export function construirInformeHtml({
  loteNombre,
  establecimientoNombre,
  situacion,
  zonas,
  mapaBichoHtml,
  mapaBabosaHtml,
}: DatosInforme): string {
  const filasZonas = zonas
    .flatMap((z) =>
      z.productos.map(
        (p) =>
          `<tr><td>${escapeHtml(z.loteNombre || "Lote")}</td><td>${escapeHtml(p.producto)}</td><td>${p.dosis} kg/ha</td><td>${p.superficie} ha</td><td>${kgDeProducto(p).toFixed(0)} kg</td></tr>`
      )
    )
    .join("");

  const resumen = resumenPorProducto(zonas);
  const filasResumen = resumen
    .map((r) => `<tr><td>${escapeHtml(r.producto)}</td><td>${r.totalKg.toFixed(0)} kg</td></tr>`)
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
  .mapasFila { display: flex; flex-direction: column; gap: 16px; margin-top: 10px; }
  .mapaEtiqueta { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
</style>
</head>
<body>
  <div class="eyebrow">INFORME TÉCNICO</div>
  <h1>${escapeHtml(loteNombre)}</h1>
  ${establecimientoNombre ? `<div class="sub">${escapeHtml(establecimientoNombre)}</div>` : ""}

  <h2>Mapa de densidad poblacional</h2>
  <div class="mapasFila">
    <div>
      <div class="mapaEtiqueta">Bichos bolita</div>
      ${mapaBichoHtml}
    </div>
    <div>
      <div class="mapaEtiqueta">Babosas</div>
      ${mapaBabosaHtml}
    </div>
  </div>

  <h2>Situación de plagas de suelo</h2>
  <p>${escapeHtml(situacion)}</p>

  <h2>Recomendación de aplicación de cebo</h2>
  <table>
    <thead><tr><th>Lote</th><th>Producto</th><th>Dosis</th><th>Superficie</th><th>Total</th></tr></thead>
    <tbody>${filasZonas || `<tr><td colspan="5">Sin lotes cargados.</td></tr>`}</tbody>
  </table>

  <h2>Resumen — total a comprar por producto</h2>
  <table>
    <thead><tr><th>Producto</th><th>Total</th></tr></thead>
    <tbody>${filasResumen || `<tr><td colspan="2">Sin productos cargados.</td></tr>`}</tbody>
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
