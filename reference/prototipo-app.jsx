import React, { useState, useMemo, useEffect, useRef } from "react";
import { Bug, MapPin, Wifi, WifiOff, ChevronLeft, ChevronDown, Check, Droplets, Camera, X, Navigation, LocateFixed, Lock, Compass, Users, Plus, Upload, Trash2, Target, Pencil, Maximize2, Minimize2, RotateCcw, LogOut, Download, MessageCircle } from "lucide-react";
import * as d3 from "d3";

const TOLERANCE_M = 10; // radio de tolerancia para considerar "en rango"

// Perímetro real del lote (los 6 vértices del KMZ) y su envolvente convexa
// (para recortar el diagrama de densidad exactamente dentro del lote)
const PERIMETRO_39HAS = [
  { x: -29.10, y: 506.11 },
  { x: 632.16, y: -256.22 },
  { x: 540.83, y: -345.73 },
  { x: -334.92, y: -18.27 },
  { x: -335.37, y: 15.55 },
  { x: -473.61, y: 98.55 },
];
const HULL_39HAS = [
  { x: -473.61, y: 98.55 },
  { x: -334.92, y: -18.27 },
  { x: 540.83, y: -345.73 },
  { x: 632.16, y: -256.22 },
  { x: -29.10, y: 506.11 },
];

// ---- Grilla REAL del lote "39 has" (Tres Esquinas), generada a partir del KMZ ----
// x,y = metros relativos al centro del polígono real; lat,lon = coordenadas reales
const PUNTOS_39HAS = [
  { id: "1.1", linea: 1, punto: 1, lat: -37.9255605, lon: -58.4156204, x: -35.23, y: 419.73 },
  { id: "1.2", linea: 1, punto: 2, lat: -37.9247294, lon: -58.4147065, x: 45.02, y: 327.21 },
  { id: "1.3", linea: 1, punto: 3, lat: -37.9238983, lon: -58.4137926, x: 125.27, y: 234.69 },
  { id: "1.4", linea: 1, punto: 4, lat: -37.9230672, lon: -58.4128787, x: 205.52, y: 142.17 },
  { id: "1.5", linea: 1, punto: 5, lat: -37.9222361, lon: -58.4119649, x: 285.78, y: 49.66 },
  { id: "1.6", linea: 1, punto: 6, lat: -37.9214050, lon: -58.4110510, x: 366.03, y: -42.86 },
  { id: "1.7", linea: 1, punto: 7, lat: -37.9205739, lon: -58.4101371, x: 446.28, y: -135.38 },
  { id: "1.8", linea: 1, punto: 8, lat: -37.9197428, lon: -58.4092233, x: 526.53, y: -227.90 },
  { id: "2.1", linea: 2, punto: 1, lat: -37.9248396, lon: -58.4166739, x: -127.75, y: 339.48 },
  { id: "2.2", linea: 2, punto: 2, lat: -37.9240085, lon: -58.4157601, x: -47.50, y: 246.96 },
  { id: "2.3", linea: 2, punto: 3, lat: -37.9231774, lon: -58.4148462, x: 32.75, y: 154.44 },
  { id: "2.4", linea: 2, punto: 4, lat: -37.9223463, lon: -58.4139323, x: 113.01, y: 61.92 },
  { id: "2.5", linea: 2, punto: 5, lat: -37.9215152, lon: -58.4130184, x: 193.26, y: -30.60 },
  { id: "2.6", linea: 2, punto: 6, lat: -37.9206841, lon: -58.4121046, x: 273.51, y: -123.11 },
  { id: "2.7", linea: 2, punto: 7, lat: -37.9198530, lon: -58.4111907, x: 353.76, y: -215.63 },
  { id: "3.1", linea: 3, punto: 1, lat: -37.9241187, lon: -58.4177275, x: -220.27, y: 259.23 },
  { id: "3.2", linea: 3, punto: 2, lat: -37.9232876, lon: -58.4168136, x: -140.02, y: 166.71 },
  { id: "3.3", linea: 3, punto: 3, lat: -37.9224565, lon: -58.4158997, x: -59.76, y: 74.19 },
  { id: "3.4", linea: 3, punto: 4, lat: -37.9216254, lon: -58.4149859, x: 20.49, y: -18.33 },
  { id: "3.5", linea: 3, punto: 5, lat: -37.9207943, lon: -58.4140720, x: 100.74, y: -110.85 },
  { id: "3.6", linea: 3, punto: 6, lat: -37.9199632, lon: -58.4131581, x: 180.99, y: -203.37 },
  { id: "4.1", linea: 4, punto: 1, lat: -37.9233978, lon: -58.4187811, x: -312.79, y: 178.97 },
  { id: "4.2", linea: 4, punto: 2, lat: -37.9225667, lon: -58.4178672, x: -232.53, y: 86.46 },
  { id: "4.3", linea: 4, punto: 3, lat: -37.9217356, lon: -58.4169533, x: -152.28, y: -6.06 },
  { id: "4.4", linea: 4, punto: 4, lat: -37.9209045, lon: -58.4160394, x: -72.03, y: -98.58 },
  { id: "5.1", linea: 5, punto: 1, lat: -37.9226769, lon: -58.4198346, x: -405.30, y: 98.72 },
  { id: "5.2", linea: 5, punto: 2, lat: -37.9218458, lon: -58.4189207, x: -325.05, y: 6.20 },
];

// Nombre de la comunidad/organización — lo elige quien crea la comunidad (el primer
// Socio Gerente). Acá lo dejamos fijo porque el prototipo no arma comunidades nuevas.
const NOMBRE_COMUNIDAD = "Zoom Agricultura";

const USERS_INICIALES = [
  { id: "u1", nombre: "Marcos Ibáñez", mail: "marcos.ibanez@mail.com", color: "#1F9350", rol: "empleado" },
  { id: "u2", nombre: "Valentina Ríos", mail: "valentina.rios@mail.com", color: "#0F8B8D", rol: "empleado" },
  { id: "u3", nombre: "Gastón Fernández", mail: "gaston.fernandez@mail.com", color: "#D9631F", rol: "encargado" },
  { id: "j1", nombre: "Tomás Guichandut", mail: "vos@zoomagricultura.com", color: "#155C35", rol: "jefe", esFundador: true },
  { id: "j2", nombre: "Lucía Beltrán", mail: "lucia.beltran@mail.com", color: "#A9752E", rol: "jefe", esFundador: false },
];
const COLORES_EMPLEADO_NUEVO = ["#1F9350", "#0F8B8D", "#D9631F", "#1E6FEB", "#7B3FA0", "#C1440E"];

function seedDataDesdePuntos(puntos) {
  // Arranca todo en cero/blanco — es una simulación real de ir a campo,
  // no datos de ejemplo pre-cargados.
  const data = {};
  puntos.forEach((p) => {
    data[p.id] = {
      x: p.x,
      y: p.y,
      lat: p.lat,
      lon: p.lon,
      bicho: 0,
      babosa: 0,
      huevoBabosas: false,
      gusanoArroz: false,
      isocaCortadora: false,
      gusanoBlanco: false,
      cargado: false,
      confirmado: false,
      cargadoPor: null,
      humedad: null,
      conflictoCon: null,
      sincronizado: false,
      observaciones: "",
      fotos: [], // lista de data URLs de las fotos adjuntas
    };
  });
  return data;
}

const LOTES_INICIALES = [
  {
    id: "L1",
    nombre: "39 has",
    establecimiento: "Tres Esquinas",
    cultivo: "Sin especificar",
    tieneGrilla: true,
    hectareas: 39.6,
    haPorPunto: 1.5,
    puntosTotal: PUNTOS_39HAS.length,
    puntosCompletados: 0,
    sincronizado: true,
    puntos: PUNTOS_39HAS,
    perimetro: PERIMETRO_39HAS,
    campanaActual: "25/26",
    historialCampanas: [], // [{ campana: "24/25", grid: {...} }, ...] — campañas cerradas y archivadas
  },
];

// Casco convexo (Andrew monotone chain) — lo necesitamos por lote, ya no es fijo
function cascoConvexo(pts) {
  const unicos = Array.from(new Set(pts.map((p) => `${p.x}|${p.y}`))).map((s) => {
    const [x, y] = s.split("|").map(Number);
    return { x, y };
  });
  unicos.sort((a, b) => a.x - b.x || a.y - b.y);
  if (unicos.length <= 2) return unicos;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of unicos) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = unicos.length - 1; i >= 0; i--) {
    const p = unicos[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Genera una grilla propia (puntos + perímetro) para un lote nuevo. Como en este
// prototipo no procesamos el KMZ real (no hay librería de geometría/zip disponible
// en este entorno), armamos un lote rectangular simple con la misma lógica de
// espaciado (1 punto cada haPorPunto hectáreas) y numeración línea.punto —
// consistente y propia de ESE lote, aunque no calcada de un polígono real.
function generarGrillaSintetica(hectareas, haPorPunto) {
  const spacing = Math.sqrt(haPorPunto * 10000);
  const objetivo = Math.max(1, Math.round(hectareas / haPorPunto));
  const nFilas = Math.max(1, Math.round(Math.sqrt(objetivo)));
  const nCols = Math.max(1, Math.round(objetivo / nFilas));

  const puntos = [];
  for (let f = 0; f < nFilas; f++) {
    for (let c = 0; c < nCols; c++) {
      puntos.push({
        id: `${f + 1}.${c + 1}`,
        linea: f + 1,
        punto: c + 1,
        x: c * spacing + spacing / 2,
        y: f * spacing + spacing / 2,
      });
    }
  }
  const anchoTotal = nCols * spacing;
  const altoTotal = nFilas * spacing;
  const margen = spacing / 2;
  const perimetro = [
    { x: -margen, y: -margen },
    { x: anchoTotal + margen, y: -margen },
    { x: anchoTotal + margen, y: altoTotal + margen },
    { x: -margen, y: altoTotal + margen },
  ];
  return { puntos, perimetro };
}

// Cliente → Establecimiento → Lote (los IDs de lote apuntan a LOTES_INICIALES)
const CLIENTES_INICIALES = [
  {
    id: "c1",
    nombre: "Baltan Agropecuaria",
    establecimientos: [{ id: "e1", nombre: "Tres Esquinas", loteIds: ["L1"] }],
  },
];

// Acceso vigente: qué empleados pueden ver cada lote ahora mismo (lo administra el jefe)
const ACCESOS_INICIALES = {
  L1: ["u1", "u2", "u3"],
  L2: [],
  L3: [],
  L4: [],
};

let nextIdNum = 100; // contador simple para IDs nuevos en esta demo
const ICONO_BICHO_BOLITA = "data:image/png;base64,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";
const ICONO_BABOSA = "data:image/png;base64,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";

function nuevoId(prefijo) {
  nextIdNum += 1;
  return `${prefijo}${nextIdNum}`;
}

// "25/26" -> "26/27" — para pasar a la campaña siguiente al restablecer un lote.
function siguienteCampana(campana) {
  const partes = String(campana || "").split("/");
  if (partes.length !== 2) return campana;
  const a = parseInt(partes[0], 10);
  const b = parseInt(partes[1], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return campana;
  const pad = (n) => String(n % 100).padStart(2, "0");
  return `${pad(a + 1)}/${pad(b + 1)}`;
}

export default function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [usuarios, setUsuarios] = useState(USERS_INICIALES);
  const [invitaciones, setInvitaciones] = useState([]); // [{codigo, usado, usadoPor}]

  function generarCodigoInvitacion() {
    const letras = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 6; i++) c += letras[Math.floor(Math.random() * letras.length)];
    const codigo = `EQUIPO-${c}`;
    setInvitaciones((inv) => [...inv, { codigo, usado: false, usadoPor: null }]);
    return codigo;
  }
  const [mostrarEquipo, setMostrarEquipo] = useState(false);
  const [avisosEquipo, setAvisosEquipo] = useState([]); // nombres que se unieron y todavía no se le avisó al jefe
  const role = usuarioLogueado?.rol || "empleado";
  // Encargado tiene el mismo acceso que Socio Gerente a todo el árbol/lotes —
  // lo único que no puede hacer es intervenir en el equipo (eso es solo del jefe).
  const puedeAdministrar = role === "jefe" || role === "encargado";
  const currentUser = usuarioLogueado || usuarios[0]; // usuario logueado en este dispositivo
  const esFundador = currentUser?.esFundador === true;
  const [lote, setLote] = useState(null);
  const [tab, setTab] = useState("campo"); // campo | densidad
  // Cada lote tiene su propia grilla — se genera la primera vez que se abre ese lote.
  const [gridsPorLote, setGridsPorLote] = useState(() => ({
    [LOTES_INICIALES[0].id]: seedDataDesdePuntos(LOTES_INICIALES[0].puntos),
  }));
  const grid = (lote && gridsPorLote[lote.id]) || {};
  function setGrid(actualizador) {
    if (!lote) return;
    setGridsPorLote((prev) => {
      const actual = prev[lote.id] || seedDataDesdePuntos(lote.puntos || []);
      const siguiente = typeof actualizador === "function" ? actualizador(actual) : actualizador;
      return { ...prev, [lote.id]: siguiente };
    });
  }
  // Qué campaña se está mirando dentro del lote abierto — null significa "la
  // actual" (editable); un string ("24/25") significa una campaña archivada
  // del historial (solo lectura).
  const [campanaViendo, setCampanaViendo] = useState(null);
  const [menuCampanaAbierto, setMenuCampanaAbierto] = useState(false);
  const [pidiendoRestablecer, setPidiendoRestablecer] = useState(false);
  const [lotesTodos, setLotesTodos] = useState(LOTES_INICIALES);
  // Versión "viva" del lote abierto (con campanaActual/historialCampanas al día,
  // más allá de que "lote" haya quedado como una foto de cuando se abrió).
  const loteVivo = lote ? lotesTodos.find((l) => l.id === lote.id) || lote : null;
  // Si se está mirando una campaña archivada, mostramos esa grilla congelada
  // (solo lectura) en vez de la grilla en vivo.
  const gridParaMostrar =
    campanaViendo && loteVivo
      ? (loteVivo.historialCampanas || []).find((h) => h.campana === campanaViendo)?.grid || {}
      : grid;
  useEffect(() => {
    if (lote && !gridsPorLote[lote.id]) {
      setGridsPorLote((prev) => ({ ...prev, [lote.id]: seedDataDesdePuntos(lote.puntos || []) }));
    }
  }, [lote]);
  const [activePoint, setActivePoint] = useState(null);
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const [conflictoAbierto, setConflictoAbierto] = useState(null); // id del punto en resolución, o null
  const [online, setOnline] = useState(false);
  const [plaga, setPlaga] = useState("bicho"); // para el mapa
  const [accesos, setAccesos] = useState(ACCESOS_INICIALES); // qué empleados ven cada lote

  function unirseConCodigo(nombre, mail, codigo) {
    const codigoNormalizado = codigo.trim().toUpperCase();
    const invitacion = invitaciones.find((i) => i.codigo === codigoNormalizado && !i.usado);
    if (!invitacion) {
      return { ok: false, motivo: "codigo" };
    }
    const mailNormalizado = mail.trim().toLowerCase();
    const existente = usuarios.find((u) => u.mail && u.mail.toLowerCase() === mailNormalizado);

    if (existente) {
      if (existente.activo === false) {
        // Vuelve alguien que ya había pasado por la comunidad antes — reconectamos
        // su cuenta vieja (misma categoría de siempre, mismo historial), no creamos otra.
        const reactivado = { ...existente, activo: true, nombre: nombre.trim() };
        setUsuarios((us) => us.map((u) => (u.id === existente.id ? reactivado : u)));
        setInvitaciones((inv) =>
          inv.map((i) => (i.codigo === codigoNormalizado ? { ...i, usado: true, usadoPor: reactivado.nombre } : i))
        );
        return { ok: true, usuario: reactivado, reactivado: true };
      }
      return { ok: false, motivo: "mail_en_uso" };
    }

    const nuevo = {
      id: nuevoId("u"),
      nombre: nombre.trim(),
      mail: mailNormalizado,
      color: COLORES_EMPLEADO_NUEVO[usuarios.length % COLORES_EMPLEADO_NUEVO.length],
      rol: "empleado", // por defecto entra como Monitoreador hasta que un Socio Gerente lo categorice
      activo: true,
    };
    setUsuarios((us) => [...us, nuevo]);
    setAvisosEquipo((a) => [...a, { id: nuevo.id, nombre: nuevo.nombre }]);
    setInvitaciones((inv) =>
      inv.map((i) => (i.codigo === codigoNormalizado ? { ...i, usado: true, usadoPor: nuevo.nombre } : i))
    );
    return { ok: true, usuario: nuevo, reactivado: false };
  }

  function eliminarEmpleado(userId) {
    // Nunca se borra a nadie de verdad — se desactiva. Así el nombre se conserva
    // en todo lo que esa persona haya cargado antes (quién cargó cada punto, etc.),
    // en vez de quedar huérfano como "otra persona".
    setUsuarios((us) => us.map((u) => (u.id === userId ? { ...u, activo: false } : u)));
    setAccesos((a) => {
      const copia = {};
      Object.entries(a).forEach(([loteId, ids]) => {
        copia[loteId] = ids.filter((id) => id !== userId);
      });
      return copia;
    });
  }

  function transferirFundador(nuevoFundadorId) {
    setUsuarios((us) =>
      us.map((u) => {
        if (u.id === nuevoFundadorId) return { ...u, esFundador: true };
        if (u.esFundador) return { ...u, esFundador: false };
        return u;
      })
    );
  }

  // Se usa SOLO en el momento de categorizar a alguien recién unido — una vez
  // asignado Socio Gerente queda fijo para siempre, no hay forma de deshacerlo desde la app.
  function asignarSocioGerenteDesdeAviso(userId) {
    setUsuarios((us) => us.map((u) => (u.id === userId ? { ...u, rol: "jefe", esFundador: false } : u)));
    setAccesos((a) => {
      const copia = {};
      Object.entries(a).forEach(([loteId, ids]) => {
        copia[loteId] = ids.filter((id) => id !== userId);
      });
      return copia;
    });
    setAvisosEquipo((av) => av.filter((x) => x.id !== userId));
  }

  function confirmarComoEmpleadoDesdeAviso(userId) {
    // ya entra como Monitoreador por defecto — solo hace falta cerrar el aviso
    setAvisosEquipo((av) => av.filter((x) => x.id !== userId));
  }

  // Alterna entre Monitoreador y Encargado — solo para miembros que NO son Socio Gerente.
  function cambiarCategoriaMiembro(userId, nuevaCategoria) {
    setUsuarios((us) => us.map((u) => (u.id === userId ? { ...u, rol: nuevaCategoria } : u)));
  }

  // Ascender a Socio Gerente a alguien que ya es parte del equipo (Encargado) —
  // reservado al Socio Fundador, un escalón por vez, igual que degradar de vuelta.
  function ascenderASocioGerente(userId) {
    setUsuarios((us) => us.map((u) => (u.id === userId ? { ...u, rol: "jefe", esFundador: false } : u)));
    setAccesos((a) => {
      const copia = {};
      Object.entries(a).forEach(([loteId, ids]) => {
        copia[loteId] = ids.filter((id) => id !== userId);
      });
      return copia;
    });
  }

  const [clientes, setClientes] = useState(CLIENTES_INICIALES);

  // Versión de los lotes con el progreso real (completados/sincronizados) de
  // cada uno, calculado en vivo a partir de su grilla — si un lote todavía no
  // se abrió nunca, no tiene grilla cargada y queda en 0.
  const lotesConProgreso = useMemo(() => {
    return lotesTodos.map((l) => {
      const g = gridsPorLote[l.id];
      if (!g) return { ...l, puntosCompletados: 0, puntosSincronizados: 0, desglosePorPersona: {} };
      const vals = Object.values(g);
      const puntosCompletados = vals.filter((p) => p.confirmado).length;
      const puntosSincronizados = vals.filter((p) => p.confirmado && p.sincronizado && !p.conflictoCon).length;
      // Cuántos puntos cargó cada persona en este lote — para el desglose
      // "Info" que ven Socio Gerente/Fundador y Encargado en el árbol.
      const desglosePorPersona = {};
      vals.forEach((p) => {
        if (p.confirmado && p.cargadoPor) {
          desglosePorPersona[p.cargadoPor] = (desglosePorPersona[p.cargadoPor] || 0) + 1;
        }
      });
      return { ...l, puntosCompletados, puntosSincronizados, desglosePorPersona };
    });
  }, [lotesTodos, gridsPorLote]);

  // Cierra la campaña actual de un lote (la archiva en su historial tal cual
  // quedó) y arranca una nueva, en blanco, con la MISMA grilla/geometría —
  // no hace falta volver a subir el KMZ ni regenerar los puntos.
  function restablecerCampana(loteId) {
    const loteActual = lotesTodos.find((l) => l.id === loteId);
    if (!loteActual) return;
    const gridActual = gridsPorLote[loteId];
    setLotesTodos((ls) =>
      ls.map((l) =>
        l.id !== loteId
          ? l
          : {
              ...l,
              campanaActual: siguienteCampana(l.campanaActual),
              historialCampanas: [
                ...(l.historialCampanas || []),
                { campana: l.campanaActual, grid: gridActual },
              ],
            }
      )
    );
    setGridsPorLote((gs) => ({ ...gs, [loteId]: seedDataDesdePuntos(loteActual.puntos) }));
    setCampanaViendo(null);
  }

  function agregarCliente(nombre) {
    setClientes((cs) => [...cs, { id: nuevoId("c"), nombre, establecimientos: [] }]);
  }

  function editarCliente(clienteId, nuevoNombre) {
    setClientes((cs) => cs.map((c) => (c.id !== clienteId ? c : { ...c, nombre: nuevoNombre })));
  }

  function editarLote(loteId, nuevoNombre) {
    setLotesTodos((ls) => ls.map((l) => (l.id !== loteId ? l : { ...l, nombre: nuevoNombre })));
  }

  function agregarEstablecimiento(clienteId, nombre) {
    const nuevoEstId = nuevoId("e");
    setClientes((cs) =>
      cs.map((c) =>
        c.id !== clienteId
          ? c
          : { ...c, establecimientos: [...c.establecimientos, { id: nuevoEstId, nombre, loteIds: [] }] }
      )
    );
    return nuevoEstId;
  }

  function agregarLote(clienteId, establecimientoId, { nombre, cultivo }) {
    const nuevoLoteId = nuevoId("L");
    const establecimiento = clientes
      .find((c) => c.id === clienteId)
      ?.establecimientos.find((e) => e.id === establecimientoId);

    setLotesTodos((ls) => [
      ...ls,
      {
        id: nuevoLoteId,
        nombre,
        cultivo,
        establecimiento: establecimiento?.nombre || "",
        tieneGrilla: false,
        hectareas: null,
        haPorPunto: 1.5,
      },
    ]);
    setClientes((cs) =>
      cs.map((c) =>
        c.id !== clienteId
          ? c
          : {
              ...c,
              establecimientos: c.establecimientos.map((e) =>
                e.id !== establecimientoId ? e : { ...e, loteIds: [...e.loteIds, nuevoLoteId] }
              ),
            }
      )
    );
    setAccesos((a) => ({ ...a, [nuevoLoteId]: [] }));
    return nuevoLoteId;
  }

  function generarGrillaDesdeKmz(loteId, { hectareas, haPorPunto }) {
    const { puntos, perimetro } = generarGrillaSintetica(hectareas, haPorPunto);
    setLotesTodos((ls) =>
      ls.map((l) =>
        l.id !== loteId
          ? l
          : {
              ...l,
              tieneGrilla: true,
              hectareas,
              haPorPunto,
              puntosTotal: puntos.length,
              puntosCompletados: 0,
              sincronizado: true,
              puntos,
              perimetro,
              campanaActual: l.campanaActual || "25/26",
              historialCampanas: l.historialCampanas || [],
            }
      )
    );
  }

  function eliminarLote(clienteId, establecimientoId, loteId) {
    setClientes((cs) =>
      cs.map((c) =>
        c.id !== clienteId
          ? c
          : {
              ...c,
              establecimientos: c.establecimientos.map((e) =>
                e.id !== establecimientoId ? e : { ...e, loteIds: e.loteIds.filter((id) => id !== loteId) }
              ),
            }
      )
    );
    setLotesTodos((ls) => ls.filter((l) => l.id !== loteId));
    setAccesos((a) => {
      const { [loteId]: _quitado, ...resto } = a;
      return resto;
    });
  }

  function eliminarEstablecimiento(clienteId, establecimientoId) {
    const cliente = clientes.find((c) => c.id === clienteId);
    const est = cliente?.establecimientos.find((e) => e.id === establecimientoId);
    const loteIdsAEliminar = est?.loteIds || [];
    setClientes((cs) =>
      cs.map((c) =>
        c.id !== clienteId
          ? c
          : { ...c, establecimientos: c.establecimientos.filter((e) => e.id !== establecimientoId) }
      )
    );
    setLotesTodos((ls) => ls.filter((l) => !loteIdsAEliminar.includes(l.id)));
    setAccesos((a) => {
      const copia = { ...a };
      loteIdsAEliminar.forEach((id) => delete copia[id]);
      return copia;
    });
  }

  function eliminarCliente(clienteId) {
    const cliente = clientes.find((c) => c.id === clienteId);
    const loteIdsAEliminar = (cliente?.establecimientos || []).flatMap((e) => e.loteIds);
    setClientes((cs) => cs.filter((c) => c.id !== clienteId));
    setLotesTodos((ls) => ls.filter((l) => !loteIdsAEliminar.includes(l.id)));
    setAccesos((a) => {
      const copia = { ...a };
      loteIdsAEliminar.forEach((id) => delete copia[id]);
      return copia;
    });
  }

  function toggleAcceso(loteId, userId) {
    setAccesos((a) => {
      const actuales = a[loteId] || [];
      const yaTiene = actuales.includes(userId);
      return {
        ...a,
        [loteId]: yaTiene ? actuales.filter((id) => id !== userId) : [...actuales, userId],
      };
    });
  }

  // ---- Posición del trabajador (simulada en metros dentro del lote) ----
  // Arranca cerca del vértice donde empieza la línea 1 (punto 1.1 real del KMZ)
  const [myPos, setMyPos] = useState({ x: -70, y: 460 });
  const [gpsStatus, setGpsStatus] = useState("simulado"); // simulado | buscando | activo | no-disponible
  const watchIdRef = useRef(null);
  const originRef = useRef(null); // referencia lat/lng del primer fix, para convertir a metros

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  function activarGPS() {
    if (!navigator.geolocation) {
      setGpsStatus("no-disponible");
      return;
    }
    setGpsStatus("buscando");
    // Origen fijo: el mismo centro de proyección usado al generar la grilla real
    // desde el KMZ (no "el primer punto donde agarra señal"), para que la posición
    // del GPS caiga exactamente alineada con los puntos reales del lote.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const metersPerDegLat = 111320;
        const metersPerDegLng = 111320 * Math.cos((ORIGEN_LOTE.lat * Math.PI) / 180);
        const dx = (longitude - ORIGEN_LOTE.lng) * metersPerDegLng;
        const dy = (ORIGEN_LOTE.lat - latitude) * metersPerDegLat;
        setMyPos({ x: dx, y: dy });
        setGpsStatus("activo");
      },
      () => setGpsStatus("no-disponible"),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
  }

  // El GPS se activa solo al entrar a un lote — no hace falta tocar nada,
  // igual que ya pasa con la brújula. Si salís del lote, cortamos el rastreo.
  useEffect(() => {
    if (lote) {
      activarGPS();
    } else if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setGpsStatus("simulado");
    }
  }, [lote]);

  const puntosConDistancia = useMemo(() => {
    return Object.entries(grid).map(([id, p]) => {
      const px = p.x;
      const py = p.y;
      const dist = Math.hypot(myPos.x - px, myPos.y - py);
      return { id, ...p, px, py, dist };
    });
  }, [grid, myPos]);

  const puntoCercano = useMemo(() => {
    if (puntosConDistancia.length === 0) return null;
    return puntosConDistancia.reduce((a, b) => (b.dist < a.dist ? b : a));
  }, [puntosConDistancia]);

  // Estado de sincronización del lote que está abierto ahora mismo.
  const puntosTotalLote = lote ? lote.puntosTotal : 0;
  const puntosCargadosLote = useMemo(
    () => Object.values(grid).filter((p) => p.confirmado).length,
    [grid]
  );
  const puntosSincronizadosLote = useMemo(
    () => Object.values(grid).filter((p) => p.confirmado && p.sincronizado && !p.conflictoCon).length,
    [grid]
  );
  // Cuánto falta sincronizar todavía. Al arrancar el lote (nada cargado) se
  // muestra el total como "pendiente", para no mostrar un verde vacío.
  const faltanSincronizar =
    puntosCargadosLote === 0 ? puntosTotalLote : puntosCargadosLote - puntosSincronizadosLote;
  const loteSincronizadoCompleto = puntosCargadosLote > 0 && faltanSincronizar === 0;
  // Un lote queda "cerrado" para los Monitoreadores (no pueden editar nada
  // más ahí) recién cuando está terminado Y sincronizado del todo.
  const loteBloqueadoParaMonitoreador = loteSincronizadoCompleto && puntosCargadosLote >= puntosTotalLote;

  const puntosConConflicto = useMemo(
    () => Object.entries(grid).filter(([, p]) => p.conflictoCon),
    [grid]
  );

  const maxVal = useMemo(() => {
    let m = 1;
    Object.values(gridParaMostrar).forEach((p) => {
      m = Math.max(m, p.bicho, p.babosa);
    });
    return m;
  }, [gridParaMostrar]);

  const porUsuario = useMemo(() => {
    const counts = {};
    USERS_INICIALES.forEach((u) => (counts[u.id] = 0));
    Object.values(grid).forEach((p) => {
      if (p.cargado && p.cargadoPor) counts[p.cargadoPor] = (counts[p.cargadoPor] || 0) + 1;
    });
    return counts;
  }, [grid]);

  function setField(id, key, value) {
    setGrid((g) => ({
      ...g,
      [id]: {
        ...g[id],
        [key]: value,
        cargado: true,
        cargadoPor: g[id].cargadoPor || currentUser.id,
        // Si el punto ya estaba confirmado (y quizás ya sincronizado) y se
        // vuelve a tocar un dato, ese cambio queda pendiente de sincronizar
        // de nuevo — aunque no se llegue a tocar "Guardar cambios" antes de
        // cerrar la ficha, el contador no debe mentir diciendo que está al día.
        sincronizado: g[id].confirmado ? false : g[id].sincronizado,
      },
    }));
  }

  function confirmarPunto(id) {
    setGrid((g) => ({
      ...g,
      [id]: { ...g[id], confirmado: true, sincronizado: online },
    }));
  }

  // Al "agarrar señal" (pasar de sin conexión a con conexión), se sincroniza
  // de una todo lo que ya estaba cargado y esperando — así es como se simula
  // acá que, por ej., Juan llega a un lugar con señal y sus puntos suben.
  function sincronizarPendientes() {
    setGrid((g) => {
      const copia = { ...g };
      Object.keys(copia).forEach((id) => {
        if (copia[id].confirmado && !copia[id].sincronizado) {
          copia[id] = { ...copia[id], sincronizado: true };
        }
      });
      return copia;
    });
  }

  function toggleOnline() {
    if (!online) sincronizarPendientes();
    setOnline((o) => !o);
  }

  function reabrirPunto(id) {
    setGrid((g) => ({
      ...g,
      [id]: { ...g[id], confirmado: false },
    }));
  }

  // ---- Cargas duplicadas offline (dos personas cargaron el mismo punto sin
  // verse entre sí) — se resuelve cuando un Socio Gerente o Encargado entra al
  // lote después de que los datos se sincronizaron. ----
  function resolverConflicto(pointId, usarAlternativa) {
    setGrid((g) => {
      const punto = g[pointId];
      if (!punto || !punto.conflictoCon) return g;
      if (usarAlternativa) {
        const { bicho, babosa, huevoBabosas, gusanoArroz, isocaCortadora, gusanoBlanco, cargadoPor } =
          punto.conflictoCon;
        return {
          ...g,
          [pointId]: {
            ...punto,
            bicho,
            babosa,
            huevoBabosas,
            gusanoArroz,
            isocaCortadora,
            gusanoBlanco,
            cargadoPor,
            conflictoCon: null,
          },
        };
      }
      return { ...g, [pointId]: { ...punto, conflictoCon: null } };
    });
  }

  // Solo para poder mostrar cómo se ve el aviso acá en el prototipo — en la
  // app real este conflicto lo generaría el propio proceso de sincronización,
  // no un botón. Toma un punto ya cargado al azar y le arma una "segunda
  // versión" cargada por otra persona, como si hubiera pasado offline.
  function simularCargaDuplicada() {
    const cargados = Object.entries(grid).filter(([, p]) => p.confirmado && !p.conflictoCon);
    if (cargados.length === 0) return;
    const [pointId, punto] = cargados[Math.floor(Math.random() * cargados.length)];
    const otroUsuario =
      usuarios.find((u) => u.activo !== false && u.id !== punto.cargadoPor && u.rol === "empleado") ||
      usuarios.find((u) => u.activo !== false && u.id !== punto.cargadoPor);
    if (!otroUsuario) return;
    setGrid((g) => ({
      ...g,
      [pointId]: {
        ...g[pointId],
        conflictoCon: {
          cargadoPor: otroUsuario.id,
          bicho: Math.max(0, punto.bicho + (Math.floor(Math.random() * 5) - 2)),
          babosa: Math.max(0, punto.babosa + (Math.floor(Math.random() * 5) - 2)),
          huevoBabosas: !punto.huevoBabosas,
          gusanoArroz: punto.gusanoArroz,
          isocaCortadora: punto.isocaCortadora,
          gusanoBlanco: punto.gusanoBlanco,
        },
      },
    }));
  }

  if (!usuarioLogueado) {
    return (
      <LoginView
        usuarios={usuarios.filter((u) => u.activo !== false)}
        onLogin={(u) => {
          setUsuarioLogueado(u);
          setLote(null);
          setTab("campo");
        }}
        onUnirse={(nombre, mail, codigo) => {
          const resultado = unirseConCodigo(nombre, mail, codigo);
          if (resultado.ok) {
            setUsuarioLogueado(resultado.usuario);
            setLote(null);
            setTab("campo");
          }
          return resultado;
        }}
      />
    );
  }

  return (
    <div style={styles.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Expanded:wght@600;800&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Poppins:wght@600;900&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
      `}</style>

      {/* Header */}
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>MONITOREO DE PLAGAS</div>
          <div style={styles.headerComunidad}>{NOMBRE_COMUNIDAD}</div>
          <div style={styles.headerComunidadRule} />
          {lote && <div style={styles.loteName}>{lote.nombre}</div>}
        </div>
        <div style={styles.headerRight}>
          <ZoomLogo variant="light" iconSize={32} wordSize={21} />
        </div>
      </header>

      <div style={styles.sessionRow}>
        <div>
          <div style={styles.sessionUser}>{currentUser.nombre}</div>
          <div style={styles.sessionRol}>{etiquetaRol(currentUser.rol, currentUser.esFundador)}</div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {role === "jefe" && !lote && (
            <button style={styles.sessionEquipo} onClick={() => setMostrarEquipo(true)}>
              Mi equipo
            </button>
          )}
          <button
            style={styles.sessionLogoutIcon}
            onClick={() => setConfirmarSalir(true)}
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {confirmarSalir && (
        <div style={styles.confirmOverlay} onClick={() => setConfirmarSalir(false)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmBoxTitle}>¿Cerrar sesión?</div>
            <div style={styles.confirmBoxRow}>
              <button style={styles.confirmBoxNo} onClick={() => setConfirmarSalir(false)}>
                Cancelar
              </button>
              <button
                style={styles.confirmBoxYes}
                onClick={() => {
                  setUsuarioLogueado(null);
                  setLote(null);
                  setConfirmarSalir(false);
                }}
              >
                Sí, cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {role === "jefe" && avisosEquipo.length > 0 && (
        <div style={styles.avisosEquipoWrap}>
          {avisosEquipo.map((av) => (
            <div key={av.id} style={styles.avisoEquipoBanner}>
              <div style={styles.avisoEquipoTexto}>🎉 {av.nombre} se unió a la comunidad.</div>
              <div style={styles.avisoEquipoBotones}>
                <button
                  style={styles.avisoEquipoBtnSocio}
                  onClick={() => asignarSocioGerenteDesdeAviso(av.id)}
                >
                  Agregar como Socio Gerente
                </button>
                <button
                  style={styles.avisoEquipoBtnEmpleado}
                  onClick={() => confirmarComoEmpleadoDesdeAviso(av.id)}
                >
                  Agregar como Empleado
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selección de lote: árbol completo para el jefe, lista simple para el empleado */}
      {mostrarEquipo ? (
        <EquipoView
          miembros={usuarios.filter((u) => u.rol !== "jefe" && u.activo !== false)}
          sociosGerentes={usuarios.filter((u) => u.rol === "jefe" && u.activo !== false)}
          esFundador={esFundador}
          currentUserId={currentUser.id}
          invitaciones={invitaciones}
          onGenerarCodigo={generarCodigoInvitacion}
          onVolver={() => setMostrarEquipo(false)}
          onEliminarEmpleado={eliminarEmpleado}
          onCambiarCategoria={cambiarCategoriaMiembro}
          onTransferirFundador={transferirFundador}
          onAscenderSocioGerente={ascenderASocioGerente}
        />
      ) : !lote ? (
        puedeAdministrar ? (
          <ArbolLotesView
            clientes={clientes}
            lotes={lotesConProgreso}
            accesos={accesos}
            miembrosComunidad={usuarios.filter((u) => u.activo !== false)}
            role={role}
            onToggleAcceso={toggleAcceso}
            onAbrirLote={setLote}
            onAgregarCliente={agregarCliente}
            onAgregarEstablecimiento={agregarEstablecimiento}
            onAgregarLote={agregarLote}
            onGenerarGrilla={generarGrillaDesdeKmz}
            onEliminarCliente={eliminarCliente}
            onEliminarEstablecimiento={eliminarEstablecimiento}
            onEliminarLote={eliminarLote}
            onEditarCliente={editarCliente}
            onEditarLote={editarLote}
          />
        ) : (
          <MisLotesView
            lotes={lotesConProgreso.filter(
              (l) => l.tieneGrilla && (accesos[l.id] || []).includes(currentUser.id)
            )}
            onSelect={setLote}
          />
        )
      ) : (
        <>
          <button
            style={{ ...styles.backRow, padding: "2px 16px 12px" }}
            onClick={() => setLote(null)}
          >
            <ChevronLeft size={15} />
            {puedeAdministrar ? " Cliente / establecimiento / lote" : " Mis lotes"}
          </button>

          {role === "jefe" && loteVivo && (
            <div style={styles.campanaRow}>
              <div style={{ position: "relative" }}>
                <button
                  style={styles.campanaPill}
                  onClick={() => setMenuCampanaAbierto((v) => !v)}
                >
                  Campaña {campanaViendo || loteVivo.campanaActual}
                  {!campanaViendo && " (actual)"}
                  <ChevronDown size={12} style={{ marginLeft: 5 }} />
                </button>
                {menuCampanaAbierto && (
                  <div style={styles.campanaMenu}>
                    <button
                      style={styles.campanaMenuItem}
                      onClick={() => {
                        setCampanaViendo(null);
                        setMenuCampanaAbierto(false);
                      }}
                    >
                      Campaña {loteVivo.campanaActual} (actual)
                    </button>
                    {(loteVivo.historialCampanas || [])
                      .slice()
                      .reverse()
                      .map((h) => (
                        <button
                          key={h.campana}
                          style={styles.campanaMenuItem}
                          onClick={() => {
                            setCampanaViendo(h.campana);
                            setMenuCampanaAbierto(false);
                            if (tab === "campo") setTab("densidad");
                          }}
                        >
                          Ver Resultados Campaña {h.campana}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {role === "jefe" && !campanaViendo && loteBloqueadoParaMonitoreador && (
                <button style={styles.restablecerCampanaBtn} onClick={() => setPidiendoRestablecer(true)}>
                  <RotateCcw size={12} style={{ marginRight: 5 }} />
                  Restablecer campaña
                </button>
              )}
            </div>
          )}

          {menuCampanaAbierto && (
            <div style={styles.menuOverlay} onClick={() => setMenuCampanaAbierto(false)} />
          )}

          {campanaViendo && (
            <div style={styles.historialBanner}>
              Estás viendo la campaña {campanaViendo} — solo lectura.
              <button style={styles.historialVolverBtn} onClick={() => setCampanaViendo(null)}>
                Volver a la actual
              </button>
            </div>
          )}

          {/* Tabs — el monitoreador no ve Resultados/Salidas, y Grilla se
              esconde mientras se mira una campaña archivada (solo lectura) */}
          {puedeAdministrar ? (
            <div style={styles.tabs}>
              {!campanaViendo && (
                <button
                  onClick={() => setTab("campo")}
                  style={{ ...styles.tab, ...(tab === "campo" ? styles.tabActive : {}) }}
                >
                  Grilla
                </button>
              )}
              <button
                onClick={() => setTab("densidad")}
                style={{ ...styles.tab, ...(tab === "densidad" ? styles.tabActive : {}) }}
              >
                Resultados
              </button>
              <button
                onClick={() => setTab("salidas")}
                style={{ ...styles.tab, ...(tab === "salidas" ? styles.tabActive : {}) }}
              >
                Salidas
              </button>
            </div>
          ) : null}

          {puedeAdministrar && tab === "campo" && puntosConConflicto.length > 0 && (
            <div style={styles.conflictoBanner}>
              <div style={styles.conflictoBannerTitulo}>
                ⚠️ {puntosConConflicto.length === 1 ? "Se encontró una carga duplicada" : `Se encontraron ${puntosConConflicto.length} cargas duplicadas`}
              </div>
              <div style={styles.conflictoBannerTexto}>
                Dos personas cargaron el mismo punto sin verse entre sí (offline) — elegí con qué
                datos te querés quedar.
              </div>
              <div style={styles.conflictoListaWrap}>
                {puntosConConflicto.map(([pointId]) => (
                  <button
                    key={pointId}
                    style={styles.conflictoResolverBtn}
                    onClick={() => setConflictoAbierto(pointId)}
                  >
                    Resolver punto {pointId}
                  </button>
                ))}
              </div>
            </div>
          )}

          {puedeAdministrar && tab === "campo" && (
            <button style={styles.simularConflictoBtn} onClick={simularCargaDuplicada}>
              🧪 Simular carga duplicada (solo prueba — no existe en la app real)
            </button>
          )}

          {(role === "empleado" || tab === "campo") ? (
            <UbicacionView
              puntos={puntosConDistancia}
              myPos={myPos}
              setMyPos={setMyPos}
              puntoCercano={puntoCercano}
              gpsStatus={gpsStatus}
              onSelect={setActivePoint}
              role={role}
              online={online}
              puntosTotalLote={puntosTotalLote}
              puntosSincronizadosLote={puntosSincronizadosLote}
              faltanSincronizar={faltanSincronizar}
              onToggleOnline={toggleOnline}
              loteCerrado={loteSincronizadoCompleto && puntosCargadosLote >= puntosTotalLote}
              perimetroLote={lote?.perimetro}
              loteId={lote?.id}
              userId={currentUser.id}
            />
          ) : tab === "densidad" ? (
            <DensidadView
              grid={gridParaMostrar}
              maxVal={maxVal}
              plaga={plaga}
              setPlaga={setPlaga}
              loteNombre={lote?.nombre}
              establecimientoNombre={lote?.establecimiento}
              perimetro={lote?.perimetro || PERIMETRO_39HAS}
            />
          ) : (
            <SalidasView
              grid={gridParaMostrar}
              loteNombre={lote?.nombre}
              establecimientoNombre={lote?.establecimiento}
              hectareas={lote?.hectareas}
              perimetro={lote?.perimetro || PERIMETRO_39HAS}
            />
          )}
        </>
      )}

      {activePoint && (
        <PointSheet
          id={activePoint}
          point={grid[activePoint]}
          role={role}
          currentUser={currentUser}
          usuarios={usuarios}
          onClose={() => setActivePoint(null)}
          onSetField={setField}
          onConfirm={confirmarPunto}
          onReopen={reabrirPunto}
          loteBloqueadoParaMonitoreador={loteBloqueadoParaMonitoreador}
        />
      )}

      {conflictoAbierto && grid[conflictoAbierto] && grid[conflictoAbierto].conflictoCon && (
        <ConflictoModal
          pointId={conflictoAbierto}
          actual={grid[conflictoAbierto]}
          alternativa={grid[conflictoAbierto].conflictoCon}
          usuarios={usuarios}
          onElegir={(usarAlternativa) => {
            resolverConflicto(conflictoAbierto, usarAlternativa);
            setConflictoAbierto(null);
          }}
          onCerrar={() => setConflictoAbierto(null)}
        />
      )}

      {pidiendoRestablecer && loteVivo && (
        <div style={styles.confirmOverlay} onClick={() => setPidiendoRestablecer(false)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmBoxTitle}>
              ¿Restablecer "{loteVivo.nombre}" para una nueva campaña?
            </div>
            <div style={styles.confirmBoxText}>
              La campaña {loteVivo.campanaActual} queda archivada tal cual está — vas a poder
              seguir viéndola desde "Campaña {loteVivo.campanaActual}" en cualquier momento. Se
              abre una campaña nueva ({siguienteCampana(loteVivo.campanaActual)}) con la misma
              grilla de puntos, todos en blanco, lista para que el equipo vuelva a trabajar este
              lote — sin tener que subir el KMZ de nuevo.
            </div>
            <div style={styles.confirmBoxRow}>
              <button style={styles.confirmBoxNo} onClick={() => setPidiendoRestablecer(false)}>
                Cancelar
              </button>
              <button
                style={styles.confirmBoxYes}
                onClick={() => {
                  restablecerCampana(loteVivo.id);
                  setPidiendoRestablecer(false);
                }}
              >
                Sí, restablecer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipoView({
  miembros,
  sociosGerentes,
  esFundador,
  currentUserId,
  invitaciones,
  onGenerarCodigo,
  onVolver,
  onEliminarEmpleado,
  onCambiarCategoria,
  onTransferirFundador,
  onAscenderSocioGerente,
}) {
  const [copiado, setCopiado] = useState(false);
  const [codigoVisible, setCodigoVisible] = useState(null); // el código recién generado, o null
  const [borrarArmado, setBorrarArmado] = useState(null); // usuario | null
  const [transferirArmado, setTransferirArmado] = useState(null); // usuario | null
  const [ascenderArmado, setAscenderArmado] = useState(null); // usuario | null
  const [degradarArmado, setDegradarArmado] = useState(null); // usuario | null
  const [menuAbierto, setMenuAbierto] = useState(null); // userId

  function generar() {
    const codigo = onGenerarCodigo();
    setCodigoVisible(codigo);
  }

  function copiarCodigo() {
    if (navigator.clipboard && codigoVisible) {
      navigator.clipboard.writeText(codigoVisible).catch(() => {});
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  function confirmarQuitar() {
    if (borrarArmado) onEliminarEmpleado(borrarArmado.id);
    setBorrarArmado(null);
  }

  function confirmarTransferir() {
    if (transferirArmado) onTransferirFundador(transferirArmado.id);
    setTransferirArmado(null);
  }

  function confirmarAscenso() {
    if (ascenderArmado) onAscenderSocioGerente(ascenderArmado.id);
    setAscenderArmado(null);
  }

  function confirmarDegradar() {
    if (degradarArmado) onCambiarCategoria(degradarArmado.id, "encargado");
    setDegradarArmado(null);
  }

  return (
    <div style={styles.section}>
      <button style={styles.backRow} onClick={onVolver}>
        <ChevronLeft size={15} /> Volver
      </button>

      <div style={styles.salidaCard}>
        <div style={styles.salidaCardTitle}>Invitar a un empleado nuevo</div>
        <div style={styles.salidaHint}>
          Cada código sirve para una sola persona — una vez que lo usa para crear su cuenta,
          queda inválido para siempre. Generá uno nuevo por cada invitación.
        </div>

        {codigoVisible ? (
          <>
            <div style={styles.codigoBox}>
              <span style={styles.codigoTexto}>{codigoVisible}</span>
              <button style={styles.codigoCopyBtn} onClick={copiarCodigo}>
                {copiado ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
            <button style={styles.codigoListoBtn} onClick={() => setCodigoVisible(null)}>
              Listo, ya lo envié
            </button>
          </>
        ) : (
          <button style={styles.codigoGenerarBtn} onClick={generar}>
            <Plus size={14} style={{ marginRight: 5 }} />
            Generar código de invitación
          </button>
        )}
      </div>

      {esFundador && (
        <>
          <div style={styles.sectionLabel}>Socios Gerentes ({sociosGerentes.length})</div>
          <div style={styles.salidaHint}>
            Como Socio Fundador de la comunidad, sos el único que puede sacar a un Socio
            Gerente, degradarlo a Encargado, o pasarle el rol de Socio Fundador a otro.
          </div>
          <div style={{ ...styles.loteListWrap, marginBottom: 22 }}>
            {sociosGerentes.map((u) => {
              const soyYo = u.id === currentUserId;
              return (
                <div key={u.id} style={{ ...styles.equipoRow, position: "relative" }}>
                  <span
                    style={{ ...styles.loginAvatar, background: u.color, width: 32, height: 32, fontSize: 13 }}
                  >
                    {u.nombre.charAt(0)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={styles.loginNombre}>{u.nombre}</div>
                    <span style={{ ...styles.loginRolChip, color: "#155C35", borderColor: "#155C35" }}>
                      {u.esFundador ? "Socio Fundador" : "Socio Gerente"}
                    </span>
                  </div>
                  {!soyYo && !u.esFundador && (
                    <div style={styles.menuWrap}>
                      <button
                        style={styles.plusBtnSmall}
                        onClick={() => setMenuAbierto((m) => (m === u.id ? null : u.id))}
                        title="Opciones"
                      >
                        <Plus size={13} />
                      </button>
                      {menuAbierto === u.id && (
                        <div style={styles.menuDropdown}>
                          <button
                            style={styles.menuItem}
                            onClick={() => {
                              setTransferirArmado(u);
                              setMenuAbierto(null);
                            }}
                          >
                            Hacer Socio Fundador de la comunidad
                          </button>
                          <button
                            style={styles.menuItem}
                            onClick={() => {
                              setDegradarArmado(u);
                              setMenuAbierto(null);
                            }}
                          >
                            Degradar a Encargado
                          </button>
                          <button
                            style={styles.menuItemDanger}
                            onClick={() => {
                              setBorrarArmado(u);
                              setMenuAbierto(null);
                            }}
                          >
                            Sacar del equipo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={styles.sectionLabel}>Tu equipo ({miembros.length})</div>
      <div style={styles.loteListWrap}>
        {miembros.map((u) => {
          const esEncargado = u.rol === "encargado";
          return (
            <div key={u.id} style={{ ...styles.equipoRow, position: "relative" }}>
              <span style={{ ...styles.loginAvatar, background: u.color, width: 32, height: 32, fontSize: 13 }}>
                {u.nombre.charAt(0)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={styles.loginNombre}>{u.nombre}</div>
                <span
                  style={{
                    ...styles.loginRolChip,
                    color: esEncargado ? "#155C35" : "#A9752E",
                    borderColor: esEncargado ? "#155C35" : "#A9752E",
                  }}
                >
                  {esEncargado ? "Encargado" : "Monitoreador"}
                </span>
              </div>
              <div style={styles.menuWrap}>
                <button
                  style={styles.plusBtnSmall}
                  onClick={() => setMenuAbierto((m) => (m === u.id ? null : u.id))}
                  title="Opciones"
                >
                  <Plus size={13} />
                </button>
                {menuAbierto === u.id && (
                  <div style={styles.menuDropdown}>
                    <button
                      style={styles.menuItem}
                      onClick={() => {
                        onCambiarCategoria(u.id, esEncargado ? "empleado" : "encargado");
                        setMenuAbierto(null);
                      }}
                    >
                      {esEncargado ? "Cambiar a Monitoreador" : "Cambiar a Encargado"}
                    </button>
                    {esFundador && esEncargado && (
                      <button
                        style={styles.menuItem}
                        onClick={() => {
                          setAscenderArmado(u);
                          setMenuAbierto(null);
                        }}
                      >
                        Ascender a Socio Gerente
                      </button>
                    )}
                    <button
                      style={styles.menuItemDanger}
                      onClick={() => {
                        setBorrarArmado(u);
                        setMenuAbierto(null);
                      }}
                    >
                      Sacar del equipo
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {menuAbierto && <div style={styles.menuOverlay} onClick={() => setMenuAbierto(null)} />}

      {transferirArmado && (
        <div style={styles.confirmOverlay} onClick={() => setTransferirArmado(null)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmBoxTitle}>
              ¿Pasarle el rol de Socio Fundador a "{transferirArmado.nombre}"?
            </div>
            <div style={styles.confirmBoxText}>
              A partir de ahora, {transferirArmado.nombre} va a ser el único con la
              capacidad de sacar o corregir a otros Socios Gerentes — y vos vas a pasar a
              ser un Socio Gerente común, sin esa capacidad, a menos que te la devuelva.
              Esta acción es grave y no se puede deshacer desde acá.
            </div>
            <div style={styles.confirmBoxRow}>
              <button style={styles.confirmBoxNo} onClick={() => setTransferirArmado(null)}>
                Cancelar
              </button>
              <button style={styles.confirmBoxYes} onClick={confirmarTransferir}>
                Sí, transferir
              </button>
            </div>
          </div>
        </div>
      )}

      {ascenderArmado && (
        <div style={styles.confirmOverlay} onClick={() => setAscenderArmado(null)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmBoxTitle}>
              ¿Ascender a "{ascenderArmado.nombre}" a Socio Gerente?
            </div>
            <div style={styles.confirmBoxText}>
              Va a tener acceso total a la comunidad, igual que vos, incluyendo "Mi equipo".
              Después vas a poder degradarlo o sacarlo del equipo si hace falta.
            </div>
            <div style={styles.confirmBoxRow}>
              <button style={styles.confirmBoxNo} onClick={() => setAscenderArmado(null)}>
                Cancelar
              </button>
              <button style={styles.confirmBoxYes} onClick={confirmarAscenso}>
                Sí, ascender
              </button>
            </div>
          </div>
        </div>
      )}

      {degradarArmado && (
        <div style={styles.confirmOverlay} onClick={() => setDegradarArmado(null)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmBoxTitle}>
              ¿Degradar a "{degradarArmado.nombre}" a Encargado?
            </div>
            <div style={styles.confirmBoxText}>
              Deja de ser Socio Gerente y de ver "Mi equipo" — pero conserva acceso a todos
              los clientes, establecimientos y lotes, igual que un Encargado.
            </div>
            <div style={styles.confirmBoxRow}>
              <button style={styles.confirmBoxNo} onClick={() => setDegradarArmado(null)}>
                Cancelar
              </button>
              <button style={styles.confirmBoxYes} onClick={confirmarDegradar}>
                Sí, degradar
              </button>
            </div>
          </div>
        </div>
      )}

      {borrarArmado && (
        <div style={styles.confirmOverlay} onClick={() => setBorrarArmado(null)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmBoxTitle}>¿Sacar a "{borrarArmado.nombre}" del equipo?</div>
            <div style={styles.confirmBoxText}>
              {borrarArmado.rol === "jefe"
                ? "Pierde por completo el acceso a la comunidad — sigue teniendo la app instalada, pero ya no ve nada de acá."
                : "Pierde el acceso a todos los lotes que tuviera."}
            </div>
            <div style={styles.confirmBoxRow}>
              <button style={styles.confirmBoxNo} onClick={() => setBorrarArmado(null)}>
                Cancelar
              </button>
              <button style={styles.confirmBoxYes} onClick={confirmarQuitar}>
                Sí, sacarlo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Logo de la empresa (ZOOM Agricultura), redibujado como SVG a partir del isologo real ----
const LOGO_VERDE = "#344D40";
const LOGO_CREMA = "#DAD8CC";
const LOGO_NARANJA = "#DB945D";

function ZoomLogoIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <circle cx="50" cy="50" r="26.5" stroke={color} strokeWidth="11" fill="none" />
      <line x1="50" y1="23.5" x2="50" y2="6" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <line x1="50" y1="76.5" x2="50" y2="94" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <line x1="23.5" y1="50" x2="6" y2="50" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <line x1="76.5" y1="50" x2="94" y2="50" stroke={color} strokeWidth="11" strokeLinecap="round" />
      {/* arco superior derecho */}
      <path
        d="M 61.74 13.86 L 64.44 14.85 L 67.05 16.04 L 69.57 17.43 L 71.98 19.00 L 74.26 20.75 L 76.40 22.67 L 78.39 24.74 L 80.21 26.95 L 81.87 29.30 L 83.34 31.77 L 84.62 34.34 L 85.71 37.00"
        stroke={LOGO_NARANJA}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* arco superior izquierdo */}
      <path
        d="M 15.02 35.15 L 16.19 32.65 L 17.54 30.24 L 19.06 27.93 L 20.75 25.74 L 22.59 23.68 L 24.57 21.76 L 26.69 19.99 L 28.93 18.37 L 31.29 16.93 L 33.74 15.65 L 36.28 14.56 L 38.89 13.66"
        stroke={LOGO_NARANJA}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* arco inferior izquierdo */}
      <path
        d="M 29.30 81.87 L 27.26 80.45 L 25.32 78.90 L 23.48 77.22 L 21.76 75.43 L 20.16 73.53 L 18.68 71.52 L 17.34 69.43 L 16.14 67.25 L 15.09 65.00 L 14.18 62.68 L 13.43 60.31 L 12.83 57.90"
        stroke={LOGO_NARANJA}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ZoomLogo({ variant = "dark", iconSize = 24, wordSize = 17, showSub = true }) {
  const color = variant === "light" ? LOGO_CREMA : LOGO_VERDE;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.max(6, iconSize * 0.22) }}>
      <ZoomLogoIcon color={color} size={iconSize} />
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch" }}>
        <div
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 900,
            fontSize: wordSize,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            whiteSpace: "nowrap",
            textAlign: "center",
            color,
          }}
        >
          ZOOM
        </div>
        {showSub && (
          <div
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 600,
              fontSize: Math.max(7, wordSize * 0.24),
              letterSpacing: "0.05em",
              textAlign: "center",
              marginTop: Math.max(0, wordSize * 0.02),
              color,
            }}
          >
            AGRICULTURA
          </div>
        )}
      </div>
    </div>
  );
}

function etiquetaRol(rol, esFundador) {
  if (rol === "jefe") return esFundador ? "Socio Fundador" : "Socio Gerente";
  if (rol === "encargado") return "Encargado";
  return "Monitoreador";
}

function capitalizarPalabras(s) {
  return s
    .toLowerCase()
    .split(" ")
    .map((palabra) => (palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra))
    .join(" ");
}

function LoginView({ usuarios, onLogin, onUnirse }) {
  const [modo, setModo] = useState("login"); // login | demo | unirse
  const [mailLogin, setMailLogin] = useState("");
  const [passLogin, setPassLogin] = useState("");
  const [mostrarInfoOlvido, setMostrarInfoOlvido] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [apellidoNuevo, setApellidoNuevo] = useState("");
  const [mailNuevo, setMailNuevo] = useState("");
  const [codigoIngresado, setCodigoIngresado] = useState("");
  const [error, setError] = useState("");

  function intentarUnirse() {
    if (!nombreNuevo.trim() || !apellidoNuevo.trim() || !mailNuevo.trim() || !codigoIngresado.trim()) {
      setError("Completá tu nombre, apellido, mail y el código.");
      return;
    }
    const nombreCompleto = `${nombreNuevo.trim()} ${apellidoNuevo.trim()}`;
    const resultado = onUnirse(nombreCompleto, mailNuevo, codigoIngresado);
    if (!resultado.ok) {
      if (resultado.motivo === "mail_en_uso") {
        setError("Ese mail ya tiene una cuenta activa en esta comunidad.");
      } else {
        setError("Ese código no es válido — pedile el código correcto a tu Socio Gerente.");
      }
    }
  }

  const titulos = {
    login: "Iniciar sesión",
    demo: "Modo prueba — elegí un usuario",
    unirse: "Unirme al equipo",
  };

  return (
    <div style={styles.loginWrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Expanded:wght@600;800&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600;700&family=Poppins:wght@600;900&display=swap');
      `}</style>

      <div style={styles.loginHero}>
        <Target size={190} color="#FFFFFF" strokeWidth={1} style={styles.loginHeroWatermark} />
        <div style={styles.loginLogoRow}>
          <ZoomLogo variant="light" iconSize={44} wordSize={32} />
        </div>
        <div style={styles.loginEyebrow}>MONITOREO DE PLAGAS</div>
        <div style={styles.loginTitle}>{titulos[modo]}</div>
      </div>

      <div style={styles.loginBody}>
      {modo === "unirse" ? (
        <div style={styles.loginJoinForm}>
          <input
            autoFocus
            style={styles.inlineInput}
            placeholder="Nombre/s"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(capitalizarPalabras(e.target.value))}
          />
          <input
            style={styles.inlineInput}
            placeholder="Apellido/s"
            value={apellidoNuevo}
            onChange={(e) => setApellidoNuevo(capitalizarPalabras(e.target.value))}
          />
          <input
            style={styles.inlineInput}
            placeholder="Mail"
            type="email"
            value={mailNuevo}
            onChange={(e) => setMailNuevo(e.target.value)}
          />
          <input
            style={styles.inlineInput}
            placeholder="Código de invitación (ej. EQUIPO-A1B2C3)"
            value={codigoIngresado}
            onChange={(e) => setCodigoIngresado(e.target.value)}
          />
          {error && <div style={styles.loginError}>{error}</div>}
          <button style={styles.inlineConfirmBtn} onClick={intentarUnirse}>
            Unirme
          </button>
          <button
            style={styles.loginBackLink}
            onClick={() => {
              setModo("login");
              setError("");
            }}
          >
            ← Volver
          </button>
        </div>
      ) : modo === "demo" ? (
        <>
          <div style={styles.loginDemoAviso}>
            Esto es solo para probar la app con distintos roles — en la versión real no existe,
            ahí siempre se entra con mail y contraseña.
          </div>
          <div style={styles.loginList}>
            {usuarios.map((u) => (
              <button key={u.id} style={styles.loginCard} onClick={() => onLogin(u)}>
                <span style={{ ...styles.loginCardStripe, background: u.color }} />
                <span style={{ ...styles.loginAvatar, background: u.color }}>
                  {u.nombre.charAt(0)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={styles.loginNombre}>{u.nombre}</div>
                  <span
                    style={{
                      ...styles.loginRolChip,
                      color: u.color,
                      borderColor: u.color,
                    }}
                  >
                    {etiquetaRol(u.rol, u.esFundador)}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <button
            style={styles.loginLimpiarBtn}
            onClick={() => {
              try {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith("miRuta"))
                  .forEach((k) => localStorage.removeItem(k));
              } catch {}
              window.location.reload();
            }}
          >
            <Trash2 size={12} style={{ marginRight: 5 }} />
            Borrar todos los recorridos guardados en este celular
          </button>
          <button style={styles.loginBackLink} onClick={() => setModo("login")}>
            ← Volver al login
          </button>
        </>
      ) : (
        <>
          <div style={styles.loginJoinForm}>
            <input
              autoFocus
              style={styles.inlineInput}
              placeholder="Mail"
              type="email"
              value={mailLogin}
              onChange={(e) => setMailLogin(e.target.value)}
            />
            <input
              style={styles.inlineInput}
              placeholder="Contraseña"
              type="password"
              value={passLogin}
              onChange={(e) => setPassLogin(e.target.value)}
            />
            <button style={styles.inlineConfirmBtn} onClick={() => setModo("demo")}>
              Ingresar
            </button>
            <button style={styles.loginBackLink} onClick={() => setMostrarInfoOlvido((v) => !v)}>
              ¿Olvidaste tu contraseña?
            </button>
            {mostrarInfoOlvido && (
              <div style={styles.loginInfoOlvido}>
                En la app real, acá pondrías tu mail y te llegaría un link para crear una
                contraseña nueva — nunca se reenvía la vieja.
              </div>
            )}
          </div>
          <button style={styles.loginJoinBtn} onClick={() => setModo("unirse")}>
            ¿Sos nuevo? Unirte con un código de invitación
          </button>
          <button style={styles.loginDemoLink} onClick={() => setModo("demo")}>
            🔧 Modo prueba — elegir un usuario para probar la app
          </button>
        </>
      )}

      <div style={styles.loginFootnote}>
        {modo === "login"
          ? "Este prototipo no tiene un servidor real detrás, así que no valida mail y contraseña de verdad — usá \"Modo prueba\" para entrar."
          : "En la app real, esto se resuelve con un login de mail y contraseña como corresponde."}
      </div>
      </div>
    </div>
  );
}

function MisLotesView({ lotes, onSelect }) {
  return (
    <div style={styles.section}>
      {lotes.length > 0 && (
        <div style={styles.avisoOfflineGeneral}>
          <Navigation size={16} style={{ marginRight: 8, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={styles.avisoOfflineGeneralTitulo}>Preparate para mañana</div>
            <div style={styles.avisoOfflineGeneralTexto}>
              Tocá cada lote de la lista y usá "Cómo llegar" mientras tengas señal — así podés
              descargar esa zona en Google Maps ("Mapas sin conexión") y tener la ruta lista aunque
              después te quedes sin señal en el campo.
            </div>
          </div>
        </div>
      )}
      <div style={styles.sectionLabel}>
        Lotes asignados — tocá uno para empezar
      </div>
      {lotes.length === 0 ? (
        <div style={styles.emptyState}>No tenés lotes asignados por ahora.</div>
      ) : (
        <div style={styles.loteListWrap}>
          {lotes.map((l) => {
            const completo = l.puntosCompletados >= l.puntosTotal;
            const faltanSinc =
              l.puntosCompletados === 0 ? l.puntosTotal : l.puntosCompletados - l.puntosSincronizados;
            return (
              <div key={l.id} style={styles.loteCard}>
                <button style={styles.loteCardMain} onClick={() => onSelect(l)}>
                  <div>
                    <div style={styles.loteCardEst}>{l.establecimiento}</div>
                    <div style={styles.loteCardNombreEmpleado}>{l.nombre}</div>
                    <div style={styles.loteCardCultivo}>{l.cultivo}</div>
                  </div>
                </button>
                <div style={styles.loteChecksRow}>
                  <div
                    style={{
                      ...styles.loteCheckPill,
                      ...(completo ? styles.loteCheckPillOk : styles.loteCheckPillRojo),
                    }}
                  >
                    {completo ? <Check size={12} /> : <span style={styles.loteCheckDot} />}
                    {l.puntosCompletados}/{l.puntosTotal} completados
                  </div>
                  <div
                    style={{
                      ...styles.loteCheckPill,
                      ...(faltanSinc > 0 ? styles.loteCheckPillRojo : styles.loteCheckPillOk),
                    }}
                  >
                    {faltanSinc > 0 ? <span style={styles.loteCheckDot} /> : <Check size={12} />}
                    {l.puntosSincronizados}/{l.puntosTotal} sincronizados
                  </div>
                  {l.perimetro && (
                    <a
                      href={urlComoLlegar(l.perimetro)}
                      target="_blank"
                      rel="noopener"
                      style={styles.comoLlegarBtn}
                    >
                      <Navigation size={12} style={{ marginRight: 5 }} />
                      Cómo llegar
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ArbolLotesView({
  clientes,
  lotes,
  accesos,
  miembrosComunidad,
  role,
  onToggleAcceso,
  onAbrirLote,
  onAgregarCliente,
  onAgregarEstablecimiento,
  onAgregarLote,
  onGenerarGrilla,
  onEliminarCliente,
  onEliminarEstablecimiento,
  onEliminarLote,
  onEditarCliente,
  onEditarLote,
}) {
  const puedeEliminar = role === "jefe"; // Encargado puede crear pero no eliminar
  const [expandidos, setExpandidos] = useState(() => new Set()); // arranca todo plegado
  // acordeón: solo un establecimiento abierto por cliente a la vez — arranca todo plegado
  const [estAbiertoPorCliente, setEstAbiertoPorCliente] = useState({});
  const [accesoAbierto, setAccesoAbierto] = useState(null); // id de lote con el panel de acceso abierto
  const [infoAbierto, setInfoAbierto] = useState(null); // id de lote con el desglose "Info" abierto
  const [formClienteAbierto, setFormClienteAbierto] = useState(false);
  const [nombreClienteNuevo, setNombreClienteNuevo] = useState("");
  const [formEstPara, setFormEstPara] = useState(null); // clienteId
  const [nombreEstNuevo, setNombreEstNuevo] = useState("");
  const [formLotePara, setFormLotePara] = useState(null); // { clienteId, establecimientoId }
  const [loteNuevoNombre, setLoteNuevoNombre] = useState("");
  const [loteNuevoCultivo, setLoteNuevoCultivo] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(null); // { tipo: 'cliente'|'establecimiento'|'lote', id }
  const [editandoClienteId, setEditandoClienteId] = useState(null);
  const [nombreClienteEditado, setNombreClienteEditado] = useState("");
  const [editandoLoteId, setEditandoLoteId] = useState(null);
  const [nombreLoteEditado, setNombreLoteEditado] = useState("");

  function ordenar(arr) {
    return [...arr].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  function toggleMenu(tipo, id) {
    setMenuAbierto((m) => (m && m.tipo === tipo && m.id === id ? null : { tipo, id }));
  }

  function iniciarEditarCliente(c) {
    setEditandoClienteId(c.id);
    setNombreClienteEditado(c.nombre);
    setMenuAbierto(null);
  }
  function confirmarEditarCliente() {
    if (nombreClienteEditado.trim()) onEditarCliente(editandoClienteId, nombreClienteEditado.trim());
    setEditandoClienteId(null);
  }
  function cancelarEditarCliente() {
    setEditandoClienteId(null);
  }

  function iniciarEditarLote(l) {
    setEditandoLoteId(l.id);
    setNombreLoteEditado(l.nombre);
  }
  function confirmarEditarLote() {
    if (nombreLoteEditado.trim()) onEditarLote(editandoLoteId, nombreLoteEditado.trim());
    setEditandoLoteId(null);
  }
  function cancelarEditarLote() {
    setEditandoLoteId(null);
  }

  function toggleExpand(id) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleEstablecimiento(clienteId, establecimientoId) {
    setEstAbiertoPorCliente((prev) => ({
      ...prev,
      [clienteId]: prev[clienteId] === establecimientoId ? null : establecimientoId,
    }));
  }

  function loteById(id) {
    return lotes.find((l) => l.id === id);
  }

  function confirmarCliente() {
    if (!nombreClienteNuevo.trim()) return;
    onAgregarCliente(nombreClienteNuevo.trim());
    setNombreClienteNuevo("");
    setFormClienteAbierto(false);
  }

  function confirmarEstablecimiento(clienteId) {
    if (!nombreEstNuevo.trim()) return;
    const nuevoEstId = onAgregarEstablecimiento(clienteId, nombreEstNuevo.trim());
    setExpandidos((prev) => new Set(prev).add(clienteId));
    setEstAbiertoPorCliente((prev) => ({ ...prev, [clienteId]: nuevoEstId }));
    setNombreEstNuevo("");
    setFormEstPara(null);
  }

  function confirmarLote(clienteId, establecimientoId) {
    if (!loteNuevoNombre.trim()) return;
    const nuevoId = onAgregarLote(clienteId, establecimientoId, {
      nombre: loteNuevoNombre.trim(),
      cultivo: loteNuevoCultivo.trim() || "Sin especificar",
    });
    setLoteNuevoNombre("");
    setLoteNuevoCultivo("");
    setFormLotePara(null);
    setAccesoAbierto(null);
  }

  function cancelarFormCliente() {
    setNombreClienteNuevo("");
    setFormClienteAbierto(false);
  }
  function cancelarFormEst() {
    setNombreEstNuevo("");
    setFormEstPara(null);
  }
  function cancelarFormLote() {
    setLoteNuevoNombre("");
    setLoteNuevoCultivo("");
    setFormLotePara(null);
  }

  // Confirmación propia (sin window.confirm — bloqueado en algunos entornos
  // de vista previa, incluido este chat). Un primer toque "arma" el borrado
  // mostrando Sí/No; el segundo toque en "Sí" lo ejecuta de verdad.
  const [borrarArmado, setBorrarArmado] = useState(null); // { tipo, ids }

  function pedirBorrarCliente(c) {
    setBorrarArmado({ tipo: "cliente", nombre: c.nombre, ids: { clienteId: c.id } });
  }
  function pedirBorrarEstablecimiento(clienteId, e) {
    setBorrarArmado({ tipo: "establecimiento", nombre: e.nombre, ids: { clienteId, establecimientoId: e.id } });
  }
  function pedirBorrarLote(clienteId, establecimientoId, l) {
    setBorrarArmado({ tipo: "lote", nombre: l.nombre, ids: { clienteId, establecimientoId, loteId: l.id } });
  }
  function confirmarBorrado() {
    if (!borrarArmado) return;
    const { tipo, ids } = borrarArmado;
    if (tipo === "cliente") onEliminarCliente(ids.clienteId);
    if (tipo === "establecimiento") onEliminarEstablecimiento(ids.clienteId, ids.establecimientoId);
    if (tipo === "lote") onEliminarLote(ids.clienteId, ids.establecimientoId, ids.loteId);
    setBorrarArmado(null);
  }
  function cancelarBorrado() {
    setBorrarArmado(null);
  }

  return (
    <div style={styles.section}>
      <div style={styles.arbolWrap}>
        {ordenar(clientes).map((c) => (
          <div key={c.id} style={styles.arbolCliente}>
            <div style={styles.arbolClienteRow}>
              <button style={styles.arbolClienteHeader} onClick={() => toggleExpand(c.id)}>
                <ChevronDown
                  size={14}
                  style={{
                    transform: expandidos.has(c.id) ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 0.15s",
                  }}
                />
                <span style={styles.arbolClienteNombre}>{c.nombre}</span>
              </button>
              <div style={styles.menuWrap}>
                <button style={styles.plusBtn} onClick={() => toggleMenu("cliente", c.id)} title="Opciones">
                  <Plus size={13} />
                </button>
                {menuAbierto && menuAbierto.tipo === "cliente" && menuAbierto.id === c.id && (
                  <div style={styles.menuDropdown}>
                    <button
                      style={styles.menuItem}
                      onClick={() => {
                        setFormEstPara(c.id);
                        setExpandidos((prev) => new Set(prev).add(c.id));
                        setMenuAbierto(null);
                      }}
                    >
                      Agregar establecimiento
                    </button>
                    <button style={styles.menuItem} onClick={() => iniciarEditarCliente(c)}>
                      Editar cliente
                    </button>
                    {puedeEliminar && (
                      <button
                        style={styles.menuItemDanger}
                        onClick={() => {
                          pedirBorrarCliente(c);
                          setMenuAbierto(null);
                        }}
                      >
                        Eliminar cliente
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {editandoClienteId === c.id && (
              <div style={styles.inlineForm}>
                <input
                  autoFocus
                  style={styles.inlineInput}
                  value={nombreClienteEditado}
                  onChange={(e) => setNombreClienteEditado(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmarEditarCliente()}
                />
                <button style={styles.inlineConfirmBtn} onClick={confirmarEditarCliente}>
                  Guardar
                </button>
                <button style={styles.inlineCancelBtn} onClick={cancelarEditarCliente}>
                  Cancelar
                </button>
              </div>
            )}

            {formEstPara === c.id && (
              <div style={styles.inlineForm}>
                <input
                  autoFocus
                  style={styles.inlineInput}
                  placeholder="Nombre del establecimiento"
                  value={nombreEstNuevo}
                  onChange={(e) => setNombreEstNuevo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmarEstablecimiento(c.id)}
                />
                <button style={styles.inlineConfirmBtn} onClick={() => confirmarEstablecimiento(c.id)}>
                  Agregar
                </button>
                <button style={styles.inlineCancelBtn} onClick={cancelarFormEst}>
                  Cancelar
                </button>
              </div>
            )}


            {expandidos.has(c.id) &&
              ordenar(c.establecimientos).map((e) => {
                const estAbierto = estAbiertoPorCliente[c.id] === e.id;
                return (
                <div key={e.id} style={styles.arbolEstablecimiento}>
                  <div style={styles.arbolEstablecimientoRow}>
                    <button
                      style={styles.arbolEstablecimientoHeader}
                      onClick={() => toggleEstablecimiento(c.id, e.id)}
                    >
                      <ChevronDown
                        size={12}
                        style={{
                          transform: estAbierto ? "rotate(0deg)" : "rotate(-90deg)",
                          transition: "transform 0.15s",
                        }}
                      />
                      <span style={styles.arbolEstablecimientoNombre}>{e.nombre}</span>
                    </button>
                    <div style={styles.menuWrap}>
                      <button
                        style={styles.plusBtnSmall}
                        onClick={() => toggleMenu("establecimiento", e.id)}
                        title="Opciones"
                      >
                        <Plus size={13} />
                      </button>
                      {menuAbierto && menuAbierto.tipo === "establecimiento" && menuAbierto.id === e.id && (
                        <div style={styles.menuDropdown}>
                          <button
                            style={styles.menuItem}
                            onClick={() => {
                              setFormLotePara({ clienteId: c.id, establecimientoId: e.id });
                              setEstAbiertoPorCliente((prev) => ({ ...prev, [c.id]: e.id }));
                              setMenuAbierto(null);
                            }}
                          >
                            Agregar lote
                          </button>
                          {puedeEliminar && (
                            <button
                              style={styles.menuItemDanger}
                              onClick={() => {
                                pedirBorrarEstablecimiento(c.id, e);
                                setMenuAbierto(null);
                              }}
                            >
                              Eliminar establecimiento
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {estAbierto && (
                    <>
                      {formLotePara && formLotePara.establecimientoId === e.id && (
                        <div style={styles.inlineFormCol}>
                          <input
                            autoFocus
                            style={styles.inlineInput}
                            placeholder="Nombre del lote (ej. Lote 8)"
                            value={loteNuevoNombre}
                            onChange={(ev) => setLoteNuevoNombre(ev.target.value)}
                          />
                          <input
                            style={styles.inlineInput}
                            placeholder="Cultivo"
                            value={loteNuevoCultivo}
                            onChange={(ev) => setLoteNuevoCultivo(ev.target.value)}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              style={styles.inlineConfirmBtn}
                              onClick={() => confirmarLote(c.id, e.id)}
                            >
                              Crear lote
                            </button>
                            <button style={styles.inlineCancelBtn} onClick={cancelarFormLote}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}


                      <div style={styles.loteListWrap}>
                        {ordenar(e.loteIds.map(loteById).filter(Boolean)).map((l) => {
                          const loteId = l.id;

                          if (!l.tieneGrilla) {
                            return (
                              <KmzUploadCard
                                key={loteId}
                                lote={l}
                                onGenerarGrilla={onGenerarGrilla}
                                onEliminar={puedeEliminar ? () => pedirBorrarLote(c.id, e.id, l) : null}
                                onEditar={(nuevoNombre) => onEditarLote(loteId, nuevoNombre)}
                              />
                            );
                          }

                      const conAcceso = accesos[loteId] || [];
                      const panelAbierto = accesoAbierto === loteId;
                      const completo = l.puntosCompletados >= l.puntosTotal;
                      const faltanSincLote =
                        l.puntosCompletados === 0 ? l.puntosTotal : l.puntosCompletados - l.puntosSincronizados;
                      return (
                        <div key={loteId} style={styles.loteCard}>
                          {editandoLoteId === loteId ? (
                            <div style={styles.inlineFormLotePadded}>
                              <input
                                autoFocus
                                style={styles.inlineInput}
                                value={nombreLoteEditado}
                                onChange={(ev) => setNombreLoteEditado(ev.target.value)}
                                onKeyDown={(ev) => ev.key === "Enter" && confirmarEditarLote()}
                              />
                              <button style={styles.inlineConfirmBtn} onClick={confirmarEditarLote}>
                                Guardar
                              </button>
                              <button style={styles.inlineCancelBtn} onClick={cancelarEditarLote}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                          <div style={styles.loteCardTopRow}>
                            <button
                              style={styles.loteCardMain}
                              onClick={() => onAbrirLote(l)}
                            >
                              <div>
                                <div style={styles.loteCardNombre}>{l.nombre}</div>
                                <div style={styles.loteCardCultivo}>
                                  {l.cultivo} · {l.hectareas} ha
                                </div>
                              </div>
                            </button>
                          <button
                            style={styles.editLoteBtn}
                            onClick={() => iniciarEditarLote(l)}
                            title="Editar nombre"
                          >
                            <Pencil size={13} />
                          </button>
                          {puedeEliminar && (
                            <button
                              style={styles.trashLoteBtn}
                              onClick={() => pedirBorrarLote(c.id, e.id, l)}
                              title="Eliminar lote"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          </div>
                          )}

                          <div style={styles.loteChecksRow}>
                            <div
                              style={{
                                ...styles.loteCheckPill,
                                ...(completo ? styles.loteCheckPillOk : styles.loteCheckPillRojo),
                              }}
                            >
                              {completo ? <Check size={12} /> : <span style={styles.loteCheckDot} />}
                              {l.puntosCompletados}/{l.puntosTotal} completados
                            </div>
                            <div
                              style={{
                                ...styles.loteCheckPill,
                                ...(faltanSincLote > 0 ? styles.loteCheckPillRojo : styles.loteCheckPillOk),
                              }}
                            >
                              {faltanSincLote > 0 ? <span style={styles.loteCheckDot} /> : <Check size={12} />}
                              {l.puntosSincronizados}/{l.puntosTotal} sincronizados
                            </div>
                            <button
                              style={styles.loteCheckPillInfo}
                              onClick={() => setInfoAbierto((v) => (v === loteId ? null : loteId))}
                            >
                              Info
                              <ChevronDown
                                size={12}
                                style={{
                                  marginLeft: 3,
                                  transform: infoAbierto === loteId ? "rotate(180deg)" : "none",
                                }}
                              />
                            </button>
                            {l.perimetro && (
                              <a
                                href={urlComoLlegar(l.perimetro)}
                                target="_blank"
                                rel="noopener"
                                style={styles.loteCheckPillInfo}
                              >
                                <Navigation size={12} style={{ marginRight: 4 }} />
                                Cómo llegar
                              </a>
                            )}
                          </div>

                          {infoAbierto === loteId && (
                            <div style={styles.infoDesgloseBox}>
                              <div style={styles.infoDesgloseTitulo}>
                                Quién hizo qué — {l.puntosCompletados}/{l.puntosTotal} puntos en total
                              </div>
                              {(accesos[loteId] || []).length === 0 ? (
                                <div style={styles.infoDesgloseVacio}>
                                  Todavía no le diste acceso a este lote a nadie.
                                </div>
                              ) : (
                                (accesos[loteId] || [])
                                  .map((userId) => {
                                    const persona = miembrosComunidad.find((u) => u.id === userId);
                                    const cantidad = l.desglosePorPersona?.[userId] || 0;
                                    return { persona, cantidad };
                                  })
                                  .filter((x) => x.persona)
                                  .sort((a, b) => b.cantidad - a.cantidad)
                                  .map(({ persona, cantidad }) => (
                                    <div key={persona.id} style={styles.infoDesgloseFila}>
                                      <span style={{ ...styles.infoDesgloseAvatar, background: persona.color }}>
                                        {persona.nombre.charAt(0)}
                                      </span>
                                      <span style={styles.infoDesgloseNombre}>{persona.nombre}</span>
                                      <span style={styles.infoDesgloseCantidad}>{cantidad} puntos</span>
                                    </div>
                                  ))
                              )}
                            </div>
                          )}

                          <button
                            style={styles.accesoToggleRow}
                            onClick={() =>
                              setAccesoAbierto(panelAbierto ? null : loteId)
                            }
                          >
                            <Users size={13} style={{ marginRight: 6 }} />
                            {conAcceso.length === 0
                              ? "Sin acceso asignado"
                              : `${conAcceso.length} con acceso`}
                            <ChevronDown
                              size={13}
                              style={{
                                marginLeft: "auto",
                                transform: panelAbierto ? "rotate(180deg)" : "rotate(0deg)",
                              }}
                            />
                          </button>

                          {panelAbierto && (
                            <div style={styles.accesoDropdown}>
                              {miembrosComunidad.map((u) => {
                                const tiene = conAcceso.includes(u.id);
                                return (
                                  <button
                                    key={u.id}
                                    onClick={() => onToggleAcceso(loteId, u.id)}
                                    style={styles.accesoDropdownRow}
                                  >
                                    <span
                                      style={{
                                        ...styles.accesoCheckbox,
                                        ...(tiene
                                          ? { background: u.color, borderColor: u.color }
                                          : { borderColor: "#D9C078" }),
                                      }}
                                    >
                                      {tiene && <Check size={11} color="#FFFFFF" />}
                                    </span>
                                    <span style={styles.accesoDropdownNombre}>{u.nombre}</span>
                                    <span style={styles.accesoDropdownRol}>{etiquetaRol(u.rol, u.esFundador)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                        })}
                      </div>
                    </>
                  )}
                </div>
                );
              })}
          </div>
        ))}

        {formClienteAbierto ? (
          <div style={{ ...styles.inlineForm, marginTop: 28 }}>
            <input
              autoFocus
              style={styles.inlineInput}
              placeholder="Nombre del cliente"
              value={nombreClienteNuevo}
              onChange={(e) => setNombreClienteNuevo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmarCliente()}
            />
            <button style={styles.inlineConfirmBtn} onClick={confirmarCliente}>
              Agregar
            </button>
            <button style={styles.inlineCancelBtn} onClick={cancelarFormCliente}>
              Cancelar
            </button>
          </div>
        ) : (
          <button style={styles.addClienteBtn} onClick={() => setFormClienteAbierto(true)}>
            <Plus size={14} style={{ marginRight: 5 }} />
            Nuevo cliente
          </button>
        )}
      </div>

      {menuAbierto && <div style={styles.menuOverlay} onClick={() => setMenuAbierto(null)} />}

      {borrarArmado && (
        <div style={styles.confirmOverlay} onClick={cancelarBorrado}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmBoxTitle}>
              ¿Borrar {borrarArmado.tipo} "{borrarArmado.nombre}"?
            </div>
            <div style={styles.confirmBoxText}>
              {borrarArmado.tipo === "cliente" && "Se borran también todos sus establecimientos y lotes."}
              {borrarArmado.tipo === "establecimiento" && "Se borran también todos sus lotes."}
              {borrarArmado.tipo === "lote" && "Se pierde su grilla y los accesos otorgados."}
            </div>
            <div style={styles.confirmBoxRow}>
              <button style={styles.confirmBoxNo} onClick={cancelarBorrado}>
                Cancelar
              </button>
              <button style={styles.confirmBoxYes} onClick={confirmarBorrado}>
                Sí, borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KmzUploadCard({ lote, onGenerarGrilla, onEliminar, onEditar }) {
  const [archivo, setArchivo] = useState(null);
  const [haPorPunto, setHaPorPunto] = useState(1.5);
  const [procesando, setProcesando] = useState(false);
  const [detectado, setDetectado] = useState(null); // { hectareas }
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(lote.nombre);

  function confirmarEdicion() {
    if (nombreEditado.trim()) onEditar(nombreEditado.trim());
    setEditando(false);
  }

  function handleArchivo(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setArchivo(f);
    setProcesando(true);
    // Simulación: en la app real acá se lee y procesa el KMZ real para
    // calcular el polígono y las hectáreas exactas del lote.
    setTimeout(() => {
      const hash = f.name.length * 7 + f.size % 97;
      const hectareasSimuladas = 18 + (hash % 90);
      setDetectado({ hectareas: hectareasSimuladas });
      setProcesando(false);
    }, 700);
  }

  const puntosEstimados = detectado ? Math.round(detectado.hectareas / haPorPunto) : null;
  const espaciadoM = haPorPunto ? Math.round(Math.sqrt(haPorPunto * 10000)) : null;

  return (
    <div style={styles.kmzCard}>
      {editando ? (
        <div style={styles.inlineFormLotePadded}>
          <input
            autoFocus
            style={styles.inlineInput}
            value={nombreEditado}
            onChange={(e) => setNombreEditado(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmarEdicion()}
          />
          <button style={styles.inlineConfirmBtn} onClick={confirmarEdicion}>
            Guardar
          </button>
          <button style={styles.inlineCancelBtn} onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      ) : (
      <div style={styles.kmzCardTopRow}>
        <div>
          <div style={styles.loteCardNombre}>{lote.nombre}</div>
          <div style={styles.loteCardCultivo}>{lote.cultivo} · sin grilla todavía</div>
        </div>
        {onEditar && (
          <button style={styles.editLoteBtn} onClick={() => setEditando(true)} title="Editar nombre">
            <Pencil size={13} />
          </button>
        )}
        {onEliminar && (
          <button style={styles.trashLoteBtn} onClick={onEliminar} title="Eliminar lote">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      )}

      {!archivo ? (
        <label style={styles.kmzUploadBtn}>
          <Upload size={14} style={{ marginRight: 6 }} />
          Subir KMZ del lote
          <input
            type="file"
            accept=".kmz,.kml"
            style={{ display: "none" }}
            onChange={handleArchivo}
          />
        </label>
      ) : procesando ? (
        <div style={styles.kmzProcessing}>Leyendo el polígono…</div>
      ) : (
        <div style={styles.kmzResult}>
          <div style={styles.kmzResultRow}>
            <span>Polígono detectado</span>
            <strong>{detectado.hectareas} ha</strong>
          </div>
          <div style={styles.kmzResultRow}>
            <span>Hectáreas por punto</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={haPorPunto}
              onChange={(e) => setHaPorPunto(parseFloat(e.target.value) || 1.5)}
              style={styles.kmzHaInput}
            />
          </div>
          <div style={styles.kmzResultRow}>
            <span>Espaciado entre puntos</span>
            <strong>~{espaciadoM} m</strong>
          </div>
          <div style={styles.kmzResultRow}>
            <span>Puntos estimados</span>
            <strong>{puntosEstimados}</strong>
          </div>
          <button
            style={styles.confirmBtn}
            onClick={() =>
              onGenerarGrilla(lote.id, { hectareas: detectado.hectareas, haPorPunto })
            }
          >
            <Check size={15} style={{ marginRight: 6 }} />
            Generar grilla
          </button>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div style={styles.legendRow}>
      {LEVEL_COLORS.map((c, i) => (
        <div key={i} style={styles.legendItem}>
          <span style={{ ...styles.legendSwatch, background: c }} />
          <span style={styles.legendText}>
            {["0", "bajo", "medio", "medio-alto", "alto", "muy alto", "crítico"][i]}
          </span>
        </div>
      ))}
    </div>
  );
}

const LEVEL_COLORS = ["#FFFFFF", "#FFF4B8", "#FFD93D", "#FFA726", "#F4511E", "#D32F2F", "#8E0000"];

const MAP_SCALE = 3.2; // px por metro, a zoom 1x
const MAP_PAD = 26; // padding en px alrededor de la grilla
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;

function UbicacionView({ puntos, myPos, setMyPos, puntoCercano, gpsStatus, onSelect, role, online, puntosTotalLote, puntosSincronizadosLote, faltanSincronizar, onToggleOnline, loteCerrado, perimetroLote, loteId, userId }) {
  const containerRef = useRef(null);
  const draggingRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [heading, setHeading] = useState(0); // grados, 0 = norte arriba
  const [headingStatus, setHeadingStatus] = useState("manual"); // manual | activo | no-disponible
  const orientHandlerRef = useRef(null);
  // Mientras "sigue brújula" está activo, la orientación del mapa la maneja el
  // sensor solo. Si el usuario gira el mapa a mano con dos dedos, se pausa
  // (para no pelearse con su gesto), y el botón "Volver a mi marcha" la retoma.
  const [siguiendoBrujula, setSiguiendoBrujula] = useState(true);
  const siguiendoBrujulaRef = useRef(true);
  const ultimoRumboBrujulaRef = useRef(0);
  useEffect(() => {
    siguiendoBrujulaRef.current = siguiendoBrujula;
  }, [siguiendoBrujula]);

  useEffect(() => {
    return () => {
      if (orientHandlerRef.current) {
        window.removeEventListener("deviceorientation", orientHandlerRef.current, true);
      }
    };
  }, []);

  function activarBrujula() {
    function handleOrientation(e) {
      let h;
      if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
      else if (e.alpha != null) h = 360 - e.alpha;
      else return;
      ultimoRumboBrujulaRef.current = h;
      if (siguiendoBrujulaRef.current) setHeading(h);
    }
    orientHandlerRef.current = handleOrientation;

    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state === "granted") {
            window.addEventListener("deviceorientation", handleOrientation, true);
            setHeadingStatus("activo");
          } else {
            setHeadingStatus("no-disponible");
          }
        })
        .catch(() => setHeadingStatus("no-disponible"));
    } else if (typeof DeviceOrientationEvent !== "undefined") {
      window.addEventListener("deviceorientation", handleOrientation, true);
      setHeadingStatus("activo");
    } else {
      setHeadingStatus("no-disponible");
    }
  }

  function volverAMiMarcha() {
    setPanX(0);
    setPanY(0);
    if (headingStatus === "activo") {
      setSiguiendoBrujula(true);
      setHeading(ultimoRumboBrujulaRef.current);
    } else {
      setHeading(0);
    }
  }

  function restablecerVista() {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setHeading(0);
  }

  // Se activa sola al entrar a la vista de Campo — salvo en dispositivos (típicamente
  // iPhone) donde el sistema exige un toque explícito del usuario para autorizar el
  // sensor; ahí queda visible el botón "Orientar mapa" para ese único permiso inicial.
  useEffect(() => {
    if (typeof DeviceOrientationEvent === "undefined") {
      setHeadingStatus("no-disponible");
      return;
    }
    if (typeof DeviceOrientationEvent.requestPermission !== "function") {
      activarBrujula();
    }
  }, []);

  // El encuadre se calcula SOLO en base a los puntos del lote — nunca de la
  // posición de "Yo". Así la vista general queda realmente fija: moverte (o
  // arrastrar el marcador) no le cambia el zoom ni el encuadre a nadie.
  const bounds = useMemo(() => {
    const xs = puntos.map((p) => p.px);
    const ys = puntos.map((p) => p.py);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [puntos]);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  // Recorrido personal (ayuda memoria) — se carga una sola vez al abrir este
  // lote, y se guarda solo en el celular de quien lo está mirando.
  const [miRuta, setMiRuta] = useState(() => cargarMiRuta(loteId, userId));
  const [modoMarcarRuta, setModoMarcarRuta] = useState(false);
  // El recorrido queda "marcado" (confirmado, en verde) recién cuando se
  // toca el OK — mientras se está tocando puntos, todavía no. Se guarda
  // junto con la ruta, así al reabrir la app se recuerda el estado.
  const [rutaConfirmada, setRutaConfirmada] = useState(
    () => cargarMiRuta(loteId, userId).length > 0 && localStorage.getItem(`miRutaConf_${loteId}_${userId}`) === "1"
  );
  useEffect(() => {
    guardarMiRuta(loteId, userId, miRuta);
  }, [miRuta, loteId, userId]);
  useEffect(() => {
    try {
      localStorage.setItem(`miRutaConf_${loteId}_${userId}`, rutaConfirmada ? "1" : "0");
    } catch {}
  }, [rutaConfirmada, loteId, userId]);
  // Editar el recorrido solo tiene sentido en la vista general — si entrás a
  // Modo trabajo a mitad de una edición, se cierra sola.
  useEffect(() => {
    if (pantallaCompleta) setModoMarcarRuta(false);
  }, [pantallaCompleta]);
  // Confirmación propia (sin window.confirm, que se bloquea en algunas
  // vistas previas) para volver a editar un recorrido ya marcado.
  const [pidiendoEditarRuta, setPidiendoEditarRuta] = useState(false);
  function alternarPuntoEnRuta(id) {
    setMiRuta((r) => (r.includes(id) ? r.filter((p) => p !== id) : [...r, id]));
  }
  const [observacionesAbiertas, setObservacionesAbiertas] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(null); // data URL de la foto que se está viendo grande, o null

  // El onTouchMove de React no siempre logra bloquear el scroll nativo de la
  // página en celulares (sobre todo moviendo el dedo hacia abajo, que dispara
  // el gesto de "scrollear"/"pull to refresh" del navegador). Enganchamos el
  // evento táctil real del DOM, sin el modo "passive" de React, para poder
  // frenarlo de verdad mientras se está arrastrando o usando dos dedos.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function bloquearScrollNativo(e) {
      if (e.touches.length >= 2 || draggingRef.current) {
        e.preventDefault();
      }
    }
    el.addEventListener("touchmove", bloquearScrollNativo, { passive: false });
    return () => el.removeEventListener("touchmove", bloquearScrollNativo);
  }, [pantallaCompleta]);

  // Escala base: ajusta automáticamente el zoom inicial al tamaño real del lote,
  // para que lotes grandes (cientos de metros) entren en la pantalla del celular.
  const FIT_W = 400;
  const FIT_H = 460;
  const baseScaleFit = Math.min((FIT_W - MAP_PAD * 2) / spanX, (FIT_H - MAP_PAD * 2) / spanY, MAP_SCALE);

  const contWSigueme = typeof window !== "undefined" ? window.innerWidth - 20 : 360;
  const contHSigueme = typeof window !== "undefined" ? window.innerHeight - 170 : 500;

  // En modo trabajo la cámara siempre te sigue a vos — el "mapa fijo" ya
  // existe en la vista general, no hacía falta duplicarlo acá.
  const enModoSigueme = pantallaCompleta;
  const baseScale = enModoSigueme ? Math.min(baseScaleFit * 1.8, MAP_SCALE) : baseScaleFit;
  const scale = baseScale * zoom;
  const headingUsado = heading;

  // ---- Vista general: encuadra TODO el lote a zoom 1x — el recuadro queda
  // SIEMPRE del mismo tamaño (no se agranda ni achica al hacer zoom o girar);
  // lo que cambia de tamaño es el contenido de adentro, como en cualquier mapa.
  const innerW = spanX * scale + MAP_PAD * 2;
  const innerH = spanY * scale + MAP_PAD * 2;
  const contWFit = FIT_W;
  const contHFit = FIT_H;

  function toPxFit(xm, ym) {
    return { left: MAP_PAD + (xm - bounds.minX) * scale, top: MAP_PAD + (ym - bounds.minY) * scale };
  }

  // ---- Modo trabajo: "Yo" queda fijo en un punto de anclaje (centrado y un
  // poco hacia abajo, como en cualquier GPS de navegación — dejando ver más
  // lote "hacia adelante" que "hacia atrás"), y el mapa se mueve y gira
  // alrededor tuyo. El contenedor es del tamaño real de la pantalla
  // disponible, no crece con el zoom (por eso, si te alejás mucho, algunos
  // puntos pueden quedar fuera — para eso está el zoom/pan).
  const anclaX = contWSigueme / 2;
  const anclaY = contHSigueme * 0.72;

  function toPxSigueme(xm, ym) {
    return { left: anclaX + (xm - myPos.x) * scale, top: anclaY + (ym - myPos.y) * scale };
  }

  const contW = pantallaCompleta ? contWSigueme : contWFit;
  const contH = pantallaCompleta ? contHSigueme : contHFit;
  const toPx = enModoSigueme ? toPxSigueme : toPxFit;

  function pxToMeters(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect();
    // click relativo al centro del contenedor, restando el desplazamiento manual
    const dx = clientX - rect.left - contW / 2 - panX;
    const dy = clientY - rect.top - contH / 2 - panY;
    // deshacemos la rotación visual (el mapa se dibuja con rotate(-heading),
    // así que para volver hay que rotar +heading)
    const rad = (heading * Math.PI) / 180;
    const cx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const cy = dx * Math.sin(rad) + dy * Math.cos(rad);
    const lx = cx + innerW / 2;
    const ly = cy + innerH / 2;
    const x = (lx - MAP_PAD) / scale + bounds.minX;
    const y = (ly - MAP_PAD) / scale + bounds.minY;
    return { x, y };
  }

  const pinchRef = useRef(null); // distancia, ángulo y punto medio inicial entre dos dedos
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Vista general y modo trabajo nunca comparten zoom/desplazamiento/giro —
  // cada una arranca siempre "de cero" al entrar, sin importar cómo quedó la otra.
  useEffect(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setHeading(0);
  }, [pantallaCompleta]);

  function handleTouchMove(e) {
    if (e.touches.length === 2) {
      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angulo = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      if (pinchRef.current == null) {
        pinchRef.current = {
          dist,
          angulo,
          midX,
          midY,
          zoomInicial: zoom,
          headingInicial: heading,
          panXInicial: panX,
          panYInicial: panY,
        };
      } else {
        const factor = dist / pinchRef.current.dist;
        const nuevoZoom = Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, +(pinchRef.current.zoomInicial * factor).toFixed(2))
        );
        setZoom(nuevoZoom);

        // Girar el mapa con los dos dedos, tipo "torcer" — SOLO si no hay
        // brújula real activa. Si la brújula está funcionando, no dejamos que
        // el gesto la pise (para que no se pueda desorientar el mapa sin
        // querer, por ejemplo mientras solo se quería hacer zoom).
        if (headingStatus !== "activo") {
          // Restamos delta (no sumamos) para que un gesto horario gire el mapa
          // horario en pantalla — el transform visual usa rotate(-heading).
          const deltaAngulo = angulo - pinchRef.current.angulo;
          const nuevoHeading = (pinchRef.current.headingInicial - deltaAngulo + 360) % 360;
          setHeading(nuevoHeading);
        }

        // Desplazar el mapa moviendo los dos dedos juntos hacia cualquier lado.
        setPanX(pinchRef.current.panXInicial + (midX - pinchRef.current.midX));
        setPanY(pinchRef.current.panYInicial + (midY - pinchRef.current.midY));
      }
      return;
    }
    handleDrag(e);
  }

  function handleTouchEnd(e) {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) draggingRef.current = false;
  }

  function handleDrag(e) {
    if (!draggingRef.current) return;
    const point = e.touches ? e.touches[0] : e;
    setMyPos(pxToMeters(point.clientX, point.clientY));
  }

  function nudge(dx, dy) {
    setMyPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  const enRango = puntoCercano && puntoCercano.dist <= TOLERANCE_M;
  const ordenNatural = (a, b) => {
    const [la, pa] = a.id.split(".").map(Number);
    const [lb, pb] = b.id.split(".").map(Number);
    return la - lb || pa - pb;
  };
  const puntosConInfo = puntos
    .filter((p) => (p.observaciones && p.observaciones.trim()) || (p.fotos && p.fotos.length > 0))
    .sort(ordenNatural);
  const soyEmpleado = role === "empleado";

  // El contenido del mapa (puntos + marcador "Yo") es el mismo en las dos
  // vistas — solo cambia el tamaño del recuadro que lo contiene.
  // En modo trabajo usamos una paleta de más contraste (pensada para leerse
  // bien al sol directo) — en la vista general se mantiene la de siempre.
  const colorBorderPendiente = pantallaCompleta ? "#1B2E1F" : "#D9631F";
  const colorFillCompleto = pantallaCompleta ? "#6FCF5C" : "#3B8F5C";
  const colorBorderCompleto = pantallaCompleta ? "#1B2E1F" : "#1F9350";
  const grosorBorde = pantallaCompleta ? 3 : 2;
  const colorEtiqueta = pantallaCompleta ? "#F2E9C9" : "#6B5D2E";
  // El tamaño de los puntos y la letra crece con el zoom, para que al acercar
  // se vean más grandes y claros (y al alejar no tapen todo el lote).
  // Vista general: tamaño original (compacto). Modo trabajo: más grande de
  // base, ya que ahí es donde de verdad hace falta ver bien los puntos.
  const basePunto = pantallaCompleta ? 24 : 18;
  const baseFuente = pantallaCompleta ? 11 : 8.5;
  const tamPunto = Math.round(basePunto * zoom);
  const tamFuenteEtiqueta = Math.round(baseFuente * zoom * 10) / 10;

  const contenidoMapa = (
    <div
      style={{
        ...styles.mapWorld,
        width: pantallaCompleta ? contW : innerW,
        height: pantallaCompleta ? contH : innerH,
        top: enModoSigueme ? 0 : "50%",
        left: enModoSigueme ? 0 : "50%",
        transformOrigin: enModoSigueme ? `${anclaX}px ${anclaY}px` : "center center",
        transform: enModoSigueme
          ? `translate(${panX}px, ${panY}px) rotate(${-headingUsado}deg)`
          : `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) rotate(${-headingUsado}deg)`,
      }}
    >
      {miRuta.length > 1 && (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: pantallaCompleta ? contW : innerW,
            height: pantallaCompleta ? contH : innerH,
            pointerEvents: "none",
          }}
        >
          {/* Un <line> por tramo (no un <polyline> único) — así cada tramo
              dibuja su propio patrón de rayitas desde cero. Además, el
              patrón de rayitas de un tramo largo no siempre "cae" justo en
              la puntita final (limitación normal de cómo dibuja rayitas
              cualquier navegador) — por eso el último 12% de cada tramo se
              dibuja sólido (sin rayitas), garantizando que la línea siempre
              se vea conectada hasta el punto, sin importar cómo caiga el
              patrón en el resto. */}
          {(() => {
            const pxs = miRuta.map((id) => puntos.find((p) => p.id === id)).filter(Boolean).map((p) => toPx(p.px, p.py));
            const segmentos = [];
            for (let i = 0; i < pxs.length - 1; i++) {
              const a = pxs[i];
              const b = pxs[i + 1];
              // Punto al 88% del tramo — desde ahí hasta el final va sólido.
              const remateX = a.left + (b.left - a.left) * 0.88;
              const remateY = a.top + (b.top - a.top) * 0.88;
              segmentos.push(
                <line
                  key={`d${i}`}
                  x1={a.left}
                  y1={a.top}
                  x2={remateX}
                  y2={remateY}
                  stroke="#1E6FEB"
                  strokeWidth={pantallaCompleta ? 3.5 : 2.5}
                  strokeDasharray="7,6"
                  strokeLinecap="round"
                />
              );
              segmentos.push(
                <line
                  key={`s${i}`}
                  x1={remateX}
                  y1={remateY}
                  x2={b.left}
                  y2={b.top}
                  stroke="#1E6FEB"
                  strokeWidth={pantallaCompleta ? 3.5 : 2.5}
                  strokeLinecap="round"
                />
              );
            }
            return segmentos;
          })()}
        </svg>
      )}
      {puntos.map((p) => {
        const pos = toPx(p.px, p.py);
        const cercano = puntoCercano && p.id === puntoCercano.id;
        const fill = p.confirmado ? colorFillCompleto : "#FFFFFF";
        const borderColor = p.confirmado ? colorBorderCompleto : colorBorderPendiente;
        return (
          <div key={p.id}>
            <button
              onClick={() => {
                // Marcar/editar el recorrido: solo desde la vista general.
                if (modoMarcarRuta && !pantallaCompleta) {
                  alternarPuntoEnRuta(p.id);
                  return;
                }
                // Cargar datos de un punto: para Monitoreadores, solo desde
                // Modo trabajo — la vista general para ellos es nada más
                // para ubicarse y ver los números de las estaciones.
                if (!pantallaCompleta && role === "empleado") return;
                onSelect(p.id);
              }}
              style={{
                ...styles.mapPoint,
                width: tamPunto,
                height: tamPunto,
                left: pos.left - tamPunto / 2,
                top: pos.top - tamPunto / 2,
                background: fill,
                border: `${grosorBorde}px solid ${borderColor}`,
                boxShadow: cercano && enRango ? "0 0 0 5px rgba(46,92,62,0.28)" : "none",
              }}
              title={p.id}
            >
              <span
                style={{
                  ...styles.mapPointLabel,
                  color: colorEtiqueta,
                  fontSize: tamFuenteEtiqueta,
                  top: tamPunto + 2,
                  ...(cercano ? styles.mapPointLabelActive : {}),
                  transform: `translateX(-50%) rotate(${headingUsado}deg)`,
                }}
              >
                {p.id}
              </span>
            </button>
          </div>
        );
      })}

      {/* Yo — con "el mapa me sigue" queda fijo en el punto de anclaje (no
          tiene sentido arrastrarlo); con "mapa fijo" (o en vista general) se
          puede arrastrar para simular que te movés. */}
      <div
        onMouseDown={() => !enModoSigueme && (draggingRef.current = true)}
        onTouchStart={() => !enModoSigueme && (draggingRef.current = true)}
        style={{
          ...styles.meMarker,
          left: toPx(myPos.x, myPos.y).left - 12,
          top: toPx(myPos.x, myPos.y).top - 12,
          cursor: enModoSigueme ? "default" : "grab",
        }}
      >
        <span style={styles.meMarkerPulse} />
        <Navigation
          size={13}
          color="#FFFFFF"
          style={{ position: "absolute", top: 3, left: 3, transform: `rotate(${heading}deg)` }}
        />
      </div>
    </div>
  );

  const tarjetaDistancia = puntoCercano && (
    <div style={{ ...styles.distanceCard, borderColor: enRango ? "#1F9350" : "#D9631F" }}>
      <div style={styles.distanceCardLeft}>
        <div style={styles.distancePointId}>Punto {puntoCercano.id}</div>
        <div style={{ ...styles.distanceStatus, color: enRango ? "#1F9350" : "#D9631F" }}>
          {enRango ? "En rango — podés muestrear" : "Acercate al punto"}
        </div>
      </div>
      <div style={styles.distanceValue}>
        {puntoCercano.dist.toFixed(1)}
        <span style={styles.distanceUnit}>m</span>
      </div>
    </div>
  );

  // Aparece si: giraste el mapa a mano (solo cuenta cuando no hay brújula real
  // guiando el rumbo — con brújula activa, que el rumbo no sea 0 es normal, no
  // hay que "arreglarlo"), o si moviste el mapa con dos dedos (esto sí hay que
  // poder deshacerlo siempre, tengas brújula real o no).
  const mapaGirado = headingStatus !== "activo" && Math.abs(((heading % 360) + 360) % 360) > 1;
  const mapaDesplazado = panX !== 0 || panY !== 0;
  const mostrarRecentrar = mapaGirado || mapaDesplazado;
  const botonRecentrar = mostrarRecentrar && (
    <button
      style={styles.recentrarBtn}
      onClick={volverAMiMarcha}
      title={headingStatus === "activo" ? "Volver a tu marcha y al centro" : "Volver al norte y al centro"}
    >
      <Compass size={9} style={{ marginRight: 3 }} />
      {headingStatus === "activo" ? "Volver a mi marcha" : "Volver al norte"}
    </button>
  );

  if (pantallaCompleta) {
    return (
      <div style={styles.focusOverlay}>
        <div style={styles.focusTopBar}>
          <button style={styles.focusExitBtn} onClick={() => setPantallaCompleta(false)}>
            <Minimize2 size={15} style={{ marginRight: 5 }} />
            Vista general
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {enModoSigueme && botonRecentrar}
            {miRuta.length > 0 && (
              <div style={{ ...styles.recentrarBtn, background: "#3A5A9C" }}>
                <Pencil size={9} style={{ marginRight: 3 }} />
                Mi recorrido: {miRuta.length} puntos
              </div>
            )}
            <div
              style={{
                ...styles.gpsPill,
                padding: "3px 8px",
                fontSize: 9.5,
                background:
                  gpsStatus === "activo" ? "#1F9350" : gpsStatus === "no-disponible" ? "#B71C1C" : "#A9752E",
              }}
            >
              <span
                style={{
                  ...styles.gpsLuz,
                  width: 6,
                  height: 6,
                  background:
                    gpsStatus === "activo" ? "#8FE3B0" : gpsStatus === "no-disponible" ? "#F4A3A3" : "#F2D9A0",
                }}
              />
              {gpsStatus === "activo" ? "GPS activado" : gpsStatus === "no-disponible" ? "GPS desactivado" : "Buscando…"}
            </div>
          </div>
        </div>

        {/* Sin recuadro ni borde — los puntos quedan "sueltos" sobre el fondo,
            centrados en el espacio libre entre la barra de arriba y la tarjeta de abajo. */}
        <div style={styles.mapFreeWrap}>
          <div
            ref={containerRef}
            style={{
              ...styles.mapFreeArea,
              width: contW,
              height: contH,
            }}
            onMouseMove={handleDrag}
            onMouseUp={() => (draggingRef.current = false)}
            onMouseLeave={() => (draggingRef.current = false)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {contenidoMapa}
          </div>
        </div>

        <div style={styles.focusBottom}>
          <span style={styles.zoomLabel}>{Math.round(zoom * 100)}% · pellizcá para zoom o girar</span>
          <div style={styles.dpad}>
            <div />
            <button style={styles.dpadBtn} onClick={() => nudge(0, -2)}>▲</button>
            <div />
            <button style={styles.dpadBtn} onClick={() => nudge(-2, 0)}>◀</button>
            <span style={styles.dpadCenter}>mover</span>
            <button style={styles.dpadBtn} onClick={() => nudge(2, 0)}>▶</button>
            <div />
            <button style={styles.dpadBtn} onClick={() => nudge(0, 2)}>▼</button>
            <div />
          </div>
          {tarjetaDistancia}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <div style={styles.gpsRow}>
        <div
          style={{
            ...styles.gpsPill,
            background:
              gpsStatus === "activo" ? "#1F9350" : gpsStatus === "no-disponible" ? "#B71C1C" : "#A9752E",
          }}
        >
          <span
            style={{
              ...styles.gpsLuz,
              background: gpsStatus === "activo" ? "#8FE3B0" : gpsStatus === "no-disponible" ? "#F4A3A3" : "#F2D9A0",
            }}
          />
          {gpsStatus === "activo"
            ? "GPS activado"
            : gpsStatus === "no-disponible"
            ? "GPS desactivado — no se encontró señal"
            : "Buscando señal GPS…"}
        </div>
      </div>

      <div style={styles.miRutaRow}>
        {modoMarcarRuta ? (
          <>
            <div style={{ ...styles.miRutaToggle, ...styles.miRutaToggleActivo }}>
              <Pencil size={12} style={{ marginRight: 5 }} />
              Tocando puntos para marcar…
            </div>
            <button
              style={styles.miRutaOk}
              onClick={() => {
                setModoMarcarRuta(false);
                if (miRuta.length > 0) setRutaConfirmada(true);
              }}
              title="Terminar de marcar"
            >
              <Check size={13} />
            </button>
          </>
        ) : rutaConfirmada && miRuta.length > 0 ? (
          pidiendoEditarRuta ? (
            <div style={styles.miRutaConfirmPregunta}>
              <span>¿Editar recorrido?</span>
              <button
                style={styles.miRutaConfirmSi}
                onClick={() => {
                  setRutaConfirmada(false);
                  setModoMarcarRuta(true);
                  setPidiendoEditarRuta(false);
                }}
              >
                Sí
              </button>
              <button style={styles.miRutaConfirmNo} onClick={() => setPidiendoEditarRuta(false)}>
                No
              </button>
            </div>
          ) : (
            <button style={styles.miRutaConfirmada} onClick={() => setPidiendoEditarRuta(true)}>
              <Check size={12} style={{ marginRight: 5 }} />
              Recorrido marcado
            </button>
          )
        ) : (
          <button
            style={styles.miRutaToggle}
            onClick={() => {
              setRutaConfirmada(false);
              setModoMarcarRuta(true);
            }}
          >
            <Pencil size={12} style={{ marginRight: 5 }} />
            Marcar mi recorrido
          </button>
        )}
        {miRuta.length > 0 && <div style={styles.miRutaContador}>{miRuta.length} puntos</div>}
      </div>

      <div style={styles.mapToolsRow}>
        <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        {(zoom !== 1 || panX !== 0 || panY !== 0 || heading !== 0) && (
          <button style={styles.resetVistaBtn} onClick={restablecerVista} title="Ver todos los puntos, como al principio">
            <RotateCcw size={12} style={{ marginRight: 4 }} />
            Restablecer
          </button>
        )}
        <button style={styles.expandirBtn} onClick={() => setPantallaCompleta(true)} title="Modo trabajo, a pantalla completa">
          <Maximize2 size={13} style={{ marginRight: 5 }} />
          Modo trabajo
        </button>
      </div>
      <div style={styles.sectionLabel}>Con dos dedos podés pellizcar para zoom o mover el mapa</div>

      <div
        ref={containerRef}
        style={{ ...styles.mapBox, width: contW, height: contH }}
        onMouseMove={handleDrag}
        onMouseUp={() => (draggingRef.current = false)}
        onMouseLeave={() => (draggingRef.current = false)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {contenidoMapa}
      </div>

      {(role === "jefe" || role === "encargado") && (
        <div style={styles.observacionesSection}>
          <button style={styles.observacionesToggle} onClick={() => setObservacionesAbiertas((v) => !v)}>
            <Pencil size={14} style={{ marginRight: 6 }} />
            Observaciones
            <ChevronDown
              size={13}
              style={{ marginLeft: "auto", transform: observacionesAbiertas ? "rotate(180deg)" : "none" }}
            />
          </button>
          {observacionesAbiertas && (
            <div style={styles.observacionesLista}>
              {puntosConInfo.length === 0 ? (
                <div style={styles.observacionesVacio}>Sin Observaciones</div>
              ) : (
                puntosConInfo.map((p) => (
                  <div key={p.id} style={styles.observacionFila}>
                    <div style={styles.observacionPunto}>Punto {p.id}</div>
                    {p.observaciones && p.observaciones.trim() && (
                      <div style={styles.observacionTexto}>{p.observaciones}</div>
                    )}
                    {p.fotos && p.fotos.length > 0 && (
                      <div style={styles.observacionFotosRow}>
                        {p.fotos.map((f, i) => (
                          <button
                            key={i}
                            style={styles.observacionFotoThumbBtn}
                            onClick={() => setFotoAmpliada(f)}
                          >
                            <img src={f} alt="" style={styles.observacionFotoThumb} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {fotoAmpliada && (
        <div style={styles.fotoLightbox} onClick={() => setFotoAmpliada(null)}>
          <button style={styles.fotoLightboxCerrar} onClick={() => setFotoAmpliada(null)}>
            <X size={18} color="#FFFFFF" />
          </button>
          <img
            src={fotoAmpliada}
            alt=""
            style={styles.fotoLightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function ConflictoModal({ pointId, actual, alternativa, usuarios, onElegir, onCerrar }) {
  const nombreActual = usuarios.find((u) => u.id === actual.cargadoPor)?.nombre || "otra persona";
  const nombreAlt = usuarios.find((u) => u.id === alternativa.cargadoPor)?.nombre || "otra persona";

  function Version({ titulo, nombre, datos, onUsar }) {
    return (
      <div style={styles.conflictoVersion}>
        <div style={styles.conflictoVersionTitulo}>{titulo}</div>
        <div style={styles.conflictoVersionNombre}>Cargado por {nombre}</div>
        <div style={styles.conflictoVersionDatos}>
          <div>Bichos bolita: {datos.bicho}</div>
          <div>Babosas: {datos.babosa}</div>
          <div>Huevo de babosas: {datos.huevoBabosas ? "Sí" : "No"}</div>
          <div>Gusano de arroz: {datos.gusanoArroz ? "Sí" : "No"}</div>
          <div>Isoca cortadora: {datos.isocaCortadora ? "Sí" : "No"}</div>
          <div>Gusano blanco: {datos.gusanoBlanco ? "Sí" : "No"}</div>
        </div>
        <button style={styles.conflictoUsarBtn} onClick={onUsar}>
          Usar esta versión
        </button>
      </div>
    );
  }

  return (
    <div style={styles.sheetOverlay} onClick={onCerrar}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHeader}>
          <div style={styles.sheetTitle}>Carga duplicada — Punto {pointId}</div>
          <button onClick={onCerrar} style={styles.iconBtn}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.salidaHint}>
          Este punto se cargó dos veces sin sincronizar a tiempo. Elegí con qué versión te
          querés quedar — la otra se descarta.
        </div>
        <Version titulo="Versión 1" nombre={nombreActual} datos={actual} onUsar={() => onElegir(false)} />
        <Version titulo="Versión 2" nombre={nombreAlt} datos={alternativa} onUsar={() => onElegir(true)} />
      </div>
    </div>
  );
}

// Lee el archivo elegido (de la cámara o de la galería) y lo guarda como
// data URL — funciona con el selector de archivos real del navegador/celular.
function manejarArchivoFoto(e, id, fotosActuales, onSetField) {
  const archivo = e.target.files && e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => onSetField(id, "fotos", [...(fotosActuales || []), lector.result]);
  lector.readAsDataURL(archivo);
  e.target.value = ""; // permite volver a elegir el mismo archivo si hace falta
}

function quitarFoto(id, index, fotosActuales, onSetField) {
  onSetField(id, "fotos", fotosActuales.filter((_, i) => i !== index));
}

function PointSheet({ id, point, role, currentUser, usuarios, onClose, onSetField, onConfirm, onReopen, loteBloqueadoParaMonitoreador }) {
  const [confirmoReapertura, setConfirmoReapertura] = useState(false);
  const [mostrarObservaciones, setMostrarObservaciones] = useState(!!point.observaciones);
  const [menuFotoAbierto, setMenuFotoAbierto] = useState(false);
  const inputCamaraRef = useRef(null);
  const inputGaleriaRef = useRef(null);
  const user = usuarios.find((u) => u.id === point.cargadoPor);
  const isOwner = point.cargadoPor === currentUser.id;
  const puedeEditarSiConfirma = isOwner || role === "jefe" || role === "encargado";
  // Una vez que el lote sincronizó por completo, ni siquiera el dueño del
  // punto (si es Monitoreador) puede seguir editando — solo Encargado/Socio.
  const bloqueadoPorSyncCompleto = role === "empleado" && loteBloqueadoParaMonitoreador;
  // Bloqueado sin ninguna posibilidad de pedir permiso: o el lote ya
  // sincronizó del todo (y sos Monitoreador), o es el punto de otra persona
  // y no tenés ese permiso (Monitoreador sobre un punto ajeno).
  const bloqueadoDelTodo = bloqueadoPorSyncCompleto || (point.confirmado && !puedeEditarSiConfirma);
  // Está cerrado, pero SE PUEDE pedir editarlo — falta el "sí, quiero editar".
  const necesitaConfirmarReapertura =
    point.confirmado && puedeEditarSiConfirma && !confirmoReapertura && !bloqueadoDelTodo;
  const camposDeshabilitados = bloqueadoDelTodo || necesitaConfirmarReapertura;

  function handleReabrir() {
    onReopen(id);
    setConfirmoReapertura(true);
  }

  function handleGuardar() {
    onConfirm(id);
    onClose();
  }

  return (
    <div style={styles.sheetOverlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHeader}>
          <div style={styles.sheetTitle}>
            <MapPin size={16} style={{ marginRight: 6 }} />
            Punto {id}
          </div>
          <button onClick={onClose} style={styles.iconBtn}>
            <X size={18} />
          </button>
        </div>

        {user && (
          <div style={{ ...styles.userTag, borderColor: user.color, color: user.color }}>
            Cargado por {user.nombre}
          </div>
        )}

        {bloqueadoDelTodo && (
          <div style={styles.lockedBanner}>
            <Lock size={13} style={{ marginRight: 6 }} />
            {bloqueadoPorSyncCompleto
              ? "Este lote ya se sincronizó por completo — para modificar datos, pedile a un Encargado o Socio Gerente"
              : `Ya fue muestreado por ${user ? user.nombre : "otra persona"} — no podés cargar acá`}
          </div>
        )}

        {necesitaConfirmarReapertura && (
          <div style={styles.reaperturaBox}>
            <div style={styles.reaperturaTexto}>
              Punto cerrado por {user ? user.nombre : "otra persona"} — ¿querés editarlo?
            </div>
            <div style={styles.reaperturaBotones}>
              <button style={styles.reaperturaCancelar} onClick={onClose}>
                Cancelar
              </button>
              <button style={styles.reaperturaSi} onClick={handleReabrir}>
                Sí, editar
              </button>
            </div>
          </div>
        )}

        <div style={styles.sheetGroupLabel}>Conteos</div>
        <NumberField
          label="Bichos bolita"
          value={point.bicho}
          disabled={camposDeshabilitados}
          onChange={(v) => onSetField(id, "bicho", v)}
          icono={ICONO_BICHO_BOLITA}
        />
        <NumberField
          label="Babosas"
          value={point.babosa}
          disabled={camposDeshabilitados}
          onChange={(v) => onSetField(id, "babosa", v)}
          icono={ICONO_BABOSA}
        />

        <div style={styles.sheetGroupLabel}>Presencia</div>
        <YesNoField
          label="Huevo de babosas"
          value={point.huevoBabosas}
          disabled={camposDeshabilitados}
          onChange={(v) => onSetField(id, "huevoBabosas", v)}
        />
        <YesNoField
          label="Gusano de arroz"
          value={point.gusanoArroz}
          disabled={camposDeshabilitados}
          onChange={(v) => onSetField(id, "gusanoArroz", v)}
        />
        <YesNoField
          label="Isoca cortadora"
          value={point.isocaCortadora}
          disabled={camposDeshabilitados}
          onChange={(v) => onSetField(id, "isocaCortadora", v)}
        />
        <YesNoField
          label="Gusano blanco"
          value={point.gusanoBlanco}
          disabled={camposDeshabilitados}
          onChange={(v) => onSetField(id, "gusanoBlanco", v)}
        />

        {!camposDeshabilitados && (
          <>
            <button style={styles.photoBtn} onClick={() => setMostrarObservaciones((v) => !v)}>
              <Pencil size={15} style={{ marginRight: 6 }} />
              Observaciones
              {point.observaciones ? " (con texto)" : ""}
            </button>
            {mostrarObservaciones && (
              <textarea
                autoFocus
                style={styles.observacionesBox}
                placeholder="Anotá algo puntual sobre este punto..."
                value={point.observaciones || ""}
                onChange={(e) => onSetField(id, "observaciones", e.target.value)}
              />
            )}
          </>
        )}

        {!camposDeshabilitados && (
          <div style={{ position: "relative" }}>
            {point.fotos && point.fotos.length > 0 && (
              <div style={styles.fotoPreviewRow}>
                {point.fotos.map((f, i) => (
                  <div key={i} style={styles.fotoPreviewItem}>
                    <img src={f} alt="" style={styles.fotoPreviewImg} />
                    <button
                      style={styles.fotoQuitarX}
                      onClick={() => quitarFoto(id, i, point.fotos, onSetField)}
                      title="Eliminar foto"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button style={styles.photoBtn} onClick={() => setMenuFotoAbierto((v) => !v)}>
              <Camera size={15} style={{ marginRight: 6 }} />
              {point.fotos && point.fotos.length > 0 ? "Agregar otra foto" : "Adjuntar foto"}
            </button>
            {menuFotoAbierto && (
              <div style={styles.fotoMenu}>
                <button
                  style={styles.fotoMenuItem}
                  onClick={() => {
                    inputCamaraRef.current?.click();
                    setMenuFotoAbierto(false);
                  }}
                >
                  <Camera size={14} style={{ marginRight: 6 }} />
                  Tomar foto
                </button>
                <button
                  style={styles.fotoMenuItem}
                  onClick={() => {
                    inputGaleriaRef.current?.click();
                    setMenuFotoAbierto(false);
                  }}
                >
                  <Upload size={14} style={{ marginRight: 6 }} />
                  Elegir de la galería
                </button>
              </div>
            )}
            <input
              ref={inputCamaraRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => manejarArchivoFoto(e, id, point.fotos, onSetField)}
            />
            <input
              ref={inputGaleriaRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => manejarArchivoFoto(e, id, point.fotos, onSetField)}
            />
          </div>
        )}

        {bloqueadoDelTodo ? (
          <button style={styles.confirmBtnLocked} onClick={onClose}>
            <Lock size={15} style={{ marginRight: 6 }} />
            Cerrado por {user ? user.nombre : "otra persona"}
          </button>
        ) : necesitaConfirmarReapertura ? null : (
          <button style={styles.confirmBtn} onClick={handleGuardar}>
            <Check size={15} style={{ marginRight: 6 }} />
            {point.confirmado ? "Guardar cambios" : "Confirmar y cerrar punto"}
          </button>
        )}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, disabled, icono }) {
  return (
    <div style={styles.counterRow}>
      <div style={styles.counterLabel}>
        {icono ? (
          <img src={icono} alt="" style={styles.counterIcono} />
        ) : (
          <Bug size={14} style={{ marginRight: 6, opacity: 0.6 }} />
        )}
        {label}
      </div>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        value={value}
        disabled={disabled}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? 0 : Math.max(0, parseInt(v, 10) || 0));
        }}
        style={{ ...styles.numInput, ...(disabled ? styles.numInputDisabled : {}) }}
      />
    </div>
  );
}

function YesNoField({ label, value, onChange, disabled }) {
  return (
    <div style={styles.counterRow}>
      <div style={styles.counterLabel}>{label}</div>
      <div style={styles.yesNoGroup}>
        <button
          disabled={disabled}
          onClick={() => onChange(false)}
          style={{
            ...styles.yesNoBtn,
            ...(value === false ? styles.yesNoBtnActiveNo : {}),
            ...(disabled ? styles.yesNoBtnDisabled : {}),
          }}
        >
          No
        </button>
        <button
          disabled={disabled}
          onClick={() => onChange(true)}
          style={{
            ...styles.yesNoBtn,
            ...(value === true ? styles.yesNoBtnActiveYes : {}),
            ...(disabled ? styles.yesNoBtnDisabled : {}),
          }}
        >
          Sí
        </button>
      </div>
    </div>
  );
}

// Rangos de clasificación tal como en los informes reales (ya llevados a m² = valor cargado × 4)
const RANGOS_BICHO = [
  { max: 30, label: "0 - 30" },
  { max: 59, label: "31 - 59" },
  { max: 120, label: "60 - 120" },
  { max: 180, label: "121 - 180" },
  { max: 240, label: "181 - 240" },
  { max: 360, label: "241 - 360" },
  { max: Infinity, label: "> 360" },
];
const RANGOS_BABOSA = [
  { max: 3, label: "0 - 3" },
  { max: 8, label: "4 - 8" },
  { max: 16, label: "9 - 16" },
  { max: 24, label: "17 - 24" },
  { max: 32, label: "25 - 32" },
  { max: 64, label: "33 - 64" },
  { max: Infinity, label: "> 64" },
];

function clasificar(valorM2, rangos) {
  return rangos.findIndex((r) => valorM2 <= r.max);
}

// Sutherland-Hodgman: recorta un polígono contra un polígono convexo (nuestro hull real)
function clipPoligonoConvexo(sujeto, clip) {
  // orientación del clip para saber de qué lado está "adentro"
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sentido = area >= 0 ? 1 : -1;

  let output = sujeto;
  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) break;
    const cA = clip[i], cB = clip[(i + 1) % clip.length];
    const dentro = (p) =>
      sentido * ((cB[0] - cA[0]) * (p[1] - cA[1]) - (cB[1] - cA[1]) * (p[0] - cA[0])) >= 0;
    const inter = (p1, p2) => {
      const x1 = cA[0], y1 = cA[1], x2 = cB[0], y2 = cB[1];
      const x3 = p1[0], y3 = p1[1], x4 = p2[0], y4 = p2[1];
      const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (denom === 0) return p2;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j - 1 + input.length) % input.length];
      const curIn = dentro(cur), prevIn = dentro(prev);
      if (curIn) {
        if (!prevIn) output.push(inter(prev, cur));
        output.push(cur);
      } else if (prevIn) {
        output.push(inter(prev, cur));
      }
    }
  }
  return output;
}

const SAT_PAD = 30;
const SAT_MAX_SCALE = 0.85; // px por metro, techo para lotes chicos

const ESCALAS_CANDIDATAS_M = [25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
function elegirEscalaBarra(satScale) {
  let mejor = ESCALAS_CANDIDATAS_M[0];
  let mejorDif = Infinity;
  for (const m of ESCALAS_CANDIDATAS_M) {
    const px = m * satScale;
    if (px < 40 || px > 130) continue;
    const dif = Math.abs(px - 85);
    if (dif < mejorDif) {
      mejorDif = dif;
      mejor = m;
    }
  }
  return { metros: mejor, px: mejor * satScale };
}

function DensidadView({ grid, maxVal, plaga, setPlaga, loteNombre, establecimientoNombre, perimetro }) {
  const [satelliteOk, setSatelliteOk] = useState(true);
  const [subTab, setSubTab] = useState("mapas"); // mapas | datos
  const rangos = plaga === "bicho" ? RANGOS_BICHO : RANGOS_BABOSA;
  const etiqueta = plaga === "bicho" ? "Nº BB/m²" : "Nº Babosas/m²";
  const nombrePlaga = plaga === "bicho" ? "Bichos Bolita" : "Babosas";
  const puntos = Object.entries(grid).map(([id, p]) => ({ id, ...p }));
  // Orden numérico real por línea.punto (1.2 antes que 1.10), no alfabético.
  const puntosOrdenados = [...puntos].sort((a, b) => {
    const [la, pa] = a.id.split(".").map(Number);
    const [lb, pb] = b.id.split(".").map(Number);
    return la - lb || pa - pb;
  });

  const todasLasX = puntos.map((p) => p.x).concat(perimetro.map((v) => v.x));
  const todasLasY = puntos.map((p) => p.y).concat(perimetro.map((v) => v.y));
  const minX = Math.min(...todasLasX);
  const minY = Math.min(...todasLasY);
  const spanX = Math.max(1, Math.max(...todasLasX) - minX);
  const spanY = Math.max(1, Math.max(...todasLasY) - minY);
  // Encuadre conservador y más angosto: deja lugar a la leyenda al costado
  // y margen de sobra para que ninguna punta del lote quede recortada.
  const satScale = Math.min(220 / spanX, 380 / spanY, SAT_MAX_SCALE);
  const w = Math.round(spanX * satScale + SAT_PAD * 2);
  const h = Math.round(spanY * satScale + SAT_PAD * 2);
  const escalaBarra = elegirEscalaBarra(satScale);

  const toPx = (x, y) => [SAT_PAD + (x - minX) * satScale, SAT_PAD + (y - minY) * satScale];
  const satUrl = construirUrlSatelital(minX, minY, satScale, w, h, SAT_PAD, SAT_PAD);

  // Diagrama de Voronoi entre los puntos de muestreo, recortado al perímetro real del lote
  const resultadoCeldas = useMemo(() => {
    try {
      if (!d3 || !d3.Delaunay) throw new Error("La librería d3 no está disponible en este entorno");
      const delaunay = d3.Delaunay.from(
        puntos,
        (p) => p.x,
        (p) => p.y
      );
      const pad = 200;
      const voronoi = delaunay.voronoi([minX - pad, minY - pad, minX + spanX + pad, minY + spanY + pad]);
      const hullClip = cascoConvexo(perimetro).map((v) => [v.x, v.y]);
      let sinCelda = 0;
      let sinRecorte = 0;
      const lista = puntos.map((p, i) => {
        const cell = voronoi.cellPolygon(i);
        if (!cell) {
          sinCelda++;
          return null;
        }
        const recortada = clipPoligonoConvexo(cell, hullClip);
        if (recortada.length < 3) {
          sinRecorte++;
          return null;
        }
        const puntosPx = recortada.map(([x, y]) => toPx(x, y).join(",")).join(" ");
        return { id: p.id, puntosPx, valorM2: p[plaga] * 4 };
      });
      const diag = `puntos:${puntos.length} sinCelda:${sinCelda} sinRecorte:${sinRecorte} hullClipPuntos:${hullClip.length} primerCell:${JSON.stringify(voronoi.cellPolygon(0))}`;
      return { lista, error: null, diag };
    } catch (err) {
      console.error("Error calculando las celdas del mapa de densidad:", err);
      return { lista: [], error: err.message || String(err), diag: null };
    }
  }, [grid, plaga, minX, minY, spanX, spanY, satScale]);
  const celdas = resultadoCeldas.lista;
  const errorCeldas = resultadoCeldas.error;
  const diagCeldas = resultadoCeldas.diag;

  const perimetroPx = perimetro.map((v) => toPx(v.x, v.y).join(",")).join(" ");

  return (
    <div style={styles.section}>
      <div style={styles.subTabsRow}>
        <button
          onClick={() => setSubTab("mapas")}
          style={{ ...styles.subTabBtn, ...(subTab === "mapas" ? styles.subTabBtnActive : {}) }}
        >
          Mapas
        </button>
        <button
          onClick={() => setSubTab("datos")}
          style={{ ...styles.subTabBtn, ...(subTab === "datos" ? styles.subTabBtnActive : {}) }}
        >
          Datos
        </button>
      </div>

      {subTab === "datos" ? (
        <TablaDatosPuntos puntos={puntosOrdenados} />
      ) : (
        <>
      <div style={styles.plagaToggle}>
        <button
          onClick={() => setPlaga("bicho")}
          style={{
            ...styles.plagaCard,
            ...(plaga === "bicho" ? styles.plagaCardActive : {}),
          }}
        >
          <img src={ICONO_BICHO_BOLITA} alt="" style={styles.plagaCardIcono} />
          Bichos bolita
        </button>
        <button
          onClick={() => setPlaga("babosa")}
          style={{
            ...styles.plagaCard,
            ...(plaga === "babosa" ? styles.plagaCardActive : {}),
          }}
        >
          <img src={ICONO_BABOSA} alt="" style={styles.plagaCardIcono} />
          Babosas
        </button>
      </div>

      <div style={styles.satMapTitleBlock}>
        <div style={styles.satMapTitle}>Mapa de densidad poblacional de {nombrePlaga}</div>
        {establecimientoNombre && (
          <div style={styles.satMapSubtitle}>Establecimiento "{establecimientoNombre}"</div>
        )}
        {loteNombre && <div style={styles.satMapSubtitle}>Lote {loteNombre}</div>}
      </div>

      <div style={styles.satRow}>
        <div style={styles.legendSide}>
          <div style={styles.legendSideTitle}>{etiqueta}</div>
          {rangos.map((r, i) => (
            <div key={i} style={styles.legendSideRow}>
              <span style={{ ...styles.legendSwatch, background: LEVEL_COLORS[i] }} />
              <span style={styles.legendSideText}>{r.label}</span>
            </div>
          ))}
        </div>

        {errorCeldas && (
          <div style={styles.errorCeldasBanner}>
            ⚠️ No se pudieron dibujar las celdas de color: {errorCeldas}
          </div>
        )}

        <div style={{ ...styles.satMapBox, width: w, height: h }}>
          {satelliteOk && (
            <img
              src={satUrl}
              alt=""
              onError={() => setSatelliteOk(false)}
              style={styles.satMapImg}
            />
          )}
          <Compass size={18} color="#FFFFFF" style={styles.satMapCompass} />

          <svg width={w} height={h} style={{ position: "relative", display: "block" }}>
            {celdas.map((c) => {
              if (!c) return null;
              const nivel = clasificar(c.valorM2, rangos);
              return (
                <polygon
                  key={c.id}
                  points={c.puntosPx}
                  fill={LEVEL_COLORS[nivel]}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={0.5}
                />
              );
            })}
            <polygon
              points={perimetroPx}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeOpacity={0.85}
            />
            {/* escala gráfica proporcional real */}
            <g transform={`translate(${w - escalaBarra.px - 16}, ${h - 14})`}>
              <line x1={0} y1={0} x2={escalaBarra.px} y2={0} stroke="#FFFFFF" strokeWidth={2} />
              <line x1={0} y1={-4} x2={0} y2={4} stroke="#FFFFFF" strokeWidth={2} />
              <line x1={escalaBarra.px} y1={-4} x2={escalaBarra.px} y2={4} stroke="#FFFFFF" strokeWidth={2} />
              <text
                x={escalaBarra.px / 2}
                y={-7}
                fill="#FFFFFF"
                fontSize="9"
                fontFamily="'IBM Plex Mono', monospace"
                textAnchor="middle"
              >
                {escalaBarra.metros} m
              </text>
            </g>
          </svg>
        </div>
      </div>

      <div style={styles.sectionLabel}>
        {puntos.length} puntos de muestreo — valores llevados a m² (× 4 sobre el dato cargado a campo, tomado en 1/4 m²)
      </div>
        </>
      )}
    </div>
  );
}

function TablaDatosPuntos({ puntos }) {
  return (
    <div style={styles.tablaWrap}>
      <div style={styles.tablaScroll}>
        <table style={styles.tabla}>
          <thead>
            <tr>
              <th style={styles.tablaTh}>Punto</th>
              <th style={styles.tablaTh}>Bichos bolita /m²</th>
              <th style={styles.tablaTh}>Babosas /m²</th>
              <th style={styles.tablaTh}>Huevo babosas</th>
              <th style={styles.tablaTh}>Gusano de arroz</th>
              <th style={styles.tablaTh}>Isoca cortadora</th>
              <th style={styles.tablaTh}>Gusano blanco</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.id}>
                <td style={{ ...styles.tablaTd, ...styles.tablaTdPunto }}>{p.id}</td>
                <td style={styles.tablaTd}>{p.cargado ? p.bicho * 4 : "—"}</td>
                <td style={styles.tablaTd}>{p.cargado ? p.babosa * 4 : "—"}</td>
                <td style={styles.tablaTd}>{p.cargado ? (p.huevoBabosas ? "Sí" : "No") : "—"}</td>
                <td style={styles.tablaTd}>{p.cargado ? (p.gusanoArroz ? "Sí" : "No") : "—"}</td>
                <td style={styles.tablaTd}>{p.cargado ? (p.isocaCortadora ? "Sí" : "No") : "—"}</td>
                <td style={styles.tablaTd}>{p.cargado ? (p.gusanoBlanco ? "Sí" : "No") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={styles.sectionLabel}>
        {puntos.filter((p) => p.cargado).length}/{puntos.length} puntos cargados — valores de
        conteo llevados a m² (× 4 sobre el dato tomado en 1/4 m²)
      </div>
    </div>
  );
}

// ---- Resumen automático de situación (mismo estilo de redacción que sus informes reales) ----
const ETIQUETAS_ABUNDANCIA = ["muy baja", "baja", "baja a media", "media", "media a alta", "alta", "alta a muy alta"];

function resumenPlaga(grid, plaga) {
  const rangos = plaga === "bicho" ? RANGOS_BICHO : RANGOS_BABOSA;
  const entradas = Object.entries(grid);
  const niveles = entradas.map(([, p]) => clasificar(p[plaga] * 4, rangos));
  const counts = {};
  niveles.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
  let modal = 0, max = -1;
  Object.entries(counts).forEach(([n, c]) => {
    if (c > max) {
      max = c;
      modal = +n;
    }
  });
  const abundancia = ETIQUETAS_ABUNDANCIA[modal];

  const altos = entradas.filter(([, p]) => clasificar(p[plaga] * 4, rangos) >= 4);
  const lineasConAltos = new Set(altos.map(([id]) => id.split(".")[0]));
  const totalLineas = new Set(entradas.map(([id]) => id.split(".")[0])).size;
  const distribucion =
    totalLineas > 0 && lineasConAltos.size / totalLineas >= 0.6 ? "generalizada" : "sectorizada";

  return { abundancia, distribucion };
}

// ---- Zona de aplicación de cebo (pensada sobre todo para babosas) ----
// Regla: estaciones con valor >= umbral (2da categoría), rellenando huecos entre
// estaciones afectadas de una misma línea, más una franja de 60m alrededor del borde.
const UMBRAL_APLICACION_BABOSA = 4; // babosas/m² — arranque de la 2da categoría
const FRANJA_PROTECCION_M = 60;
const SPACING_M = 122.47; // espaciado real entre estaciones (1 punto cada 1.5 ha)
const RASTER_RES_M = 12; // resolución de la grilla de cálculo, en metros

const RADIO_VECINO_M = SPACING_M * 1.6; // cubre vecinos ortogonales y diagonales (~196m)

function estacionesSeleccionadas(grid, plaga, umbral) {
  const entradas = Object.entries(grid).map(([id, p]) => ({
    id,
    x: p.x,
    y: p.y,
    afectada: p[plaga] * 4 >= umbral,
  }));
  const seleccionadas = new Set(entradas.filter((e) => e.afectada).map((e) => e.id));

  // Relleno tipo "agujero rodeado": una estación sin plaga se suma si TODAS sus
  // estaciones vecinas reales (por proximidad, incluye diagonales) ya están
  // seleccionadas — funciona igual contra un borde/esquina del lote, donde
  // simplemente hay menos vecinos reales para chequear. Se aplica en pasadas
  // sucesivas por si rellenar una estación deja "rodeada" a otra.
  let cambiado = true;
  while (cambiado) {
    cambiado = false;
    entradas.forEach((e) => {
      if (seleccionadas.has(e.id)) return;
      const vecinos = entradas.filter(
        (o) => o.id !== e.id && Math.hypot(o.x - e.x, o.y - e.y) <= RADIO_VECINO_M
      );
      if (vecinos.length > 0 && vecinos.every((v) => seleccionadas.has(v.id))) {
        seleccionadas.add(e.id);
        cambiado = true;
      }
    });
  }
  return seleccionadas;
}

function puntoEnPoligono(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (yi > y !== yj > y) {
      const xin = xi + ((y - yi) / (yj - yi)) * (xj - xi);
      if (x < xin) inside = !inside;
    }
  }
  return inside;
}

function rotarPunto(x, y, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return { x: x * c - y * s, y: x * s + y * c };
}

// Ángulo real de la grilla de muestreo: usamos la línea con más puntos y
// miramos hacia dónde apunta (del primer al último punto de esa línea).
function anguloGrilla(puntosConId) {
  const porLinea = {};
  puntosConId.forEach((p) => {
    const [linea, punto] = p.id.split(".").map(Number);
    (porLinea[linea] = porLinea[linea] || []).push({ ...p, punto });
  });
  let mejor = null;
  Object.values(porLinea).forEach((fila) => {
    if (!mejor || fila.length > mejor.length) mejor = fila;
  });
  mejor.sort((a, b) => a.punto - b.punto);
  const p0 = mejor[0], p1 = mejor[mejor.length - 1];
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

// Traza el contorno tipo "escalera" (solo bordes rectos, alineados a la
// grilla) de un conjunto de celdas incluidas, y lo simplifica juntando
// segmentos colineales. Devuelve un polígono en el mismo marco (u,v) de las celdas.
function trazarContornoEscalera(celdasIncluidas, resolucion) {
  const esquina = (ci, ri) => [ci * resolucion, ri * resolucion];
  const edgeMap = new Map();
  const addEdge = (a, b) => edgeMap.set(a.join(","), b);

  celdasIncluidas.forEach((_v, key) => {
    const [ci, ri] = key.split(",").map(Number);
    if (!celdasIncluidas.has(`${ci},${ri - 1}`)) addEdge(esquina(ci, ri), esquina(ci + 1, ri)); // arriba
    if (!celdasIncluidas.has(`${ci},${ri + 1}`)) addEdge(esquina(ci + 1, ri + 1), esquina(ci, ri + 1)); // abajo
    if (!celdasIncluidas.has(`${ci - 1},${ri}`)) addEdge(esquina(ci, ri + 1), esquina(ci, ri)); // izquierda
    if (!celdasIncluidas.has(`${ci + 1},${ri}`)) addEdge(esquina(ci + 1, ri), esquina(ci + 1, ri + 1)); // derecha
  });

  const visitados = new Set();
  const loops = [];
  edgeMap.forEach((_v, startKey) => {
    if (visitados.has(startKey)) return;
    const loop = [];
    let curKey = startKey;
    do {
      if (visitados.has(curKey)) break;
      visitados.add(curKey);
      const [cx, cy] = curKey.split(",").map(Number);
      loop.push({ x: cx, y: cy });
      const next = edgeMap.get(curKey);
      if (!next) break;
      curKey = next.join(",");
    } while (curKey !== startKey);
    if (loop.length >= 3) loops.push(loop);
  });

  // simplificar: sacar vértices colineales (donde el contorno sigue derecho)
  return loops.map((loop) => {
    const n = loop.length;
    return loop.filter((b, i) => {
      const a = loop[(i - 1 + n) % n];
      const c = loop[(i + 1) % n];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      return Math.abs(cross) > 1e-6;
    });
  });
}

function calcularZonaAplicacion(grid, plaga, umbral, perimetro) {
  const seleccionadas = estacionesSeleccionadas(grid, plaga, umbral);
  const puntos = Object.entries(grid).map(([id, p]) => ({ id, x: p.x, y: p.y, sel: seleccionadas.has(id) }));

  // Trabajamos en un marco rotado, alineado a la orientación real de las
  // líneas de muestreo, para que el polígono resultante tenga bordes rectos
  // en el mismo sentido que la grilla (nada de diagonales sueltas).
  const theta = anguloGrilla(puntos);
  const puntosR = puntos.map((p) => ({ ...p, ...rotarPunto(p.x, p.y, -theta) }));
  const perimetroR = perimetro.map((v) => rotarPunto(v.x, v.y, -theta));

  const us = perimetroR.map((v) => v.x);
  const vs = perimetroR.map((v) => v.y);
  const minU = Math.min(...us) - FRANJA_PROTECCION_M;
  const maxU = Math.max(...us) + FRANJA_PROTECCION_M;
  const minV = Math.min(...vs) - FRANJA_PROTECCION_M;
  const maxV = Math.max(...vs) + FRANJA_PROTECCION_M;

  const nCols = Math.ceil((maxU - minU) / RASTER_RES_M);
  const nRows = Math.ceil((maxV - minV) / RASTER_RES_M);
  const incluidaGrid = new Map(); // "col,row" -> true
  let celdasIncluidas = 0;
  const radioTotal = SPACING_M / 2 + FRANJA_PROTECCION_M;

  for (let ci = 0; ci < nCols; ci++) {
    for (let ri = 0; ri < nRows; ri++) {
      const cu = minU + ci * RASTER_RES_M + RASTER_RES_M / 2;
      const cv = minV + ri * RASTER_RES_M + RASTER_RES_M / 2;
      if (!puntoEnPoligono(cu, cv, perimetroR)) continue;
      const incluida = puntosR.some(
        (p) => p.sel && Math.max(Math.abs(cu - p.x), Math.abs(cv - p.y)) <= radioTotal
      );
      if (incluida) {
        incluidaGrid.set(`${ci},${ri}`, true);
        celdasIncluidas++;
      }
    }
  }

  // componentes conexas (flood fill 4-conexo) — cada una es un "manchón" separado
  const visitado = new Set();
  const componentes = [];
  for (const key of incluidaGrid.keys()) {
    if (visitado.has(key)) continue;
    const pila = [key];
    const comp = new Map();
    while (pila.length) {
      const k = pila.pop();
      if (visitado.has(k)) continue;
      visitado.add(k);
      comp.set(k, true);
      const [ci, ri] = k.split(",").map(Number);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dci, dri]) => {
        const nk = `${ci + dci},${ri + dri}`;
        if (incluidaGrid.has(nk) && !visitado.has(nk)) pila.push(nk);
      });
    }
    componentes.push(comp);
  }

  const manchones = [];
  componentes.forEach((comp) => {
    const contornos = trazarContornoEscalera(comp, RASTER_RES_M);
    contornos.forEach((loopUV) => {
      // volvemos del marco de celdas (índices * resolución + offset) al real (x,y)
      const enUV = loopUV.map((v) => ({ x: minU + v.x, y: minV + v.y }));
      const enXY = enUV.map((v) => rotarPunto(v.x, v.y, theta));
      manchones.push(enXY);
    });
  });

  const haIncluidas = (celdasIncluidas * RASTER_RES_M * RASTER_RES_M) / 10000;
  return { manchones, haIncluidas, seleccionadas };
}

// Calcula, para la forma real de ESTE lote en particular, el margen mínimo
// necesario para que la leyenda (abajo a la izquierda) nunca toque el
// polígono — probando de menor a mayor, así el lote queda siempre lo más
// grande posible sea cual sea su forma, sin necesidad de números fijos
// pensados para un solo caso.
function calcularEncuadreSeguro(perimetro, minX, minY, spanX, spanY, scaleObjetivo, anchoMaximoPantalla, margenGeneral) {
  const LEG_W = 115;
  const LEG_H = 145;
  const LEG_OFFSET = 8;
  // Zonas reservadas para la brújula (arriba a la derecha) y la escala
  // gráfica (abajo a la derecha) — el lote tampoco puede tocarlas.
  const COMPASS_SIZE = 32;
  const COMPASS_OFFSET = 8;
  const ESCALA_W = 100;
  const ESCALA_H = 34;
  const ESCALA_OFFSET = 8;

  function puntoEnPoligono(px, py, poly) {
    let dentro = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }
  function rectTocaPoligono(rx0, ry0, rx1, ry1, poly, muestras) {
    for (let i = 0; i < muestras; i++) {
      for (let j = 0; j < muestras; j++) {
        const px = rx0 + ((rx1 - rx0) * i) / (muestras - 1);
        const py = ry0 + ((ry1 - ry0) * j) / (muestras - 1);
        if (puntoEnPoligono(px, py, poly)) return true;
      }
    }
    return false;
  }

  for (let margenLD = 20; margenLD <= 140; margenLD += 6) {
    const scaleMaxPorAncho = (anchoMaximoPantalla - margenLD * 2) / spanX;
    const scale = Math.min(scaleObjetivo, scaleMaxPorAncho);
    if (scale <= 0) continue;
    const w = Math.round(spanX * scale + margenLD * 2);
    for (let padAbajoExtra = 30; padAbajoExtra <= 400; padAbajoExtra += 8) {
      const padAbajo = margenGeneral + padAbajoExtra;
      const h = Math.round(spanY * scale + margenGeneral + padAbajo);
      const legY0 = h - LEG_OFFSET - LEG_H;
      if (legY0 < 0) continue;
      const toPxLocal = (x, y) => [margenLD + (x - minX) * scale, margenGeneral + (y - minY) * scale];
      const polyPx = perimetro.map((v) => toPxLocal(v.x, v.y));

      const legX0 = LEG_OFFSET;
      const legX1 = LEG_OFFSET + LEG_W;
      const legY1 = h - LEG_OFFSET;
      if (rectTocaPoligono(legX0, legY0, legX1, legY1, polyPx, 14)) continue;

      const compX0 = w - COMPASS_OFFSET - COMPASS_SIZE;
      const compX1 = w - COMPASS_OFFSET;
      const compY0 = COMPASS_OFFSET;
      const compY1 = COMPASS_OFFSET + COMPASS_SIZE;
      if (rectTocaPoligono(compX0, compY0, compX1, compY1, polyPx, 10)) continue;

      const escX0 = w - ESCALA_OFFSET - ESCALA_W;
      const escX1 = w - ESCALA_OFFSET;
      const escY1 = h - ESCALA_OFFSET;
      const escY0 = escY1 - ESCALA_H;
      if (rectTocaPoligono(escX0, escY0, escX1, escY1, polyPx, 10)) continue;

      return { padIzq: margenLD, margenDerecho: margenLD, padAbajo, scale, w, h };
    }
  }
  // No debería llegar hasta acá salvo un lote con una forma rarísima —
  // devuelvo algo bien conservador para que al menos no se rompa nada.
  const scale = Math.min(scaleObjetivo, (anchoMaximoPantalla - 240) / spanX);
  const padIzq = 120;
  return {
    padIzq,
    margenDerecho: 120,
    padAbajo: margenGeneral + 360,
    scale: Math.max(scale, 0.01),
    w: Math.round(spanX * Math.max(scale, 0.01) + 240),
    h: Math.round(spanY * Math.max(scale, 0.01) + margenGeneral + margenGeneral + 360),
  };
}

// Rosa de los vientos real (no un ícono genérico) — para que se note bien
// clara la orientación del mapa en el informe.
function RosaDeLosVientos({ style, size = 42 }) {
  const c = size / 2;
  const rLarga = size * 0.46;
  const rCorta = size * 0.24;
  const rBase = size * 0.05;

  // Estrella náutica clásica: 4 puntas largas (N/S/E/O) + 4 puntas cortas
  // intermedias (NE/SE/SO/NO), todo en un tono neutro — sin relleno de color.
  function puntaPath(anguloGrados, largo) {
    const a = (anguloGrados * Math.PI) / 180;
    const perp = a + Math.PI / 2;
    const punta = [c + largo * Math.sin(a), c - largo * Math.cos(a)];
    const base1 = [c + rBase * Math.sin(perp), c - rBase * Math.cos(perp)];
    const base2 = [c - rBase * Math.sin(perp), c + rBase * Math.cos(perp)];
    return `${punta.join(",")} ${base1.join(",")} ${c},${c} ${base2.join(",")}`;
  }

  return (
    <svg width={size} height={size} style={style} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={c - 1} fill="rgba(255,255,255,0.14)" stroke="#FFFFFF" strokeWidth="1" />
      {[45, 135, 225, 315].map((ang) => (
        <polygon key={ang} points={puntaPath(ang, rCorta)} fill="#FFFFFF" fillOpacity="0.55" />
      ))}
      {[0, 90, 180, 270].map((ang) => (
        <polygon key={ang} points={puntaPath(ang, rLarga)} fill="#FFFFFF" />
      ))}
      <circle cx={c} cy={c} r={size * 0.035} fill="#1B2E1F" />
      <text x={c} y={size * 0.155} textAnchor="middle" fontSize={size * 0.2} fontWeight="700" fill="#1B2E1F" fontFamily="'IBM Plex Mono', monospace">
        N
      </text>
    </svg>
  );
}

// ---- Mini mapa de una plaga, para la pestaña Salidas (combina las dos) ----
function MiniMapaPlaga({ grid, plaga, titulo, perimetro, paraImprimir, establecimientoNombre, hectareas }) {
  const [satelliteOk, setSatelliteOk] = useState(true);
  // Ancho real disponible en la pantalla del que está mirando esto — medido
  // de verdad (no un número fijo adivinado), para aprovechar bien el ancho
  // en celulares grandes sin desbordar en los chicos.
  const wrapRef = useRef(null);
  const [anchoMedido, setAnchoMedido] = useState(335);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const medir = () => setAnchoMedido(el.clientWidth || 335);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const rangos = plaga === "bicho" ? RANGOS_BICHO : RANGOS_BABOSA;
  const etiqueta = plaga === "bicho" ? "Nº BB/m²" : "Nº Babosas/m²";
  const puntos = Object.entries(grid).map(([id, p]) => ({ id, ...p }));
  const todasLasX = puntos.map((p) => p.x).concat(perimetro.map((v) => v.x));
  const todasLasY = puntos.map((p) => p.y).concat(perimetro.map((v) => v.y));
  const minX = Math.min(...todasLasX);
  const minY = Math.min(...todasLasY);
  const spanX = Math.max(1, Math.max(...todasLasX) - minX);
  const spanY = Math.max(1, Math.max(...todasLasY) - minY);
  // En el informe impreso el mapa se ve mucho más grande, con más detalle —
  // en la pantalla normal se mantiene chico como siempre.
  // Margen superior más generoso — deja al lote "bajar" un poco dentro del
  // recuadro, con más aire arriba (cerca de la brújula) en vez de quedar
  // pegado al borde de arriba.
  const margenGeneral = 34;
  // Techo real de ancho total (en un celular no puede desbordar la pantalla,
  // sin importar cuánto pida "objetivo" al escalar el polígono). Usa el
  // ancho medido de verdad en la pantalla, no un número fijo.
  const anchoMaximoPantalla = paraImprimir ? 900 : anchoMedido;
  const objetivo = paraImprimir ? 380 : 460;
  const scaleCandidata = Math.min(objetivo / spanX, objetivo / spanY, SAT_MAX_SCALE * (paraImprimir ? 1.7 : 1));

  // Encuadre calculado a medida para la forma REAL de este lote — nunca dos
  // lotes van a necesitar el mismo margen, así que se recalcula acá, no con
  // números fijos. Se memoriza para no recalcularlo en cada re-render.
  const encuadre = useMemo(
    () => calcularEncuadreSeguro(perimetro, minX, minY, spanX, spanY, scaleCandidata, anchoMaximoPantalla, margenGeneral),
    [perimetro, minX, minY, spanX, spanY, scaleCandidata, anchoMaximoPantalla, margenGeneral]
  );
  const { padIzq, margenDerecho, padAbajo, scale, w, h } = encuadre;
  const toPx = (x, y) => [padIzq + (x - minX) * scale, margenGeneral + (y - minY) * scale];
  const satUrl = construirUrlSatelital(minX, minY, scale, w, h, padIzq, margenGeneral);
  const escalaBarra = elegirEscalaBarra(scale);

  const resultadoCeldas = useMemo(() => {
    try {
      if (!d3 || !d3.Delaunay) throw new Error("La librería d3 no está disponible en este entorno");
      const delaunay = d3.Delaunay.from(puntos, (p) => p.x, (p) => p.y);
      const pad = 200;
      const voronoi = delaunay.voronoi([minX - pad, minY - pad, minX + spanX + pad, minY + spanY + pad]);
      const hullClip = cascoConvexo(perimetro).map((v) => [v.x, v.y]);
      const lista = puntos.map((p, i) => {
        const cell = voronoi.cellPolygon(i);
        if (!cell) return null;
        const recortada = clipPoligonoConvexo(cell, hullClip);
        if (recortada.length < 3) return null;
        return { id: p.id, puntosPx: recortada.map(([x, y]) => toPx(x, y).join(",")).join(" "), valorM2: p[plaga] * 4 };
      });
      return { lista, error: null };
    } catch (err) {
      console.error("Error calculando las celdas del mapa de densidad (informe):", err);
      return { lista: [], error: err.message || String(err) };
    }
  }, [grid, plaga, minX, minY, scale, padIzq, margenGeneral]);
  const celdas = resultadoCeldas.lista;
  const errorCeldas = resultadoCeldas.error;

  const perimetroPx = perimetro.map((v) => toPx(v.x, v.y).join(",")).join(" ");

  return (
    <div ref={wrapRef} style={styles.miniMapaWrap} className="mapa-informe">
      <div style={styles.miniMapaTitulo}>{titulo}</div>
      {establecimientoNombre && (
        <div style={styles.miniMapaSubtitulo}>
          Establecimiento "{establecimientoNombre}"{hectareas ? ` — ${hectareas} has` : ""}
        </div>
      )}
      {errorCeldas && (
        <div style={styles.errorCeldasBanner}>
          ⚠️ No se pudieron dibujar las celdas de color: {errorCeldas}
        </div>
      )}
      <div style={{ ...styles.satMapBox, width: w, height: h }}>
        {satelliteOk && (
          <img src={satUrl} alt="" onError={() => setSatelliteOk(false)} style={styles.satMapImg} />
        )}
        <RosaDeLosVientos style={styles.satMapCompass} size={32} />

        <svg width={w} height={h} style={{ position: "relative", display: "block" }}>
          {celdas.map((c) => {
            if (!c) return null;
            const nivel = clasificar(c.valorM2, rangos);
            return <polygon key={c.id} points={c.puntosPx} fill={LEVEL_COLORS[nivel]} stroke="rgba(255,255,255,0.35)" strokeWidth={0.5} />;
          })}
          <polygon points={perimetroPx} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeOpacity={0.85} />
          <g transform={`translate(${w - escalaBarra.px - 14}, ${h - 16})`}>
            <text x={escalaBarra.px / 2} y={-4} fill="#FFFFFF" fontSize="8" fontFamily="'IBM Plex Mono', monospace" textAnchor="middle" style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.6))" }}>
              {escalaBarra.metros} m
            </text>
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={(i * escalaBarra.px) / 4}
                y={0}
                width={escalaBarra.px / 4}
                height={4}
                fill={i % 2 === 0 ? "#1B2E1F" : "#FFFFFF"}
                stroke="#1B2E1F"
                strokeWidth={0.5}
              />
            ))}
          </g>
        </svg>

        {/* Leyenda superpuesta arriba del mapa, no al costado */}
        <div style={styles.legendOverlay}>
          <div style={styles.legendOverlayTitle}>{etiqueta}</div>
          {rangos.map((r, i) => (
            <div key={i} style={styles.legendOverlayRow}>
              <span style={{ ...styles.legendSwatch, width: 11, height: 11, background: LEVEL_COLORS[i] }} />
              <span style={styles.legendOverlayText}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
      {satelliteOk && (
        <div style={styles.satAttribution}>Fuente: Esri, Maxar, Earthstar Geographics</div>
      )}
    </div>
  );
}

const CAMPOS_PRESENCIA = [
  ["huevoBabosas", "Huevo de babosas"],
  ["gusanoArroz", "Gusano de arroz"],
  ["isocaCortadora", "Isoca cortadora"],
  ["gusanoBlanco", "Gusano blanco"],
];

function resumenPresencias(grid) {
  // Porcentaje sobre el TOTAL de puntos del lote (no solo los ya cargados)
  const entradas = Object.values(grid);
  const total = entradas.length;
  if (total === 0) return [];
  return CAMPOS_PRESENCIA.map(([campo, nombre]) => {
    const con = entradas.filter((p) => p[campo]).length;
    if (con === 0) return null;
    const pct = con / total;
    const nivel = pct > 0.3 ? "generalizada" : "aislada";
    return `${nombre} = presencia ${nivel}.`;
  }).filter(Boolean);
}

function textoSituacion(resumenBicho, resumenBabosa, presencias) {
  const base = [
    `Bichos Bolita = abundancia ${resumenBicho.abundancia}, distribución ${resumenBicho.distribucion}.`,
    `Babosas = abundancia ${resumenBabosa.abundancia}, distribución ${resumenBabosa.distribucion}.`,
  ];
  // interlineado moderado entre oraciones — sin línea en blanco completa, que quedaba muy separado
  return base.concat(presencias).join("\n");
}

// ---- Vista del polígono de aplicación (relleno + franja de 60m) ----
// Origen de proyección del lote — el mismo que usa el GPS real, para que la
// exportación GPX/KML caiga exactamente en el lugar correcto en un GPS real.
const ORIGEN_LOTE = { lat: -37.92179002562003, lng: -58.4152191764046 };

// Recorrido personal de cada Monitoreador (ayuda memoria: qué puntos planea
// hacer y en qué orden) — vive solo en SU celular, guardado con localStorage,
// nunca se manda a ningún lado ni se sincroniza con nadie más.
function claveMiRuta(loteId, userId) {
  return `miRuta_${loteId}_${userId}`;
}
function cargarMiRuta(loteId, userId) {
  try {
    const raw = localStorage.getItem(claveMiRuta(loteId, userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function guardarMiRuta(loteId, userId, ruta) {
  try {
    localStorage.setItem(claveMiRuta(loteId, userId), JSON.stringify(ruta));
  } catch {
    // si el navegador bloquea localStorage (pasa en algunas vistas previas
    // embebidas), simplemente no se guarda entre sesiones — no rompe nada.
  }
}

function xyALatLon(x, y) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((ORIGEN_LOTE.lat * Math.PI) / 180);
  return { lat: ORIGEN_LOTE.lat - y / metersPerDegLat, lon: ORIGEN_LOTE.lng + x / metersPerDegLng };
}

// Abre Google Maps pidiéndole la ruta calculada de verdad, desde donde esté
// parada la persona en el momento que toca el botón, hasta el centro real
// del lote (calculado a partir de las coordenadas reales del perímetro) —
// no una ruta fija guardada, así sirve para cualquiera sin importar desde
// dónde arranque cada vez.
// Calcula la URL correcta para "cómo llegar" según la plataforma — la usamos
// directo como href de un <a> real (no disparada por código), porque un
// archivo local (file://) no puede simular el toque de forma confiable: la
// app de Maps solo se abre bien cuando la persona toca el link de verdad.
function urlComoLlegar(perimetro) {
  const cx = perimetro.reduce((s, v) => s + v.x, 0) / perimetro.length;
  const cy = perimetro.reduce((s, v) => s + v.y, 0) / perimetro.length;
  const { lat, lon } = xyALatLon(cx, cy);
  const destino = `${lat},${lon}`;
  // Link universal de Google Maps — funciona en cualquier navegador o app
  // real (sea iPhone, Android o compu). La versión "esquema propio de la
  // app" que probamos antes solo hacía falta para tratar de esquivar una
  // restricción de seguridad de Safari con archivos locales sueltos — algo
  // que no existe ni en una página real ni en la app nativa, así que no
  // vale la pena la complejidad extra acá.
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`;
}

// Arma la URL de la imagen satelital calculando el recorte exacto que hace
// falta para que encaje pixel a pixel con el polígono dibujado encima — antes
// esto estaba con un recorte fijo hardcodeado, que no correspondía de verdad
// con las coordenadas reales del lote (por eso se veía corrido).
// La imagen satelital de Esri está guardada internamente en proyección Web
// Mercator (la misma que usa Google Maps y casi todo servicio de mapas web).
// Pedirla en coordenadas geográficas simples (como se hacía antes) obliga al
// servidor a reproyectar, y eso no es una simple rotación: distorsiona la
// forma. Pidiéndola directamente en Web Mercator se evita esa distorsión.
function lonLatAWebMercator(lon, lat) {
  const R = 6378137; // radio de la Tierra (WGS84), en metros
  const x = (R * lon * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { x, y };
}

function construirUrlSatelital(minX, minY, scale, w, h, padIzqPx, padArribaPx) {
  const nw = xyALatLon(minX - padIzqPx / scale, minY - padArribaPx / scale);
  const se = xyALatLon(minX + (w - padIzqPx) / scale, minY + (h - padArribaPx) / scale);
  const nwM = lonLatAWebMercator(nw.lon, nw.lat);
  const seM = lonLatAWebMercator(se.lon, se.lat);
  const bbox = `${nwM.x},${seM.y},${seM.x},${nwM.y}`;
  return (
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
    `?bbox=${bbox}&bboxSR=102100&imageSR=102100&size=${Math.max(1, Math.round(w))},${Math.max(1, Math.round(h))}&format=png32&f=image`
  );
}

function descargarArchivo(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportarGPX(manchones, nombreLote) {
  let rutas = "";
  manchones.forEach((m, i) => {
    const cerrado = [...m, m[0]];
    const pts = cerrado
      .map((v) => {
        const { lat, lon } = xyALatLon(v.x, v.y);
        return `      <rtept lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"></rtept>`;
      })
      .join("\n");
    rutas += `  <rte>\n    <n>Manchón ${i + 1} - ${nombreLote || "Lote"}</n>\n${pts}\n  </rte>\n`;
  });
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Monitoreo de plagas">\n${rutas}</gpx>`;
  descargarArchivo(`manchoneo_${(nombreLote || "lote").replace(/\s+/g, "_")}.gpx`, gpx, "application/gpx+xml");
}

function exportarKML(manchones, nombreLote) {
  let placemarks = "";
  manchones.forEach((m, i) => {
    const cerrado = [...m, m[0]];
    const coords = cerrado
      .map((v) => {
        const { lat, lon } = xyALatLon(v.x, v.y);
        return `${lon.toFixed(7)},${lat.toFixed(7)},0`;
      })
      .join(" ");
    placemarks += `  <Placemark>\n    <n>Manchón ${i + 1} - ${nombreLote || "Lote"}</n>\n    <Style><PolyStyle><color>7d3fa07b</color></PolyStyle></Style>\n    <Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n  </Placemark>\n`;
  });
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n${placemarks}</Document>\n</kml>`;
  descargarArchivo(`manchoneo_${(nombreLote || "lote").replace(/\s+/g, "_")}.kml`, kml, "application/vnd.google-earth.kml+xml");
}

function ZonaAplicacionView({ grid, plaga, hectareas, loteNombre, perimetro }) {
  const { manchones: manchonesCalculados, haIncluidas, seleccionadas } = useMemo(
    () => calcularZonaAplicacion(grid, plaga, UMBRAL_APLICACION_BABOSA, perimetro),
    [grid, plaga, perimetro]
  );
  const [manchones, setManchones] = useState(manchonesCalculados);
  const [editado, setEditado] = useState(false);
  const [verticeActivo, setVerticeActivo] = useState(null); // { mi, vi } | null
  const containerRef = useRef(null);
  const arrastreRef = useRef(null);

  useEffect(() => {
    if (!editado) setManchones(manchonesCalculados);
  }, [manchonesCalculados, editado]);

  function recalcular() {
    setManchones(manchonesCalculados);
    setEditado(false);
    setVerticeActivo(null);
  }

  const puntos = Object.entries(grid).map(([id, p]) => ({ id, ...p }));

  const todasLasX = puntos.map((p) => p.x).concat(perimetro.map((v) => v.x));
  const todasLasY = puntos.map((p) => p.y).concat(perimetro.map((v) => v.y));
  const minX = Math.min(...todasLasX) - FRANJA_PROTECCION_M;
  const minY = Math.min(...todasLasY) - FRANJA_PROTECCION_M;
  const spanX = Math.max(1, Math.max(...todasLasX) + FRANJA_PROTECCION_M - minX);
  const spanY = Math.max(1, Math.max(...todasLasY) + FRANJA_PROTECCION_M - minY);
  const scale = Math.min(320 / spanX, 320 / spanY, SAT_MAX_SCALE);
  const w = spanX * scale + SAT_PAD * 2;
  const h = spanY * scale + SAT_PAD * 2;
  const toPx = (x, y) => [SAT_PAD + (x - minX) * scale, SAT_PAD + (y - minY) * scale];
  const pxAxy = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - SAT_PAD) / scale + minX,
      y: (clientY - rect.top - SAT_PAD) / scale + minY,
    };
  };

  function iniciarArrastre(mi, vi) {
    arrastreRef.current = { mi, vi };
    setVerticeActivo({ mi, vi });
    setEditado(true);
  }
  function moverArrastre(e) {
    if (!arrastreRef.current) return;
    const { mi, vi } = arrastreRef.current;
    const punto = e.touches ? e.touches[0] : e;
    const { x, y } = pxAxy(punto.clientX, punto.clientY);
    setManchones((ms) => ms.map((m, i) => (i !== mi ? m : m.map((v, j) => (j !== vi ? v : { x, y })))));
  }
  function soltarArrastre() {
    arrastreRef.current = null;
    // el vértice queda resaltado (con el botón de confirmar) hasta que el usuario lo acepte
  }
  function confirmarVertice() {
    setVerticeActivo(null);
  }

  const perimetroPx = perimetro.map((v) => toPx(v.x, v.y).join(",")).join(" ");
  const sinEstaciones = seleccionadas.size === 0;
  const haPoligonos = manchones.reduce((acc, m) => {
    let area = 0;
    for (let i = 0; i < m.length; i++) {
      const a = m[i], b = m[(i + 1) % m.length];
      area += a.x * b.y - b.x * a.y;
    }
    return acc + Math.abs(area) / 2 / 10000;
  }, 0);

  const vActivoPx =
    verticeActivo && manchones[verticeActivo.mi]
      ? toPx(manchones[verticeActivo.mi][verticeActivo.vi].x, manchones[verticeActivo.mi][verticeActivo.vi].y)
      : null;

  return (
    <div>
      <div style={{ ...styles.satMapBox, width: w, height: h, margin: "0 auto" }}>
        <div
          ref={containerRef}
          style={{ position: "relative", width: w, height: h, touchAction: "none" }}
          onMouseMove={moverArrastre}
          onMouseUp={soltarArrastre}
          onMouseLeave={soltarArrastre}
          onTouchMove={moverArrastre}
          onTouchEnd={soltarArrastre}
        >
          <svg width={w} height={h} style={{ display: "block" }}>
            <polygon points={perimetroPx} fill="none" stroke="#6B5D2E" strokeWidth={1.5} strokeOpacity={0.7} />
            {manchones.map((m, mi) => (
              <polygon
                key={mi}
                points={m.map((v) => toPx(v.x, v.y).join(",")).join(" ")}
                fill="#1B2E1F"
                fillOpacity={0.28}
                stroke="#1B2E1F"
                strokeWidth={2}
              />
            ))}
            {puntos.map((p) => {
              const [px, py] = toPx(p.x, p.y);
              const sel = seleccionadas.has(p.id);
              return (
                <circle
                  key={p.id}
                  cx={px}
                  cy={py}
                  r={sel ? 4.5 : 3}
                  fill={sel ? "#1B8A4A" : "#FFFFFF"}
                  stroke="#6B5D2E"
                  strokeWidth={1}
                />
              );
            })}
            {manchones.map((m, mi) =>
              m.map((v, vi) => {
                const [px, py] = toPx(v.x, v.y);
                const activo = verticeActivo && verticeActivo.mi === mi && verticeActivo.vi === vi;
                return (
                  <circle
                    key={`${mi}-${vi}`}
                    cx={px}
                    cy={py}
                    r={activo ? 9 : 7}
                    fill={activo ? "#D9C078" : "#FFFFFF"}
                    stroke={activo ? "#1B2E1F" : "#1B2E1F"}
                    strokeWidth={2.5}
                    style={{ cursor: "grab" }}
                    onMouseDown={() => iniciarArrastre(mi, vi)}
                    onTouchStart={() => iniciarArrastre(mi, vi)}
                  />
                );
              })
            )}
          </svg>

          {verticeActivo && vActivoPx && (
            <button
              style={{
                ...styles.confirmVerticeBtn,
                left: vActivoPx[0] + 12,
                top: vActivoPx[1] - 14,
              }}
              onClick={confirmarVertice}
            >
              <Check size={12} style={{ marginRight: 4 }} />
              OK
            </button>
          )}
        </div>
      </div>

      <div style={styles.zonaRefRow}>
        <div style={styles.zonaRefItem}>
          <span style={{ ...styles.legendSwatch, background: "#1B2E1F", opacity: 0.4 }} />
          <span style={styles.legendSideText}>manchón(es)</span>
        </div>
        <div style={styles.zonaRefItem}>
          <span style={{ ...styles.legendSwatch, background: "#1B8A4A" }} />
          <span style={styles.legendSideText}>≥ {UMBRAL_APLICACION_BABOSA}/m²</span>
        </div>
        <div style={styles.zonaRefItem}>
          <span style={{ ...styles.legendSwatch, background: "#F4A11E" }} />
          <span style={styles.legendSideText}>vértice en edición</span>
        </div>
      </div>
      <div style={styles.zonaStatBoxCentrado}>
        <span style={styles.zonaStatValue}>{haPoligonos.toFixed(1)} ha</span>
        <span style={styles.zonaStatLabel}>
          {" "}
          de polígono{hectareas ? ` · lote de ${hectareas} ha` : ""}
        </span>
      </div>

      {sinEstaciones ? (
        <div style={styles.salidaHint}>
          Ninguna estación superó el umbral de {UMBRAL_APLICACION_BABOSA}/m² — con estos datos no hace falta
          una aplicación sectorizada.
        </div>
      ) : (
        <>
          <div style={styles.salidaHintRow}>
            <div style={styles.salidaHint}>
              {editado
                ? "Vértices ajustados a mano — tocá uno para moverlo y confirmá con OK."
                : "Rectángulo calculado automático — tocá cualquier vértice para ajustarlo."}
            </div>
            {editado && (
              <button style={styles.salidaRecalcBtn} onClick={recalcular}>
                Recalcular automático
              </button>
            )}
          </div>
          <div style={styles.exportRow}>
            <button style={styles.exportBtn} onClick={() => exportarGPX(manchones, loteNombre)}>
              <Upload size={13} style={{ marginRight: 5, transform: "rotate(180deg)" }} />
              Exportar GPX
            </button>
            <button style={styles.exportBtn} onClick={() => exportarKML(manchones, loteNombre)}>
              <Upload size={13} style={{ marginRight: 5, transform: "rotate(180deg)" }} />
              Exportar KML
            </button>
          </div>
          <div style={styles.salidaHint}>
            El archivo KML es la versión sin comprimir de KMZ — se abre igual en Google Earth y la mayoría
            de apps de GPS agrícola. Comprimir a .kmz real requeriría una librería que este prototipo no tiene disponible.
          </div>
        </>
      )}
    </div>
  );
}

function SalidasView({ grid, loteNombre, establecimientoNombre, hectareas, perimetro }) {
  const [subTab, setSubTab] = useState("informe"); // informe | manchoneo
  // Detección real de cuándo el navegador está imprimiendo/generando el PDF
  // (no un truco de CSS) — así los mapas se recalculan más grandes de verdad.
  const [imprimiendo, setImprimiendo] = useState(false);
  useEffect(() => {
    function antes() {
      setImprimiendo(true);
    }
    function despues() {
      setImprimiendo(false);
    }
    window.addEventListener("beforeprint", antes);
    window.addEventListener("afterprint", despues);
    return () => {
      window.removeEventListener("beforeprint", antes);
      window.removeEventListener("afterprint", despues);
    };
  }, []);

  const resumenBicho = useMemo(() => resumenPlaga(grid, "bicho"), [grid]);
  const resumenBabosa = useMemo(() => resumenPlaga(grid, "babosa"), [grid]);
  const presencias = useMemo(() => resumenPresencias(grid), [grid]);

  const [situacion, setSituacion] = useState(() => textoSituacion(resumenBicho, resumenBabosa, presencias));
  const [editadoManualmente, setEditadoManualmente] = useState(false);

  // Mientras el jefe no haya tocado el texto a mano, se recalcula solo
  // cada vez que cambian los datos cargados (ver bug reportado).
  useEffect(() => {
    if (!editadoManualmente) {
      setSituacion(textoSituacion(resumenBicho, resumenBabosa, presencias));
    }
  }, [resumenBicho.abundancia, resumenBicho.distribucion, resumenBabosa.abundancia, resumenBabosa.distribucion, presencias, editadoManualmente]);

  function recalcular() {
    setSituacion(textoSituacion(resumenBicho, resumenBabosa, presencias));
    setEditadoManualmente(false);
  }

  const [zonas, setZonas] = useState([
    { id: 1, nombre: loteNombre || "Lote", producto: "Crustacicida + Molusquicida", dosis: 5, superficie: hectareas || 0 },
  ]);

  function actualizarZona(id, campo, valor) {
    setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, [campo]: valor } : z)));
  }
  function agregarZona() {
    setZonas((zs) => [...zs, { id: Date.now(), nombre: "", producto: "Crustacicida", dosis: 0, superficie: 0 }]);
  }
  function quitarZona(id) {
    setZonas((zs) => zs.filter((z) => z.id !== id));
  }

  function exportarPDF() {
    window.print();
  }

  function textoInformeCompartir() {
    const lineasZonas = zonas
      .map((z) => {
        const kg = (Number(z.dosis) || 0) * (Number(z.superficie) || 0);
        return `• ${z.nombre || "Zona"}: ${z.producto}, ${z.dosis} kg/ha × ${z.superficie} ha = ${kg.toFixed(0)} kg`;
      })
      .join("\n");
    return (
      `*INFORME TÉCNICO — Zoom Agricultura*\n` +
      `${loteNombre || "Lote"}${establecimientoNombre ? " — " + establecimientoNombre : ""}\n\n` +
      `*Situación de plagas de suelo:*\n${situacion}\n\n` +
      `*Recomendación de aplicación de cebo:*\n${lineasZonas}`
    );
  }

  async function compartirWhatsApp() {
    const texto = textoInformeCompartir();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Informe técnico — Zoom Agricultura", text: texto });
        return;
      } catch (err) {
        // si cancela el share nativo, no hacemos nada más
        if (err && err.name === "AbortError") return;
      }
    }
    // Sin API de compartir nativa (ej. compu de escritorio) — abrimos WhatsApp
    // Web/Desktop con el mensaje ya redactado, listo para elegir el contacto.
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  return (
    <div style={styles.section}>
      <div style={styles.subTabs}>
        <button
          onClick={() => setSubTab("informe")}
          style={{ ...styles.subTab, ...(subTab === "informe" ? styles.subTabActive : {}) }}
        >
          Informe
        </button>
        <button
          onClick={() => setSubTab("manchoneo")}
          style={{ ...styles.subTab, ...(subTab === "manchoneo" ? styles.subTabActive : {}) }}
        >
          Manchoneo
        </button>
      </div>

      {subTab === "informe" ? (
        <>
          <style>{`
            @media print {
              /* Ancho intermedio: cómodo para leer bajando con el dedo en el
                 celular, pero sin verse chico y perdido en una PC — ni hoja
                 A4 ancha, ni ticket angosto. La página mide casi lo mismo
                 que el contenido, para que no quede una hoja vacía enorme
                 alrededor achicando todo. */
              @page { size: 140mm 1400mm; margin: 10mm; }
              body * { visibility: hidden; }
              #informe-imprimible, #informe-imprimible * { visibility: visible; }
              #informe-imprimible {
                position: absolute;
                left: 0;
                top: 0;
                width: 100% !important;
                max-width: 120mm !important;
                margin: 0 auto !important;
                padding: 0 !important;
              }
              .no-imprimir { display: none !important; }

              /* Todo lo que en pantalla es un control editable, acá tiene
                 que verse como texto fijo prolijo — sin bordes, sin fondo,
                 sin flechitas de formulario. */
              #informe-imprimible textarea,
              #informe-imprimible input,
              #informe-imprimible select {
                border: none !important;
                background: transparent !important;
                -webkit-appearance: none !important;
                appearance: none !important;
                padding: 0 !important;
                pointer-events: none !important;
                color: #1B2E1F !important;
              }
              #informe-imprimible textarea { resize: none !important; overflow: hidden !important; }
              #informe-imprimible input[type="number"] { -moz-appearance: textfield !important; }
            }
          `}</style>
          <div id="informe-imprimible">
          <div style={styles.informeLetterhead}>
            <div style={styles.informeLetterheadEyebrow}>INFORME TÉCNICO</div>
            <ZoomLogo variant="dark" iconSize={34} wordSize={22} />
          </div>
          <div style={styles.sectionLabel}>Salida combinada — para armar el informe del lote</div>

          <MiniMapaPlaga grid={grid} plaga="bicho" titulo="Resultado Monitoreo Bichos Bolita" perimetro={perimetro} paraImprimir={imprimiendo} establecimientoNombre={establecimientoNombre} hectareas={hectareas} />
          <MiniMapaPlaga grid={grid} plaga="babosa" titulo="Resultado Monitoreo Babosas" perimetro={perimetro} paraImprimir={imprimiendo} establecimientoNombre={establecimientoNombre} hectareas={hectareas} />

          <div style={styles.salidaCard}>
            <div style={styles.salidaCardTitle}>Situación de plagas de suelo</div>
            <textarea
              style={styles.salidaTextarea}
              value={situacion}
              onChange={(e) => {
                setSituacion(e.target.value);
                setEditadoManualmente(true);
              }}
              rows={5}
            />
            <div style={styles.salidaHintRow} className="no-imprimir">
              <div style={styles.salidaHint}>
                {editadoManualmente
                  ? "Editado a mano — ya no se recalcula solo al cambiar los datos."
                  : "Se recalcula solo a partir de los datos cargados."}
              </div>
              {editadoManualmente && (
                <button style={styles.salidaRecalcBtn} onClick={recalcular}>
                  Recalcular automático
                </button>
              )}
            </div>
          </div>

          <div style={styles.salidaCard}>
            <div style={styles.salidaCardTitle}>Recomendación de aplicación de cebo</div>
            {zonas.map((z) => {
              const kg = (Number(z.dosis) || 0) * (Number(z.superficie) || 0);
              return (
                <div key={z.id} style={styles.zonaRow}>
                  <input
                    style={styles.zonaInputNombre}
                    value={z.nombre}
                    placeholder="Zona / Lote"
                    onChange={(e) => actualizarZona(z.id, "nombre", e.target.value)}
                  />
                  <select
                    style={styles.zonaSelect}
                    value={z.producto}
                    onChange={(e) => actualizarZona(z.id, "producto", e.target.value)}
                  >
                    <option>Crustacicida</option>
                    <option>Molusquicida</option>
                    <option>Crustacicida + Molusquicida</option>
                    <option>No aplicar</option>
                  </select>
                  <div style={styles.zonaNumRow}>
                    <input
                      style={styles.zonaInputNum}
                      type="number"
                      value={z.dosis}
                      onChange={(e) => actualizarZona(z.id, "dosis", e.target.value)}
                    />
                    <span style={styles.zonaUnidad}>kg/ha</span>
                    <input
                      style={styles.zonaInputNum}
                      type="number"
                      value={z.superficie}
                      onChange={(e) => actualizarZona(z.id, "superficie", e.target.value)}
                    />
                    <span style={styles.zonaUnidad}>ha</span>
                    <span style={styles.zonaTotal}>= {kg.toFixed(0)} kg</span>
                    <button style={styles.zonaDelete} className="no-imprimir" onClick={() => quitarZona(z.id)}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            <button style={styles.addClienteBtn} className="no-imprimir" onClick={agregarZona}>
              <Plus size={14} style={{ marginRight: 5 }} />
              Agregar zona
            </button>
          </div>
          </div>

          <button style={styles.exportarPdfBtn} onClick={exportarPDF}>
            <Download size={15} style={{ marginRight: 6 }} />
            Exportar PDF
          </button>
          <button style={styles.compartirWhatsappBtn} onClick={compartirWhatsApp}>
            <MessageCircle size={15} style={{ marginRight: 6 }} />
            Enviar por WhatsApp
          </button>
          <div style={styles.sectionLabel}>
            "Exportar PDF" abre el diálogo de impresión del navegador — elegí "Guardar como PDF" ahí. Es
            una forma real de generar el PDF sin depender de ninguna app externa.
          </div>
        </>
      ) : (
        <>
          <div style={styles.sectionLabel}>
            Polígono de aplicación de cebo — pensado sobre todo para babosas, cuya distribución suele ser sectorizada
          </div>
          <div style={styles.salidaCard}>
            <div style={styles.salidaCardTitle}>Manchoneo — Babosas</div>
            <div style={styles.salidaHint}>
              Estaciones con ≥ {UMBRAL_APLICACION_BABOSA} babosas/m², relleno de huecos entre estaciones
              afectadas de una misma línea, y franja de protección de {FRANJA_PROTECCION_M} m alrededor del borde.
            </div>
            <div style={{ height: 10 }} />
            <ZonaAplicacionView grid={grid} plaga="babosa" hectareas={hectareas} loteNombre={loteNombre} perimetro={perimetro} />
          </div>
        </>
      )}
    </div>
  );
}

function heatColor(t) {
  // blanco -> amarillo -> naranja -> rojo intenso (misma escala de los informes)
  const stops = [
    [255, 255, 255],
    [255, 244, 184],
    [255, 217, 61],
    [255, 167, 38],
    [244, 81, 30],
    [211, 47, 47],
    [142, 0, 0],
  ];
  const seg = Math.min(0.999, t) * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

const styles = {
  app: {
    fontFamily: "'Archivo', sans-serif",
    background: "#FFFFFF",
    minHeight: "100vh",
    color: "#1B2E1F",
    maxWidth: 480,
    margin: "0 auto",
    paddingBottom: 32,
  },
  sessionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 16px 10px",
  },
  sessionUser: {
    fontSize: 12,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#155C35",
    fontWeight: 600,
  },
  sessionRol: {
    fontSize: 10.5,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#8A7B4F",
    fontWeight: 600,
    marginTop: 1,
  },
  sessionLogout: {
    border: "none",
    background: "transparent",
    color: "#155C35",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    textDecoration: "underline",
  },
  sessionLogoutIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid #D9C078",
    background: "transparent",
    color: "#155C35",
    borderRadius: 7,
    width: 28,
    height: 28,
    flexShrink: 0,
  },
  sessionEquipo: {
    border: "none",
    background: "transparent",
    color: "#155C35",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    textDecoration: "underline",
  },
  avisosEquipoWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    margin: "0 16px 14px",
  },
  avisoEquipoBanner: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "#E4F0E7",
    border: "1.5px solid #1B8A4A",
    borderRadius: 10,
    padding: "12px 14px",
  },
  avisoEquipoTexto: {
    fontSize: 13,
    fontWeight: 600,
    color: "#155C35",
    lineHeight: 1.4,
  },
  avisoEquipoBotones: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  avisoEquipoBtnSocio: {
    flex: "1 1 auto",
    border: "none",
    background: "#1B8A4A",
    color: "#FFFFFF",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  avisoEquipoBtnEmpleado: {
    flex: "1 1 auto",
    border: "1.5px solid #1B8A4A",
    background: "transparent",
    color: "#155C35",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  codigoGenerarBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    border: "none",
    background: "#1B8A4A",
    color: "#FFFFFF",
    borderRadius: 9,
    padding: "11px 0",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 10,
  },
  codigoListoBtn: {
    display: "block",
    width: "100%",
    border: "1.5px solid #D9C078",
    background: "transparent",
    color: "#6B5D2E",
    borderRadius: 8,
    padding: "9px 0",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 8,
  },
  codigoBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#F3F7F2",
    border: "1.5px dashed #D9631F",
    borderRadius: 8,
    padding: "10px 14px",
    marginTop: 4,
  },
  codigoTexto: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 15,
    color: "#1B2E1F",
    letterSpacing: "0.03em",
  },
  codigoCopyBtn: {
    border: "1.5px solid #1B8A4A",
    background: "#1B8A4A",
    color: "#F3F7F2",
    borderRadius: 7,
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 700,
  },
  equipoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1.5px solid #D9C078",
    boxShadow: "0 1px 3px rgba(20,35,26,0.07)",
    background: "#FFFFFF",
    borderRadius: 10,
    padding: "8px 12px",
  },
  confirmOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(36,27,18,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    padding: 24,
  },
  confirmBox: {
    boxShadow: "0 1px 3px rgba(20,35,26,0.07)",
    background: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    maxWidth: 340,
    width: "100%",
  },
  confirmBoxTitle: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 15,
    color: "#1B2E1F",
    marginBottom: 6,
  },
  confirmBoxText: {
    fontSize: 12,
    color: "#8A7B4F",
    marginBottom: 16,
    lineHeight: 1.4,
  },
  confirmBoxRow: {
    display: "flex",
    gap: 8,
  },
  confirmBoxNo: {
    flex: 1,
    border: "1.5px solid #D9C078",
    background: "transparent",
    color: "#6B5D2E",
    borderRadius: 8,
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 700,
  },
  confirmBoxYes: {
    flex: 1,
    border: "none",
    background: "#B71C1C",
    color: "#FFFFFF",
    borderRadius: 8,
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 700,
  },
  loginWrap: {
    fontFamily: "'Archivo', sans-serif",
    background: "#FFFFFF",
    minHeight: "100vh",
    maxWidth: 480,
    margin: "0 auto",
    color: "#1B2E1F",
    overflow: "hidden",
  },
  loginHero: {
    position: "relative",
    overflow: "hidden",
    background: "#14231A",
    backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
    backgroundSize: "16px 16px",
    borderRadius: "0 0 28px 28px",
    padding: "40px 24px 34px",
  },
  loginHeroWatermark: {
    position: "absolute",
    top: -40,
    right: -50,
    opacity: 0.08,
  },
  loginBody: {
    padding: "28px 24px 40px",
    backgroundImage: "radial-gradient(#D9C078 1.5px, transparent 1.5px)",
    backgroundSize: "28px 28px",
    backgroundPosition: "-4px -4px",
  },
  loginLogoRow: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 10,
    position: "relative",
  },
  loginEyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13.5,
    letterSpacing: "0.16em",
    color: "#F2A93B",
    fontWeight: 700,
    textAlign: "center",
    position: "relative",
    transform: "translateX(0.08em)", // compensa el letter-spacing, que corre el centro visual hacia la izquierda
  },
  loginTitle: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 900,
    fontSize: 26,
    fontStyle: "italic",
    textAlign: "center",
    margin: "8px 0 0",
    color: "#FFFFFF",
    position: "relative",
  },
  loginList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  loginCard: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 12,
    border: "1.5px solid #EDE0B8",
    boxShadow: "0 3px 10px rgba(20,35,26,0.09)",
    background: "#FFFFFF",
    borderRadius: 14,
    padding: "14px 16px 14px 20px",
    textAlign: "left",
    overflow: "hidden",
  },
  loginCardStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  loginAvatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#FFFFFF",
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 16,
    flexShrink: 0,
    boxShadow: "0 2px 5px rgba(20,35,26,0.2)",
  },
  loginNombre: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 15,
    marginBottom: 5,
  },
  loginRol: {
    fontSize: 12,
    color: "#A9752E",
    marginTop: 1,
  },
  loginRolChip: {
    display: "inline-block",
    fontSize: 10.5,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    letterSpacing: "0.03em",
    border: "1.3px solid",
    borderRadius: 999,
    padding: "2px 9px",
  },
  loginFootnote: {
    fontSize: 11,
    color: "#A89968",
    textAlign: "center",
    marginTop: 28,
    lineHeight: 1.5,
  },
  loginJoinBtn: {
    display: "block",
    width: "100%",
    border: "1.5px dashed #D9631F",
    background: "transparent",
    color: "#D9631F",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
  },
  loginDemoLink: {
    display: "block",
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#8A7B4F",
    borderRadius: 10,
    padding: "10px 0",
    fontSize: 11.5,
    fontWeight: 600,
    marginTop: 10,
    textAlign: "center",
    textDecoration: "underline",
  },
  loginDemoAviso: {
    background: "#F3F7F2",
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12,
    color: "#6B5D2E",
    lineHeight: 1.4,
    marginBottom: 14,
  },
  loginInfoOlvido: {
    background: "#F3F7F2",
    border: "1px solid #D9C078",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 11.5,
    color: "#6B5D2E",
    lineHeight: 1.4,
  },
  loginJoinForm: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  loginLimpiarBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px dashed #B71C1C",
    background: "transparent",
    color: "#B71C1C",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 11.5,
    fontWeight: 600,
    marginTop: 4,
  },
  loginBackLink: {
    border: "none",
    background: "transparent",
    color: "#8A7B4F",
    fontSize: 12,
    fontWeight: 600,
    textAlign: "center",
    marginTop: 4,
  },
  loginError: {
    fontSize: 12,
    color: "#B71C1C",
    fontWeight: 600,
  },
  roleSwitcher: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    padding: "10px 16px 0",
  },
  roleSwitcherLabel: {
    fontSize: 10,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#D9631F",
    marginRight: 2,
  },
  roleSwitcherDivider: {
    width: 1,
    height: 14,
    background: "#D8C9A8",
    margin: "0 2px",
  },
  roleBtn: {
    border: "1.5px solid #D9631F",
    background: "transparent",
    color: "#D9631F",
    borderRadius: 6,
    padding: "3px 9px",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  roleBtnActive: {
    background: "#D9631F",
    color: "#FFFFFF",
  },
  header: {
    padding: "22px 16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    background: "#14231A",
    backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
    backgroundSize: "16px 16px",
    borderRadius: "0 0 20px 20px",
    marginBottom: 4,
  },
  headerRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
  },
  eyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.04em",
    color: "#F2A93B",
    fontWeight: 600,
  },
  headerComunidad: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 21,
    color: "#FFFFFF",
    marginTop: 6,
    whiteSpace: "nowrap",
  },
  headerComunidadRule: {
    width: 32,
    height: 3,
    background: "#DB945D",
    borderRadius: 2,
    marginTop: 8,
  },
  loteName: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 20,
    marginTop: 8,
    color: "#FFFFFF",
  },
  syncPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#FFFFFF",
    border: "none",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  loteRow: {
    display: "flex",
    gap: 8,
    padding: "0 16px 10px",
  },
  loteChip: {
    border: "1.5px solid #D9C078",
    background: "transparent",
    borderRadius: 8,
    padding: "6px 12px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: 600,
    color: "#6B5D2E",
  },
  loteChipActive: {
    background: "#2F6B3E",
    borderColor: "#2F6B3E",
    color: "#FFFFFF",
  },
  tabs: {
    display: "flex",
    margin: "4px 16px 14px",
    background: "#EDE0B8",
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    border: "none",
    background: "transparent",
    padding: "9px 0",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    color: "#8A7B4F",
  },
  tabActive: {
    background: "#1B8A4A",
    color: "#F3F7F2",
  },
  subTabs: {
    display: "flex",
    marginBottom: 14,
    background: "transparent",
    borderBottom: "2px solid #EDE0B8",
    gap: 4,
  },
  informeLetterhead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    marginBottom: 14,
    borderBottom: "3px solid #DB945D",
  },
  informeLetterheadEyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "#D9631F",
  },
  subTab: {
    border: "none",
    background: "transparent",
    padding: "6px 4px 10px",
    marginRight: 18,
    fontSize: 12.5,
    fontWeight: 700,
    color: "#8A7B4F",
    borderBottom: "2px solid transparent",
    marginBottom: -2,
  },
  subTabActive: {
    color: "#1B2E1F",
    borderBottom: "2px solid #1B8A4A",
  },
  section: { padding: "0 16px" },
  backSyncRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 16px",
    gap: 8,
    flexWrap: "wrap",
  },
  backRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    background: "transparent",
    color: "#A9752E",
    fontSize: 13,
    fontWeight: 600,
    padding: "2px 0 12px",
  },
  emptyState: {
    fontSize: 13,
    color: "#8A7B4F",
    padding: "20px 0",
    textAlign: "center",
  },
  loteListWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 12,
  },
  loteCard: {
    border: "1.5px solid #D9C078",
    boxShadow: "0 1px 3px rgba(20,35,26,0.07)",
    background: "#FFFFFF",
    borderRadius: 12,
    overflow: "hidden",
  },
  loteCardTopRow: {
    display: "flex",
    alignItems: "center",
  },
  loteCardMain: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flex: 1,
    width: "100%",
    minWidth: 0,
    border: "none",
    background: "transparent",
    padding: "14px 16px",
    textAlign: "left",
  },
  deleteLoteBtn: {
    border: "none",
    background: "transparent",
    color: "#D9631F",
    padding: "0 14px 0 4px",
    flexShrink: 0,
  },
  loteCardEst: {
    fontSize: 15,
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    color: "#1B2E1F",
  },
  loteCardNombreEmpleado: {
    fontFamily: "'Archivo', sans-serif",
    fontWeight: 600,
    fontSize: 13,
    color: "#5C5236",
    margin: "3px 0 1px",
  },
  loteCardNombre: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 13,
    margin: "2px 0",
  },
  loteCardCultivo: {
    fontSize: 12,
    color: "#A9752E",
  },
  loteChecksRow: {
    display: "flex",
    gap: 4,
    padding: "0 16px 14px",
    flexWrap: "wrap",
  },
  comoLlegarBtn: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #1B8A4A",
    background: "#F3F7F2",
    color: "#1B6B39",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    textDecoration: "none",
  },
  loteCheckPill: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
  },
  loteCheckPillOk: {
    background: "#E4F0E7",
    color: "#1F9350",
  },
  loteCheckPillPendiente: {
    background: "#F4E3D6",
    color: "#C1590A",
  },
  loteCheckPillRojo: {
    background: "#FDECEC",
    color: "#B71C1C",
  },
  loteCheckPillInfo: {
    display: "flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    color: "#6B5D2E",
    textDecoration: "none",
  },
  infoDesgloseBox: {
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    padding: "10px 12px",
    margin: "8px 0 0",
    background: "#F3F7F2",
  },
  infoDesgloseTitulo: {
    fontSize: 11.5,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    color: "#8A7B4F",
    marginBottom: 8,
  },
  infoDesgloseVacio: {
    fontSize: 12.5,
    color: "#8A7B4F",
  },
  infoDesgloseFila: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 0",
  },
  infoDesgloseAvatar: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  infoDesgloseNombre: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    color: "#1B2E1F",
  },
  infoDesgloseCantidad: {
    fontSize: 12.5,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#6B5D2E",
    fontWeight: 700,
  },
  loteCheckDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#C1590A",
    display: "inline-block",
  },
  arbolWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginBottom: 12,
  },
  arbolCliente: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  arbolClienteHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: "transparent",
    padding: 0,
  },
  arbolClienteRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  arbolClienteNombre: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 18,
    color: "#1B2E1F",
  },
  arbolEstablecimiento: {
    marginLeft: 20,
    paddingLeft: 10,
    borderLeft: "2px solid #D8CBA6",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  arbolEstablecimientoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  arbolEstablecimientoHeader: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "none",
    background: "transparent",
    padding: 0,
  },
  arbolEstablecimientoNombre: {
    fontSize: 13.5,
    fontFamily: "'Archivo', sans-serif",
    color: "#A9752E",
    fontWeight: 700,
    letterSpacing: "0.01em",
  },
  addSmallBtn: {
    display: "flex",
    alignItems: "center",
    border: "1px dashed #D9631F",
    background: "transparent",
    color: "#D9631F",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 10.5,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
    whiteSpace: "nowrap",
  },
  arbolBtnGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  deleteSmallBtn: {
    border: "none",
    background: "transparent",
    color: "#A89968",
    padding: 2,
  },
  menuWrap: {
    position: "relative",
  },
  plusBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    border: "1.5px solid #1B8A4A",
    background: "transparent",
    color: "#1B8A4A",
    borderRadius: "50%",
  },
  plusBtnSmall: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    border: "1.5px solid #1B8A4A",
    background: "transparent",
    color: "#1B8A4A",
    borderRadius: "50%",
  },
  menuOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 14,
    background: "transparent",
  },
  menuDropdown: {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    background: "#FFFFFF",
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    boxShadow: "0 4px 12px rgba(20,35,26,0.15)",
    zIndex: 15,
    minWidth: 190,
    overflow: "hidden",
  },
  menuItem: {
    display: "block",
    width: "100%",
    border: "none",
    borderBottom: "1px solid #EDE0B8",
    background: "transparent",
    color: "#1B2E1F",
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
  },
  menuItemDanger: {
    display: "block",
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#B71C1C",
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
  },
  trashLoteBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    flexShrink: 0,
    border: "none",
    background: "transparent",
    color: "#A89968",
    marginRight: 10,
  },
  editLoteBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    flexShrink: 0,
    border: "none",
    background: "transparent",
    color: "#A9752E",
    marginRight: 4,
  },
  inlineFormLotePadded: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    padding: "14px 16px",
  },
  addClienteBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px dashed #D9631F",
    background: "transparent",
    color: "#D9631F",
    borderRadius: 10,
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 28,
  },
  exportarPdfBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    border: "none",
    background: "#1B2E1F",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "13px 0",
    fontSize: 14,
    fontWeight: 700,
    marginTop: 24,
  },
  compartirWhatsappBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    border: "1.5px solid #1B8A4A",
    background: "#FFFFFF",
    color: "#1B8A4A",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 13.5,
    fontWeight: 700,
    marginTop: 8,
  },
  inlineForm: {
    display: "flex",
    gap: 6,
    marginTop: -2,
    flexWrap: "wrap",
  },
  inlineFormCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    background: "#FFFFFF",
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    padding: 10,
  },
  inlineInput: {
    flex: 1,
    border: "1.5px solid #D9C078",
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 16,
    fontFamily: "'Archivo', sans-serif",
    background: "#FFFFFF",
    color: "#1B2E1F",
  },
  inlineConfirmBtn: {
    border: "none",
    background: "#1B8A4A",
    color: "#F3F7F2",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
  },
  inlineCancelBtn: {
    border: "1.5px solid #D9C078",
    background: "transparent",
    color: "#8A7B4F",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
  },
  kmzCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    border: "1.5px dashed #D9631F",
    boxShadow: "0 1px 3px rgba(20,35,26,0.07)",
    background: "#FFFFFF",
    borderRadius: 12,
    padding: "14px 16px",
  },
  kmzCardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  kmzUploadBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid #1B8A4A",
    background: "#1B8A4A",
    color: "#F3F7F2",
    borderRadius: 8,
    padding: "9px 0",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
  },
  kmzProcessing: {
    fontSize: 12,
    color: "#8A7B4F",
    fontFamily: "'IBM Plex Mono', monospace",
    padding: "6px 0",
  },
  kmzResult: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 2,
  },
  kmzResultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
    color: "#6B5D2E",
  },
  kmzHaInput: {
    width: 56,
    border: "1.5px solid #D9C078",
    borderRadius: 6,
    padding: "3px 6px",
    fontSize: 16,
    fontFamily: "'IBM Plex Mono', monospace",
    textAlign: "center",
    background: "#F3F7F2",
  },
  accesoToggleRow: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    border: "none",
    borderTop: "1px solid #EDE0B8",
    background: "#F3F7F2",
    padding: "7px 16px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#8A7B4F",
    fontWeight: 600,
  },
  accesoDropdown: {
    borderTop: "1px solid #EDE0B8",
    padding: "4px 0",
  },
  accesoDropdownRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    border: "none",
    background: "transparent",
    padding: "9px 16px",
    textAlign: "left",
  },
  accesoCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: "1.5px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  accesoDropdownNombre: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1B2E1F",
    flex: 1,
  },
  accesoDropdownRol: {
    fontSize: 10.5,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#8A7B4F",
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 12,
    color: "#8A7B4F",
    marginBottom: 10,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  gridWrap: {
    display: "grid",
    gap: 6,
    marginBottom: 12,
  },
  legendRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    display: "inline-block",
  },
  legendText: {
    fontSize: 11,
    color: "#8A7B4F",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  rutaOfflineBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    border: "1.5px solid #1B8A4A",
    background: "#F3F7F2",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 14,
    boxSizing: "border-box",
  },
  rutaOfflineBannerTitulo: {
    fontSize: 13,
    fontWeight: 700,
    color: "#155C35",
  },
  avisoOfflineGeneral: {
    display: "flex",
    alignItems: "flex-start",
    border: "1.5px solid #A9752E",
    background: "#EDE0B8",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 14,
  },
  avisoOfflineGeneralTitulo: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "#5C4A1E",
    marginBottom: 3,
  },
  avisoOfflineGeneralTexto: {
    fontSize: 12,
    color: "#6B5A2E",
    lineHeight: 1.4,
  },
  miRutaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  miRutaToggle: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #6B5D2E",
    background: "transparent",
    color: "#6B5D2E",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11.5,
    fontWeight: 700,
  },
  miRutaToggleActivo: {
    background: "#1E6FEB",
    borderColor: "#1E6FEB",
    color: "#FFFFFF",
  },
  miRutaOk: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "#1E6FEB",
    color: "#FFFFFF",
    borderRadius: 999,
    width: 30,
    height: 30,
  },
  miRutaConfirmada: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #1F9350",
    background: "#E3F3E6",
    color: "#155C35",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11.5,
    fontWeight: 700,
  },
  miRutaConfirmPregunta: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    border: "1.5px solid #1F9350",
    background: "#E3F3E6",
    color: "#155C35",
    borderRadius: 999,
    padding: "6px 8px 6px 12px",
    fontSize: 11.5,
    fontWeight: 700,
  },
  miRutaConfirmSi: {
    border: "none",
    background: "#1F9350",
    color: "#FFFFFF",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  miRutaConfirmNo: {
    border: "1.5px solid #1F9350",
    background: "transparent",
    color: "#155C35",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  miRutaContador: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    color: "#6B5D2E",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11.5,
    fontWeight: 700,
  },
  gpsRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 14,
  },
  gpsPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#FFFFFF",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 10.5,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  gpsLuz: {
    width: 6.5,
    height: 6.5,
    borderRadius: "50%",
    flexShrink: 0,
    boxShadow: "0 0 3px 1px rgba(255,255,255,0.5)",
  },
  gpsBtn: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #1B8A4A",
    background: "#1B8A4A",
    color: "#F3F7F2",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
  },
  mapToolsRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  compassBtn: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    color: "#6B5D2E",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  compassPillActive: {
    display: "flex",
    alignItems: "center",
    background: "#1F9350",
    color: "#FFFFFF",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  rotateManual: {
    display: "flex",
    gap: 4,
  },
  zoomGroup: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  zoomBtn: {
    width: 28,
    height: 28,
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    borderRadius: 7,
    fontSize: 14,
    fontWeight: 700,
    color: "#6B5D2E",
  },
  zoomLabel: {
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#8A7B4F",
    minWidth: 34,
    textAlign: "center",
  },
  mapBox: {
    position: "relative",
    background: "#EFE8CE",
    border: "1.5px solid #D9C078",
    borderRadius: 12,
    margin: "0 auto 14px",
    overflow: "hidden",
  },
  expandirBtn: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #1B8A4A",
    background: "transparent",
    color: "#1B8A4A",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    marginLeft: "auto",
  },
  resetVistaBtn: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    color: "#6B5D2E",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  observacionesSection: {
    margin: "14px 16px 0",
  },
  observacionesToggle: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    border: "1.5px solid #D9C078",
    background: "#F3F7F2",
    color: "#1B2E1F",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
  },
  observacionesLista: {
    border: "1.5px solid #D9C078",
    borderTop: "none",
    borderRadius: "0 0 10px 10px",
    padding: "10px 14px",
    background: "#FFFFFF",
  },
  observacionesVacio: {
    fontSize: 12.5,
    color: "#8A7B4F",
    fontStyle: "italic",
    padding: "4px 0",
  },
  observacionFila: {
    padding: "8px 0",
    borderBottom: "1px solid #EDE0B8",
  },
  observacionPunto: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 12.5,
    color: "#A9752E",
    marginBottom: 3,
  },
  observacionTexto: {
    fontSize: 13,
    color: "#1B2E1F",
    lineHeight: 1.4,
  },
  observacionFotosRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  observacionFotoThumbBtn: {
    border: "none",
    background: "transparent",
    padding: 0,
  },
  observacionFotoThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    objectFit: "cover",
    border: "1.5px solid #D9C078",
  },
  fotoLightbox: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    background: "rgba(20,20,20,0.9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fotoLightboxCerrar: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "1.5px solid rgba(255,255,255,0.5)",
    background: "rgba(255,255,255,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  fotoLightboxImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: 10,
    objectFit: "contain",
  },
  fotosGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    border: "1.5px solid #D9C078",
    borderTop: "none",
    borderRadius: "0 0 10px 10px",
    padding: "12px 14px",
    background: "#FFFFFF",
  },
  fotoGridItem: {
    width: 84,
  },
  fotoGridImg: {
    width: 84,
    height: 84,
    borderRadius: 8,
    objectFit: "cover",
    border: "1.5px solid #D9C078",
    marginBottom: 4,
  },
  fotoGridLabel: {
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    color: "#6B5D2E",
    textAlign: "center",
  },
  campanaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px 10px",
    flexWrap: "wrap",
  },
  campanaPill: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #A9752E",
    background: "#FFFFFF",
    color: "#A9752E",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  campanaMenu: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    background: "#FFFFFF",
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    boxShadow: "0 6px 18px rgba(27,46,31,0.18)",
    overflow: "hidden",
    zIndex: 15,
    minWidth: 220,
  },
  campanaMenuItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    borderBottom: "1px solid #EDE0B8",
    background: "#FFFFFF",
    color: "#1B2E1F",
    padding: "10px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  restablecerCampanaBtn: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #1B8A4A",
    background: "transparent",
    color: "#1B8A4A",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11.5,
    fontWeight: 700,
  },
  historialBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    background: "#EDE0B8",
    border: "1.5px solid #A9752E",
    color: "#5C4A1E",
    borderRadius: 10,
    padding: "8px 14px",
    margin: "0 16px 12px",
    fontSize: 12,
    fontWeight: 600,
  },
  historialVolverBtn: {
    border: "1.5px solid #5C4A1E",
    background: "transparent",
    color: "#5C4A1E",
    borderRadius: 7,
    padding: "5px 10px",
    fontSize: 11.5,
    fontWeight: 700,
  },
  focusOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "#F8F1DC",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "10px 10px 12px",
  },
  focusTopBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: 460,
    marginBottom: 8,
  },
  modoTogglesRow: {
    display: "flex",
    gap: 6,
    width: "100%",
    maxWidth: 460,
    marginBottom: 8,
  },
  modoToggleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    color: "#6B5D2E",
    borderRadius: 8,
    padding: "7px 6px",
    fontSize: 11.5,
    fontWeight: 700,
  },
  modoToggleBtnActivo: {
    border: "1.5px solid #1B8A4A",
    background: "#1B8A4A",
    color: "#FFFFFF",
  },
  focusExitBtn: {
    display: "flex",
    alignItems: "center",
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    color: "#6B5D2E",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  recentrarBtn: {
    display: "flex",
    alignItems: "center",
    border: "none",
    background: "#1B8A4A",
    color: "#FFFFFF",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 9.5,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  mapFreeWrap: {
    flex: 1,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: "#2F3B26",
    marginLeft: -10,
    marginRight: -10,
  },
  mapFreeArea: {
    position: "relative",
    overflow: "hidden",
  },
  focusBottom: {
    width: "100%",
    maxWidth: 460,
    marginTop: 10,
  },
  mapWorld: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transformOrigin: "center center",
  },
  toleranceCircle: {
    position: "absolute",
    borderRadius: "50%",
    border: "1.5px dashed",
  },
  mapPoint: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  mapPointFotoBadge: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#1E6FEB",
    border: "1.5px solid #FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  mapPointLabel: {
    position: "absolute",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 8.5,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    color: "#6B5D2E",
    whiteSpace: "nowrap",
    lineHeight: 1,
  },
  mapPointLabelActive: {
    top: -18,
    left: "50%",
    fontSize: 10,
    fontWeight: 700,
    color: "#1B2E1F",
    background: "#F3F7F2",
    borderRadius: 4,
    padding: "1px 4px",
  },
  meMarker: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#1E6FEB",
    border: "3px solid #FFFFFF",
    boxShadow: "0 0 0 2px rgba(30,111,235,0.55)",
    cursor: "grab",
    zIndex: 2,
  },
  meMarkerPulse: {
    position: "absolute",
    inset: -8,
    borderRadius: "50%",
    border: "2px solid rgba(30,111,235,0.4)",
  },
  dpad: {
    display: "grid",
    gridTemplateColumns: "40px 40px 40px",
    justifyContent: "center",
    gap: 4,
    marginBottom: 16,
  },
  dpadBtn: {
    width: 40,
    height: 34,
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    borderRadius: 8,
    fontSize: 14,
    color: "#6B5D2E",
  },
  dpadCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    color: "#8A7B4F",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  distanceCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    border: "1.5px solid",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 12,
    background: "#FFFFFF",
  },
  distancePointId: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 15,
  },
  distanceStatus: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 2,
  },
  distanceValue: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 26,
    fontWeight: 700,
  },
  distanceUnit: {
    fontSize: 13,
    marginLeft: 2,
    opacity: 0.6,
  },
  plagaToggle: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
  },
  plagaBtn: {
    flex: 1,
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    borderRadius: 8,
    padding: "8px 0",
    fontSize: 13,
    fontWeight: 600,
    color: "#6B5D2E",
  },
  plagaBtnActive: {
    background: "#1B8A4A",
    borderColor: "#1B8A4A",
    color: "#FFFFFF",
  },
  plagaCard: {
    flex: 1,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid #EDE0B8",
    background: "transparent",
    borderRadius: 999,
    padding: "5px 4px",
    fontSize: 11,
    fontWeight: 600,
    color: "#8A7B4F",
  },
  plagaCardActive: {
    background: "#E4F0E7",
    borderColor: "#1B8A4A",
    color: "#1B6B39",
  },
  plagaCardIcono: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
  },
  subTabsRow: {
    display: "flex",
    gap: 6,
    marginBottom: 12,
    marginTop: 2,
    background: "transparent",
    borderBottom: "1.5px solid #EDE0B8",
    padding: 0,
  },
  subTabBtn: {
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "#8A7B4F",
    borderRadius: 0,
    padding: "6px 4px 8px",
    fontSize: 12.5,
    fontWeight: 700,
  },
  subTabBtnActive: {
    color: "#1B2E1F",
    borderBottom: "2px solid #1B8A4A",
    boxShadow: "none",
  },
  tablaWrap: {
    marginBottom: 4,
  },
  tablaScroll: {
    overflowX: "auto",
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    marginBottom: 10,
  },
  tabla: {
    borderCollapse: "collapse",
    width: "100%",
    minWidth: 560,
  },
  tablaTh: {
    textAlign: "left",
    padding: "9px 12px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    color: "#6B5D2E",
    background: "#F3F7F2",
    borderBottom: "1.5px solid #D9C078",
    whiteSpace: "nowrap",
  },
  tablaTd: {
    padding: "8px 12px",
    fontSize: 12.5,
    color: "#1B2E1F",
    borderBottom: "1px solid #EDE0B8",
    whiteSpace: "nowrap",
  },
  tablaTdPunto: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
  },
  heatCell: {
    aspectRatio: "1",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  heatCellAbs: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.5)",
  },
  heatVal: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
    color: "#FFFFFF",
    textShadow: "0 1px 2px rgba(0,0,0,0.35)",
  },
  errorCeldasBanner: {
    background: "#FDECEC",
    border: "1.5px solid #B71C1C",
    color: "#B71C1C",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 11.5,
    marginBottom: 10,
  },
  debugCeldasInfo: {
    background: "#EDE0B8",
    border: "1px dashed #A9752E",
    color: "#6B5D2E",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 10.5,
    fontFamily: "'IBM Plex Mono', monospace",
    marginBottom: 10,
  },
  satMapBox: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    flexShrink: 0,
    // fondo de respaldo neutro y claro (por si la imagen satelital real no carga
    // en el entorno donde se abra la app) — ya no el verde simulado de antes
    background: "#D7E8D2",
    border: "1px solid #D9C078",
  },
  satMapImg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "fill",
  },
  satRow: {
    display: "flex",
    flexDirection: "row", // leyenda a la izquierda, mapa a la derecha
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  satMapTitleBlock: {
    marginBottom: 10,
  },
  satMapTitle: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontStyle: "italic",
    fontSize: 14,
    lineHeight: 1.25,
    color: "#1B2E1F",
    marginBottom: 3,
  },
  satMapSubtitle: {
    fontSize: 11,
    color: "#8A7B4F",
    fontFamily: "'IBM Plex Mono', monospace",
    lineHeight: 1.5,
  },
  satMapCompass: {
    position: "absolute",
    top: 8,
    right: 8,
    filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
  },
  compassN: {
    fontSize: 9,
    fontWeight: 800,
    color: "#FFFFFF",
    fontFamily: "'IBM Plex Mono', monospace",
    textShadow: "0 1px 2px rgba(0,0,0,0.7)",
  },
  legendSide: {
    flex: "0 0 auto",
    minWidth: 100,
    boxShadow: "0 1px 3px rgba(20,35,26,0.07)",
    background: "#FFFFFF",
    border: "1px solid #D9C078",
    borderRadius: 8,
    padding: "8px 10px",
  },
  legendSideTitle: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: "#6B5D2E",
    marginBottom: 4,
  },
  legendSideRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "1px 0",
  },
  legendSideText: {
    fontSize: 10,
    color: "#6B5D2E",
    fontFamily: "'IBM Plex Mono', monospace",
    whiteSpace: "nowrap",
  },
  zonaStatBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1px solid #EDE0B8",
  },
  zonaStatBoxCentrado: {
    textAlign: "center",
    marginBottom: 14,
  },
  zonaStatValue: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 16,
    color: "#1B2E1F",
  },
  zonaStatLabel: {
    fontSize: 10,
    color: "#8A7B4F",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  zonaRefRow: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 10,
    marginBottom: 4,
  },
  zonaRefItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  confirmVerticeBtn: {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    border: "none",
    background: "#D9631F",
    color: "#FFFFFF",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
    boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
    zIndex: 3,
  },
  exportRow: {
    display: "flex",
    gap: 8,
    marginTop: 10,
  },
  exportBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    border: "1.5px solid #1B8A4A",
    background: "#1B8A4A",
    color: "#F3F7F2",
    borderRadius: 8,
    padding: "9px 0",
    fontSize: 12,
    fontWeight: 700,
  },
  miniMapaWrap: {
    marginBottom: 18,
  },
  miniMapaTitulo: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontStyle: "italic",
    fontSize: 13,
    color: "#1B2E1F",
    marginBottom: 8,
  },
  miniMapaSubtitulo: {
    fontSize: 11.5,
    color: "#6B5D2E",
    marginTop: -5,
    marginBottom: 8,
  },
  legendOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 6,
    padding: "7px 9px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
  },
  legendOverlayTitle: {
    fontSize: 9.5,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    color: "#1B2E1F",
    marginBottom: 3,
  },
  legendOverlayRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "1.5px 0",
  },
  legendOverlayText: {
    fontSize: 9.5,
    color: "#1B2E1F",
  },
  satAttribution: {
    fontSize: 8.5,
    color: "#A89968",
    marginTop: 3,
    textAlign: "right",
  },
  salidaCard: {
    border: "1.5px solid #D9C078",
    boxShadow: "0 1px 3px rgba(20,35,26,0.07)",
    background: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  salidaCardTitle: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 14,
    marginBottom: 8,
    color: "#1B2E1F",
  },
  salidaTextarea: {
    width: "100%",
    border: "1.5px solid #D9C078",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    lineHeight: 1.55,
    fontFamily: "'Archivo', sans-serif",
    color: "#1B2E1F",
    background: "#F3F7F2",
    resize: "vertical",
    boxSizing: "border-box",
  },
  salidaHintRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  salidaHint: {
    fontSize: 10,
    color: "#A89968",
    fontStyle: "italic",
  },
  salidaRecalcBtn: {
    border: "1px solid #D9631F",
    background: "transparent",
    color: "#D9631F",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  zonaRow: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    border: "1px solid #EDE0B8",
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  zonaInputNombre: {
    border: "1.5px solid #D9C078",
    borderRadius: 7,
    padding: "6px 9px",
    fontSize: 16,
    fontWeight: 600,
    fontFamily: "'Archivo', sans-serif",
    background: "#F3F7F2",
    color: "#1B2E1F",
  },
  zonaSelect: {
    border: "1.5px solid #D9C078",
    borderRadius: 7,
    padding: "6px 9px",
    fontSize: 16,
    fontFamily: "'IBM Plex Mono', monospace",
    background: "#F3F7F2",
    color: "#1B2E1F",
  },
  zonaNumRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  zonaInputNum: {
    width: 56,
    border: "1.5px solid #D9C078",
    borderRadius: 7,
    padding: "5px 6px",
    fontSize: 16,
    fontFamily: "'IBM Plex Mono', monospace",
    textAlign: "center",
    background: "#F3F7F2",
    color: "#1B2E1F",
  },
  zonaUnidad: {
    fontSize: 10,
    color: "#8A7B4F",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  zonaTotal: {
    fontSize: 12,
    fontWeight: 700,
    color: "#155C35",
    fontFamily: "'IBM Plex Mono', monospace",
    marginLeft: "auto",
  },
  zonaDelete: {
    border: "none",
    background: "transparent",
    color: "#D9631F",
  },
  gradientBar: { marginBottom: 18 },
  gradientTrack: {
    height: 10,
    borderRadius: 999,
    background:
      "linear-gradient(90deg, #FFFFFF, #FFF4B8, #FFD93D, #FFA726, #F4511E, #D32F2F, #8E0000)",
    border: "1px solid #E5DFC5",
    marginBottom: 4,
  },
  gradientLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#8A7B4F",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  sheetOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    background: "rgba(36,27,18,0.45)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  conflictoBanner: {
    background: "#FDECEC",
    border: "1.5px solid #B71C1C",
    borderRadius: 10,
    padding: "12px 14px",
    margin: "0 16px 14px",
  },
  conflictoBannerTitulo: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 13,
    color: "#B71C1C",
    marginBottom: 4,
  },
  conflictoBannerTexto: {
    fontSize: 12,
    color: "#7A2E1B",
    lineHeight: 1.4,
    marginBottom: 10,
  },
  conflictoListaWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  conflictoResolverBtn: {
    border: "1.5px solid #B71C1C",
    background: "#FFFFFF",
    color: "#B71C1C",
    borderRadius: 8,
    padding: "8px 0",
    fontSize: 12.5,
    fontWeight: 700,
  },
  simularConflictoBtn: {
    display: "block",
    width: "calc(100% - 32px)",
    margin: "0 16px 14px",
    border: "1.5px dashed #A89968",
    background: "transparent",
    color: "#8A7B4F",
    borderRadius: 8,
    padding: "8px 0",
    fontSize: 11,
    fontWeight: 600,
  },
  conflictoVersion: {
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },
  conflictoVersionTitulo: {
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 14,
    color: "#1B2E1F",
  },
  conflictoVersionNombre: {
    fontSize: 12,
    color: "#A9752E",
    fontWeight: 600,
    marginTop: 2,
    marginBottom: 10,
  },
  conflictoVersionDatos: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontSize: 13,
    color: "#1B2E1F",
    marginBottom: 12,
  },
  conflictoUsarBtn: {
    display: "block",
    width: "100%",
    border: "none",
    background: "#1B8A4A",
    color: "#FFFFFF",
    borderRadius: 8,
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 700,
  },
  sheet: {
    background: "#FFFFFF",
    width: "100%",
    maxWidth: 480,
    borderRadius: "16px 16px 0 0",
    padding: 20,
  },
  sheetHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    display: "flex",
    alignItems: "center",
    fontFamily: "'Archivo Expanded', sans-serif",
    fontWeight: 800,
    fontSize: 17,
  },
  iconBtn: {
    border: "none",
    background: "transparent",
    color: "#8A7B4F",
  },
  userTag: {
    display: "inline-block",
    border: "1.5px solid",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    marginBottom: 14,
  },
  sheetGroupLabel: {
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#8A7B4F",
    letterSpacing: "0.06em",
    marginTop: 14,
    marginBottom: 2,
  },
  numInput: {
    width: 70,
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    textAlign: "center",
    border: "1.5px solid #D9C078",
    borderRadius: 8,
    padding: "6px 4px",
    background: "#F3F7F2",
    color: "#1B2E1F",
  },
  numInputDisabled: {
    opacity: 0.55,
    background: "#EFE9D6",
  },
  yesNoGroup: {
    display: "flex",
    gap: 6,
  },
  yesNoBtn: {
    border: "1.5px solid #D9C078",
    background: "#F3F7F2",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#6B5D2E",
  },
  yesNoBtnActiveYes: {
    background: "#1B8A4A",
    borderColor: "#1B8A4A",
    color: "#FFF8E7",
  },
  yesNoBtnActiveNo: {
    background: "#EDE0B8",
    borderColor: "#D9C078",
    color: "#6B5D2E",
  },
  yesNoBtnDisabled: {
    opacity: 0.5,
  },
  lockedBanner: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    background: "#EDE0B8",
    border: "1.5px solid #1B2E1F",
    color: "#1B2E1F",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 10,
  },
  reaperturaBox: {
    background: "#F3F7F2",
    border: "1.5px solid #1B8A4A",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 14,
  },
  reaperturaTexto: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "#1B2E1F",
    marginBottom: 10,
  },
  reaperturaBotones: {
    display: "flex",
    gap: 8,
  },
  reaperturaCancelar: {
    flex: 1,
    border: "1.5px solid #D9C078",
    background: "#FFFFFF",
    color: "#6B5D2E",
    borderRadius: 8,
    padding: "9px 0",
    fontSize: 13,
    fontWeight: 700,
  },
  reaperturaSi: {
    flex: 1,
    border: "none",
    background: "#1B8A4A",
    color: "#FFFFFF",
    borderRadius: 8,
    padding: "9px 0",
    fontSize: 13,
    fontWeight: 700,
  },
  unlockLink: {
    border: "none",
    background: "transparent",
    color: "#1B2E1F",
    textDecoration: "underline",
    fontSize: 12,
    fontWeight: 700,
    marginLeft: "auto",
  },
  confirmBtnLocked: {
    width: "100%",
    border: "none",
    background: "#D9C078",
    color: "#6B5D2E",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  counterRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #EDE0B8",
  },
  counterLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: 14,
    fontWeight: 500,
  },
  counterIcono: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    objectFit: "cover",
    marginRight: 8,
    flexShrink: 0,
  },
  counterControls: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1.5px solid #D9C078",
    background: "#F3F7F2",
    fontSize: 16,
    fontWeight: 700,
    color: "#1B2E1F",
  },
  counterVal: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 16,
    fontWeight: 600,
    minWidth: 20,
    textAlign: "center",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#8A7B4F",
    padding: "12px 0",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  photoBtn: {
    width: "100%",
    border: "1.5px dashed #D9C078",
    background: "transparent",
    borderRadius: 10,
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 600,
    color: "#6B5D2E",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 12,
  },
  observacionesBox: {
    width: "100%",
    minHeight: 80,
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 16,
    fontFamily: "'Archivo', sans-serif",
    color: "#1B2E1F",
    background: "#F3F7F2",
    marginTop: -4,
    marginBottom: 12,
    resize: "vertical",
  },
  fotoMenu: {
    position: "absolute",
    bottom: "calc(100% + 4px)",
    left: 0,
    right: 0,
    background: "#FFFFFF",
    border: "1.5px solid #D9C078",
    borderRadius: 10,
    boxShadow: "0 -4px 14px rgba(27,46,31,0.15)",
    overflow: "hidden",
    zIndex: 5,
  },
  fotoMenuItem: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    border: "none",
    borderBottom: "1px solid #EDE0B8",
    background: "#FFFFFF",
    color: "#1B2E1F",
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 600,
  },
  fotoPreviewRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  fotoPreviewItem: {
    position: "relative",
    width: 56,
    height: 56,
    flexShrink: 0,
  },
  fotoPreviewImg: {
    width: 56,
    height: 56,
    borderRadius: 8,
    objectFit: "cover",
    border: "1.5px solid #D9C078",
  },
  fotoQuitarX: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid #FFFFFF",
    background: "#B71C1C",
    color: "#FFFFFF",
  },
  confirmBtn: {
    width: "100%",
    border: "none",
    background: "#2F6B3E",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
