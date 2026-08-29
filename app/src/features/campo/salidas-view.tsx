import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Check, ChevronDown, Download, Pencil, Plus, RotateCcw, Upload, X } from "lucide-react-native";

import {
  areaManchonesHa,
  calcularZonaAplicacion,
  UMBRAL_APLICACION_BABOSA,
  UMBRAL_APLICACION_BICHO,
  type EstacionAplicacion,
} from "@/lib/geo/zona-aplicacion";
import { inferirOrigenDesdePuntos, type XY } from "@/lib/geo/geometria";
import { NIVEL_COLORES, rangosDe } from "@/lib/geo/densidad";
import { resumenPlaga, resumenPresencias, textoSituacion } from "@/lib/informe/situacion";
import {
  construirInformeHtml,
  construirInformeHtmlNuevo,
  exportarInformePdf,
  kgDeProducto,
  resumenPorProducto,
  type ProductoAplicado,
  type ZonaCebo,
} from "@/lib/exportar/informe";
import { construirMapaDensidadHtml } from "@/lib/exportar/mapa-svg";
import { exportarGPX, exportarKML } from "@/lib/exportar/manchones";
import { formatearHectareas } from "@/lib/format";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { PromptModal } from "@/components/prompt-modal";
import { useDatosCampo } from "./usar-datos-campo";
import { MapaDensidad } from "./mapa-densidad";
import { MapaManchoneo, type CapaManchon } from "./mapa-manchoneo";

// Alto fijo — adentro de un ScrollView no tiene sentido "crecer" en alto
// (no hay límite de pantalla que respetar), pero el ancho se mide en vivo
// contra el card real (ver onLayoutMapasCard) para usar todo el espacio
// disponible, no un tamaño achicado a mano que después se pisa todo adentro.
const MAPA_INFORME_ALTO = 280;
// Los mapas del PDF son bastante más grandes que los de pantalla — una
// hoja A4/carta da mucho más lugar que la miniatura del informe, y achicar
// el mapa ahí solo apretaba título/rosa/leyenda/escala sin necesidad. Más
// apaisado que 4:3 a propósito — lotes reales suelen ser más anchos que
// altos, así se aprovecha el ancho de la hoja en vez de dejarlo en blanco
// a los costados cuando el alto es lo que limita el zoom del polígono. La
// primera hoja del PDF es solo el encabezado + estos dos mapas (ver
// page-break-after en informe.ts), así que hay margen para agrandarlos
// más sin que se pisen con el resto del informe.
const MAPA_PDF_ANCHO = 580;
const MAPA_PDF_ALTO = 380;

const PRODUCTOS = ["Crustacicida", "Molusquicida", "Crustacicida + Molusquicida", "No aplicar"];

type SubTab = "informe" | "manchoneo";
type PedidoExport = "pdf" | "gpx" | "kml" | null;

interface SalidasViewProps {
  lote: Lote;
  establecimientoNombre?: string;
  campanaViendo: string;
}

/** Deja pasar dígitos y como mucho UN separador decimal (coma o punto) con
 * un solo dígito después — "5", "5." y "5.5" quedan igual; un segundo
 * dígito decimal o un segundo separador se descartan en el momento. Vuelve
 * a procesar el texto completo en cada cambio (no solo el último
 * caracter), así que también funciona bien borrando/pegando texto. */
function limitarUnDecimal(valor: string): string {
  let resultado = "";
  let tuvoSeparador = false;
  let digitosDecimales = 0;
  for (const ch of valor) {
    if (ch >= "0" && ch <= "9") {
      if (tuvoSeparador) {
        if (digitosDecimales >= 1) continue;
        digitosDecimales++;
      }
      resultado += ch;
    } else if ((ch === "." || ch === ",") && !tuvoSeparador) {
      tuvoSeparador = true;
      resultado += ch;
    }
  }
  return resultado;
}

function zonaInicial(lote: Lote): ZonaCebo {
  return {
    id: "1",
    // En blanco a propósito — la persona escribe lo que quiera acá (el
    // nombre del lote, una zona dentro del lote, lo que sea), no un lote
    // elegido de una lista fija.
    loteNombre: "",
    // Dosis/superficie arrancan vacíos, no en 0 — la persona carga sus
    // propios números desde cero, sin nada que borrar antes.
    productos: [{ id: "1", producto: "Crustacicida + Molusquicida", dosis: "", superficie: "" }],
  };
}

/** Pestaña "Salidas" — portada de `SalidasView` del prototipo: informe
 * técnico (mapas de densidad, situación de plagas auto-generada + editable,
 * recomendación de cebo con exportar PDF), y zona de aplicación/manchoneo
 * (mapa + exportar GPX/KML), con una subsolapa por plaga (bicho bolita y
 * babosas) y el manchón editable a mano — vértices arrastrables, con el
 * límite del lote como freno (ver mapa-manchoneo.tsx). */
export function SalidasView({ lote, establecimientoNombre, campanaViendo }: SalidasViewProps) {
  const { cargando, puntos, cargas } = useDatosCampo(lote.id, campanaViendo);
  const [subTab, setSubTab] = useState<SubTab>("informe");
  // Elige qué diseño de PDF usa "Exportar PDF" — el mismo formulario
  // (mapas, situación, recomendación) sirve para las dos, solo cambia el
  // HTML que se arma al exportar. Puramente para que la persona pruebe las
  // dos versiones y decida cuál prefiere; no hay diferencia en los datos.
  const [disenoInforme, setDisenoInforme] = useState<"tradicional" | "nuevo">("tradicional");

  const puntosConValores = useMemo(
    () =>
      puntos.map((p) => {
        const c = cargas.get(p.id);
        return {
          id: `${p.linea}.${p.puntoNum}`,
          linea: p.linea,
          puntoNum: p.puntoNum,
          x: p.x,
          y: p.y,
          // Un punto sin carga no es lo mismo que un punto cargado en cero
          // — ver PuntoPlaga en lib/informe/situacion.ts.
          cargado: !!c?.cargado,
          bicho: (c?.bicho ?? 0) * 4,
          babosa: (c?.babosa ?? 0) * 4,
          huevoBabosas: c?.huevoBabosas ?? false,
          gusanoArroz: c?.gusanoArroz ?? false,
          isocaCortadora: c?.isocaCortadora ?? false,
          gusanoBlanco: c?.gusanoBlanco ?? false,
        };
      }),
    [puntos, cargas]
  );

  // Espaciado real entre estaciones de este lote — hace falta ARRIBA (no
  // solo para Manchoneo más abajo) porque la distribución de la situación
  // de plagas también agrupa puntos por cercanía real, con el mismo radio.
  const spacingM = Math.sqrt(Math.max(lote.haPorPunto, 0.01) * 10000);

  // ---------- Informe ----------
  const resumenBicho = useMemo(
    () =>
      resumenPlaga(
        puntosConValores.map((p) => ({ id: p.id, x: p.x, y: p.y, valorM2: p.bicho, cargado: p.cargado })),
        "bicho",
        spacingM
      ),
    [puntosConValores, spacingM]
  );
  const resumenBabosa = useMemo(
    () =>
      resumenPlaga(
        puntosConValores.map((p) => ({ id: p.id, x: p.x, y: p.y, valorM2: p.babosa, cargado: p.cargado })),
        "babosa",
        spacingM
      ),
    [puntosConValores, spacingM]
  );
  const presencias = useMemo(() => resumenPresencias(puntosConValores, puntosConValores.length), [puntosConValores]);
  const presenciasClave = presencias.join("|");

  const [situacion, setSituacion] = useState(() => textoSituacion(resumenBicho, resumenBabosa, presencias));
  const [editadoManualmente, setEditadoManualmente] = useState(false);

  // Mientras nadie tocó el texto a mano, se recalcula solo cada vez que
  // cambian los datos cargados — portado de la misma lógica del prototipo.
  useEffect(() => {
    if (!editadoManualmente) setSituacion(textoSituacion(resumenBicho, resumenBabosa, presencias));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- presenciasClave representa a `presencias`
  }, [
    resumenBicho.abundancia,
    resumenBicho.distribucion,
    resumenBicho.sinPresencia,
    resumenBicho.sinDatos,
    resumenBabosa.abundancia,
    resumenBabosa.distribucion,
    resumenBabosa.sinPresencia,
    resumenBabosa.sinDatos,
    presenciasClave,
    editadoManualmente,
  ]);

  function recalcularSituacion() {
    setSituacion(textoSituacion(resumenBicho, resumenBabosa, presencias));
    setEditadoManualmente(false);
  }

  // Los mapas de densidad del informe son los mismos que Resultados (mismos
  // datos, mismo cálculo de celdas) — se arman una sola vez acá y se
  // reusan tanto en pantalla como al exportar el PDF.
  const puntosDensidadBicho = useMemo(
    () => puntosConValores.map((p) => ({ id: `${p.linea}.${p.puntoNum}`, x: p.x, y: p.y, valor: p.bicho })),
    [puntosConValores]
  );
  const puntosDensidadBabosa = useMemo(
    () => puntosConValores.map((p) => ({ id: `${p.linea}.${p.puntoNum}`, x: p.x, y: p.y, valor: p.babosa })),
    [puntosConValores]
  );
  const origenDensidad = useMemo(() => (puntos.length > 0 ? inferirOrigenDesdePuntos(puntos) : null), [puntos]);

  const [zonas, setZonas] = useState<ZonaCebo[]>(() => [zonaInicial(lote)]);

  // Nota libre debajo de "Recomendación de aplicación de cebo" — arranca
  // visible y vacía; la cruz la saca de en medio si no se va a usar (así
  // no queda un cuadro vacío ni en pantalla ni, sobre todo, en el PDF).
  // Sacarla con la cruz no es definitivo: "Agregar cuadro de texto" (al
  // lado de "Agregar lote") la vuelve a mostrar, con lo que tenía escrito.
  const [notaCebo, setNotaCebo] = useState("");
  const [notaCeboVisible, setNotaCeboVisible] = useState(true);

  function actualizarZonaNombre(id: string, valor: string) {
    setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, loteNombre: valor } : z)));
  }
  // "producto" | "dosis" | "superficie" — la superficie va por producto,
  // no una sola compartida entre todos los productos del lote (dos
  // productos del mismo lote pueden cubrir superficies distintas).
  function actualizarProducto(
    zonaId: string,
    productoId: string,
    campo: "producto" | "dosis" | "superficie",
    valor: string
  ) {
    const limpio = campo === "dosis" || campo === "superficie" ? limitarUnDecimal(valor) : valor;
    setZonas((zs) =>
      zs.map((z) => {
        if (z.id !== zonaId) return z;
        return {
          ...z,
          productos: z.productos.map((p) => (p.id === productoId ? { ...p, [campo]: limpio } : p)),
        };
      })
    );
  }
  function agregarProducto(zonaId: string) {
    setZonas((zs) =>
      zs.map((z) =>
        z.id === zonaId
          ? { ...z, productos: [...z.productos, { id: String(Date.now()), producto: "Crustacicida", dosis: "", superficie: "" }] }
          : z
      )
    );
  }
  function quitarProducto(zonaId: string, productoId: string) {
    setZonas((zs) =>
      zs.map((z) => (z.id === zonaId ? { ...z, productos: z.productos.filter((p) => p.id !== productoId) } : z))
    );
  }
  function agregarZona() {
    setZonas((zs) => [...zs, { ...zonaInicial(lote), id: String(Date.now()) }]);
  }
  function quitarZona(id: string) {
    setZonas((zs) => zs.filter((z) => z.id !== id));
  }

  const [exportando, setExportando] = useState<"pdf" | "gpx" | "kml" | null>(null);
  // Qué exportación se está por hacer — mientras no sea null, el modal de
  // nombre está abierto, prellenado con el nombre por defecto de esa
  // exportación puntual (ver nombreDefaultExport). El nombre final lo
  // confirma la persona, siempre se puede sobrescribir.
  const [pedidoExport, setPedidoExport] = useState<PedidoExport>(null);

  // ---------- Manchoneo ----------
  // Dos subsolapas por plaga (a pedido del usuario) — las dos funcionan
  // igual (mismo `calcularZonaAplicacion`), cada una con su propio valor
  // por estación y su propio umbral: el umbral de cada una deja afuera la
  // primera categoría del mapa de densidad correspondiente (0-3 en babosas,
  // 0-59 en bicho bolita — ver los comentarios en zona-aplicacion.ts). Más
  // una tercera, "Dúo": acá NO se calcula ninguna intersección automática
  // (una primera versión de esto lo hacía así — el usuario prefirió verlo
  // y decidirlo a mano, es más fiel a cómo trabaja en el campo). "Dúo" es
  // un espacio de trabajo: muestra los manchones de bicho y de babosa
  // juntos en un mismo mapa (con el fondo de densidad de cualquiera de las
  // dos plagas, a elección), deja editar cualquiera de los dos ahí mismo
  // (la MISMA edición que se ve después en su propia subsolapa — no hay
  // un tercer polígono propio de Dúo), y deja tocar cada manchón individual
  // para marcarlo — los marcados se exportan como "DUO" en vez de
  // "BB"/"BAB", y quedan afuera de la exportación de su subsolapa de
  // origen (ver manchonesActivos/haActivas más abajo).
  const [manchoneoVista, setManchoneoVista] = useState<"bicho" | "babosa" | "duo">("bicho");

  const estacionesBicho: EstacionAplicacion[] = useMemo(
    () => puntosConValores.map((p) => ({ id: p.id, x: p.x, y: p.y, linea: p.linea, puntoNum: p.puntoNum, valorM2: p.bicho })),
    [puntosConValores]
  );
  const estacionesBabosa: EstacionAplicacion[] = useMemo(
    () => puntosConValores.map((p) => ({ id: p.id, x: p.x, y: p.y, linea: p.linea, puntoNum: p.puntoNum, valorM2: p.babosa })),
    [puntosConValores]
  );
  const zonaAplicacionBicho = useMemo(
    () => calcularZonaAplicacion(estacionesBicho, UMBRAL_APLICACION_BICHO, lote.perimetro, spacingM),
    [estacionesBicho, lote.perimetro, spacingM]
  );
  const zonaAplicacionBabosa = useMemo(
    () => calcularZonaAplicacion(estacionesBabosa, UMBRAL_APLICACION_BABOSA, lote.perimetro, spacingM),
    [estacionesBabosa, lote.perimetro, spacingM]
  );

  // El manchón editado a mano (si lo hay) — un slot por plaga, así editar
  // bicho bolita no pisa lo que se haya tocado en babosas y viceversa. En
  // null significa "todavía usando el cálculo automático" — recién se
  // llena con la primera edición de un vértice (ver editarVerticeDePlaga).
  // Compartido de verdad entre la subsolapa de la plaga y "Dúo": editar
  // ahí es editar este mismo estado, no una copia — así lo que se ajusta
  // en Dúo se ve reflejado después en Bicho bolita/Babosas y viceversa.
  const [manchonesManualBicho, setManchonesManualBicho] = useState<XY[][] | null>(null);
  const [manchonesManualBabosa, setManchonesManualBabosa] = useState<XY[][] | null>(null);
  const [editandoManchon, setEditandoManchon] = useState(false);

  // Manchones marcados como "Dúo" a mano — un Set de índices por plaga
  // (dentro de manchonesActivosBicho/Babosa). Se limpian si esa plaga se
  // restablece (ver restablecerPlaga): los índices ya no apuntarían a los
  // mismos polígonos.
  const [duoTagsBicho, setDuoTagsBicho] = useState<Set<number>>(new Set());
  const [duoTagsBabosa, setDuoTagsBabosa] = useState<Set<number>>(new Set());
  // Cuál de las dos plagas se ve de fondo (densidad) y cuál se está
  // editando dentro de la vista Dúo — dos elecciones independientes.
  const [duoFondo, setDuoFondo] = useState<"bicho" | "babosa">("bicho");
  const [duoEditando, setDuoEditando] = useState<"bicho" | "babosa" | null>(null);

  // Manchones/hectáreas efectivos de CADA plaga (editado a mano si existe,
  // si no el automático) — se calculan siempre los dos, no solo el de la
  // subsolapa que se esté mirando, porque "Dúo" los necesita a ambos a la
  // vez sin importar cuál de las otras dos subsolapas se visitó última.
  const manchonesActivosBicho = manchonesManualBicho ?? zonaAplicacionBicho.manchones;
  const manchonesActivosBabosa = manchonesManualBabosa ?? zonaAplicacionBabosa.manchones;
  const haActivasBicho = useMemo(
    () => (manchonesManualBicho ? areaManchonesHa(manchonesManualBicho) : zonaAplicacionBicho.haIncluidas),
    [manchonesManualBicho, zonaAplicacionBicho.haIncluidas]
  );
  const haActivasBabosa = useMemo(
    () => (manchonesManualBabosa ? areaManchonesHa(manchonesManualBabosa) : zonaAplicacionBabosa.haIncluidas),
    [manchonesManualBabosa, zonaAplicacionBabosa.haIncluidas]
  );

  // Manchones marcados como Dúo, de las dos plagas juntos — lo que
  // realmente se exporta/mide en la subsolapa Dúo.
  const manchonesDuo = useMemo(
    () => [
      ...[...duoTagsBicho].map((i) => manchonesActivosBicho[i]).filter((m): m is XY[] => !!m),
      ...[...duoTagsBabosa].map((i) => manchonesActivosBabosa[i]).filter((m): m is XY[] => !!m),
    ],
    [duoTagsBicho, duoTagsBabosa, manchonesActivosBicho, manchonesActivosBabosa]
  );
  const haDuo = useMemo(() => areaManchonesHa(manchonesDuo), [manchonesDuo]);

  // Lo que se exporta/mide como "BB"/"BAB" queda SIN los manchones ya
  // marcados como Dúo (a pedido del usuario: "los otros manchones BB o
  // Babosas los guardo en las otras solapas" — los marcados dejan de
  // contar ahí, pasan a exportarse solo como Dúo). Ojo: esto es aparte de
  // lo que se VE/edita en el mapa de Bicho bolita/Babosas — ahí se sigue
  // mostrando el manchón completo (marcado incluido), para no romper los
  // índices de los vértices al editar; solo el número de hectáreas y la
  // exportación excluyen lo marcado.
  const manchonesExportBicho = useMemo(
    () => (duoTagsBicho.size === 0 ? manchonesActivosBicho : manchonesActivosBicho.filter((_, i) => !duoTagsBicho.has(i))),
    [manchonesActivosBicho, duoTagsBicho]
  );
  const manchonesExportBabosa = useMemo(
    () => (duoTagsBabosa.size === 0 ? manchonesActivosBabosa : manchonesActivosBabosa.filter((_, i) => !duoTagsBabosa.has(i))),
    [manchonesActivosBabosa, duoTagsBabosa]
  );
  const haExportBicho = useMemo(
    () => (duoTagsBicho.size === 0 ? haActivasBicho : areaManchonesHa(manchonesExportBicho)),
    [duoTagsBicho, haActivasBicho, manchonesExportBicho]
  );
  const haExportBabosa = useMemo(
    () => (duoTagsBabosa.size === 0 ? haActivasBabosa : areaManchonesHa(manchonesExportBabosa)),
    [duoTagsBabosa, haActivasBabosa, manchonesExportBabosa]
  );

  // Plaga "efectiva" para todo lo que tiene que ver con edición (mostrar
  // "Restablecer", a quién le pega editarVerticeDePlaga/restablecerPlaga):
  // en Bicho bolita/Babosas es la vista misma; en Dúo, la que se eligió
  // para editar (duoEditando) — null mientras no se eligió ninguna.
  const plagaEditando = manchoneoVista === "duo" ? duoEditando : manchoneoVista;
  const manchonesManualActivo = plagaEditando === "bicho" ? manchonesManualBicho : plagaEditando === "babosa" ? manchonesManualBabosa : null;
  // Lo que se exporta y se muestra como hectáreas — para Dúo, YA es solo lo
  // marcado; para Bicho bolita/Babosas, es el manchón completo MENOS lo que
  // ya se marcó como Dúo (ver el comentario de arriba).
  const manchonesActivos =
    manchoneoVista === "bicho" ? manchonesExportBicho : manchoneoVista === "babosa" ? manchonesExportBabosa : manchonesDuo;
  const haActivas = manchoneoVista === "bicho" ? haExportBicho : manchoneoVista === "babosa" ? haExportBabosa : haDuo;
  const umbralActivo = manchoneoVista === "bicho" ? UMBRAL_APLICACION_BICHO : UMBRAL_APLICACION_BABOSA;
  const unidadActiva = manchoneoVista === "bicho" ? "bichos bolita/m²" : "babosas/m²";
  const etiquetaActiva = manchoneoVista === "bicho" ? "Bicho bolita" : manchoneoVista === "babosa" ? "Babosas" : "Dúo";
  const prefijoExportActivo = manchoneoVista === "bicho" ? "BB" : manchoneoVista === "babosa" ? "BAB" : "DUO";
  // Si hay algo para exportar en la vista actual (para Bicho bolita/Babosas
  // puede dar true acá y aun así haber manchones en el mapa — los que ya se
  // marcaron como Dúo, que se ven/editan igual pero no exportan de acá).
  const sinEstaciones = manchonesActivos.length === 0;
  // Si la plaga tiene manchones para editar/marcar, más allá de que ya
  // estén todos marcados como Dúo (eso no debería esconder "Editar
  // polígono" — el manchón sigue estando ahí).
  const sinManchonesPlaga =
    manchoneoVista === "bicho"
      ? manchonesActivosBicho.length === 0
      : manchoneoVista === "babosa"
        ? manchonesActivosBabosa.length === 0
        : manchonesActivosBicho.length === 0 && manchonesActivosBabosa.length === 0;

  // Colores de contorno consistentes en toda la pestaña — bicho siempre
  // verde, babosa siempre azul, dúo siempre naranja, así se reconoce cada
  // uno de un vistazo tanto en su propia subsolapa como en "Dúo".
  const colorBicho = colors.primary;
  const colorBabosa = colors.info;
  const colorDuo = colors.warning;
  // El mapa de Bicho bolita/Babosas SIEMPRE muestra el manchón completo
  // (marcados como Dúo incluidos) — filtrar acá rompería los índices de
  // vértice al editar (ver el comentario largo más arriba).
  const capasMapa: CapaManchon[] = useMemo(() => {
    if (manchoneoVista === "duo") {
      return [
        { manchones: manchonesActivosBicho, color: colorBicho, marcados: duoTagsBicho, colorMarcado: colorDuo },
        { manchones: manchonesActivosBabosa, color: colorBabosa, marcados: duoTagsBabosa, colorMarcado: colorDuo },
      ];
    }
    const manchonesPlaga = manchoneoVista === "bicho" ? manchonesActivosBicho : manchonesActivosBabosa;
    const color = manchoneoVista === "bicho" ? colorBicho : colorBabosa;
    const marcados = manchoneoVista === "bicho" ? duoTagsBicho : duoTagsBabosa;
    // Se ve en naranja acá también (sin chapita, esa es solo de Dúo) para
    // no perder de vista que ese manchón ya quedó "reservado" para Dúo,
    // aunque se pueda seguir editando y viendo desde esta solapa.
    return [{ manchones: manchonesPlaga, color, marcados, colorMarcado: colorDuo }];
  }, [manchoneoVista, manchonesActivosBicho, manchonesActivosBabosa, duoTagsBicho, duoTagsBabosa, colorBicho, colorBabosa, colorDuo]);

  // Densidad de fondo: en Bicho bolita/Babosas es fija (la de esa plaga);
  // en Dúo la elige la persona (duoFondo) — "primero, intercambiar entre
  // el mapa de babosa y el de bicho bolita", como pidió.
  const densidadFondo = manchoneoVista === "duo" ? duoFondo : manchoneoVista;

  // Sale del modo edición y limpia el estado de edición al cambiar de
  // vista — evita quedar "editando" un manchón que ya no se está mirando.
  function elegirManchoneoVista(vista: "bicho" | "babosa" | "duo") {
    setManchoneoVista(vista);
    setEditandoManchon(false);
  }

  // MapaManchoneo llama a esto UNA sola vez por arrastre (al soltar el
  // dedo, no en cada micro-movimiento — ver la vista previa en vivo propia
  // que tiene ese componente), así que esto corre una vez por edición real,
  // no re-renderiza toda la pantalla en cada frame del arrastre.
  //
  // La primera edición de un manchón "clona" el cálculo automático a mano
  // (`manchones` llega tal cual estaba en pantalla en ese momento) — de ahí
  // en adelante todas las ediciones parten de ese estado editado, no del
  // automático (que de otra forma pisaría los cambios en cada recálculo).
  // Recibe la plaga explícita (no la deduce de manchoneoVista) porque desde
  // Dúo se puede editar cualquiera de las dos sin haber "entrado" a su
  // subsolapa — ver duoEditando.
  function editarVerticeDePlaga(plaga: "bicho" | "babosa", manchonIndex: number, verticeIndex: number, nuevo: XY) {
    const setManual = plaga === "bicho" ? setManchonesManualBicho : setManchonesManualBabosa;
    const automatico = plaga === "bicho" ? zonaAplicacionBicho.manchones : zonaAplicacionBabosa.manchones;
    setManual((actual) => {
      const base = actual ?? automatico;
      return base.map((m, i) => (i !== manchonIndex ? m : m.map((v, j) => (j !== verticeIndex ? v : nuevo))));
    });
  }

  // Restablecer una plaga también limpia sus marcas de Dúo — los índices
  // apuntarían a polígonos distintos una vez que el manchón vuelve al
  // cálculo automático.
  function restablecerPlaga(plaga: "bicho" | "babosa") {
    const setManual = plaga === "bicho" ? setManchonesManualBicho : setManchonesManualBabosa;
    setManual(null);
    (plaga === "bicho" ? setDuoTagsBicho : setDuoTagsBabosa)(new Set());
  }

  // Marca/desmarca un manchón individual como Dúo — se toca directo sobre
  // el mapa (ver onTocarManchon en MapaManchoneo), no hace falta estar en
  // modo edición.
  function alternarDuoTag(plaga: "bicho" | "babosa", manchonIndex: number) {
    const setTags = plaga === "bicho" ? setDuoTagsBicho : setDuoTagsBabosa;
    setTags((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(manchonIndex)) nuevo.delete(manchonIndex);
      else nuevo.add(manchonIndex);
      return nuevo;
    });
  }

  // Nombre por defecto de cada exportación — siempre editable desde el
  // modal (ver onConfirmar), esto solo prellena el campo.
  function nombreDefaultExport(pedido: PedidoExport): string {
    if (pedido === "pdf") {
      return `Informe monitoreo de plagas ${lote.nombre}${establecimientoNombre ? " " + establecimientoNombre : ""}`;
    }
    return `${prefijoExportActivo} Lote ${lote.nombre} ${haActivas.toFixed(1)} Ha`;
  }

  async function confirmarExport(valores: Record<string, string>) {
    const pedido = pedidoExport;
    if (!pedido) {
      setPedidoExport(null);
      return;
    }
    setExportando(pedido);
    try {
      if (pedido === "pdf") {
        const datosInforme = {
          loteNombre: lote.nombre,
          establecimientoNombre,
          situacion,
          zonas,
          notaCebo: notaCeboVisible ? notaCebo : "",
          mapaBichoHtml: construirMapaDensidadHtml(
            puntosDensidadBicho,
            lote.perimetro,
            rangosDe("bicho"),
            NIVEL_COLORES,
            "Nº BB/m²",
            MAPA_PDF_ANCHO,
            MAPA_PDF_ALTO,
            origenDensidad
          ),
          mapaBabosaHtml: construirMapaDensidadHtml(
            puntosDensidadBabosa,
            lote.perimetro,
            rangosDe("babosa"),
            NIVEL_COLORES,
            "Nº Babosas/m²",
            MAPA_PDF_ANCHO,
            MAPA_PDF_ALTO,
            origenDensidad
          ),
        };
        // Mismos datos para las dos versiones — solo cambia qué armador de
        // HTML se usa, según lo que la persona haya elegido arriba.
        const html =
          disenoInforme === "nuevo" ? construirInformeHtmlNuevo(datosInforme) : construirInformeHtml(datosInforme);
        await exportarInformePdf(html, valores.nombre);
      } else {
        const origen = inferirOrigenDesdePuntos(puntos);
        if (pedido === "gpx") await exportarGPX(manchonesActivos, lote.nombre, origen, valores.nombre);
        else await exportarKML(manchonesActivos, lote.nombre, origen, valores.nombre);
      }
    } catch (e: any) {
      Alert.alert(`No se pudo exportar el ${pedido.toUpperCase()}`, e.message ?? String(e));
    } finally {
      setExportando(null);
      setPedidoExport(null);
    }
  }

  const resumen = useMemo(() => resumenPorProducto(zonas), [zonas]);

  // Ancho real del card de mapas, medido en vivo — así el mapa usa todo el
  // espacio disponible en vez de un tamaño achicado a mano (que apretaba
  // título/rosa/leyenda/escala todos contra todos).
  const [anchoCardMapas, setAnchoCardMapas] = useState(0);
  function onLayoutCardMapas(e: LayoutChangeEvent) {
    setAnchoCardMapas(e.nativeEvent.layout.width - 28); // menos el padding del card (14 de cada lado)
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.subTabs}>
        <Text
          onPress={() => setSubTab("informe")}
          style={[styles.subTabTexto, subTab === "informe" && styles.subTabTextoActivo]}
        >
          Informe
        </Text>
        <Text
          onPress={() => setSubTab("manchoneo")}
          style={[styles.subTabTexto, subTab === "manchoneo" && styles.subTabTextoActivo]}
        >
          Manchoneo
        </Text>
      </View>

      {subTab === "informe" ? (
        <ScrollView
          contentContainerStyle={styles.scrollContenido}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {/* Elige qué diseño de PDF arma "Exportar PDF" más abajo — el
              formulario (mapas, situación, recomendación) es el mismo para
              las dos, solo para probar y elegir cuál gusta más. */}
          <View style={styles.disenoToggle}>
            <Pressable
              style={[styles.disenoBoton, disenoInforme === "tradicional" && styles.disenoBotonActivo]}
              onPress={() => setDisenoInforme("tradicional")}
            >
              <Text style={[styles.disenoBotonTexto, disenoInforme === "tradicional" && styles.disenoBotonTextoActivo]}>
                Informe tradicional
              </Text>
            </Pressable>
            <Pressable
              style={[styles.disenoBoton, disenoInforme === "nuevo" && styles.disenoBotonActivo]}
              onPress={() => setDisenoInforme("nuevo")}
            >
              <Text style={[styles.disenoBotonTexto, disenoInforme === "nuevo" && styles.disenoBotonTextoActivo]}>
                Informe nuevo
              </Text>
            </Pressable>
          </View>

          {/* Sin título propio en el card: "Mapa de densidad poblacional" ya
              lo muestra cada mapa adentro suyo (ver MapaDensidad) — ponerlo
              acá también era repetir el mismo texto dos veces seguidas. */}
          <View style={styles.card} onLayout={onLayoutCardMapas}>
            {anchoCardMapas > 40 && (
              <>
                <MapaInformeConLeyenda
                  titulo="Resultado Monitoreo de Bichos Bolita"
                  puntos={puntosDensidadBicho}
                  perimetro={lote.perimetro}
                  plaga="bicho"
                  origen={origenDensidad}
                  ancho={anchoCardMapas}
                  alto={MAPA_INFORME_ALTO}
                />
                <MapaInformeConLeyenda
                  titulo="Resultado Monitoreo de Babosas"
                  puntos={puntosDensidadBabosa}
                  perimetro={lote.perimetro}
                  plaga="babosa"
                  origen={origenDensidad}
                  ancho={anchoCardMapas}
                  alto={MAPA_INFORME_ALTO}
                />
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Situación de plagas de suelo</Text>
            <TextInput
              style={styles.situacionInput}
              value={situacion}
              onChangeText={(v) => {
                setSituacion(v);
                setEditadoManualmente(true);
              }}
              multiline
              numberOfLines={5}
            />
            <View style={styles.hintFila}>
              <Text style={styles.hint}>
                {editadoManualmente
                  ? "Editado a mano — ya no se recalcula solo al cambiar los datos."
                  : "Se recalcula solo a partir de los datos cargados."}
              </Text>
              {editadoManualmente && (
                <Pressable style={styles.recalcularBtn} onPress={recalcularSituacion}>
                  <RotateCcw size={12} color={colors.primaryDark} />
                  <Text style={styles.recalcularTexto}>Recalcular</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Recomendación de aplicación de cebo</Text>
            {notaCeboVisible && (
              <View style={styles.notaFila}>
                <TextInput
                  style={styles.notaInput}
                  value={notaCebo}
                  onChangeText={setNotaCebo}
                  placeholder="Anotar o informar algo (opcional)"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <Pressable style={styles.notaQuitarBtn} onPress={() => setNotaCeboVisible(false)}>
                  <X size={13} color={colors.danger} />
                </Pressable>
              </View>
            )}
            {zonas.map((z) => (
              <ZonaFila
                key={z.id}
                zona={z}
                onCambiarNombre={(v) => actualizarZonaNombre(z.id, v)}
                onCambiarProducto={(prodId, campo, v) => actualizarProducto(z.id, prodId, campo, v)}
                onAgregarProducto={() => agregarProducto(z.id)}
                onQuitarProducto={(prodId) => quitarProducto(z.id, prodId)}
                onQuitar={() => quitarZona(z.id)}
              />
            ))}
            <View style={styles.agregarBotonesFila}>
              {!notaCeboVisible && (
                <Pressable style={[styles.agregarZonaBtn, styles.agregarBotonFlex]} onPress={() => setNotaCeboVisible(true)}>
                  <Plus size={14} color={colors.primaryDark} />
                  <Text style={styles.agregarZonaTexto}>Agregar cuadro de texto</Text>
                </Pressable>
              )}
              <Pressable style={[styles.agregarZonaBtn, styles.agregarBotonFlex]} onPress={agregarZona}>
                <Plus size={14} color={colors.primaryDark} />
                <Text style={styles.agregarZonaTexto}>Agregar lote</Text>
              </Pressable>
            </View>

            {resumen.length > 0 && (
              <View style={styles.resumenBox}>
                <Text style={styles.resumenTitulo}>Total a comprar</Text>
                {resumen.map((r) => (
                  <View key={r.producto} style={styles.resumenFila}>
                    <Text style={styles.resumenProducto}>{r.producto}</Text>
                    <Text style={styles.resumenKg}>{r.totalKg.toFixed(0)} kg</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Pressable style={styles.botonPdf} onPress={() => setPedidoExport("pdf")} disabled={exportando !== null}>
            {exportando === "pdf" ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Download size={15} color={colors.surface} />
            )}
            <Text style={styles.botonPdfTexto}>Exportar PDF</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContenido}>
          <Text style={styles.hint}>
            Polígono de aplicación de cebo, uno por plaga — cada mapa se concentra en las estaciones que superan el
            umbral, dejando afuera la categoría más baja del mapa de densidad correspondiente. "Dúo" muestra los dos
            manchones juntos para poder ajustarlos y marcar a mano dónde va el producto combinado.
          </Text>

          <View style={styles.disenoToggle}>
            <Pressable
              style={[styles.disenoBoton, manchoneoVista === "bicho" && styles.disenoBotonActivo]}
              onPress={() => elegirManchoneoVista("bicho")}
            >
              <Text style={[styles.disenoBotonTexto, manchoneoVista === "bicho" && styles.disenoBotonTextoActivo]}>
                Bicho bolita
              </Text>
            </Pressable>
            <Pressable
              style={[styles.disenoBoton, manchoneoVista === "babosa" && styles.disenoBotonActivo]}
              onPress={() => elegirManchoneoVista("babosa")}
            >
              <Text style={[styles.disenoBotonTexto, manchoneoVista === "babosa" && styles.disenoBotonTextoActivo]}>
                Babosas
              </Text>
            </Pressable>
            <Pressable
              style={[styles.disenoBoton, manchoneoVista === "duo" && styles.disenoBotonActivo]}
              onPress={() => elegirManchoneoVista("duo")}
            >
              <Text style={[styles.disenoBotonTexto, manchoneoVista === "duo" && styles.disenoBotonTextoActivo]}>
                Dúo
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Manchoneo — {etiquetaActiva}</Text>
            {manchoneoVista === "duo" ? (
              <>
                <View style={styles.leyendaDuo}>
                  <View style={styles.leyendaDuoFila}>
                    <View style={[styles.leyendaDuoMuestra, { borderColor: colorBicho }]} />
                    <Text style={styles.hint}>Bicho bolita</Text>
                  </View>
                  <View style={styles.leyendaDuoFila}>
                    <View style={[styles.leyendaDuoMuestra, { borderColor: colorBabosa }]} />
                    <Text style={styles.hint}>Babosas</Text>
                  </View>
                  <View style={styles.leyendaDuoFila}>
                    <View style={[styles.leyendaDuoMuestra, { borderColor: colorDuo }]} />
                    <Text style={styles.hint}>Marcado como Dúo</Text>
                  </View>
                </View>
                <Text style={styles.hint}>Fondo del mapa (densidad):</Text>
                <View style={styles.disenoToggle}>
                  <Pressable
                    style={[styles.disenoBoton, duoFondo === "bicho" && styles.disenoBotonActivo]}
                    onPress={() => setDuoFondo("bicho")}
                  >
                    <Text style={[styles.disenoBotonTexto, duoFondo === "bicho" && styles.disenoBotonTextoActivo]}>
                      Bicho bolita
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.disenoBoton, duoFondo === "babosa" && styles.disenoBotonActivo]}
                    onPress={() => setDuoFondo("babosa")}
                  >
                    <Text style={[styles.disenoBotonTexto, duoFondo === "babosa" && styles.disenoBotonTextoActivo]}>
                      Babosas
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.hint}>
                Estaciones con ≥ {umbralActivo} {unidadActiva}, relleno de huecos entre estaciones afectadas de una
                misma línea, y franja de protección alrededor del borde.
              </Text>
            )}

            <View style={styles.mapaMarco}>
              <MapaManchoneo
                perimetro={lote.perimetro}
                capas={capasMapa}
                puntosDensidad={densidadFondo === "bicho" ? puntosDensidadBicho : puntosDensidadBabosa}
                rangos={rangosDe(densidadFondo)}
                nivelColores={NIVEL_COLORES}
                ancho={320}
                alto={320}
                editable={editandoManchon}
                capaEditable={manchoneoVista === "duo" ? (duoEditando === "babosa" ? 1 : 0) : 0}
                onEditarVertice={(mi, vi, nuevo) =>
                  editarVerticeDePlaga(plagaEditando ?? "bicho", mi, vi, nuevo)
                }
                onTocarManchon={
                  manchoneoVista === "duo" ? (ci, mi) => alternarDuoTag(ci === 0 ? "bicho" : "babosa", mi) : undefined
                }
              />
            </View>
            <Text style={styles.hint}>
              {manchoneoVista === "duo"
                ? "Pellizcá para acercar. Tocá la chapita \"Dúo\" de un manchón para marcarlo/desmarcarlo."
                : "Pellizcá con dos dedos para acercar el mapa."}
            </Text>

            {manchoneoVista === "duo" && (
              <>
                <Text style={styles.hint}>Editar polígono de:</Text>
                <View style={styles.disenoToggle}>
                  <Pressable
                    style={[styles.disenoBoton, duoEditando === "bicho" && styles.disenoBotonActivo]}
                    onPress={() => {
                      setDuoEditando("bicho");
                      setEditandoManchon(false);
                    }}
                  >
                    <Text style={[styles.disenoBotonTexto, duoEditando === "bicho" && styles.disenoBotonTextoActivo]}>
                      Bicho bolita
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.disenoBoton, duoEditando === "babosa" && styles.disenoBotonActivo]}
                    onPress={() => {
                      setDuoEditando("babosa");
                      setEditandoManchon(false);
                    }}
                  >
                    <Text style={[styles.disenoBotonTexto, duoEditando === "babosa" && styles.disenoBotonTextoActivo]}>
                      Babosas
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {!sinManchonesPlaga && (manchoneoVista !== "duo" || duoEditando) && (
              <View style={styles.editarFila}>
                <Pressable style={styles.editarBtn} onPress={() => setEditandoManchon((v) => !v)}>
                  {editandoManchon ? (
                    <Check size={12} color={colors.primaryDark} />
                  ) : (
                    <Pencil size={12} color={colors.primaryDark} />
                  )}
                  <Text style={styles.editarTexto}>{editandoManchon ? "Listo" : "Editar polígono"}</Text>
                </Pressable>
                {manchonesManualActivo && (
                  <Pressable
                    style={styles.editarBtn}
                    onPress={() => restablecerPlaga(plagaEditando ?? "bicho")}
                  >
                    <RotateCcw size={12} color={colors.primaryDark} />
                    <Text style={styles.editarTexto}>Restablecer</Text>
                  </Pressable>
                )}
              </View>
            )}
            {editandoManchon && (
              <Text style={styles.hint}>
                Arrastrá los vértices para ajustar el polígono a mano — no se puede sacar del límite del lote.
              </Text>
            )}

            <View style={styles.statBox}>
              <Text style={styles.statValor}>{haActivas.toFixed(1)} ha</Text>
              <Text style={styles.statLabel}>
                {" "}
                de polígono{manchoneoVista === "duo" ? " marcadas como Dúo" : ""} · lote de{" "}
                {formatearHectareas(lote.hectareas)} ha
              </Text>
            </View>

            {sinEstaciones ? (
              <Text style={styles.hint}>
                {manchoneoVista === "duo"
                  ? "Todavía no marcaste ningún manchón como Dúo — tocá la chapita sobre el mapa para elegir cuál."
                  : `Ninguna estación superó el umbral de ${umbralActivo} ${unidadActiva} — con estos datos no hace falta una aplicación sectorizada.`}
              </Text>
            ) : (
              <>
                <View style={styles.exportRow}>
                  <Pressable style={styles.botonExport} onPress={() => setPedidoExport("gpx")} disabled={exportando !== null}>
                    {exportando === "gpx" ? (
                      <ActivityIndicator color={colors.primaryDark} size="small" />
                    ) : (
                      <Upload size={13} color={colors.primaryDark} />
                    )}
                    <Text style={styles.botonExportTexto}>Exportar GPX</Text>
                  </Pressable>
                  <Pressable style={styles.botonExport} onPress={() => setPedidoExport("kml")} disabled={exportando !== null}>
                    {exportando === "kml" ? (
                      <ActivityIndicator color={colors.primaryDark} size="small" />
                    ) : (
                      <Upload size={13} color={colors.primaryDark} />
                    )}
                    <Text style={styles.botonExportTexto}>Exportar KML</Text>
                  </Pressable>
                </View>
                <Text style={styles.hint}>
                  El KML es la versión sin comprimir de KMZ — se abre igual en Google Earth y la mayoría de apps de
                  GPS agrícola.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      )}

      <PromptModal
        visible={pedidoExport !== null}
        titulo={pedidoExport === "pdf" ? "Exportar PDF" : `Exportar manchoneo (${pedidoExport?.toUpperCase()})`}
        fields={pedidoExport ? [{ key: "nombre", label: "Nombre del archivo", valorInicial: nombreDefaultExport(pedidoExport) }] : []}
        textoConfirmar="Exportar"
        confirmando={exportando !== null}
        onCancelar={() => setPedidoExport(null)}
        onConfirmar={confirmarExport}
      />
    </View>
  );
}

interface MapaInformeConLeyendaProps {
  titulo: string;
  puntos: Array<{ id: string; x: number; y: number; valor: number }>;
  perimetro: Lote["perimetro"];
  plaga: "bicho" | "babosa";
  origen: ReturnType<typeof inferirOrigenDesdePuntos> | null;
  ancho: number;
  alto: number;
}

/** El mismo mapa de densidad de Resultados (mismo componente `MapaDensidad`,
 * mismos datos, con foto satelital de fondo si hay señal, y la leyenda ya
 * adentro del propio rectángulo) — para que la persona vea en pantalla lo
 * mismo que va a salir en el PDF (ahí más grande y sin foto, ver
 * mapa-svg.ts), sin tener que ir a otra pestaña. `ancho` viene medido en
 * vivo del card real (ver onLayoutCardMapas más arriba), no achicado a
 * mano — así usa todo el lugar disponible en vez de apretar todo adentro. */
function MapaInformeConLeyenda({ titulo, puntos, perimetro, plaga, origen, ancho, alto }: MapaInformeConLeyendaProps) {
  const rangos = rangosDe(plaga);
  const etiqueta = plaga === "bicho" ? "Nº BB/m²" : "Nº Babosas/m²";
  return (
    <View style={styles.mapaInformeBloque}>
      <Text style={styles.mapaInformeTitulo}>{titulo}</Text>
      <View style={[styles.mapaInformeMarco, { width: ancho, height: alto }]}>
        <MapaDensidad
          puntos={puntos}
          perimetro={perimetro}
          rangos={rangos}
          nivelColores={NIVEL_COLORES}
          etiquetaLeyenda={etiqueta}
          ancho={ancho}
          alto={alto}
          origen={origen}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  subTabs: {
    flexDirection: "row",
    gap: 32,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  subTabTexto: { fontSize: 13.5, fontWeight: "700", color: colors.textMuted, paddingBottom: 8 },
  subTabTextoActivo: { color: colors.primary, borderBottomWidth: 2, borderBottomColor: colors.primary },
  scrollContenido: { padding: 16, gap: 12 },
  disenoToggle: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
  },
  disenoBoton: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  disenoBotonActivo: { backgroundColor: colors.primaryConfirm },
  disenoBotonTexto: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  disenoBotonTextoActivo: { color: colors.surface },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  cardTitulo: { fontSize: 14, fontWeight: "700", color: colors.text },
  mapaInformeBloque: { gap: 6 },
  mapaInformeTitulo: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
  mapaInformeMarco: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  situacionInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    lineHeight: 22,
    color: colors.text,
    minHeight: 110,
    textAlignVertical: "top",
  },
  hintFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hint: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16, flex: 1 },
  recalcularBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  recalcularTexto: { fontSize: 11.5, fontWeight: "700", color: colors.primaryDark },
  notaFila: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  notaInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    lineHeight: 22,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: "top",
  },
  notaQuitarBtn: { padding: 6 },
  zonaCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  zonaFilaSuperior: { flexDirection: "row", alignItems: "center", gap: 8 },
  zonaNombreInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  zonaQuitarBtn: { padding: 6 },
  productoFila: { gap: 6 },
  zonaProductoFilaSuperior: { flexDirection: "row", alignItems: "center", gap: 6 },
  zonaProductoWrap: { flex: 1, position: "relative" },
  zonaProductoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  zonaProductoTexto: { fontSize: 13, color: colors.text },
  zonaProductoMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.surface,
    zIndex: 10,
    elevation: 10,
  },
  zonaProductoItem: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  zonaProductoItemTexto: { fontSize: 13, color: colors.text },
  zonaNumRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  zonaNumInput: {
    width: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
    textAlign: "center",
  },
  zonaUnidad: { fontSize: 12, color: colors.textMuted },
  zonaTotal: { fontSize: 12.5, fontWeight: "700", color: colors.text, marginLeft: "auto" },
  agregarProductoBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  agregarBotonesFila: { flexDirection: "row", gap: 8 },
  agregarBotonFlex: { flex: 1 },
  agregarZonaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  agregarZonaTexto: { fontSize: 12.5, fontWeight: "700", color: colors.primaryDark, textAlign: "center" },
  resumenBox: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 4,
  },
  resumenTitulo: { fontSize: 12.5, fontWeight: "700", color: colors.text, marginBottom: 2 },
  resumenFila: { flexDirection: "row", justifyContent: "space-between" },
  resumenProducto: { fontSize: 12.5, color: colors.text },
  resumenKg: { fontSize: 12.5, fontWeight: "700", color: colors.primaryDark },
  botonPdf: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 12,
  },
  botonPdfTexto: { color: colors.surface, fontWeight: "700", fontSize: 13 },
  mapaMarco: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 8,
  },
  statBox: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", flexWrap: "wrap" },
  statValor: { fontSize: 18, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
  exportRow: { flexDirection: "row", gap: 10 },
  botonExport: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingVertical: 10,
  },
  botonExportTexto: { fontSize: 12.5, fontWeight: "700", color: colors.primaryDark },
  editarFila: { flexDirection: "row", gap: 8 },
  editarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  editarTexto: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  leyendaDuo: { gap: 4 },
  leyendaDuoFila: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaDuoMuestra: { width: 14, height: 14, borderRadius: 3, borderWidth: 2.5, backgroundColor: "transparent" },
});

interface ZonaFilaProps {
  zona: ZonaCebo;
  onCambiarNombre: (valor: string) => void;
  onCambiarProducto: (productoId: string, campo: "producto" | "dosis" | "superficie", valor: string) => void;
  onAgregarProducto: () => void;
  onQuitarProducto: (productoId: string) => void;
  onQuitar: () => void;
}

/** Una fila = un lote (nombre libre, no una lista fija — se puede armar un
 * informe que junte varios lotes de un mismo establecimiento con nombres
 * cualquiera), con uno o más productos aplicados — cada uno con su propia
 * dosis Y su propia superficie (dos productos del mismo lote pueden cubrir
 * superficies distintas, no necesariamente el lote entero cada uno) —
 * portado y extendido de `ZonaFila` del prototipo (ahí solo había un
 * producto por zona, con una única superficie). */
function ZonaFila({ zona, onCambiarNombre, onCambiarProducto, onAgregarProducto, onQuitarProducto, onQuitar }: ZonaFilaProps) {
  return (
    <View style={styles.zonaCard}>
      <View style={styles.zonaFilaSuperior}>
        <TextInput
          style={styles.zonaNombreInput}
          value={zona.loteNombre}
          placeholder="Nombre del lote"
          placeholderTextColor={colors.textMuted}
          onChangeText={onCambiarNombre}
        />
        <Pressable style={styles.zonaQuitarBtn} onPress={onQuitar}>
          <X size={13} color={colors.danger} />
        </Pressable>
      </View>

      {zona.productos.map((p, i) => (
        <ProductoFila
          key={p.id}
          producto={p}
          puedeQuitar={zona.productos.length > 1}
          // El "+" de agregar otro producto va al lado del desplegable, pero
          // solo en la última fila — si hubiera uno por fila, se repetiría
          // sin sentido (todos hacen lo mismo: agregar una fila más).
          mostrarAgregar={i === zona.productos.length - 1}
          onAgregarProducto={onAgregarProducto}
          onCambiar={(campo, v) => onCambiarProducto(p.id, campo, v)}
          onQuitar={() => onQuitarProducto(p.id)}
        />
      ))}
    </View>
  );
}

interface ProductoFilaProps {
  producto: ProductoAplicado;
  puedeQuitar: boolean;
  mostrarAgregar: boolean;
  onAgregarProducto: () => void;
  onCambiar: (campo: "producto" | "dosis" | "superficie", valor: string) => void;
  onQuitar: () => void;
}

function ProductoFila({ producto, puedeQuitar, mostrarAgregar, onAgregarProducto, onCambiar, onQuitar }: ProductoFilaProps) {
  const [productoAbierto, setProductoAbierto] = useState(false);

  return (
    <View style={styles.productoFila}>
      <View style={styles.zonaProductoFilaSuperior}>
        <View style={styles.zonaProductoWrap}>
          <Pressable style={styles.zonaProductoBtn} onPress={() => setProductoAbierto((v) => !v)}>
            <Text style={styles.zonaProductoTexto}>{producto.producto}</Text>
            <ChevronDown size={13} color={colors.textMuted} />
          </Pressable>
          {productoAbierto && (
            <View style={styles.zonaProductoMenu}>
              {PRODUCTOS.map((p) => (
                <Pressable
                  key={p}
                  style={styles.zonaProductoItem}
                  onPress={() => {
                    onCambiar("producto", p);
                    setProductoAbierto(false);
                  }}
                >
                  <Text style={styles.zonaProductoItemTexto}>{p}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {mostrarAgregar && (
          <Pressable style={styles.agregarProductoBtn} onPress={onAgregarProducto}>
            <Plus size={16} color={colors.primaryDark} />
          </Pressable>
        )}
        {puedeQuitar && (
          <Pressable style={styles.zonaQuitarBtn} onPress={onQuitar}>
            <X size={12} color={colors.danger} />
          </Pressable>
        )}
      </View>

      <View style={styles.zonaNumRow}>
        <TextInput
          style={styles.zonaNumInput}
          value={producto.dosis}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          onChangeText={(v) => onCambiar("dosis", v)}
        />
        <Text style={styles.zonaUnidad}>kg/ha ×</Text>
        <TextInput
          style={styles.zonaNumInput}
          value={producto.superficie}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          onChangeText={(v) => onCambiar("superficie", v)}
        />
        <Text style={styles.zonaUnidad}>ha</Text>
        <Text style={styles.zonaTotal}>= {kgDeProducto(producto).toFixed(0)} kg</Text>
      </View>
    </View>
  );
}
