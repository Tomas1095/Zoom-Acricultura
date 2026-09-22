import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes, puedeResolverConflictos } from "@/lib/roles";
import * as db from "@/lib/db/lotes";
import { leerCacheArbol } from "@/lib/offline/cache-arbol";
import { leerCacheLote } from "@/lib/offline/cache-lote";
import { conTimeout, hayConexion } from "@/lib/offline/net";
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
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    if (!usuario || !id) return;
    try {
      // Chequeo rápido antes de intentar nada — ver lib/offline/net.ts.
      if (!(await hayConexion())) throw new Error("Sin conexión");
      // Este lote puntual + su establecimiento en un solo viaje — antes
      // acá se pedía el ÁRBOL ENTERO (fetchArbol) solo para buscar este
      // único lote adentro, la parte más lenta de entrar a cualquier lote
      // (ver el comentario de fetchLoteConEstablecimiento en db/lotes.ts).
      const resultado = await conTimeout(db.fetchLoteConEstablecimiento(id));
      setLote(resultado?.lote ?? null);
      setEstablecimientoNombre(resultado?.establecimientoNombre);
      setError(null);
    } catch (e: any) {
      // Sin señal: esta pantalla es el paso obligado para entrar a
      // CUALQUIER lote, desde Mis Lotes o el árbol — sin este respaldo,
      // esas dos pantallas ya podían verse offline pero tocar un lote
      // puntual se rompía justo acá. Reusa la misma foto que ya guardan
      // esas dos (lib/offline/cache-arbol.ts).
      const cache = await leerCacheArbol(usuario.id);
      const l = cache?.lotes.find((x) => x.id === id) ?? null;
      if (l) {
        setLote(l);
        setEstablecimientoNombre(cache?.establecimientos.find((e) => e.id === l.establecimientoId)?.nombre);
        setError(null);
      } else {
        // La foto del árbol puede no tener este lote (nunca se entró a
        // "Mis lotes"/el árbol con señal después de que se asignó, o esa
        // foto quedó vieja) — pero si alguien ya vio este lote puntual con
        // señal en algún momento (Vista general/Modo trabajo), esa foto
        // MÁS específica sí existe (ver lib/offline/cache-lote.ts) y
        // alcanza para reconstruir el lote sin tener que adivinar la
        // campaña vigente (leerCacheLote sin campaña trae la más
        // reciente que haya). Reportado en el campo: alguien entraba,
        // veía la grilla perfecta con señal, y al toque de poner modo
        // avión (sin volver a "Mis lotes" en el medio) le aparecía "no se
        // pudo cargar el lote" — la foto de ESTE lote sí estaba guardada,
        // solo que nadie la miraba acá.
        const cacheLote = leerCacheLote(id);
        if (cacheLote) {
          setLote(cacheLote.lote);
          setEstablecimientoNombre(cache?.establecimientos.find((est) => est.id === cacheLote.lote.establecimientoId)?.nombre);
          setError(null);
        } else {
          setLote(null);
          setError(e.message ?? String(e));
        }
      }
    } finally {
      setCargando(false);
    }
  }, [id, usuario]);

  // useFocusEffect (no useEffect a secas) para que, al volver de cargar
  // puntos, el estado del lote (tieneGrilla, campanaActual, etc.) se
  // actualice solo.
  useFocusEffect(
    useCallback(() => {
      refrescar();
    }, [refrescar])
  );

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
            <Text style={styles.aviso}>
              {error ? `No se pudo cargar el lote: ${error}` : "No se encontró el lote."}
            </Text>
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
