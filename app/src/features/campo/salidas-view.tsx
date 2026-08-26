import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ChevronDown, Download, MessageCircle, Plus, RotateCcw, Upload, X } from "lucide-react-native";

import { calcularZonaAplicacion, UMBRAL_APLICACION_BABOSA, type EstacionAplicacion } from "@/lib/geo/zona-aplicacion";
import { inferirOrigenDesdePuntos } from "@/lib/geo/geometria";
import { resumenPlaga, resumenPresencias, textoSituacion } from "@/lib/informe/situacion";
import { construirInformeHtml, exportarInformePdf, textoInformeCompartir, type ZonaCebo, kgDeZona } from "@/lib/exportar/informe";
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
  campanaViendo: string;
}

/** Pestaña "Salidas" — portada de `SalidasView` del prototipo: informe
 * técnico (situación de plagas auto-generada + editable, recomendación de
 * cebo, exportar PDF, compartir), y zona de aplicación/manchoneo (mapa +
 * exportar GPX/KML). Sin mini-mapas satelitales en el PDF/pantalla todavía
 * (mismo motivo que en Resultados, ver lib/geo/densidad.ts) y sin arrastrar
 * los vértices del manchón a mano (el prototipo lo permitía; acá por ahora
 * el polígono es siempre el calculado automático). */
export function SalidasView({ lote, establecimientoNombre, campanaViendo }: SalidasViewProps) {
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

  const [zonas, setZonas] = useState<ZonaCebo[]>(() => [
    { id: "1", nombre: lote.nombre, producto: "Crustacicida + Molusquicida", dosis: 5, superficie: lote.hectareas },
  ]);

  function actualizarZonaTexto(id: string, campo: "nombre" | "producto", valor: string) {
    setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, [campo]: valor } : z)));
  }
  function actualizarZonaNumero(id: string, campo: "dosis" | "superficie", valor: string) {
    const n = Number(valor.replace(",", "."));
    setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, [campo]: Number.isFinite(n) ? n : 0 } : z)));
  }
  function agregarZona() {
    setZonas((zs) => [...zs, { id: String(Date.now()), nombre: "", producto: "Crustacicida", dosis: 0, superficie: 0 }]);
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

  async function compartir() {
    try {
      await Share.share({ message: textoInformeCompartir({ loteNombre: lote.nombre, establecimientoNombre, situacion, zonas }) });
    } catch (e: any) {
      Alert.alert("No se pudo compartir", e.message ?? String(e));
    }
  }

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
        const html = construirInformeHtml({ loteNombre: lote.nombre, establecimientoNombre, situacion, zonas });
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
                onCambiarTexto={(campo, v) => actualizarZonaTexto(z.id, campo, v)}
                onCambiarNumero={(campo, v) => actualizarZonaNumero(z.id, campo, v)}
                onQuitar={() => quitarZona(z.id)}
              />
            ))}
            <Pressable style={styles.agregarZonaBtn} onPress={agregarZona}>
              <Plus size={14} color={colors.primaryDark} />
              <Text style={styles.agregarZonaTexto}>Agregar zona</Text>
            </Pressable>
          </View>

          <Pressable style={styles.botonPdf} onPress={() => setPedidoExport("pdf")} disabled={exportando !== null}>
            {exportando === "pdf" ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Download size={15} color={colors.surface} />
            )}
            <Text style={styles.botonPdfTexto}>Exportar PDF</Text>
          </Pressable>
          <Pressable style={styles.botonWhatsapp} onPress={compartir}>
            <MessageCircle size={15} color={colors.primaryDark} />
            <Text style={styles.botonWhatsappTexto}>Compartir informe</Text>
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
  onCambiarTexto: (campo: "nombre" | "producto", valor: string) => void;
  onCambiarNumero: (campo: "dosis" | "superficie", valor: string) => void;
  onQuitar: () => void;
}

function ZonaFila({ zona, onCambiarTexto, onCambiarNumero, onQuitar }: ZonaFilaProps) {
  const [productoAbierto, setProductoAbierto] = useState(false);

  return (
    <View style={styles.zonaCard}>
      <View style={styles.zonaFilaSuperior}>
        <TextInput
          style={styles.zonaNombreInput}
          value={zona.nombre}
          placeholder="Zona / Lote"
          placeholderTextColor={colors.textMuted}
          onChangeText={(v) => onCambiarTexto("nombre", v)}
        />
        <Pressable style={styles.zonaQuitarBtn} onPress={onQuitar}>
          <X size={13} color={colors.danger} />
        </Pressable>
      </View>

      <View style={styles.zonaProductoWrap}>
        <Pressable style={styles.zonaProductoBtn} onPress={() => setProductoAbierto((v) => !v)}>
          <Text style={styles.zonaProductoTexto}>{zona.producto}</Text>
          <ChevronDown size={13} color={colors.textMuted} />
        </Pressable>
        {productoAbierto && (
          <View style={styles.zonaProductoMenu}>
            {PRODUCTOS.map((p) => (
              <Pressable
                key={p}
                style={styles.zonaProductoItem}
                onPress={() => {
                  onCambiarTexto("producto", p);
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
          value={String(zona.dosis)}
          keyboardType="decimal-pad"
          onChangeText={(v) => onCambiarNumero("dosis", v)}
        />
        <Text style={styles.zonaUnidad}>kg/ha ×</Text>
        <TextInput
          style={styles.zonaNumInput}
          value={String(zona.superficie)}
          keyboardType="decimal-pad"
          onChangeText={(v) => onCambiarNumero("superficie", v)}
        />
        <Text style={styles.zonaUnidad}>ha</Text>
        <Text style={styles.zonaTotal}>= {kgDeZona(zona).toFixed(0)} kg</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  subTabs: {
    flexDirection: "row",
    gap: 18,
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
  zonaNombreInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: colors.text,
  },
  zonaQuitarBtn: { padding: 6 },
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
  botonWhatsapp: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    paddingVertical: 12,
  },
  botonWhatsappTexto: { color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
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
