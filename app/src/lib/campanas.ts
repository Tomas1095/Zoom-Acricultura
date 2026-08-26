// "25/26" -> "26/27" — portado tal cual de `siguienteCampana` del
// prototipo: un incremento de string puro, sin mirar la fecha real (el
// prototipo tampoco lo hacía). El tope por calendario de acá abajo es lo
// que evita que este incremento se use para saltar a una campaña que
// todavía no arrancó.
export function siguienteCampana(campana: string): string {
  const partes = String(campana || "").split("/");
  if (partes.length !== 2) return campana;
  const a = parseInt(partes[0], 10);
  const b = parseInt(partes[1], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return campana;
  const pad = (n: number) => String(n % 100).padStart(2, "0");
  return `${pad(a + 1)}/${pad(b + 1)}`;
}

// El año de trabajo real (según el usuario) arranca el 1° de septiembre y
// termina el 31 de agosto — ej. la campaña "26/27" corre de 1/9/2026 a
// 31/8/2027. Antes de esa fecha de arranque, esa campaña ni existe todavía.
const MES_INICIO_CAMPANA = 9; // septiembre, en base 1 (1=enero)

function primerAnio(campana: string): number {
  return parseInt(String(campana || "").split("/")[0], 10);
}

/** Qué campaña corresponde "hoy" según el año de trabajo (1/9 a 31/8) —
 * ej. cualquier fecha entre el 1/9/2026 y el 31/8/2027 da "26/27". */
export function campanaVigentePorFecha(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth() + 1; // Date.getMonth() es 0-11
  const inicio = mes >= MES_INICIO_CAMPANA ? anio : anio - 1;
  const pad = (n: number) => String(n % 100).padStart(2, "0");
  return `${pad(inicio % 100)}/${pad((inicio + 1) % 100)}`;
}

/** Si ya se puede cerrar la campaña vigente del lote y pasar a `candidata`
 * (la siguiente) — no antes de que esa campaña arranque de verdad, aunque
 * ya esté toda la grilla cargada. Evita además saltar más de una campaña
 * de una sola vez, que sería un error de todos modos. */
export function puedeAvanzarACampana(candidata: string, fecha: Date = new Date()): boolean {
  return primerAnio(candidata) <= primerAnio(campanaVigentePorFecha(fecha));
}

/** Fecha de arranque de `campana` en texto, para el aviso de "todavía no
 * se puede cerrar" (ej. "26/27" -> "1 de septiembre de 2026"). Asume años
 * 2000+ (con dos dígitos "26" -> 2026), razonable para esta app. */
export function fechaInicioCampanaTexto(campana: string): string {
  const anio = 2000 + primerAnio(campana);
  return `1 de septiembre de ${anio}`;
}
