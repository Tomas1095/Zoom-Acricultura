import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";

import * as db from "@/lib/db/comunidades";
import type { ComunidadPendiente } from "@/lib/db/comunidades";
import { colors } from "@/theme/colors";

/** "Solicitudes de comunidad" — solo entran acá quienes tienen
 * `adminPlataforma` (ver la ruta que arma esta pantalla,
 * (app)/solicitudes-comunidad.tsx). Aprobar deja a quien la pidió usar la
 * app como Socio Fundador de su propia comunidad nueva, aislada de todas
 * las demás; rechazar la deja sin poder entrar (ver
 * app/comunidad-pendiente.tsx, del lado de quien espera). */
export function SolicitudesComunidadScreen() {
  const [cargando, setCargando] = useState(true);
  const [solicitudes, setSolicitudes] = useState<ComunidadPendiente[]>([]);
  const [procesando, setProcesando] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      setSolicitudes(await db.fetchComunidadesPendientes());
    } catch (e: any) {
      Alert.alert("No se pudieron cargar las solicitudes", e.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  async function resolver(c: ComunidadPendiente, aprobar: boolean) {
    setProcesando(c.id);
    try {
      await db.revisarComunidad(c.id, aprobar);
      await refrescar();
    } catch (e: any) {
      Alert.alert("Ocurrió un error", e.message ?? String(e));
    } finally {
      setProcesando(null);
    }
  }

  function confirmar(c: ComunidadPendiente, aprobar: boolean) {
    Alert.alert(
      aprobar ? "Aprobar comunidad" : "Rechazar comunidad",
      aprobar
        ? `"${c.nombre}" va a poder usar la app como una comunidad aparte, con ${c.creadorNombre ?? "quien la pidió"} como Socio Fundador.`
        : `"${c.nombre}" queda rechazada — ${c.creadorNombre ?? "quien la pidió"} no va a poder entrar.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: aprobar ? "Aprobar" : "Rechazar",
          style: aprobar ? "default" : "destructive",
          onPress: () => resolver(c, aprobar),
        },
      ]
    );
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {solicitudes.length === 0 ? (
        <Text style={styles.vacio}>No hay solicitudes de comunidad pendientes.</Text>
      ) : (
        solicitudes.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.nombre}>{c.nombre}</Text>
            <Text style={styles.detalle}>
              Pedida por {c.creadorNombre ?? "—"}
              {c.creadorMail ? ` (${c.creadorMail})` : ""}
            </Text>
            <View style={styles.acciones}>
              <Pressable
                style={[styles.boton, styles.botonAprobar]}
                disabled={procesando === c.id}
                onPress={() => confirmar(c, true)}
              >
                <Check size={14} color={colors.surface} />
                <Text style={styles.botonTexto}>Aprobar</Text>
              </Pressable>
              <Pressable
                style={[styles.boton, styles.botonRechazar]}
                disabled={procesando === c.id}
                onPress={() => confirmar(c, false)}
              >
                <X size={14} color={colors.danger} />
                <Text style={[styles.botonTexto, styles.botonRechazarTexto]}>Rechazar</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 10 },
  vacio: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  nombre: { fontSize: 15, fontWeight: "800", color: colors.text },
  detalle: { fontSize: 12, color: colors.textMuted },
  acciones: { flexDirection: "row", gap: 8, marginTop: 4 },
  boton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 8,
    paddingVertical: 9,
  },
  botonAprobar: { backgroundColor: colors.primaryConfirm },
  botonRechazar: { borderWidth: 1, borderColor: colors.danger },
  botonTexto: { fontSize: 12.5, fontWeight: "700", color: colors.surface },
  botonRechazarTexto: { color: colors.danger },
});
