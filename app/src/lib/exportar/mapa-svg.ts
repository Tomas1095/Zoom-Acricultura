// Mapa de densidad para el informe en PDF — arma el mismo mapa "todo
// adentro del rectángulo" que se ve en pantalla (Resultados/Salidas →
// Informe, ver features/campo/mapa-densidad.tsx): título arriba, norte
// arriba a la derecha, leyenda abajo a la izquierda, escala tipo regla
// abajo a la derecha — acá como HTML+SVG en vez de vistas de React Native
// (expo-print renderiza HTML normal, no hace falta ninguna librería nueva
// ni capturar una vista con view-shot). Sin foto satelital de fondo: un
// PDF no tiene conexión propia al abrirse, así que acá siempre queda sobre
// fondo claro liso — por eso el texto va oscuro, no blanco con sombra como
// en pantalla (ahí sí hace falta leerse encima de una foto).

import { calcularCeldasDensidad, elegirEscalaBarra, type RangoDensidad } from "@/lib/geo/densidad";
import type { XY } from "@/lib/geo/geometria";

const PAD = 16;
const ESCALA_MAX = 3.2;
const SEGMENTOS_ESCALA = 4;

export interface PuntoDensidadSvg {
  id: string;
  x: number;
  y: number;
  valor: number;
}

/** Arma el mapa completo (SVG del Voronoi + contorno, con título/norte/
 * leyenda/escala superpuestos como HTML) — un solo bloque listo para pegar
 * en el HTML del informe. */
export function construirMapaDensidadHtml(
  puntos: PuntoDensidadSvg[],
  perimetro: XY[],
  rangos: RangoDensidad[],
  nivelColores: readonly string[],
  etiquetaLeyenda: string,
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

  const svg = `<svg width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" style="position:absolute;top:0;left:0;" xmlns="http://www.w3.org/2000/svg">${poligonos}${lados}</svg>`;

  const filasLeyenda = rangos
    .map(
      (r, i) =>
        `<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:#1B2E1F;"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:0.5px solid rgba(0,0,0,0.3);background:${nivelColores[i]};"></span>${r.label}</div>`
    )
    .join("");

  const escalaBarra = elegirEscalaBarra(escala);
  const anchoSegmento = escalaBarra.px / SEGMENTOS_ESCALA;
  const segmentosEscala = Array.from({ length: SEGMENTOS_ESCALA })
    .map(
      (_v, i) =>
        `<div style="width:${anchoSegmento}px;height:6px;background:${i % 2 === 0 ? "#000000" : "#FFFFFF"};border:0.5px solid #000000;"></div>`
    )
    .join("");

  return `<div style="position:relative;width:${ancho}px;height:${alto}px;background:#F3F7F2;border:1px solid #EDE0B8;border-radius:10px;overflow:hidden;">
    ${svg}
    <div style="position:absolute;top:6px;left:6px;right:6px;text-align:center;font-size:12px;font-weight:800;font-style:italic;color:#1B2E1F;">Mapa de densidad poblacional</div>
    <div style="position:absolute;top:6px;right:8px;text-align:center;color:#1B2E1F;">
      <div style="font-size:12px;line-height:1;">▲</div>
      <div style="font-size:8px;font-weight:800;">N</div>
    </div>
    <div style="position:absolute;bottom:6px;left:6px;max-width:55%;">
      <div style="font-size:10px;font-weight:800;color:#1B2E1F;margin-bottom:2px;">${etiquetaLeyenda}</div>
      <div style="display:flex;flex-direction:column;gap:2px;">${filasLeyenda}</div>
    </div>
    <div style="position:absolute;bottom:20px;right:10px;text-align:center;">
      <div style="display:flex;">${segmentosEscala}</div>
      <div style="display:flex;justify-content:space-between;width:100%;margin-top:2px;font-size:8px;font-weight:700;color:#1B2E1F;"><span>0</span><span>${escalaBarra.metros} m</span></div>
    </div>
  </div>`;
}
