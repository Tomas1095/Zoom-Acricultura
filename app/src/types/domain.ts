// Tipos de dominio de la app, portados del modelo de datos del prototipo
// (reference/prototipo-app.jsx) pero adaptados a un backend relacional real
// (Supabase/Postgres) en vez de estado en memoria.
//
// Diferencia clave con el prototipo: ahí cada campaña archivada guardaba una
// "foto" completa de la grilla (grid jsonb). Acá, en cambio, `cargas` tiene
// `campana` como columna: cada carga pertenece a una campaña específica, así
// que ver el historial es simplemente filtrar por campaña — no hace falta
// duplicar snapshots a mano.

/** Jerarquía de 4 niveles. Nombres de columna en DB usan snake_case; acá va
 * la versión de dominio en camelCase que usa la UI. */
export type Rol = "socio_fundador" | "socio_gerente" | "encargado" | "monitoreador";

export interface Usuario {
  id: string;
  authUserId: string; // FK a auth.users(id) de Supabase
  comunidadId: string;
  nombre: string;
  mail: string;
  color: string; // hex, para identificar al usuario en el mapa/conflictos
  rol: Rol; // POR comunidad — ver adminPlataforma para lo que cruza comunidades
  activo: boolean;
  // Aparte de `rol`: administra la plataforma entera (aprueba/rechaza
  // comunidades nuevas, ver Comunidad más abajo) — hoy solo el usuario
  // original de Zoom Agricultura.
  adminPlataforma: boolean;
  createdAt: string;
}

/** Multi-tenant: cada empresa de monitoreo que usa la app es una comunidad
 * aislada de las demás (ver supabase/schema.sql). Alta de una comunidad
 * nueva NO es self-service — nace "pendiente" y un admin de plataforma la
 * aprueba o rechaza (ver lib/db/comunidades.ts). */
export interface Comunidad {
  id: string;
  nombre: string;
  estado: "pendiente" | "activa" | "rechazada";
  creadaPorId: string | null;
  aprobadaPorId: string | null;
  createdAt: string;
}

export interface Invitacion {
  id: string;
  codigo: string; // "EQUIPO-XXXXXX"
  usado: boolean;
  usadoPorId: string | null;
  creadoPorId: string;
  createdAt: string;
}

export interface Cliente {
  id: string;
  nombre: string;
}

export interface Establecimiento {
  id: string;
  clienteId: string;
  nombre: string;
}

export interface PuntoGeo {
  x: number; // metros relativos al centro del polígono del lote
  y: number;
}

export interface Lote {
  id: string;
  establecimientoId: string;
  nombre: string;
  cultivo: string;
  hectareas: number;
  haPorPunto: number;
  campanaActual: string; // "25/26"
  perimetro: PuntoGeo[]; // vértices reales del KMZ, en metros relativos al centro
  tieneGrilla: boolean;
}

export interface Punto {
  id: string;
  loteId: string;
  linea: number;
  puntoNum: number;
  lat: number;
  lon: number;
  x: number;
  y: number;
}

/** Una carga = los datos de monitoreo de un punto, en una campaña puntual.
 * Equivale a una entrada del `grid` del prototipo, pero versionada por campaña. */
export interface Carga {
  id: string;
  puntoId: string;
  campana: string;
  bicho: number;
  babosa: number;
  huevoBabosas: boolean;
  gusanoArroz: boolean;
  isocaCortadora: boolean;
  gusanoBlanco: boolean;
  humedad: "seco" | "humedo" | "muy_humedo" | null;
  observaciones: string;
  fotos: string[]; // paths en Supabase Storage, no data URLs
  cargado: boolean;
  confirmado: boolean;
  cargadoPorId: string | null;
  conflictoConId: string | null; // id de otra `carga` en pugna, si hay conflicto sin resolver
  sincronizado: boolean; // seteado por la capa de sync local, no persiste tal cual en el server
  updatedAt: string;
}

/** Qué usuarios tienen acceso a qué lote — lo administra el jefe/encargado. */
export interface Acceso {
  loteId: string;
  usuarioId: string;
}

// La cola offline local (SQLite en el dispositivo) vive en
// lib/offline/cola.ts, no acá — el tipo que había acá como placeholder
// (un solo shape para cualquier cambio pendiente) no reflejaba que "guardar
// los datos de un punto" y "subir una foto" son dos acciones bien
// distintas contra el server; lib/offline/cola.ts ya tiene el tipo real
// (CambioPendienteCarga | CambioPendienteFoto).
