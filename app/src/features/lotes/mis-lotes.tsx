import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, MapPin } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import * as db from "@/lib/db/lotes";
import { formatearHectareas } from "@/lib/format";
import { guardarCacheArbol, leerCacheArbol } from "@/lib/offline/cache-arbol";
import { precargarLotes } from "@/lib/offline/cache-lote";
import { PrecargaPill } from "./precarga-pill";
import { conTimeout, hayConexion } from "@/lib/offline/net";
import { calcularResumenAvance, fusionarPendientesEnCargas, type ResumenAvanceLote } from "@/lib/offline/resumen";
import type { Establecimiento, Lote } from "@/types/domain";
import { colors } from "@/theme/colors";

/** Lista plana de lotes con acceso — lo que ve un Monitoreador. Portado de
 * MisLotesView del prototipo. Nada de crear/editar/borrar acá: eso es solo
 * de administradores (ver ArbolLotes). */
export function MisLotes() {
  const { usuario } = useAuth();
  const insets = useSafeAreaInsets();
  const [cargando, setCargando] = useState(true);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([]);
  const [resumenes, setResumenes] = useState<Record<string, ResumenAvanceLote>>({});
  const [usandoCache, setUsandoCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [precargando, setPrecargando] = useState(false);
  const [precargaLista, setPrecargaLista] = useState(false);
  // true apenas termina la primera precarga completa de esta sesión — de
  // ahí en más, volver de un lote (que vuelve a disparar `refrescar` por
  // el useFocusEffect de abajo, para que el resumen de esa card se
  // actualice) NO hace que la pastilla vuelva a mostrar "Descargando…"
  // como si arrancara de cero. Reportado por el usuario: entrar y salir
  // de un lote una y otra vez hacía que la pastilla se la pasara
  // parpadeando entre naranja y verde, aunque ya tenía todo guardado —
  // molesto y además engañoso (parecía que se estaba perdiendo lo ya
  // descargado). La precarga real SIGUE corriendo igual en cada vuelta
  // (necesaria para el resumen actualizado); lo único que cambia es que,
  // pasada la primera vez, corre calladita de fondo sin tapar la
  // pastilla en verde — salvo que la toquen a mano para forzar un
  // reintento (ver PrecargaPill/onPress más abajo).
  const yaPrecargoUnaVezRef = useRef(false);
  // Qué lote se tocó para entrar — así, al volver (useFocusEffect abajo),
  // la precarga automática solo repasa ESE lote puntual (el único que
  // pudo haber cambiado) en vez de los N lotes asignados enteros. Pedido
  // explícito del usuario: repetir el pedido de red a TODOS los lotes en
  // cada ida y vuelta gastaba señal y batería de más sin necesidad, para
  // terminar actualizando como mucho un solo número.
  const ultimoLoteAbiertoIdRef = useRef<string | null>(null);

  const refrescar = useCallback(async (manual = false) => {
    if (!usuario) return;

    // Mostrar lo guardado ya mismo, sin esperar nada de red — mismo
    // cambio que en el resto de las pantallas de campo (ver el comentario
    // en useDatosCampo, offline/cache-lote.ts): esta es la PRIMERA
    // pantalla que ve un Monitoreador al entrar, así que hacerla esperar
    // acá se sentía en TODOS lados.
    let arbol: db.Arbol | null = await leerCacheArbol(usuario.id);
    if (arbol) {
      setLotes(arbol.lotes);
      setEstablecimientos(arbol.establecimientos);
      setUsandoCache(true);
      setError(null);
      setCargando(false);
    }

    try {
      if (!(await hayConexion())) throw new Error("Sin conexión");
      const arbolLive = await conTimeout(db.fetchArbol(), 15000);
      arbol = arbolLive;
      setLotes(arbolLive.lotes);
      setEstablecimientos(arbolLive.establecimientos);
      setUsandoCache(false);
      setError(null);
      guardarCacheArbol(usuario.id, arbolLive);
      // Con solo entrar a esta pantalla (que pasa siempre, apenas hay
      // sesión) ya queda todo listo para trabajar offline en cualquier
      // lote asignado — no hace falta abrir cada uno a mano. Ver
      // lib/offline/cache-lote.ts. De paso, esta misma pasada de datos
      // sirve para calcular el resumen de avance de cada card más abajo
      // (antes se pedía de nuevo aparte, duplicando el pedido — ver el
      // comentario de `onDatos` en precargarLotes).
    } catch (e: any) {
      // El pedido en vivo falló. Si ya se estaba mostrando la lista (de
      // la foto guardada, arriba), se deja como está — sin nada guardado
      // todavía es cuando corresponde el cartel de error.
      if (!arbol) {
        setError(e.message ?? String(e));
        setCargando(false);
        return;
      }
    }
    setCargando(false);

    // Aparte y sin bloquear la lista — así se ve "N puntos completados ·
    // M sincronizados" de cada lote apenas se calcula, sin esperar a
    // todos. Filtrado por el usuario actual: acá cada Monitoreador quiere
    // ver LO SUYO, no el total del lote (ver lib/offline/resumen.ts) —
    // esta pantalla es solo la de Monitoreador, nunca la ve un Socio. Si
    // no hay señal esto también va a fallar solo — cada card se queda sin
    // el resumen, no rompe el resto. Un solo pedido por lote (precarga +
    // resumen juntos, ver el comentario de `onDatos` en precargarLotes) en
    // vez de dos por separado — con esto Y la pausa entre tandas (ver
    // concurrencia.ts) resuelto, comunidades grandes (50+ lotes) dejan de
    // saturar Postgres con timeouts reales (57014, confirmado con logs de
    // Supabase), afectando a cualquiera usando la app en ese momento, no
    // solo a esta pantalla.
    const primeraVez = !yaPrecargoUnaVezRef.current;
    const mostrarPrecargando = manual || primeraVez;
    if (mostrarPrecargando) setPrecargando(true);
    // La primera vez de la sesión (o un reintento a mano) repasa TODOS
    // los lotes — para eso existe la pastilla. Cualquier otra vuelta
    // automática (volver de haber entrado a un lote puntual) alcanza con
    // repasar ESE lote nomás: es el único que pudo haber cambiado, y
    // pedir los N lotes enteros de nuevo en cada ida y vuelta gastaba
    // señal y batería de más sin necesidad real.
    const lotesAPrecargar =
      primeraVez || manual ? arbol.lotes : arbol.lotes.filter((l) => l.id === ultimoLoteAbiertoIdRef.current);
    precargarLotes(lotesAPrecargar, (l, puntos, cargas) => {
      const fusionadas = fusionarPendientesEnCargas(cargas, puntos, l.campanaActual);
      const r = calcularResumenAvance(puntos.length, fusionadas, usuario.id);
      setResumenes((prev) => ({ ...prev, [l.id]: r }));
    }).then(() => {
      if (mostrarPrecargando) setPrecargando(false);
      setPrecargaLista(true);
      yaPrecargoUnaVezRef.current = true;
    });
  }, [usuario]);

  // useFocusEffect (no useEffect a secas) para que, al volver de cargar
  // puntos en un lote, el resumen de esa card se actualice solo — sin
  // esto quedaba con el conteo viejo hasta salir de la app y volver a
  // entrar.
  useFocusEffect(
    useCallback(() => {
      refrescar();
    }, [refrescar])
  );

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.vacio}>No se pudo cargar tu lista de lotes: {error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 10 + insets.bottom }]}>
      {usandoCache && (
        <Text style={styles.avisoCache}>
          📡 Sin señal — mostrando la última lista guardada en este celular, puede no estar al día.
        </Text>
      )}
      <PrecargaPill precargando={precargando} lista={precargaLista} onPress={() => refrescar(true)} />
      <Text style={styles.label}>Lotes asignados — tocá uno para empezar</Text>
      {lotes.length === 0 ? (
        <Text style={styles.vacio}>No tenés lotes asignados por ahora.</Text>
      ) : (
        lotes.map((l) => {
          const establecimiento = establecimientos.find((e) => e.id === l.establecimientoId);
          const resumen = resumenes[l.id];
          return (
            <Pressable
              key={l.id}
              style={styles.card}
              onPress={() => {
                ultimoLoteAbiertoIdRef.current = l.id;
                router.push(`/(app)/lote/${l.id}`);
              }}
            >
              <Text style={styles.establecimiento}>{establecimiento?.nombre ?? ""}</Text>
              <Text style={styles.nombre}>{l.nombre}</Text>
              <Text style={styles.cultivo}>{l.cultivo}</Text>
              <View style={styles.pill}>
                {l.tieneGrilla ? (
                  <>
                    <CheckCircle2 size={12} color={colors.primary} />
                    <Text style={styles.pillTextoOk}>{formatearHectareas(l.hectareas)} ha</Text>
                  </>
                ) : (
                  <>
                    <MapPin size={12} color={colors.warning} />
                    <Text style={styles.pillTextoAviso}>Sin grilla todavía — avisá a tu Encargado</Text>
                  </>
                )}
              </View>
              {resumen && resumen.completados > 0 && (
                <Text
                  style={[
                    styles.resumenAvance,
                    resumen.sincronizados === resumen.completados ? styles.resumenAvanceOk : styles.resumenAvanceAlerta,
                  ]}
                  numberOfLines={1}
                >
                  {resumen.completados} puntos completados · {resumen.sincronizados}/{resumen.completados}{" "}
                  sincronizados
                </Text>
              )}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 10 },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  avisoCache: {
    fontSize: 11.5,
    color: colors.warning,
    backgroundColor: colors.warningBg,
    borderRadius: 8,
    padding: 10,
    fontWeight: "600",
  },
  vacio: { color: colors.textMuted, textAlign: "center", marginTop: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  establecimiento: { fontSize: 11, fontWeight: "700", color: colors.accentGold, textTransform: "uppercase" },
  nombre: { fontSize: 17, fontWeight: "700", color: colors.text, marginTop: 2 },
  cultivo: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  pillTextoOk: { fontSize: 12, color: colors.primaryDark, fontWeight: "600" },
  pillTextoAviso: { fontSize: 12, color: colors.warning, fontWeight: "600" },
  resumenAvance: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  // Verde solo cuando todo lo que la persona cargó ya sincronizó de
  // verdad (nada colgado en la cola local); si queda alguna fracción
  // (ej. 11/12 sincronizados) va en naranja/alerta — pedido explícito.
  resumenAvanceOk: { color: colors.primaryDark },
  resumenAvanceAlerta: { color: colors.warning },
});
