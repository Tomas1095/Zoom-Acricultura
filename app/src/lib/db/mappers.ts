// Conversión fila de Postgres (snake_case) -> tipo de dominio (camelCase).
// Centralizado acá para no repetirlo en cada archivo de queries.
import type { Cliente, Comunidad, Establecimiento, Invitacion, Lote, PuntoGeo, Usuario } from "@/types/domain";

export function filaACliente(f: any): Cliente {
  return { id: f.id, nombre: f.nombre };
}

export function filaAEstablecimiento(f: any): Establecimiento {
  return { id: f.id, clienteId: f.cliente_id, nombre: f.nombre };
}

/** El perímetro pasó de ser una sola lista de vértices (`PuntoGeo[]`) a una
 * lista de piezas (`PuntoGeo[][]`, ver domain.ts) para soportar campos con
 * lotes no contiguos — pero lotes ya generados ANTES de este cambio tienen
 * guardado el formato viejo en la base. Se detecta mirando el primer
 * elemento: si tiene `x`/`y` directo, es el formato viejo (una sola pieza
 * "plana") y se envuelve en un array; si ya es un array, es el formato
 * nuevo tal cual. */
function normalizarPerimetro(valor: any): PuntoGeo[][] {
  if (!Array.isArray(valor) || valor.length === 0) return [];
  return Array.isArray(valor[0]) ? (valor as PuntoGeo[][]) : [valor as PuntoGeo[]];
}

export function filaALote(f: any): Lote {
  return {
    id: f.id,
    establecimientoId: f.establecimiento_id,
    nombre: f.nombre,
    cultivo: f.cultivo,
    hectareas: f.hectareas,
    haPorPunto: f.ha_por_punto,
    campanaActual: f.campana_actual,
    perimetro: normalizarPerimetro(f.perimetro),
    tieneGrilla: f.tiene_grilla,
  };
}

export function filaAUsuario(f: any): Usuario {
  return {
    id: f.id,
    authUserId: f.auth_user_id,
    comunidadId: f.comunidad_id,
    nombre: f.nombre,
    mail: f.mail,
    color: f.color,
    rol: f.rol,
    activo: f.activo,
    adminPlataforma: f.admin_plataforma,
    createdAt: f.created_at,
  };
}

export function filaAComunidad(f: any): Comunidad {
  return {
    id: f.id,
    nombre: f.nombre,
    estado: f.estado,
    creadaPorId: f.creada_por_id,
    aprobadaPorId: f.aprobada_por_id,
    createdAt: f.created_at,
  };
}

export function filaAInvitacion(f: any): Invitacion {
  return {
    id: f.id,
    codigo: f.codigo,
    usado: f.usado,
    usadoPorId: f.usado_por_id,
    creadoPorId: f.creado_por_id,
    createdAt: f.created_at,
  };
}
