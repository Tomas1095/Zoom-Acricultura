// Resumen automático de la situación de plagas — segunda pasada, portada
// del prototipo actualizado tras analizar 124 informes reales de Zoom
// Monitoreos (comparando el texto de "Situación plagas de suelo" contra los
// mapas de densidad de cada informe, para sacar el criterio real detrás de
// la redacción). Reemplaza la primera versión (más simple, sin validar
// contra casos reales).
//
// Dos ideas clave que no son obvias a primera vista:
// 1) La abundancia describe los valores DONDE HAY PRESENCIA, no un promedio
//    diluido por todo el lote — un informe real con solo 4 de 35 puntos con
//    presencia decía igual "abundancia media-alta", porque esos 4 puntos
//    estaban en ese rango, sin importar que el resto del lote esté en cero.
// 2) La distribución es un patrón espacial real (puntos vecinos entre sí o
//    no), no un simple porcentaje de líneas afectadas — por eso se agrupan
//    los puntos afectados por cercanía real (mismo radio que ya usa la
//    zona de aplicación de cebo, ver zona-aplicacion.ts) y se mira la forma
//    del agrupamiento resultante:
//    - generalizada: presencia en casi todo el lote (pocos o ningún vacío)
//    - sectorizada: los puntos con presencia forman un grupo conectado,
//      una zona reconocible dentro del lote
//    - aislada: los puntos con presencia están sueltos, sin tocarse entre sí
//    - desuniforme: mezcla pareja de puntos con y sin presencia, sin
//      agruparse en una zona ni cubrir todo el lote
//
// Calibración de la palabra de abundancia en los casos límite: estimación
// razonable a partir de reconstruir a mano un puñado de casos reales (los
// informes originales no traen los valores numéricos, solo el mapa como
// imagen) — no bloquea el uso real porque el texto generado sigue siendo
// editable a mano en la app.

import { clasificarNivel, rangosDe, type Plaga } from "@/lib/geo/densidad";

const ETIQUETAS_ABUNDANCIA = ["baja a nula", "baja", "media", "media-alta", "alta", "alta a muy alta", "muy alta"];

export interface ResumenPlaga {
  abundancia: string;
  distribucion: "generalizada" | "sectorizada" | "aislada" | "desuniforme" | null;
  /** Todos los puntos cargados están en cero — caso aparte de "abundancia
   * baja a nula" (que sigue siendo > 0, solo que en el bracket más bajo). */
  sinPresencia: boolean;
  /** Ningún punto de este lote/campaña tiene carga todavía. */
  sinDatos: boolean;
}

export interface PuntoPlaga {
  id: string;
  x: number;
  y: number;
  valorM2: number;
  /** Si el punto tiene una carga real (aunque sea con 0 individuos) — un
   * punto sin cargar NO es lo mismo que un punto cargado en cero, y tratar
   * ambos igual sesgaría la abundancia/distribución mientras el lote todavía
   * no está recorrido del todo. */
  cargado: boolean;
}

/** Mismo radio que usa la zona de aplicación de cebo (ver
 * lib/geo/zona-aplicacion.ts) — cubre vecinos ortogonales y diagonales de
 * la grilla real. No se comparte el helper porque ahí no está exportado y
 * el contexto es otro (relleno de huecos vs. agrupamiento para redactar). */
function radioVecino(spacingM: number): number {
  return spacingM * 1.6;
}

/** `spacingM` es el espaciado real entre estaciones de este lote (ver
 * `Math.sqrt(haPorPunto * 10000)` en salidas-view.tsx), no un valor fijo —
 * cada lote puede tener su propia densidad de grilla. */
export function resumenPlaga(puntos: PuntoPlaga[], plaga: Plaga, spacingM: number): ResumenPlaga {
  const rangos = rangosDe(plaga);
  const cargados = puntos.filter((p) => p.cargado);
  if (cargados.length === 0) {
    return { abundancia: "", distribucion: null, sinPresencia: false, sinDatos: true };
  }

  // "sin presencia" es un caso aparte: NINGÚN individuo encontrado en
  // NINGÚN punto (no solo "bracket bajo" — cero de verdad).
  const todoEnCero = cargados.every((p) => p.valorM2 === 0);
  if (todoEnCero) {
    return { abundancia: "sin presencia", distribucion: null, sinPresencia: true, sinDatos: false };
  }

  const conNivel = cargados.map((p) => ({ ...p, nivel: clasificarNivel(p.valorM2, rangos) }));

  // La abundancia se calcula sobre los puntos AFECTADOS (nivel >= 1), no
  // sobre el total del lote — así un foco puntual con valores altos no se
  // diluye entre los puntos vacíos/mínimos alrededor.
  const afectados = conNivel.filter((p) => p.nivel >= 1);
  if (afectados.length === 0) {
    return { abundancia: ETIQUETAS_ABUNDANCIA[0], distribucion: null, sinPresencia: false, sinDatos: false };
  }

  const counts = new Map<number, number>();
  afectados.forEach((p) => counts.set(p.nivel, (counts.get(p.nivel) ?? 0) + 1));
  let modal = 1;
  let max = -1;
  counts.forEach((c, n) => {
    if (c > max) {
      max = c;
      modal = n;
    }
  });
  // Una infestación que cubre casi todo el lote se percibe (y se redacta)
  // como más grave que la misma intensidad concentrada en un sector chico —
  // por eso la cobertura empuja la palabra de abundancia un escalón para
  // arriba cuando la presencia es realmente generalizada.
  const cobertura = afectados.length / conNivel.length;
  if (cobertura >= 0.8 && modal < ETIQUETAS_ABUNDANCIA.length - 1) modal += 1;
  const abundancia = ETIQUETAS_ABUNDANCIA[modal];

  // Distribución: agrupamos los puntos afectados por cercanía real
  // (union-find simple) y miramos la forma del agrupamiento resultante.
  const radio = radioVecino(spacingM);
  const padre = afectados.map((_, i) => i);
  function encontrar(i: number): number {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]];
      i = padre[i];
    }
    return i;
  }
  function unir(i: number, j: number) {
    const ri = encontrar(i);
    const rj = encontrar(j);
    if (ri !== rj) padre[ri] = rj;
  }
  for (let i = 0; i < afectados.length; i++) {
    for (let j = i + 1; j < afectados.length; j++) {
      const d = Math.hypot(afectados[i].x - afectados[j].x, afectados[i].y - afectados[j].y);
      if (d <= radio) unir(i, j);
    }
  }
  const grupos = new Map<number, number>();
  afectados.forEach((_, i) => {
    const r = encontrar(i);
    grupos.set(r, (grupos.get(r) ?? 0) + 1);
  });
  const tamanosGrupos = Array.from(grupos.values()).sort((a, b) => b - a);
  const grupoMasGrande = tamanosGrupos[0];
  const propGrupoMasGrande = grupoMasGrande / afectados.length;
  const promedioGrupo = afectados.length / tamanosGrupos.length;

  let distribucion: ResumenPlaga["distribucion"];
  if (cobertura >= 0.8) {
    distribucion = "generalizada";
  } else if (propGrupoMasGrande >= 0.6 && grupoMasGrande >= 2) {
    // la mayoría de los puntos afectados están agrupados en una sola zona
    distribucion = "sectorizada";
  } else if (promedioGrupo < 1.8) {
    // los puntos afectados están sueltos, casi ninguno tocando a otro
    distribucion = "aislada";
  } else {
    distribucion = "desuniforme";
  }

  return { abundancia, distribucion, sinPresencia: false, sinDatos: false };
}

const CAMPOS_PRESENCIA = [
  ["huevoBabosas", "Huevo de babosas"],
  ["gusanoArroz", "Gusano de arroz"],
  ["isocaCortadora", "Isoca cortadora"],
  ["gusanoBlanco", "Gusano blanco"],
] as const;

/** Presencias booleanas (no llevadas a m²) — sobre el total de puntos del
 * lote, no solo los ya cargados, para que el % baje solo si de verdad hay
 * poca presencia en vez de "poca porque falta cargar". */
export function resumenPresencias(
  cargas: Array<Pick<import("@/types/domain").Carga, "huevoBabosas" | "gusanoArroz" | "isocaCortadora" | "gusanoBlanco">>,
  totalPuntos: number
): string[] {
  if (totalPuntos === 0) return [];
  const resultado: string[] = [];
  for (const [campo, nombre] of CAMPOS_PRESENCIA) {
    const con = cargas.filter((c) => c[campo]).length;
    if (con === 0) continue;
    const pct = con / totalPuntos;
    const nivel = pct > 0.3 ? "generalizada" : "aislada";
    resultado.push(`${nombre} = presencia ${nivel}.`);
  }
  return resultado;
}

/** Arma el texto final de "Situación de plagas de suelo" — es el valor
 * inicial del textarea editable; una vez que alguien lo toca a mano, deja
 * de recalcularse solo (ver SalidasView). */
export function textoSituacion(resumenBicho: ResumenPlaga, resumenBabosa: ResumenPlaga, presencias: string[]): string {
  function linea(nombrePlaga: string, resumen: ResumenPlaga): string {
    if (resumen.sinDatos) return `${nombrePlaga} = sin datos cargados todavía.`;
    if (resumen.sinPresencia || !resumen.distribucion) return `${nombrePlaga} = ${resumen.abundancia}.`;
    return `${nombrePlaga} = abundancia ${resumen.abundancia}, distribución ${resumen.distribucion}.`;
  }
  const base = [linea("Bichos Bolita", resumenBicho), linea("Babosas", resumenBabosa)];
  return base.concat(presencias).join("\n");
}
