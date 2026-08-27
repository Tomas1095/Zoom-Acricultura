import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes, puedeResolverConflictos } from "@/lib/roles";
import * as db from "@/lib/db/lotes";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { AppHeader } from "@/components/app-header";
import { SubirKmz } from "@/features/lotes/subir-kmz";
import { VistaGeneral } from "@/features/campo/vista-general";
import { LoteTabs } from "@/features/campo/lote-tabs";
import { ConflictosBanner } from "@/features/campo/conflictos-banner";

/** Pantalla del lote — mantiene el mismo header de marca que "Mis lotes"
 * (ver AppHeader), con el nombre del lote agregado debajo de la línea
 * naranja, tal como en el prototipo (`{lote && <div style={loteName}>}`,
 * ver reference/prototipo-app.jsx). Por eso el Stack la lleva con
 * `headerShown: false` — este header reemplaza al nativo. */
export default function LoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { usuario } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);
  const [establecimientoNombre, setEstablecimientoNombre] = useState<string | undefined>(undefined);

  const refrescar = useCallback(async () => {
    const arbol = await db.fetchArbol();
    const l = arbol.lotes.find((l) => l.id === id) ?? null;
    setLote(l);
    setEstablecimientoNombre(arbol.establecimientos.find((e) => e.id === l?.establecimientoId)?.nombre);
    setCargando(false);
  }, [id]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  return (
    <View style={styles.pantalla}>
      <StatusBar style="light" />
      <AppHeader loteNombre={lote?.nombre} />
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <ChevronLeft size={15} color={colors.textMuted} />
        <Text style={styles.backTexto}>Mis lotes</Text>
      </Pressable>

      <View style={styles.contenido}>
        {cargando ? (
          <View style={styles.centrado}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : !lote ? (
          <View style={styles.centrado}>
            <Text style={styles.aviso}>No se encontró el lote.</Text>
          </View>
        ) : lote.tieneGrilla ? (
          // El Monitoreador solo ve la grilla (vista general), sin
          // pestañas — mismo criterio que el prototipo: "Resultados"/
          // "Salidas" no son para ese rol (ver CONTEXTO.md).
          usuario && puedeAdministrarLotes(usuario.rol) ? (
            <>
              {puedeResolverConflictos(usuario.rol) && (
                <View style={styles.bannerFila}>
                  <ConflictosBanner loteId={lote.id} />
                </View>
              )}
              <LoteTabs lote={lote} establecimientoNombre={establecimientoNombre} onLoteActualizado={refrescar} />
            </>
          ) : (
            <VistaGeneral lote={lote} establecimientoNombre={establecimientoNombre} />
          )
        ) : (
          <ScrollView contentContainerStyle={styles.sinGrilla}>
            <Text style={styles.cultivo}>{lote.cultivo}</Text>

            {usuario && puedeAdministrarLotes(usuario.rol) ? (
              <SubirKmz loteId={lote.id} onListo={refrescar} />
            ) : (
              <Text style={styles.aviso}>
                Este lote todavía no tiene grilla generada. Avisale a tu Encargado o Socio Gerente para que
                suba el KMZ.
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 16, paddingVertical: 10 },
  backTexto: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  contenido: { flex: 1 },
  bannerFila: { paddingHorizontal: 16, paddingTop: 12 },
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  sinGrilla: { flexGrow: 1, padding: 20, gap: 4 },
  cultivo: { fontSize: 14, color: colors.textMuted },
  aviso: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 12 },
});
