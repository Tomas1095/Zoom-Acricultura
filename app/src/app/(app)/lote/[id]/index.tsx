import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes, puedeResolverConflictos } from "@/lib/roles";
import * as db from "@/lib/db/lotes";
import { leerCacheArbol } from "@/lib/offline/cache-arbol";
import { leerCacheLote } from "@/lib/offline/cache-lote";
import { conTimeout, hayConexion } from "@/lib/offline/net";
import { nombreLoteYEstablecimiento } from "@/lib/exportar/nombres";
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
  const insets = useSafeAreaInsets();
  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);
  const [establecimientoNombre, setEstablecimientoNombre] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Busca este lote en las dos fotos guardadas que hay disponibles — la
  // del árbol entero (cache-arbol.ts, la escriben Mis Lotes/el árbol) y la
  // de este lote puntual (cache-lote.ts, la escriben Vista general/Modo
  // trabajo) — devuelve la primera que lo tenga, o null si ninguna. Se usa
  // dos veces: para mostrar algo YA sin esperar nada de red (ver
  // `refrescar` abajo) y como respaldo si el pedido en vivo falla y nunca
  // se había mostrado nada.
  const buscarEnCaches = useCallback(
    async (): Promise<{ lote: Lote; establecimientoNombre?: string } | null> => {
      if (!usuario) return null;
      const cache = await leerCacheArbol(usuario.id);
      const l = cache?.lotes.find((x) => x.id === id) ?? null;
      if (l) return { lote: l, establecimientoNombre: cache?.establecimientos.find((e) => e.id === l.establecimientoId)?.nombre };
      // La foto del árbol puede no tener este lote (nunca se entró a "Mis
      // lotes"/el árbol con señal después de que se asignó, o esa foto
      // quedó vieja) — pero si alguien ya vio este lote puntual con señal
      // en algún momento (Vista general/Modo trabajo), esa foto MÁS
      // específica sí existe y alcanza para reconstruirlo sin tener que
      // adivinar la campaña vigente (leerCacheLote sin campaña trae la
      // más reciente que haya).
      const cacheLote = leerCacheLote(id);
      if (cacheLote) {
        return {
          lote: cacheLote.lote,
          establecimientoNombre: cache?.establecimientos.find((est) => est.id === cacheLote.lote.establecimientoId)?.nombre,
        };
      }
      return null;
    },
    [id, usuario]
  );

  const refrescar = useCallback(async () => {
    if (!usuario || !id) return;

    // Mostrar lo guardado ya mismo, sin esperar nada de red — mismo
    // cambio que en useDatosCampo/la pantalla del punto (ver esos
    // comentarios): antes esta pantalla, el paso obligado para entrar a
    // CUALQUIER lote, siempre esperaba a que el pedido en vivo fallara
    // antes de mostrar lo que ya tenía guardado.
    let teniaAlgoLocal = false;
    const encontrado = await buscarEnCaches();
    if (encontrado) {
      setLote(encontrado.lote);
      setEstablecimientoNombre(encontrado.establecimientoNombre);
      setError(null);
      setCargando(false);
      teniaAlgoLocal = true;
    }

    try {
      // Chequeo rápido antes de intentar nada — ver lib/offline/net.ts.
      if (!(await hayConexion())) throw new Error("Sin conexión");
      // Este lote puntual + su establecimiento en un solo viaje — antes
      // acá se pedía el ÁRBOL ENTERO (fetchArbol) solo para buscar este
      // único lote adentro, la parte más lenta de entrar a cualquier lote
      // (ver el comentario de fetchLoteConEstablecimiento en db/lotes.ts).
      const resultado = await conTimeout(db.fetchLoteConEstablecimiento(id), 15000);
      setLote(resultado?.lote ?? null);
      setEstablecimientoNombre(resultado?.establecimientoNombre);
      setError(null);
    } catch (e: any) {
      // El pedido en vivo falló. Si ya se estaba mostrando el lote (de la
      // foto guardada, arriba), se deja como está — sin esto no tenía
      // sentido tapar un lote que la persona YA está viendo con un cartel
      // de error solo porque el intento de refrescarlo de fondo no llegó
      // a nada.
      if (!teniaAlgoLocal) {
        setLote(null);
        setError(e.message ?? String(e));
      }
    } finally {
      setCargando(false);
    }
  }, [id, usuario, buscarEnCaches]);

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
      {/* Lote + establecimiento (ej. "Lote 14 - La Alborada"), no solo el
       * nombre del lote — pedido explícito del usuario: con varios
       * clientes/establecimientos reales, "Lote 14" a secas no alcanza
       * para saber de cuál se está hablando de un vistazo. Misma función
       * que ya arma este mismo nombre para archivos/informes exportados
       * (ver lib/exportar/nombres.ts), así queda consistente en toda la
       * app — incluye la excepción de no repetirlo si el lote y el
       * establecimiento se llaman igual. */}
      <AppHeader loteNombre={lote ? nombreLoteYEstablecimiento(lote.nombre, establecimientoNombre, " - ") : undefined} />
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
          <ScrollView contentContainerStyle={[styles.sinGrilla, { paddingBottom: 20 + insets.bottom }]}>
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
