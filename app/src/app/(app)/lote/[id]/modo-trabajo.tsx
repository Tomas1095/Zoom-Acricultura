import { useCallback, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { ChevronLeft, Compass, Minus, Pencil, Plus } from "lucide-react-native";
import { useKeepAwake } from "expo-keep-awake";

import { colors } from "@/theme/colors";
import { useAuth } from "@/lib/auth-context";
import { cargarMiRuta } from "@/lib/local/mi-ruta";
import { useDatosCampo } from "@/features/campo/usar-datos-campo";
import { MapaCampo, type MapaCampoHandle, type PuntoMapa } from "@/features/campo/mapa-campo";
import { GpsEstadoPill } from "@/features/campo/gps-estado-pill";

/** Modo trabajo — portado de UbicacionView del prototipo en su modo
 * pantalla completa: la cámara te sigue caminando, letras y puntos más
 * grandes (pensado para leerse al sol), y acá se puede cargar cualquier
 * punto sin importar la distancia (esa restricción no existía en el
 * prototipo — la distancia es solo informativa, ver tarjetaDistancia). */
export default function ModoTrabajoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { usuario } = useAuth();
  const { width, height } = useWindowDimensions();
  const { cargando, error, usandoCache, lote, puntos, cargas, gps, puntoCercano, enRango } = useDatosCampo(id);
  const mapaRef = useRef<MapaCampoHandle>(null);
  const [vistaModificada, setVistaModificada] = useState(false);
  // Recorrido personal, de solo lectura acá — se marca/edita solo desde
  // vista general (ver usarMiRuta) — se vuelve a leer cada vez que se
  // entra a esta pantalla, por si se editó justo antes de entrar.
  const [miRuta, setMiRuta] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      if (!usuario) return;
      cargarMiRuta(id, usuario.id).then(setMiRuta);
    }, [id, usuario])
  );

  useKeepAwake(); // la pantalla no se apaga mientras estás caminando el lote

  const puntosMapa: PuntoMapa[] = useMemo(
    () =>
      puntos.map((p) => ({
        // Única en el lote (ver el comentario en PuntoMapa) — el texto que
        // se ve en el mapa es `etiqueta`, sin la pieza.
        id: `${p.pieza}.${p.linea}.${p.puntoNum}`,
        etiqueta: `${p.linea}.${p.puntoNum}`,
        x: p.x,
        y: p.y,
        confirmado: cargas.get(p.id)?.confirmado ?? false,
      })),
    [puntos, cargas]
  );

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  // Sin señal y sin ninguna foto guardada de este lote todavía (nunca se
  // entró acá con cobertura) — no hay nada que mostrar, a diferencia del
  // caso con cache (usandoCache), que sigue de largo con lo último que
  // haya. Ver useDatosCampo/lib/offline/cache-lote.ts.
  if (!lote) {
    return (
      <View style={styles.centrado}>
        <Pressable style={styles.volver} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.aviso}>
          {error ? `No se pudo cargar el lote: ${error}` : "No se encontró el lote."}
        </Text>
      </View>
    );
  }

  // Texto que se muestra en la tarjeta ("Punto 1.1") — sin la pieza.
  const etiquetaCercano = puntoCercano ? `${puntoCercano.punto.linea}.${puntoCercano.punto.puntoNum}` : null;
  // Identidad real, para que `MapaCampo` resalte el punto correcto aunque
  // otra pieza tenga la misma "linea.puntoNum" (ver el comentario en
  // PuntoMapa, mapa-campo.tsx).
  const idCercano = puntoCercano
    ? `${puntoCercano.punto.pieza}.${puntoCercano.punto.linea}.${puntoCercano.punto.puntoNum}`
    : null;

  return (
    <View style={styles.container}>
      <MapaCampo
        ref={mapaRef}
        puntos={puntosMapa}
        perimetro={lote.perimetro}
        miPos={gps.posicion}
        puntoCercanoId={idCercano}
        enRango={enRango}
        heading={gps.heading}
        pantallaCompleta
        puedeTocarPuntos
        onTapPunto={(pid) => router.push(`/(app)/lote/${lote.id}/punto/${pid}`)}
        miRuta={miRuta}
        ancho={width}
        alto={height}
        seguirRumbo
        onInteraccion={setVistaModificada}
      />

      <Pressable style={styles.volver} onPress={() => router.back()}>
        <ChevronLeft size={22} color={colors.text} />
      </Pressable>

      <View style={styles.pillTop}>
        {usandoCache && (
          <View style={styles.pillSinSenal}>
            <Text style={styles.pillSinSenalTexto}>📡 Sin señal — datos guardados</Text>
          </View>
        )}
        <GpsEstadoPill estado={gps.estado} />
        {miRuta.length > 0 && (
          <View style={styles.pillMiRuta}>
            <Pencil size={11} color={colors.surface} />
            <Text style={styles.pillMiRutaTexto}>Mi recorrido: {miRuta.length} puntos</Text>
          </View>
        )}
        {vistaModificada && (
          <Pressable
            style={styles.botonVolverMarcha}
            onPress={() => {
              mapaRef.current?.restablecer();
              setVistaModificada(false);
            }}
          >
            <Compass size={13} color={colors.surface} />
            <Text style={styles.botonVolverMarchaTexto}>
              {gps.headingDisponible ? "Volver a mi marcha" : "Volver al norte"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Zoom con botones fijos, no pellizcando — como los botones físicos
          de +/- de un GPS de mano (Garmin eTrex y similares). */}
      <View style={styles.rockerZoom}>
        <Pressable style={styles.botonZoom} onPress={() => mapaRef.current?.acercar()}>
          <Plus size={20} color={colors.text} />
        </Pressable>
        <View style={styles.rockerZoomSeparador} />
        <Pressable style={styles.botonZoom} onPress={() => mapaRef.current?.alejar()}>
          <Minus size={20} color={colors.text} />
        </Pressable>
      </View>

      {puntoCercano && (
        <View style={[styles.tarjetaDistancia, { borderColor: enRango ? colors.primary : colors.warning }]}>
          <View>
            <Text style={styles.tarjetaPunto}>Punto {etiquetaCercano}</Text>
            <Text style={[styles.tarjetaEstado, { color: enRango ? colors.primary : colors.warning }]}>
              {enRango ? "En rango — podés muestrear" : "Acercate al punto"}
            </Text>
          </View>
          <Text style={styles.tarjetaDistanciaValor}>{puntoCercano.distancia.toFixed(1)} m</Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  aviso: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 30 },
  container: { flex: 1, backgroundColor: colors.background },
  volver: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pillTop: { position: "absolute", top: 58, right: 16, alignItems: "flex-end", gap: 6 },
  pillMiRuta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.info,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillMiRutaTexto: { color: colors.surface, fontWeight: "700", fontSize: 10.5 },
  pillSinSenal: {
    backgroundColor: colors.warning,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillSinSenalTexto: { color: colors.surface, fontWeight: "700", fontSize: 10.5 },
  rockerZoom: {
    position: "absolute",
    top: "50%",
    right: 16,
    transform: [{ translateY: -44 }], // centrado vertical (2 botones de 44px c/u)
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  botonZoom: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  rockerZoomSeparador: { height: 1, backgroundColor: colors.border },
  botonVolverMarcha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  botonVolverMarchaTexto: { color: colors.surface, fontWeight: "700", fontSize: 11.5 },
  tarjetaDistancia: {
    position: "absolute",
    bottom: 28,
    left: 16,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tarjetaPunto: { fontSize: 15, fontWeight: "800", color: colors.text },
  tarjetaEstado: { fontSize: 12, fontWeight: "700", marginTop: 1 },
  tarjetaDistanciaValor: { fontSize: 20, fontWeight: "800", color: colors.text },
});
