// Mapa de densidad para el informe en PDF — arma el mismo mapa "todo
// adentro del rectángulo" que se ve en pantalla (Resultados/Salidas →
// Informe, ver features/campo/mapa-densidad.tsx): título arriba, rosa de
// los vientos arriba a la derecha, leyenda abajo a la izquierda, escala
// graduada tipo regla abajo a la derecha — acá como HTML+SVG en vez de
// vistas de React Native
// (expo-print renderiza HTML normal, no hace falta ninguna librería nueva
// ni capturar una vista con view-shot). Sin foto satelital de fondo: un
// PDF no tiene conexión propia al abrirse, así que acá siempre queda sobre
// fondo claro liso — por eso el texto va oscuro, no blanco con sombra como
// en pantalla (ahí sí hace falta leerse encima de una foto).

import {
  calcularCeldasDensidad,
  elegirEscalaBarra,
  graduarEscalaBarra,
  ROSA_VIENTOS_KITES,
  type RangoDensidad,
} from "@/lib/geo/densidad";
import type { XY } from "@/lib/geo/geometria";

// Margen general del dibujo del lote contra el borde del recuadro — más
// grande que un simple padding estético a propósito: evita que el
// polígono llegue hasta las esquinas donde viven la leyenda, la rosa de
// los vientos y la escala (mismo criterio que features/campo/mapa-densidad.tsx).
const PAD = 34;
const ESCALA_MAX = 3.2;
// Tamaño (en px) del cuadrado donde entra la rosa de los vientos — mismo
// viewBox de 36×36 que usa MapaDensidad en pantalla (ver lib/geo/densidad.ts).
const TAMANO_ROSA = 30;
const ROSA_MARGEN = 8;
const ROSA_CAJA = TAMANO_ROSA + ROSA_MARGEN * 2;

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
  const dispW = ancho - PAD * 2;
  const dispH = alto - PAD * 2;
  const escala = Math.min(dispW / spanX, dispH / spanY, ESCALA_MAX);
  // Centrado real (mismo criterio que en pantalla): si un eje sobra
  // espacio, se reparte parejo de los dos lados en vez de pegar el lote
  // arriba a la izquierda.
  const offX = PAD + (dispW - spanX * escala) / 2;
  const offY = PAD + (dispH - spanY * escala) / 2;
  const toPx = (x: number, y: number) => ({ left: offX + (x - minX) * escala, top: offY + (y - minY) * escala });

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
  const escalaGraduada = graduarEscalaBarra(escalaBarra.metros, escalaBarra.px);
  const segmentosEscala = escalaGraduada.segmentos
    .map((s) => `<div style="width:${s.anchoPx}px;height:4px;background:${s.color};border:0.5px solid #000000;"></div>`)
    .join("");
  const etiquetasEscala = escalaGraduada.etiquetas
    .map(
      (e) =>
        `<span style="position:absolute;left:${e.posicionPx}px;transform:translateX(-50%);">${e.texto}</span>`
    )
    .join("");

  // Rosa de los vientos — mismos 4 picos blanco/negro alternados que en
  // pantalla (ver ROSA_VIENTOS_KITES), no una simple flecha con "N".
  const rosaPoligonos = ROSA_VIENTOS_KITES.map(
    (k) =>
      `<polygon points="${k.puntos.map((p) => `${p.x},${p.y}`).join(" ")}" fill="${k.color}" stroke="#000000" stroke-width="0.6" />`
  ).join("");
  const rosaSvg = `<svg width="${TAMANO_ROSA}" height="${TAMANO_ROSA}" viewBox="0 0 36 36" style="position:absolute;top:${ROSA_MARGEN}px;left:${ROSA_MARGEN}px;">${rosaPoligonos}</svg>`;

  return `<div style="position:relative;width:${ancho}px;height:${alto}px;background:#F3F7F2;border:1px solid #EDE0B8;border-radius:10px;overflow:hidden;">
    ${svg}
    <div style="position:absolute;top:6px;left:${ROSA_CAJA + 10}px;right:${ROSA_CAJA + 10}px;text-align:center;font-size:12px;font-weight:800;font-style:italic;color:#1B2E1F;">Mapa de densidad poblacional</div>
    <div style="position:absolute;top:6px;right:6px;width:${ROSA_CAJA}px;height:${ROSA_CAJA}px;color:#1B2E1F;font-size:7px;font-weight:800;">
      ${rosaSvg}
      <div style="position:absolute;top:0;left:0;right:0;text-align:center;">N</div>
      <div style="position:absolute;bottom:0;left:0;right:0;text-align:center;">S</div>
      <div style="position:absolute;top:${ROSA_CAJA / 2 - 5}px;right:0;">E</div>
      <div style="position:absolute;top:${ROSA_CAJA / 2 - 5}px;left:0;">O</div>
    </div>
    <div style="position:absolute;bottom:6px;left:6px;max-width:55%;">
      <div style="font-size:10px;font-weight:800;color:#1B2E1F;margin-bottom:2px;">${etiquetaLeyenda}</div>
      <div style="display:flex;flex-direction:column;gap:2px;">${filasLeyenda}</div>
    </div>
    <div style="position:absolute;bottom:20px;right:10px;width:${escalaGraduada.anchoTotalPx}px;">
      <div style="display:flex;">${segmentosEscala}</div>
      <div style="position:relative;width:${escalaGraduada.anchoTotalPx}px;height:9px;margin-top:2px;font-size:6.5px;font-weight:700;color:#1B2E1F;">${etiquetasEscala}</div>
    </div>
  </div>`;
}
