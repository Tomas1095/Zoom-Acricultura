// Nombre de lote + establecimiento para archivos e informes — a pedido
// del usuario: cuando arma un establecimiento con un solo lote y les pone
// el mismo nombre a los dos (caso real, no es un error de tipeo), repetir
// ese nombre dos veces en cada archivo/título quedaba raro ("Puntos La
// Juanita La Juanita", "La Juanita - La Juanita"). Acá, en ese caso, se
// muestra una sola vez — se compara sin mayúsculas/espacios de sobra para
// no depender de que estén escritos carácter por carácter igual.

/** Si el lote y su establecimiento se llaman, en los hechos, lo mismo. */
export function esMismoNombreLoteEstablecimiento(
  loteNombre: string,
  establecimientoNombre: string | null | undefined
): boolean {
  if (!establecimientoNombre) return false;
  return loteNombre.trim().toLowerCase() === establecimientoNombre.trim().toLowerCase();
}

/** Junta el nombre del lote con el del establecimiento — salvo que sean el
 * mismo nombre, ahí devuelve solo el del lote. `separador` es lo que va
 * ENTRE los dos cuando sí se muestran los dos (un espacio para nombres de
 * archivo, " - " para un título, etc.) — sin usar en el caso de un solo
 * nombre, así que no importa si no tiene espacios propios. */
export function nombreLoteYEstablecimiento(
  loteNombre: string,
  establecimientoNombre: string | null | undefined,
  separador = " "
): string {
  if (!establecimientoNombre || esMismoNombreLoteEstablecimiento(loteNombre, establecimientoNombre)) return loteNombre;
  return `${loteNombre}${separador}${establecimientoNombre}`;
}
