/** Hectáreas con 2 decimales nomás — más que eso es ruido visual que nadie
 * necesita para caminar un lote. */
export function formatearHectareas(hectareas: number): string {
  return hectareas.toFixed(2);
}
