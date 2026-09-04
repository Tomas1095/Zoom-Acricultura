// Exportar el mapa de densidad como imagen PNG — a pedido del usuario,
// para poder mandar solo el mapa (sin el informe completo) en alguna
// situación puntual. Usa `react-native-view-shot` para capturar la vista
// del mapa tal cual se ve en pantalla (foto satelital + celdas de
// densidad + título/leyenda/rosa/escala, todo junto) — es la única forma
// real de "sacarle una foto" a una vista mixta de Image + SVG + Text, no
// hay manera de recrear eso a mano con canvas/SVG puro sin duplicar toda
// la lógica de dibujado que ya tiene MapaDensidad.

import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { guardarYCompartirDesdeArchivo, sanitizarNombreArchivo } from "./archivo";

/** `viewRef` tiene que apuntar al `View` raíz de un `MapaDensidad` (usa
 * `forwardRef` justo para esto) — captura ESE rectángulo nomás, sin el
 * marco/padding de la pantalla que lo contiene. */
export async function exportarMapaPng(viewRef: RefObject<View | null>, nombreArchivo: string): Promise<void> {
  if (!viewRef.current) throw new Error("El mapa todavía no está listo para exportar.");
  const uri = await captureRef(viewRef.current, { format: "png", quality: 1 });
  await guardarYCompartirDesdeArchivo(`${sanitizarNombreArchivo(nombreArchivo)}.png`, uri, "image/png");
}
