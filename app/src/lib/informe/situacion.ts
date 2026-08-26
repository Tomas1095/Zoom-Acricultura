// Resumen automático de la situación de plagas — portado tal cual del
// prototipo (`resumenPlaga`, `resumenPresencias`, `textoSituacion`), mismo
// estilo de redacción que usan en sus informes reales. Trabaja sobre los
// valores ya llevados a m² (× 4 sobre el conteo cargado a campo).

import { clasificarNivel, rangosDe, type Plaga } from "@/lib/geo/densidad";

const ETIQUETAS_ABUNDANCIA = ["muy baja", "baja", "baja a media", "media", "media a alta", "alta", "alta a muy alta"];

export interface ResumenPlaga {
  abundancia: string;
  distribucion: "generalizada" | "sectorizada";
}

/** Nivel modal (el más frecuente entre los puntos) → abundancia, y si los
 * niveles altos (>= "121-180" o equivalente, índice 4) están concentrados
 * en pocas líneas o repartidos por todo el lote → distribución. */
export function resumenPlaga(puntos: Array<{ linea: number; valorM2: number }>, plaga: Plaga): ResumenPlaga {
  const rangos = rangosDe(plaga);
  const niveles = puntos.map((p) => clasificarNivel(p.valorM2, rangos));
  const counts = new Map<number, number>();
  niveles.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  let modal = 0;
  let max = -1;
  counts.forEach((c, n) => {
    if (c > max) {
      max = c;
      modal = n;
    }
  });
  const abundancia = ETIQUETAS_ABUNDANCIA[modal] ?? ETIQUETAS_ABUNDANCIA[0];

  const altos = puntos.filter((p) => clasificarNivel(p.valorM2, rangos) >= 4);
  const lineasConAltos = new Set(altos.map((p) => p.linea));
  const totalLineas = new Set(puntos.map((p) => p.linea)).size;
  const distribucion =
    totalLineas > 0 && lineasConAltos.size / totalLineas >= 0.6 ? "generalizada" : "sectorizada";

  return { abundancia, distribucion };
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

/** Arma el texto final de "Situación de plagas de suelo" — portado tal cual
 * de `textoSituacion`. Es el valor inicial del textarea editable; una vez
 * que alguien lo toca a mano, deja de recalcularse solo (ver SalidasView). */
export function textoSituacion(resumenBicho: ResumenPlaga, resumenBabosa: ResumenPlaga, presencias: string[]): string {
  const base = [
    `Bichos Bolita = abundancia ${resumenBicho.abundancia}, distribución ${resumenBicho.distribucion}.`,
    `Babosas = abundancia ${resumenBabosa.abundancia}, distribución ${resumenBabosa.distribucion}.`,
  ];
  return base.concat(presencias).join("\n");
}
