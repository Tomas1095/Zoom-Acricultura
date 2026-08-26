// "25/26" -> "26/27" — portado tal cual de `siguienteCampana` del
// prototipo: un incremento de string puro, no mira la fecha real. El
// prototipo tampoco lo hacía (no había ninguna regla de calendario ahí) —
// si en algún momento se agrega un tope por año calendario (para que no se
// pueda abrir la campaña siguiente antes de que arranque en serio), va acá.
export function siguienteCampana(campana: string): string {
  const partes = String(campana || "").split("/");
  if (partes.length !== 2) return campana;
  const a = parseInt(partes[0], 10);
  const b = parseInt(partes[1], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return campana;
  const pad = (n: number) => String(n % 100).padStart(2, "0");
  return `${pad(a + 1)}/${pad(b + 1)}`;
}
