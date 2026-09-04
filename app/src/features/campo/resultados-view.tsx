import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Image as ImageIcon } from "lucide-react-native";

import { calcularCeldasDensidad, NIVEL_COLORES, rangosDe, type CeldaDensidad, type Plaga } from "@/lib/geo/densidad";
import { inferirOrigenDesdePuntos } from "@/lib/geo/geometria";
import { exportarMapaPng } from "@/lib/exportar/mapa-png";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { useDatosCampo } from "./usar-datos-campo";
import { MapaDensidad, type PuntoDensidad } from "./mapa-densidad";
import { TablaDatosPuntos } from "./tabla-datos-puntos";

const PAD_RECUADRO = 14;

type SubTab = "mapas" | "datos";

/** Pestaña "Resultados" — portada de `DensidadView` del prototipo: el mapa
 * de densidad poblacional (Voronoi recortado al perímetro real, con la
 * imagen satelital de fondo — ver lib/geo/satelital.ts) tanto de Bichos
 * bolita como de Babosas, más la sub-pestaña "Datos" (tabla con todos los
 * puntos). Quién puede ver esta pestaña lo decide LoteTabs, no
 * este componente — igual que el selector de historial de campañas, que
 * vive en LoteTabs (arriba de Grilla/Resultados/Salidas, compartido entre
 * las dos) y llega acá como prop.
 *
 * Título, leyenda, norte y escala van todos ADENTRO del rectángulo del
 * mapa (los pinta `MapaDensidad`, superpuestos a la foto) — como un mapa
 * armado de verdad, no como texto aparte alrededor. Por eso el marco de
 * acá solo le da tamaño, no le agrega nada más.
 *
 * "Mapas" tiene que entrar en una pantalla fija, sin scroll (no tiene
 * sentido scrollear un mapa acá) — el mapa se mide con `onLayout`. El marco
 * es apaisado (ancho por alto fijo, no `flex: 1` llenando toda la pantalla)
 * a propósito — mismo formato que el mapa de la pestaña Informe, para que
 * el diseño se mantenga igual entre las dos solapas. "Datos" sí scrollea —
 * es una tabla, no un mapa. */
export function ResultadosView({
  lote,
  establecimientoNombre,
  campanaViendo,
  activo,
}: {
  lote: Lote;
  establecimientoNombre?: string;
  campanaViendo: string;
  /** Ver el comentario de `activo` en usar-datos-campo.ts — hace falta acá
   * para refrescar los datos al volver a esta pestaña sin que se haya
   * desmontado (ver lote-tabs.tsx). Default `true`: sin pasarlo (nadie más
   * la usa así hoy), se comporta como siempre. */
  activo?: boolean;
}) {
  const [subTab, setSubTab] = useState<SubTab>("mapas");
  const [plaga, setPlaga] = useState<Plaga>("bicho");
  const [cajaSize, setCajaSize] = useState({ ancho: 0, alto: 0 });
  const [exportandoPng, setExportandoPng] = useState(false);
  const mapaRef = useRef<View>(null);

  const { cargando, puntos, cargas } = useDatosCampo(lote.id, campanaViendo, undefined, activo ?? true);

  const rangos = rangosDe(plaga);
  const etiqueta = plaga === "bicho" ? "Nº BB/m²" : "Nº Babosas/m²";

  // Bicho y babosa por separado (no un solo useMemo con `plaga` en las
  // dependencias) — a propósito: así cada uno se cachea por su cuenta y
  // pasar de uno al otro (y volver) no repite el Voronoi completo cada vez
  // — ver el comentario largo en celdasBicho/celdasBabosa más abajo, que es
  // donde de verdad pesa el cálculo.
  const puntosDensidadBicho: PuntoDensidad[] = useMemo(
    () =>
      puntos.map((p) => ({
        id: `${p.linea}.${p.puntoNum}`,
        x: p.x,
        y: p.y,
        valor: (cargas.get(p.id)?.bicho ?? 0) * 4, // se carga por cuadrante de 1/4 m²
      })),
    [puntos, cargas]
  );
  const puntosDensidadBabosa: PuntoDensidad[] = useMemo(
    () =>
      puntos.map((p) => ({
        id: `${p.linea}.${p.puntoNum}`,
        x: p.x,
        y: p.y,
        valor: (cargas.get(p.id)?.babosa ?? 0) * 4,
      })),
    [puntos, cargas]
  );
  const puntosDensidad = plaga === "bicho" ? puntosDensidadBicho : puntosDensidadBabosa;

  // El Voronoi de cada plaga (calcularCeldasDensidad, con su recorte de
  // polygon-clipping) es la parte que de verdad tarda acá — con un
  // useMemo compartido entre las dos plagas, cambiar de Bichos bolita a
  // Babosas y volver lo recalculaba las DOS veces (el useMemo solo
  // recuerda el último resultado, no uno por cada valor de `plaga`). Con
  // un useMemo propio para cada una, cada plaga se calcula una sola vez
  // (la primera vez que se la mira) y después de eso alternar entre las
  // dos es instantáneo — es lo que hacía sentir lenta la pantalla al tocar
  // "Babosas"/"Bichos bolita" varias veces seguidas.
  const celdasBicho = useMemo(() => {
    try {
      return calcularCeldasDensidad(puntosDensidadBicho, lote.perimetro, rangosDe("bicho"));
    } catch {
      return [];
    }
  }, [puntosDensidadBicho, lote.perimetro]);
  const celdasBabosa = useMemo(() => {
    try {
      return calcularCeldasDensidad(puntosDensidadBabosa, lote.perimetro, rangosDe("babosa"));
    } catch {
      return [];
    }
  }, [puntosDensidadBabosa, lote.perimetro]);
  const celdas: CeldaDensidad[] = plaga === "bicho" ? celdasBicho : celdasBabosa;

  const cargados = puntos.filter((p) => cargas.get(p.id)?.cargado).length;
  const origen = useMemo(() => (puntos.length > 0 ? inferirOrigenDesdePuntos(puntos) : null), [puntos]);

  const anchoMapa = cajaSize.ancho - PAD_RECUADRO * 2;
  const altoMapa = cajaSize.alto - PAD_RECUADRO * 2;
  const mapaListo = anchoMapa > 40 && altoMapa > 80;

  function onLayoutRecuadro(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setCajaSize({ ancho: width, alto: height });
  }

  // "Mapa BB <Lote> <Establecimiento>" / "Mapa Babosas <Lote> <Establecimiento>"
  // — a pedido del usuario, mismo criterio de nombrado que el resto de las
  // exportaciones (ver nombreDefaultExport en salidas-view.tsx).
  async function exportarPng() {
    setExportandoPng(true);
    try {
      const prefijo = plaga === "bicho" ? "BB" : "Babosas";
      const nombre = `Mapa ${prefijo} ${lote.nombre}${establecimientoNombre ? " " + establecimientoNombre : ""}`;
      await exportarMapaPng(mapaRef, nombre);
    } catch (e: any) {
      Alert.alert("No se pudo exportar el mapa", e.message ?? String(e));
    } finally {
      setExportandoPng(false);
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
          onPress={() => setSubTab("mapas")}
          style={[styles.subTabTexto, subTab === "mapas" && styles.subTabTextoActivo]}
        >
          Mapas
        </Text>
        <Text
          onPress={() => setSubTab("datos")}
          style={[styles.subTabTexto, subTab === "datos" && styles.subTabTextoActivo]}
        >
          Datos
        </Text>
      </View>

      {subTab === "datos" ? (
        <ScrollView style={styles.datosScroll} contentContainerStyle={styles.datosContenido}>
          <TablaDatosPuntos puntos={puntos} cargas={cargas} />
        </ScrollView>
      ) : (
        <View style={styles.mapasContenido}>
          <View style={styles.plagaToggle}>
            <Text
              onPress={() => setPlaga("bicho")}
              style={[styles.plagaBoton, plaga === "bicho" && styles.plagaBotonActivo]}
            >
              Bichos bolita
            </Text>
            <Text
              onPress={() => setPlaga("babosa")}
              style={[styles.plagaBoton, plaga === "babosa" && styles.plagaBotonActivo]}
            >
              Babosas
            </Text>
          </View>

          <View style={styles.marco} onLayout={onLayoutRecuadro}>
            {mapaListo && (
              <MapaDensidad
                ref={mapaRef}
                puntos={puntosDensidad}
                celdasPrecalculadas={celdas}
                perimetro={lote.perimetro}
                rangos={rangos}
                nivelColores={NIVEL_COLORES}
                etiquetaLeyenda={etiqueta}
                ancho={anchoMapa}
                alto={altoMapa}
                origen={origen}
              />
            )}
          </View>

          <Text style={styles.pie} numberOfLines={2}>
            {cargados}/{puntos.length} puntos cargados — valores llevados a m² (× 4 sobre el dato cargado a campo,
            tomado en 1/4 m²)
          </Text>

          {/* Exportar solo el mapa (sin el resto del informe) — a pedido
              del usuario, para alguna situación puntual donde solo haga
              falta mandar eso. Aplica a la plaga que esté seleccionada
              arriba (bicho o babosa), no a las dos a la vez. */}
          <Pressable style={styles.botonPng} onPress={exportarPng} disabled={!mapaListo || exportandoPng}>
            <ImageIcon size={14} color={colors.primaryDark} />
            <Text style={styles.botonPngTexto}>{exportandoPng ? "Exportando…" : "Exportar PNG"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, padding: 16, gap: 10, alignItems: "center" },
  subTabs: { flexDirection: "row", gap: 18, borderBottomWidth: 1, borderBottomColor: colors.border, width: "100%" },
  subTabTexto: {
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.textMuted,
    paddingBottom: 8,
  },
  subTabTextoActivo: { color: colors.primary, borderBottomWidth: 2, borderBottomColor: colors.primary },
  datosScroll: { flex: 1, width: "100%" },
  datosContenido: { paddingTop: 4 },
  // flex-start (no "center") a pedido del usuario — que quede el espacio
  // vacío abajo, no repartido arriba y abajo por igual.
  mapasContenido: { flex: 1, width: "100%", gap: 10, alignItems: "center", justifyContent: "flex-start", paddingTop: 8 },
  plagaToggle: { flexDirection: "row", gap: 8 },
  plagaBoton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    overflow: "hidden",
  },
  plagaBotonActivo: {
    backgroundColor: colors.primaryConfirm,
    borderColor: colors.primaryConfirm,
    color: colors.surface,
  },
  // Apaisado (ancho fijo por alto fijo, no flex:1 llenando la pantalla) —
  // mismo formato "tipo mapa impreso" que usa el mapa del Informe, para que
  // el diseño se mantenga igual entre las dos solapas.
  marco: {
    width: "100%",
    maxWidth: 400,
    height: 300,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: PAD_RECUADRO,
  },
  pie: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
  botonPng: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  botonPngTexto: { color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
});
