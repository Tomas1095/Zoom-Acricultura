// Mapa de densidad como string SVG — para embeber en el HTML del informe
// (expo-print renderiza <svg> inline sin problema, no hace falta ninguna
// librería nueva ni capturar una vista con view-shot). Misma matemática de
// `MapaDensidad` (features/campo/mapa-densidad.tsx), pero sin la foto
// satelital de fondo — un PDF no tiene conexión propia al abrirse, así que
// el mapa acá siempre queda sobre fondo blanco liso.

import { calcularCeldasDensidad, elegirEscalaBarra, type RangoDensidad } from "@/lib/geo/densidad";
import type { XY } from "@/lib/geo/geometria";

const PAD = 16;
const ESCALA_MAX = 3.2;

export interface PuntoDensidadSvg {
  id: string;
  x: number;
  y: number;
  valor: number;
}

/** Arma el `<svg>` del mapa (celdas de Voronoi + contorno del lote + escala
 * gráfica), listo para pegar directo en el HTML del informe. */
export function construirSvgDensidad(
  puntos: PuntoDensidadSvg[],
  perimetro: XY[],
  rangos: RangoDensidad[],
  nivelColores: readonly string[],
  ancho: number,
  alto: number
): string {
  const todasX = puntos.map((p) => p.x).concat(perimetro.map((v) => v.x));
  const todasY = puntos.map((p) => p.y).concat(perimetro.map((v) => v.y));
  const minX = todasX.length > 0 ? Math.min(...todasX) : 0;
  const minY = todasY.length > 0 ? Math.min(...todasY) : 0;
  const spanX = Math.max(1, (todasX.length > 0 ? Math.max(...todasX) : 0) - minX);
  const spanY = Math.max(1, (todasY.length > 0 ? Math.max(...todasY) : 0) - minY);
  const escala = Math.min((ancho - PAD * 2) / spanX, (alto - PAD * 2) / spanY, ESCALA_MAX);
  const toPx = (x: number, y: number) => ({ left: PAD + (x - minX) * escala, top: PAD + (y - minY) * escala });

  let celdas: ReturnType<typeof calcularCeldasDensidad> = [];
  try {
    celdas = calcularCeldasDensidad(puntos, perimetro, rangos);
  } catch {
    celdas = [];
  }

  const poligonos = celdas
    .map(
      (c) =>
        `<polygon points="${c.poligono.map((p) => `${toPx(p.x, p.y).left},${toPx(p.x, p.y).top}`).join(" ")}" fill="${nivelColores[c.nivel]}" stroke="#FFFFFF" stroke-width="0.5" />`
    )
    .join("");

  const perimetroPx = perimetro.map((v) => toPx(v.x, v.y));
  const lados = perimetroPx
    .map((a, i) => {
      const b = perimetroPx[(i + 1) % perimetroPx.length];
      return `<line x1="${a.left}" y1="${a.top}" x2="${b.left}" y2="${b.top}" stroke="#1B2E1F" stroke-width="2" />`;
    })
    .join("");

  const escalaBarra = elegirEscalaBarra(escala);
  const barraX = ancho - escalaBarra.px - 14;
  const barraY = alto - 12;
  const escalaSvg =
    `<line x1="${barraX}" y1="${barraY}" x2="${barraX + escalaBarra.px}" y2="${barraY}" stroke="#1B2E1F" stroke-width="2" />` +
    `<line x1="${barraX}" y1="${barraY - 4}" x2="${barraX}" y2="${barraY + 4}" stroke="#1B2E1F" stroke-width="2" />` +
    `<line x1="${barraX + escalaBarra.px}" y1="${barraY - 4}" x2="${barraX + escalaBarra.px}" y2="${barraY + 4}" stroke="#1B2E1F" stroke-width="2" />` +
    `<text x="${barraX + escalaBarra.px / 2}" y="${barraY - 8}" font-size="10" fill="#1B2E1F" text-anchor="middle">${escalaBarra.metros} m</text>`;

  return `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" xmlns="http://www.w3.org/2000/svg">${poligonos}${lados}${escalaSvg}</svg>`;
}

/** Leyenda de colores (misma lista de rangos/colores que el mapa en
 * pantalla) — como bloque HTML aparte, más simple que meterla adentro del SVG. */
export function construirLeyendaHtml(rangos: RangoDensidad[], nivelColores: readonly string[], etiqueta: string): string {
  const filas = rangos
    .map(
      (r, i) =>
        `<div style="display:flex;align-items:center;gap:6px;font-size:11px;"><span style="display:inline-block;width:11px;height:11px;border-radius:2px;border:1px solid #EDE0B8;background:${nivelColores[i]};"></span>${r.label}</div>`
    )
    .join("");
  return `<div><div style="font-size:11px;font-weight:700;color:#6B5D2E;margin-bottom:4px;">${etiqueta}</div><div style="display:flex;flex-direction:column;gap:2px;">${filas}</div></div>`;
}
