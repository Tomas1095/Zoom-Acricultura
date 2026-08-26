import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Lock } from "lucide-react-native";

import { cerrarCampanaDeLote } from "@/lib/db/lotes";
import { fechaInicioCampanaTexto, puedeAvanzarACampana, siguienteCampana } from "@/lib/campanas";
import type { Carga, Lote, Punto } from "@/types/domain";
import { colors } from "@/theme/colors";

interface CerrarCampanaBotonProps {
  lote: Lote;
  puntos: Punto[];
  cargas: Map<string, Carga>;
  /** Se llama después de cerrar con éxito, para que quien lo use refresque
   * el lote (nueva `campanaActual`) y el selector de historial. */
  onCerrado: () => void;
}

/** Botón "Cerrar campaña" — portado de `restablecerCampana`/
 * `restablecerCampanaBtn` del prototipo. Solo lo ve quien puede cerrar
 * campañas (ver `puedeCerrarCampana` en roles.ts — decisión de quien
 * renderiza esto, no de este componente), y solo tiene sentido mirando la
 * campaña vigente, no una archivada (eso también lo filtra quien llama). */
export function CerrarCampanaBoton({ lote, puntos, cargas, onCerrado }: CerrarCampanaBotonProps) {
  const [cerrando, setCerrando] = useState(false);

  const completo = puntos.length > 0 && puntos.every((p) => cargas.get(p.id)?.cargado);
  const cargados = puntos.filter((p) => cargas.get(p.id)?.cargado).length;
  const siguiente = siguienteCampana(lote.campanaActual);
  const yaArrancoLaSiguiente = puedeAvanzarACampana(siguiente);

  function confirmar() {
    Alert.alert(
      `¿Cerrar la campaña ${lote.campanaActual}?`,
      `Va a quedar archivada, de solo lectura, disponible desde el selector de campañas. Se abre la campaña ${siguiente} en blanco, con la misma grilla de puntos — no hace falta volver a subir el KMZ.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Cerrar campaña", style: "destructive", onPress: cerrar },
      ]
    );
  }

  async function cerrar() {
    setCerrando(true);
    try {
      await cerrarCampanaDeLote(lote.id, siguiente);
      onCerrado();
    } catch (e: any) {
      Alert.alert("No se pudo cerrar la campaña", e.message ?? String(e));
    } finally {
      setCerrando(false);
    }
  }

  if (!completo) {
    return (
      <View style={styles.avisoIncompleto}>
        <Text style={styles.avisoIncompletoTexto}>
          Faltan puntos por cargar para poder cerrar la campaña {lote.campanaActual} ({cargados}/{puntos.length}).
        </Text>
      </View>
    );
  }

  if (!yaArrancoLaSiguiente) {
    return (
      <View style={styles.avisoIncompleto}>
        <Text style={styles.avisoIncompletoTexto}>
          Grilla completa — pero todavía no se puede cerrar: la campaña {siguiente} arranca recién el{" "}
          {fechaInicioCampanaTexto(siguiente)}.
        </Text>
      </View>
    );
  }

  return (
    <Pressable style={styles.boton} onPress={confirmar} disabled={cerrando}>
      {cerrando ? (
        <ActivityIndicator color={colors.surface} size="small" />
      ) : (
        <Lock size={14} color={colors.surface} />
      )}
      <Text style={styles.botonTexto}>Cerrar campaña {lote.campanaActual}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    width: "100%",
  },
  botonTexto: { color: colors.surface, fontWeight: "700", fontSize: 13 },
  avisoIncompleto: {
    width: "100%",
    backgroundColor: colors.warningBg,
    borderRadius: 10,
    padding: 12,
  },
  avisoIncompletoTexto: { color: colors.text, fontSize: 12, textAlign: "center", lineHeight: 17 },
});
