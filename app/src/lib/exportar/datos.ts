// Exportar la tabla "Datos" (todos los puntos de muestreo, ver
// TablaDatosPuntos en features/campo) a PDF — mismos datos que la vista
// previa en pantalla, pero en una hoja A4 apaisada (bastante más ancha que
// alta, para que las columnas entren sin achicarse) en vez de un scroll
// horizontal como en la app.

import type { Carga, Punto } from "@/types/domain";
import { exportarInformePdf } from "./informe";

// A4 apaisada en puntos (72 dpi: A4 = 595×842pt en vertical, acá invertido)
// — expo-print, a diferencia del informe técnico (que usa el tamaño carta
// vertical por defecto), necesita el tamaño explícito para salir apaisada.
const A4_APAISADA_ANCHO = 842;
const A4_APAISADA_ALTO = 595;

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Mismas columnas y mismo criterio ("—" sin cargar, Sí/No para los booleanos,
// × 4 sobre el conteo cargado en 1/4 m²) que TablaDatosPuntos en pantalla.
const COLUMNAS: Array<{ etiqueta: string; valor: (c: Carga | undefined) => string }> = [
  { etiqueta: "Bichos bolita /m²", valor: (c) => (c?.cargado ? String(c.bicho * 4) : "—") },
  { etiqueta: "Babosas /m²", valor: (c) => (c?.cargado ? String(c.babosa * 4) : "—") },
  { etiqueta: "Huevo babosas", valor: (c) => (c?.cargado ? (c.huevoBabosas ? "Sí" : "No") : "—") },
  { etiqueta: "Gusano de arroz", valor: (c) => (c?.cargado ? (c.gusanoArroz ? "Sí" : "No") : "—") },
  { etiqueta: "Isoca cortadora", valor: (c) => (c?.cargado ? (c.isocaCortadora ? "Sí" : "No") : "—") },
  { etiqueta: "Gusano blanco", valor: (c) => (c?.cargado ? (c.gusanoBlanco ? "Sí" : "No") : "—") },
];

/** HTML de la tabla de datos, listo para expo-print — mismo criterio visual
 * (colores de theme/colors.ts) que el informe técnico (lib/exportar/informe.ts),
 * pero acá el contenido es la tabla completa de puntos, no mapas/situación/cebo. */
export function construirDatosHtml(
  puntos: Punto[],
  cargas: Map<string, Carga>,
  loteNombre: string,
  establecimientoNombre?: string
): string {
  const filas = [...puntos].sort((a, b) => a.linea - b.linea || a.puntoNum - b.puntoNum);
  const cargados = filas.filter((p) => cargas.get(p.id)?.cargado).length;

  const filasHtml = filas
    .map((p) => {
      const c = cargas.get(p.id);
      const celdas = COLUMNAS.map((col) => `<td>${escapeHtml(col.valor(c))}</td>`).join("");
      return `<tr><td class="punto">${p.linea}.${p.puntoNum}</td>${celdas}</tr>`;
    })
    .join("");

  const titulo = `Monitoreo de Bichos Bolita y Babosas ${escapeHtml(loteNombre)}${
    establecimientoNombre ? " " + escapeHtml(establecimientoNombre) : ""
  }`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  @page { margin: 0; }
  body { margin: 0; padding: 22px 30px; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1B2E1F; background: #F3F7F2; }
  .eyebrow { color: #A9752E; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; margin: 0 0 4px; }
  h1 { font-size: 19px; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; background: #FFFFFF; border-radius: 10px; overflow: hidden; }
  th, td { padding: 7px 10px; font-size: 11.5px; text-align: center; border-bottom: 1px solid #EDE0B8; }
  th { background: #EDE0B8; color: #A9752E; font-weight: 700; font-size: 10.5px; }
  td.punto { font-weight: 800; text-align: left; }
  tr:last-child td { border-bottom: none; }
  .pie { margin-top: 12px; font-size: 11px; color: #6B5D2E; text-align: center; }
</style>
</head>
<body>
  <div class="eyebrow">MONITOREO DE PLAGAS</div>
  <h1>${titulo}</h1>
  <table>
    <thead>
      <tr><th>Punto</th>${COLUMNAS.map((c) => `<th>${escapeHtml(c.etiqueta)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${filasHtml}
    </tbody>
  </table>
  <div class="pie">${cargados}/${filas.length} puntos cargados — valores de conteo llevados a m² (× 4 sobre el dato tomado en 1/4 m²)</div>
</body>
</html>`;
}

/** Mismo mecanismo de generar+copiar+compartir que exportarInformePdf —
 * solo cambia el tamaño de hoja (A4 apaisada, ver arriba) que ese no
 * necesitaba pedir explícito. */
export async function exportarDatosPdf(html: string, nombreArchivoBase: string): Promise<void> {
  await exportarInformePdf(html, nombreArchivoBase, { width: A4_APAISADA_ANCHO, height: A4_APAISADA_ALTO });
}
