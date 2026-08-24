import type { Rol } from "@/types/domain";

/** Portado de `etiquetaRol` del prototipo, adaptado al enum de 4 valores
 * (acá `socio_fundador` y `socio_gerente` ya son roles distintos en vez de
 * un flag `esFundador` aparte). */
export function etiquetaRol(rol: Rol): string {
  switch (rol) {
    case "socio_fundador":
      return "Socio Fundador";
    case "socio_gerente":
      return "Socio Gerente";
    case "encargado":
      return "Encargado";
    case "monitoreador":
      return "Monitoreador";
  }
}

/** Encargado tiene el mismo acceso que Socio Gerente a todo el árbol/lotes —
 * lo único que no puede hacer es intervenir en el equipo (eso es solo del
 * Fundador/Gerente). Ver reference/CONTEXTO.md. */
export function puedeAdministrarLotes(rol: Rol): boolean {
  return rol === "socio_fundador" || rol === "socio_gerente" || rol === "encargado";
}

export function puedeGestionarEquipo(rol: Rol): boolean {
  return rol === "socio_fundador" || rol === "socio_gerente";
}
