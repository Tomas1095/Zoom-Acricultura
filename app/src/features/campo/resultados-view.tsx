import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { NIVEL_COLORES, rangosDe, type Plaga } from "@/lib/geo/densidad";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { useDatosCampo } from "./usar-datos-campo";
import { MapaDensidad, type PuntoDensidad } from "./mapa-densidad";

const ALTO_MAPA = 420;

/** Pestaña "Resultados" — portada de `DensidadView` del prototipo: el mapa
 * de densidad poblacional (Voronoi recortado al perímetro real) tanto de
 * Bichos bolita como de Babosas. Sin imagen satelital todavía (ver nota en
 * lib/geo/densidad.ts). Quién puede ver esta pestaña lo decide LoteTabs, no
 * este componente. */
export function ResultadosView({ lote }: { lote: Lote }) {
  const { cargando, puntos, cargas } = useDatosCampo(lote.id);
  const { width } = useWindowDimensions();
  const [plaga, setPlaga] = useState<Plaga>("bicho");

  const anchoMapa = Math.min(width - 32, 400);
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

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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

      <View style={styles.recuadroDorado}>
        <MapaDensidad
          puntos={puntosDensidad}
          perimetro={lote.perimetro}
          rangos={rangos}
          nivelColores={NIVEL_COLORES}
          ancho={anchoMapa}
          alto={ALTO_MAPA}
        />

        <View style={styles.leyenda}>
          <Text style={styles.leyendaTitulo}>{etiqueta}</Text>
          <View style={styles.leyendaFilas}>
            {rangos.map((r, i) => (
              <View key={i} style={styles.leyendaItem}>
                <View style={[styles.leyendaMuestra, { backgroundColor: NIVEL_COLORES[i] }]} />
                <Text style={styles.leyendaTexto}>{r.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.pie}>
        {cargados}/{puntos.length} puntos cargados — valores llevados a m² (× 4 sobre el dato cargado a campo,
        tomado en 1/4 m²)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12, alignItems: "center" },
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
  recuadroDorado: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    padding: 14,
  },
  leyenda: { width: "100%", gap: 6 },
  leyendaTitulo: { fontSize: 11, fontWeight: "700", color: colors.accentGold },
  leyendaFilas: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  leyendaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  leyendaMuestra: { width: 11, height: 11, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  leyendaTexto: { fontSize: 11.5, color: colors.text, fontWeight: "600" },
  pie: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
});
