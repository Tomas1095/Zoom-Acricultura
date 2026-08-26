import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronDown, Download, Plus, RotateCcw, Upload, X } from "lucide-react-native";

import { calcularZonaAplicacion, UMBRAL_APLICACION_BABOSA, type EstacionAplicacion } from "@/lib/geo/zona-aplicacion";
import { inferirOrigenDesdePuntos } from "@/lib/geo/geometria";
import { NIVEL_COLORES, rangosDe } from "@/lib/geo/densidad";
import { resumenPlaga, resumenPresencias, textoSituacion } from "@/lib/informe/situacion";
import {
  construirInformeHtml,
  exportarInformePdf,
  kgDeProducto,
  resumenPorProducto,
  type ProductoAplicado,
  type ZonaCebo,
} from "@/lib/exportar/informe";
import { construirLeyendaHtml, construirSvgDensidad } from "@/lib/exportar/mapa-svg";
import { exportarGPX, exportarKML } from "@/lib/exportar/manchones";
import { formatearHectareas } from "@/lib/format";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { esperarCierreModal, PromptModal } from "@/components/prompt-modal";
import { useDatosCampo } from "./usar-datos-campo";
import { MapaManchoneo } from "./mapa-manchoneo";

const PRODUCTOS = ["Crustacicida", "Molusquicida", "Crustacicida + Molusquicida", "No aplicar"];

type SubTab = "informe" | "manchoneo";
type PedidoExport = "pdf" | "gpx" | "kml" | null;

interface SalidasViewProps {
  lote: Lote;
  establecimientoNombre?: string;
  /** Lotes hermanos del mismo establecimiento (con grilla) — para elegir a
   * qué lote corresponde cada zona de la recomendación de cebo, cuando el
   * informe junta varios lotes de un mismo cliente. */
  lotesEstablecimiento?: Lote[];
  campanaViendo: string;
}

function zonaInicial(lote: Lote): ZonaCebo {
  return {
    id: "1",
    loteId: lote.id,
    loteNombre: lote.nombre,
    superficie: lote.hectareas,
    productos: [{ id: "1", producto: "Crustacicida + Molusquicida", dosis: 5 }],
  };
}

/** Pestaña "Salidas" — portada de `SalidasView` del prototipo: informe
 * técnico (mapas de densidad, situación de plagas auto-generada + editable,
 * recomendación de cebo lote por lote con exportar PDF), y zona de
 * aplicación/manchoneo (mapa + exportar GPX/KML). Sin arrastrar los
 * vértices del manchón a mano (el prototipo lo permitía; acá por ahora el
 * polígono es siempre el calculado automático). */
export function SalidasView({ lote, establecimientoNombre, lotesEstablecimiento, campanaViendo }: SalidasViewProps) {
  const { cargando, puntos, cargas } = useDatosCampo(lote.id, campanaViendo);
  const [subTab, setSubTab] = useState<SubTab>("informe");

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

  // ---------- Informe ----------
  const resumenBicho = useMemo(
    () => resumenPlaga(puntosConValores.map((p) => ({ linea: p.linea, valorM2: p.bicho })), "bicho"),
    [puntosConValores]
  );
  const resumenBabosa = useMemo(
    () => resumenPlaga(puntosConValores.map((p) => ({ linea: p.linea, valorM2: p.babosa })), "babosa"),
    [puntosConValores]
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
  }, [resumenBicho.abundancia, resumenBicho.distribucion, resumenBabosa.abundancia, resumenBabosa.distribucion, presenciasClave, editadoManualmente]);

  function recalcularSituacion() {
    setSituacion(textoSituacion(resumenBicho, resumenBabosa, presencias));
    setEditadoManualmente(false);
  }

  const [zonas, setZonas] = useState<ZonaCebo[]>(() => [zonaInicial(lote)]);

  function actualizarZonaLote(id: string, loteElegido: Lote) {
    setZonas((zs) =>
      zs.map((z) =>
        z.id === id ? { ...z, loteId: loteElegido.id, loteNombre: loteElegido.nombre, superficie: loteElegido.hectareas } : z
      )
    );
  }
  function actualizarZonaSuperficie(id: string, valor: string) {
    const n = Number(valor.replace(",", "."));
    setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, superficie: Number.isFinite(n) ? n : 0 } : z)));
  }
  function actualizarProducto(zonaId: string, productoId: string, campo: "producto" | "dosis", valor: string) {
    setZonas((zs) =>
      zs.map((z) => {
        if (z.id !== zonaId) return z;
        return {
          ...z,
          productos: z.productos.map((p) => {
            if (p.id !== productoId) return p;
            if (campo === "producto") return { ...p, producto: valor };
            const n = Number(valor.replace(",", "."));
            return { ...p, dosis: Number.isFinite(n) ? n : 0 };
          }),
        };
      })
    );
  }
  function agregarProducto(zonaId: string) {
    setZonas((zs) =>
      zs.map((z) =>
        z.id === zonaId
          ? { ...z, productos: [...z.productos, { id: String(Date.now()), producto: "Crustacicida", dosis: 0 }] }
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
  const spacingM = Math.sqrt(Math.max(lote.haPorPunto, 0.01) * 10000);
  const estaciones: EstacionAplicacion[] = useMemo(
    () => puntosConValores.map((p) => ({ id: p.id, x: p.x, y: p.y, linea: p.linea, puntoNum: p.puntoNum, valorM2: p.babosa })),
    [puntosConValores]
  );
  const zonaAplicacion = useMemo(
    () => calcularZonaAplicacion(estaciones, UMBRAL_APLICACION_BABOSA, lote.perimetro, spacingM),
    [estaciones, lote.perimetro, spacingM]
  );
  const sinEstaciones = zonaAplicacion.manchones.length === 0;

  // Nombre por defecto de cada exportación — siempre editable desde el
  // modal (ver onConfirmar), esto solo prellena el campo.
  function nombreDefaultExport(pedido: PedidoExport): string {
    if (pedido === "pdf") {
      return `Informe monitoreo de plagas Lote ${lote.nombre}${establecimientoNombre ? " Establecimiento " + establecimientoNombre : ""}`;
    }
    return `BAB Lote ${lote.nombre} ${zonaAplicacion.haIncluidas.toFixed(1)} Ha`;
  }

  async function confirmarExport(valores: Record<string, string>) {
    const pedido = pedidoExport;
    setPedidoExport(null);
    if (!pedido) return;
    setExportando(pedido);
    await esperarCierreModal();
    try {
      if (pedido === "pdf") {
        const puntosBicho = puntosConValores.map((p) => ({ id: `${p.linea}.${p.puntoNum}`, x: p.x, y: p.y, valor: p.bicho }));
        const puntosBabosa = puntosConValores.map((p) => ({ id: `${p.linea}.${p.puntoNum}`, x: p.x, y: p.y, valor: p.babosa }));
        const html = construirInformeHtml({
          loteNombre: lote.nombre,
          establecimientoNombre,
          situacion,
          zonas,
          mapaBichoSvg: construirSvgDensidad(puntosBicho, lote.perimetro, rangosDe("bicho"), NIVEL_COLORES, 260, 220),
          mapaBabosaSvg: construirSvgDensidad(puntosBabosa, lote.perimetro, rangosDe("babosa"), NIVEL_COLORES, 260, 220),
          leyendaBichoHtml: construirLeyendaHtml(rangosDe("bicho"), NIVEL_COLORES, "Nº BB/m²"),
          leyendaBabosaHtml: construirLeyendaHtml(rangosDe("babosa"), NIVEL_COLORES, "Nº Babosas/m²"),
        });
        await exportarInformePdf(html, valores.nombre);
      } else {
        const origen = inferirOrigenDesdePuntos(puntos);
        if (pedido === "gpx") await exportarGPX(zonaAplicacion.manchones, lote.nombre, origen, valores.nombre);
        else await exportarKML(zonaAplicacion.manchones, lote.nombre, origen, valores.nombre);
      }
    } catch (e: any) {
      Alert.alert(`No se pudo exportar el ${pedido.toUpperCase()}`, e.message ?? String(e));
    } finally {
      setExportando(null);
    }
  }

  const resumen = useMemo(() => resumenPorProducto(zonas), [zonas]);

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
        <ScrollView contentContainerStyle={styles.scrollContenido}>
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
            {zonas.map((z) => (
              <ZonaFila
                key={z.id}
                zona={z}
                lotesElegibles={lotesEstablecimiento && lotesEstablecimiento.length > 0 ? lotesEstablecimiento : [lote]}
                onElegirLote={(loteElegido) => actualizarZonaLote(z.id, loteElegido)}
                onCambiarSuperficie={(v) => actualizarZonaSuperficie(z.id, v)}
                onCambiarProducto={(prodId, campo, v) => actualizarProducto(z.id, prodId, campo, v)}
                onAgregarProducto={() => agregarProducto(z.id)}
                onQuitarProducto={(prodId) => quitarProducto(z.id, prodId)}
                onQuitar={() => quitarZona(z.id)}
              />
            ))}
            <Pressable style={styles.agregarZonaBtn} onPress={agregarZona}>
              <Plus size={14} color={colors.primaryDark} />
              <Text style={styles.agregarZonaTexto}>Agregar lote</Text>
            </Pressable>

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
            Polígono de aplicación de cebo — pensado sobre todo para babosas, cuya distribución suele ser
            sectorizada.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Manchoneo — Babosas</Text>
            <Text style={styles.hint}>
              Estaciones con ≥ {UMBRAL_APLICACION_BABOSA} babosas/m², relleno de huecos entre estaciones afectadas
              de una misma línea, y franja de protección alrededor del borde.
            </Text>

            <View style={styles.mapaMarco}>
              <MapaManchoneo perimetro={lote.perimetro} manchones={zonaAplicacion.manchones} ancho={320} alto={320} />
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statValor}>{zonaAplicacion.haIncluidas.toFixed(1)} ha</Text>
              <Text style={styles.statLabel}> de polígono · lote de {formatearHectareas(lote.hectareas)} ha</Text>
            </View>

            {sinEstaciones ? (
              <Text style={styles.hint}>
                Ninguna estación superó el umbral de {UMBRAL_APLICACION_BABOSA}/m² — con estos datos no hace falta
                una aplicación sectorizada.
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
        onCancelar={() => setPedidoExport(null)}
        onConfirmar={confirmarExport}
      />
    </View>
  );
}

interface ZonaFilaProps {
  zona: ZonaCebo;
  /** Entre qué lotes se puede elegir (los del mismo establecimiento, o
   * solo el lote actual si no hay más — ver SalidasView). */
  lotesElegibles: Lote[];
  onElegirLote: (lote: Lote) => void;
  onCambiarSuperficie: (valor: string) => void;
  onCambiarProducto: (productoId: string, campo: "producto" | "dosis", valor: string) => void;
  onAgregarProducto: () => void;
  onQuitarProducto: (productoId: string) => void;
  onQuitar: () => void;
}

/** Una fila = un lote, con uno o más productos aplicados a dosis distintas
 * (por ej. crustacicida en un sector del lote y molusquicida en otro, o
 * simplemente dos productos juntos) — portado y extendido de `ZonaFila`
 * del prototipo (ahí solo había un producto por zona). */
function ZonaFila({
  zona,
  lotesElegibles,
  onElegirLote,
  onCambiarSuperficie,
  onCambiarProducto,
  onAgregarProducto,
  onQuitarProducto,
  onQuitar,
}: ZonaFilaProps) {
  const [loteAbierto, setLoteAbierto] = useState(false);

  return (
    <View style={styles.zonaCard}>
      <View style={styles.zonaFilaSuperior}>
        <View style={styles.zonaLoteWrap}>
          <Pressable
            style={styles.zonaLoteBtn}
            onPress={() => lotesElegibles.length > 1 && setLoteAbierto((v) => !v)}
            disabled={lotesElegibles.length <= 1}
          >
            <Text style={styles.zonaLoteTexto} numberOfLines={1}>
              {zona.loteNombre}
            </Text>
            {lotesElegibles.length > 1 && <ChevronDown size={13} color={colors.textMuted} />}
          </Pressable>
          {loteAbierto && (
            <View style={styles.zonaLoteMenu}>
              {lotesElegibles.map((l) => (
                <Pressable
                  key={l.id}
                  style={styles.zonaProductoItem}
                  onPress={() => {
                    onElegirLote(l);
                    setLoteAbierto(false);
                  }}
                >
                  <Text style={styles.zonaProductoItemTexto}>{l.nombre}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <Pressable style={styles.zonaQuitarBtn} onPress={onQuitar}>
          <X size={13} color={colors.danger} />
        </Pressable>
      </View>

      {zona.productos.map((p) => (
        <ProductoFila
          key={p.id}
          producto={p}
          superficie={zona.superficie}
          puedeQuitar={zona.productos.length > 1}
          onCambiar={(campo, v) => onCambiarProducto(p.id, campo, v)}
          onQuitar={() => onQuitarProducto(p.id)}
        />
      ))}
      <Pressable style={styles.agregarProductoBtn} onPress={onAgregarProducto}>
        <Plus size={12} color={colors.primaryDark} />
        <Text style={styles.agregarProductoTexto}>Agregar producto</Text>
      </Pressable>

      <View style={styles.zonaSuperficieFila}>
        <Text style={styles.zonaUnidad}>Superficie:</Text>
        <TextInput
          style={styles.zonaNumInput}
          value={String(zona.superficie)}
          keyboardType="decimal-pad"
          onChangeText={onCambiarSuperficie}
        />
        <Text style={styles.zonaUnidad}>ha</Text>
      </View>
    </View>
  );
}

interface ProductoFilaProps {
  producto: ProductoAplicado;
  superficie: number;
  puedeQuitar: boolean;
  onCambiar: (campo: "producto" | "dosis", valor: string) => void;
  onQuitar: () => void;
}

function ProductoFila({ producto, superficie, puedeQuitar, onCambiar, onQuitar }: ProductoFilaProps) {
  const [productoAbierto, setProductoAbierto] = useState(false);

  return (
    <View style={styles.productoFila}>
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

      <View style={styles.zonaNumRow}>
        <TextInput
          style={styles.zonaNumInput}
          value={String(producto.dosis)}
          keyboardType="decimal-pad"
          onChangeText={(v) => onCambiar("dosis", v)}
        />
        <Text style={styles.zonaUnidad}>kg/ha</Text>
        <Text style={styles.zonaTotal}>= {kgDeProducto(superficie, producto).toFixed(0)} kg</Text>
        {puedeQuitar && (
          <Pressable style={styles.zonaQuitarBtn} onPress={onQuitar}>
            <X size={12} color={colors.danger} />
          </Pressable>
        )}
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
    paddingTop: 4,
  },
  subTabTexto: { fontSize: 13.5, fontWeight: "700", color: colors.textMuted, paddingBottom: 8 },
  subTabTextoActivo: { color: colors.primary, borderBottomWidth: 2, borderBottomColor: colors.primary },
  scrollContenido: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  cardTitulo: { fontSize: 14, fontWeight: "700", color: colors.text },
  situacionInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: colors.text,
    minHeight: 110,
    textAlignVertical: "top",
  },
  hintFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hint: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16, flex: 1 },
  recalcularBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  recalcularTexto: { fontSize: 11.5, fontWeight: "700", color: colors.primaryDark },
  zonaCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  zonaFilaSuperior: { flexDirection: "row", alignItems: "center", gap: 8 },
  zonaLoteWrap: { flex: 1, position: "relative" },
  zonaLoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  zonaLoteTexto: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.text },
  zonaLoteMenu: {
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
  zonaQuitarBtn: { padding: 6 },
  productoFila: { gap: 6 },
  zonaProductoWrap: { position: "relative" },
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
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  zonaProductoItem: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  zonaProductoItemTexto: { fontSize: 13, color: colors.text },
  zonaNumRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  zonaSuperficieFila: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
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
  agregarProductoBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 },
  agregarProductoTexto: { fontSize: 11.5, fontWeight: "700", color: colors.primaryDark },
  agregarZonaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingVertical: 9,
  },
  agregarZonaTexto: { fontSize: 12.5, fontWeight: "700", color: colors.primaryDark },
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
});
