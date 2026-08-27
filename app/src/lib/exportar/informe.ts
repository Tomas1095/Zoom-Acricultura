// Informe técnico — el HTML que se convierte a PDF con expo-print. Portado
// de la parte de texto/tabla de `SalidasView` del prototipo, con dos
// diferencias reales: acá SÍ van los mapas de densidad poblacional (como
// SVG embebido, ver lib/exportar/mapa-svg.ts — el prototipo no los tenía
// en el PDF) y cada "zona" ahora es un LOTE con posibilidad de varios
// productos distintos aplicados a la vez (a dosis distintas cada uno), no
// un producto único como antes.

import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { sanitizarNombreArchivo } from "./archivo";

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

// Mismos paths/colores que components/zoom-logo.tsx (variante "dark", para
// fondo claro) — repetido acá como SVG plano porque el PDF es HTML, no
// puede importar el componente de React Native.
const LOGO_VERDE = "#344D40";
const LOGO_NARANJA = "#DB945D";
// Mismas proporciones que ZoomLogo en app-header.tsx (iconSize 32,
// wordSize 21 — AGRICULTURA sale de wordSize*0.24, con un piso de 7),
// escaladas un poco más grandes: acá es el logo de toda una hoja impresa,
// no el ícono de una barra de header angosta.
const LOGO_HTML = `<div style="display:flex;align-items:center;gap:9px;">
  <svg width="42" height="42" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="26.5" stroke="${LOGO_VERDE}" stroke-width="11" fill="none" />
    <line x1="50" y1="23.5" x2="50" y2="6" stroke="${LOGO_VERDE}" stroke-width="11" stroke-linecap="round" />
    <line x1="50" y1="76.5" x2="50" y2="94" stroke="${LOGO_VERDE}" stroke-width="11" stroke-linecap="round" />
    <line x1="23.5" y1="50" x2="6" y2="50" stroke="${LOGO_VERDE}" stroke-width="11" stroke-linecap="round" />
    <line x1="76.5" y1="50" x2="94" y2="50" stroke="${LOGO_VERDE}" stroke-width="11" stroke-linecap="round" />
    <path d="M 61.74 13.86 L 64.44 14.85 L 67.05 16.04 L 69.57 17.43 L 71.98 19.00 L 74.26 20.75 L 76.40 22.67 L 78.39 24.74 L 80.21 26.95 L 81.87 29.30 L 83.34 31.77 L 84.62 34.34 L 85.71 37.00" stroke="${LOGO_NARANJA}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 15.02 35.15 L 16.19 32.65 L 17.54 30.24 L 19.06 27.93 L 20.75 25.74 L 22.59 23.68 L 24.57 21.76 L 26.69 19.99 L 28.93 18.37 L 31.29 16.93 L 33.74 15.65 L 36.28 14.56 L 38.89 13.66" stroke="${LOGO_NARANJA}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 29.30 81.87 L 27.26 80.45 L 25.32 78.90 L 23.48 77.22 L 21.76 75.43 L 20.16 73.53 L 18.68 71.52 L 17.34 69.43 L 16.14 67.25 L 15.09 65.00 L 14.18 62.68 L 13.43 60.31 L 12.83 57.90" stroke="${LOGO_NARANJA}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <div style="display:flex;flex-direction:column;align-items:center;">
    <div style="font-size:26px;font-weight:900;letter-spacing:-0.5px;color:${LOGO_VERDE};line-height:1;">ZOOM</div>
    <div style="font-size:8px;font-weight:700;letter-spacing:0.6px;color:${LOGO_VERDE};margin-top:2px;">AGRICULTURA</div>
  </div>
</div>`;

/** HTML del informe, listo para pasarle a expo-print. Orden pedido: mapas
 * de densidad (bichos bolita, después babosas) → situación de plagas →
 * recomendación de aplicación de cebo (lote por lote, con todos los
 * productos de cada uno) → resumen de compra por producto.
 *
 * El diseño acá es una copia fiel del look de la pestaña "Informe" de la
 * app (mismos colores de theme/colors.ts, mismas cards blancas con borde
 * redondeado, mismo estilo de fila de producto "dosis × superficie =
 * total") — no una tabla HTML genérica aparte, para que lo que la persona
 * ve en pantalla y lo que termina en el PDF se parezcan de verdad. */
export function construirInformeHtml({
  loteNombre,
  establecimientoNombre,
  situacion,
  zonas,
  mapaBichoHtml,
  mapaBabosaHtml,
}: DatosInforme): string {
  const zonasHtml = zonas
    .map((z) => {
      const productosHtml = z.productos
        .map((p) => {
          // Si todavía no cargó dosis/superficie, "kg/ha × ha" sin números
          // se ve roto — 0 como placeholder visual, igual que en pantalla.
          const dosis = p.dosis || "0";
          const superficie = p.superficie || "0";
          return `<div class="productoFila">
            <span class="productoNombre">${escapeHtml(p.producto)}</span>
            <span class="productoDetalle">${dosis} kg/ha × ${superficie} ha = <b>${kgDeProducto(p).toFixed(0)} kg</b></span>
          </div>`;
        })
        .join("");
      return `<div class="zonaCard">
        <div class="zonaNombre">${escapeHtml(z.loteNombre || "Lote")}</div>
        ${productosHtml}
      </div>`;
    })
    .join("");

  const resumen = resumenPorProducto(zonas);
  const resumenHtml = resumen
    .map(
      (r) =>
        `<div class="resumenFila"><span>${escapeHtml(r.producto)}</span><span class="resumenKg">${r.totalKg.toFixed(0)} kg</span></div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  /* Sin esto, WebKit (el motor que usa expo-print en iOS) no imprime los
     colores de fondo de elementos comunes al generar el PDF — por default
     los "ahorra" como si fuera a tinta de verdad (economía de impresión).
     Es lo que hacía que las leyendas de color de los mapas, la barra de
     escala y hasta el fondo de las cards salieran en blanco. Los rellenos
     de SVG (los cuadraditos del Voronoi) no se veían afectados porque no
     son "background" en el sentido de CSS — por eso el mapa en sí se veía
     bien pero la leyenda de al lado no. */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1B2E1F; background: #F3F7F2; padding: 26px; }
  .encabezado { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .eyebrow { color: #A9752E; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  h1 { font-size: 21px; margin: 4px 0 0; }
  .card { background: #FFFFFF; border: 1px solid #EDE0B8; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  /* La primera hoja es solo el encabezado + los dos mapas — situación y
     recomendación arrancan en la hoja siguiente, no importa cuánto sobre
     o falte de espacio en la primera. */
  .cardMapas { page-break-after: always; break-after: page; }
  .cardTitulo { font-size: 14px; font-weight: 700; color: #1B2E1F; margin-bottom: 10px; }
  .mapaBloque { margin-bottom: 28px; }
  .mapaBloque:last-child { margin-bottom: 0; }
  .mapaEtiqueta { font-size: 12.5px; font-weight: 700; color: #6B5D2E; margin-bottom: 6px; }
  .situacionBox { border: 1px solid #EDE0B8; border-radius: 8px; padding: 10px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
  .zonaCard { border: 1px solid #EDE0B8; border-radius: 10px; padding: 10px; margin-bottom: 8px; }
  .zonaCard:last-of-type { margin-bottom: 0; }
  .zonaNombre { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
  .productoFila { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; padding: 3px 0; }
  .resumenBox { margin-top: 10px; border-top: 1px solid #EDE0B8; padding-top: 10px; }
  .resumenTitulo { font-size: 12.5px; font-weight: 700; margin-bottom: 6px; }
  .resumenFila { display: flex; justify-content: space-between; font-size: 12.5px; padding: 2px 0; }
  .resumenKg { font-weight: 700; color: #155C35; }
  .vacio { font-size: 12.5px; color: #6B5D2E; }
</style>
</head>
<body>
  <div class="encabezado">
    <div>
      <div class="eyebrow">INFORME TÉCNICO</div>
      <h1>${escapeHtml(loteNombre)}${establecimientoNombre ? ` - ${escapeHtml(establecimientoNombre)}` : ""}</h1>
    </div>
    ${LOGO_HTML}
  </div>

  <div class="card cardMapas">
    <div class="mapaBloque">
      <div class="mapaEtiqueta">Resultado Monitoreo de Bichos Bolita</div>
      ${mapaBichoHtml}
    </div>
    <div class="mapaBloque">
      <div class="mapaEtiqueta">Resultado Monitoreo de Babosas</div>
      ${mapaBabosaHtml}
    </div>
  </div>

  <div class="card">
    <div class="cardTitulo">Situación de plagas de suelo</div>
    <div class="situacionBox">${escapeHtml(situacion)}</div>
  </div>

  <div class="card">
    <div class="cardTitulo">Recomendación de aplicación de cebo</div>
    ${zonasHtml || `<div class="vacio">Sin lotes cargados.</div>`}
    ${
      resumen.length > 0
        ? `<div class="resumenBox">
      <div class="resumenTitulo">Total a comprar</div>
      ${resumenHtml}
    </div>`
        : ""
    }
  </div>
</body>
</html>`;
}

/** Genera el PDF con expo-print y abre la hoja de compartir nativa — el
 * equivalente real de "Guardar como PDF" del diálogo de impresión del
 * navegador que usaba el prototipo (`window.print()`, que no existe acá).
 *
 * `Print.printToFileAsync` guarda el archivo con un nombre interno propio
 * (algo como "Print-xxxx.pdf"), sin relación con lo que la persona escribió
 * en el modal — `dialogTitle` en `Sharing.shareAsync` solo pone el título
 * de la hoja de compartir, NO renombra el archivo real, así que cualquier
 * app a la que se comparta (Archivos, WhatsApp, mail) terminaba guardándolo
 * con el nombre interno. Se copia a un archivo nuevo con el nombre elegido
 * (mismo patrón que `guardarYCompartirTexto` en archivo.ts) antes de
 * compartirlo, así el nombre real del archivo compartido es el correcto. */
export async function exportarInformePdf(html: string, nombreArchivoBase: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const generado = new File(uri);
  const destino = new File(Paths.cache, `${sanitizarNombreArchivo(nombreArchivoBase)}.pdf`);
  if (destino.exists) destino.delete();
  generado.copy(destino);

  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) throw new Error("Compartir no está disponible en este dispositivo.");
  await Sharing.shareAsync(destino.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: nombreArchivoBase });
}
