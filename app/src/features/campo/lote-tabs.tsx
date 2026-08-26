import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeCerrarCampana } from "@/lib/roles";
import { fetchCampanasDeLote } from "@/lib/db/puntos";
import { cerrarCampanaDeLote } from "@/lib/db/lotes";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { VistaGeneral } from "./vista-general";
import { ResultadosView } from "./resultados-view";
import { SalidasView } from "./salidas-view";
import { CampanaSelector } from "./campana-selector";

type Tab = "grilla" | "resultados" | "salidas";

const TABS: Array<{ id: Tab; etiqueta: string }> = [
  { id: "grilla", etiqueta: "Grilla" },
  { id: "resultados", etiqueta: "Resultados" },
  { id: "salidas", etiqueta: "Salidas" },
];

interface LoteTabsProps {
  lote: Lote;
  establecimientoNombre?: string;
  /** Lotes hermanos del mismo establecimiento (con grilla) — ver
   * SalidasView, para elegir a qué lote corresponde cada zona del
   * informe técnico cuando se arma uno conjunto. */
  lotesEstablecimiento?: Lote[];
  /** Refresca el lote en el padre (lote/[id]/index.tsx) — hace falta
   * después de cerrar una campaña, porque cambia `lote.campanaActual`. */
  onLoteActualizado: () => void;
}

/** Portado de las pestañas Grilla/Resultados/Salidas del prototipo — solo
 * las ven los roles que pueden administrar lotes (ver LoteScreen, que
 * muestra `VistaGeneral` directo, sin pestañas, para el Monitoreador).
 *
 * El selector de campaña vive acá, arriba de las 3 pestañas — mismo lugar
 * que el combo de campaña del prototipo — y se comparte entre Grilla y
 * Resultados (las dos ven la misma campaña elegida a la vez, no una por
 * pestaña). Solo Socio Fundador/Gerente lo ven (`puedeCerrarCampana`,
 * mismo criterio que el prototipo: ahí tampoco lo veía Encargado). */
export function LoteTabs({ lote, establecimientoNombre, lotesEstablecimiento, onLoteActualizado }: LoteTabsProps) {
  const { usuario } = useAuth();
  const [tab, setTab] = useState<Tab>("grilla");
  const [campanas, setCampanas] = useState<string[]>([lote.campanaActual]);
  const [campanaViendo, setCampanaViendo] = useState(lote.campanaActual);

  const puedeVerHistorial = !!usuario && puedeCerrarCampana(usuario.rol);

  // Se resetea a la campaña vigente cada vez que cambia (por ejemplo, justo
  // después de cerrar una) — y de paso refresca la lista de campañas con
  // historial, que también cambió.
  useEffect(() => {
    setCampanaViendo(lote.campanaActual);
    fetchCampanasDeLote(lote.id)
      .then((historicas) => {
        setCampanas(Array.from(new Set([lote.campanaActual, ...historicas])).sort().reverse());
      })
      .catch(() => {}); // si falla, se queda solo con la actual — no rompe la pantalla
  }, [lote.id, lote.campanaActual]);

  function pedirReabrir() {
    Alert.alert(
      `¿Reabrir la campaña ${campanaViendo}?`,
      `Vuelve a ser la campaña vigente del lote — se puede seguir cargando datos ahí. Cuando termines, cerrala de nuevo.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reabrir",
          onPress: async () => {
            try {
              // Mismo mecanismo que "cerrar" — acá en vez de avanzar a la
              // siguiente, vuelve `campanaActual` para atrás, a la que se
              // estaba mirando. No se pierde ni se copia nada: las cargas ya
              // están todas guardadas con su propia `campana`.
              await cerrarCampanaDeLote(lote.id, campanaViendo);
              onLoteActualizado();
            } catch (e: any) {
              Alert.alert("No se pudo reabrir la campaña", e.message ?? String(e));
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      {puedeVerHistorial && (
        <View style={styles.campanaFila}>
          <CampanaSelector
            campanas={campanas}
            campanaActual={lote.campanaActual}
            campanaViendo={campanaViendo}
            onCambiar={setCampanaViendo}
            onReabrir={pedirReabrir}
          />
        </View>
      )}

      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tabBoton, tab === t.id && styles.tabBotonActivo]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabTexto, tab === t.id && styles.tabTextoActivo]}>{t.etiqueta}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.contenido}>
        {tab === "grilla" && (
          <VistaGeneral
            lote={lote}
            establecimientoNombre={establecimientoNombre}
            campanaViendo={campanaViendo}
            puedeMostrarCerrarCampana={puedeVerHistorial}
            onCampanaCerrada={onLoteActualizado}
          />
        )}
        {tab === "resultados" && <ResultadosView lote={lote} campanaViendo={campanaViendo} />}
        {tab === "salidas" && (
          <SalidasView
            lote={lote}
            establecimientoNombre={establecimientoNombre}
            lotesEstablecimiento={lotesEstablecimiento}
            campanaViendo={campanaViendo}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  campanaFila: { alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 12 },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
    margin: 16,
    marginBottom: 0,
  },
  tabBoton: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  tabBotonActivo: { backgroundColor: colors.primaryConfirm },
  tabTexto: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabTextoActivo: { color: colors.surface },
  contenido: { flex: 1 },
});
