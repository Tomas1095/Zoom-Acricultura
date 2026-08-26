import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { fetchCampanasDeLote } from "@/lib/db/puntos";
import { NIVEL_COLORES, rangosDe, type Plaga } from "@/lib/geo/densidad";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { useDatosCampo } from "./usar-datos-campo";
import { MapaDensidad, type PuntoDensidad } from "./mapa-densidad";
import { CampanaSelector } from "./campana-selector";
import { TablaDatosPuntos } from "./tabla-datos-puntos";

const PAD_RECUADRO = 14;
const GAP_RECUADRO = 12;

type SubTab = "mapas" | "datos";

/** Pestaña "Resultados" — portada de `DensidadView` del prototipo: el mapa
 * de densidad poblacional (Voronoi recortado al perímetro real) tanto de
 * Bichos bolita como de Babosas, más la sub-pestaña "Datos" (tabla con
 * todos los puntos) y el selector de campaña para ver resultados de
 * campañas anteriores (portado de `historialBanner`/combo de campaña del
 * prototipo). Sin imagen satelital todavía (ver nota en
 * lib/geo/densidad.ts). Quién puede ver esta pestaña lo decide LoteTabs, no
 * este componente.
 *
 * El mapa y la leyenda comparten un mismo marco fino (mismo verde claro de
 * fondo que el resto de la app, ver `colors.background`) — por eso
 * `MapaDensidad` no trae su propio fondo/borde, lo pone este componente.
 *
 * "Mapas" tiene que entrar en una pantalla fija, sin scroll (no tiene
 * sentido scrollear un mapa acá) — por eso el marco usa `flex: 1` y el mapa
 * se mide con `onLayout`. "Datos" sí scrollea — es una tabla, no un mapa. */
export function ResultadosView({ lote }: { lote: Lote }) {
  const [subTab, setSubTab] = useState<SubTab>("mapas");
  const [plaga, setPlaga] = useState<Plaga>("bicho");
  const [campanas, setCampanas] = useState<string[]>([lote.campanaActual]);
  const [campanaViendo, setCampanaViendo] = useState(lote.campanaActual);
  const [cajaSize, setCajaSize] = useState({ ancho: 0, alto: 0 });
  const [altoLeyenda, setAltoLeyenda] = useState(0);

  const { cargando, puntos, cargas } = useDatosCampo(lote.id, campanaViendo);

  useEffect(() => {
    fetchCampanasDeLote(lote.id)
      .then((historicas) => {
        setCampanas(Array.from(new Set([lote.campanaActual, ...historicas])).sort().reverse());
      })
      .catch(() => {}); // si falla, se queda solo con la actual — no rompe la pantalla
  }, [lote.id, lote.campanaActual]);

  const rangos = rangosDe(plaga);
  const etiqueta = plaga === "bicho" ? "Nº BB/m²" : "Nº Babosas/m²";

  const puntosDensidad: PuntoDensidad[] = useMemo(
    () =>
      puntos.map((p) => ({
        id: `${p.linea}.${p.puntoNum}`,
        x: p.x,
        y: p.y,
        valor: (cargas.get(p.id)?.[plaga] ?? 0) * 4, // se carga por cuadrante de 1/4 m²
      })),
    [puntos, cargas, plaga]
  );

  const cargados = puntos.filter((p) => cargas.get(p.id)?.cargado).length;

  const anchoMapa = cajaSize.ancho - PAD_RECUADRO * 2;
  const altoMapa = cajaSize.alto - PAD_RECUADRO * 2 - GAP_RECUADRO - altoLeyenda;
  const mapaListo = anchoMapa > 40 && altoMapa > 80;

  function onLayoutRecuadro(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setCajaSize({ ancho: width, alto: height });
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
      <CampanaSelector
        campanas={campanas}
        campanaActual={lote.campanaActual}
        campanaViendo={campanaViendo}
        onCambiar={setCampanaViendo}
      />

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

          <Text style={styles.titulo}>Mapa de densidad poblacional</Text>

          <View style={styles.marco} onLayout={onLayoutRecuadro}>
            {mapaListo && (
              <MapaDensidad
                puntos={puntosDensidad}
                perimetro={lote.perimetro}
                rangos={rangos}
                nivelColores={NIVEL_COLORES}
                ancho={anchoMapa}
                alto={altoMapa}
              />
            )}

            <View style={styles.leyenda} onLayout={(e) => setAltoLeyenda(e.nativeEvent.layout.height)}>
              <Text style={styles.leyendaTitulo}>{etiqueta}</Text>
              {rangos.map((r, i) => (
                <View key={i} style={styles.leyendaFila}>
                  <View style={[styles.leyendaMuestra, { backgroundColor: NIVEL_COLORES[i] }]} />
                  <Text style={styles.leyendaTexto}>{r.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.pie} numberOfLines={2}>
            {cargados}/{puntos.length} puntos cargados — valores llevados a m² (× 4 sobre el dato cargado a campo,
            tomado en 1/4 m²)
          </Text>
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
  mapasContenido: { flex: 1, width: "100%", gap: 10, alignItems: "center" },
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
  titulo: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  marco: {
    flex: 1,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: GAP_RECUADRO,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: PAD_RECUADRO,
  },
  leyenda: { width: "100%", gap: 3 },
  leyendaTitulo: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 2 },
  leyendaFila: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaMuestra: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  leyendaTexto: { fontSize: 12, color: colors.text },
  pie: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
});
