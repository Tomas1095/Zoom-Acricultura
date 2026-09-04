// "Orientación de la grilla" — pantalla previa que se abre después de leer
// el KMZ y ANTES de guardar la grilla del lote, a pedido del usuario: la
// orientación (el ángulo de las líneas de muestreo) se calcula automático
// por default (el lado más largo del casco convexo del campo, ver
// anguloBordeMasLargo en geometria.ts), pero no siempre es la que el
// productor quiere — acá puede girarla a mano antes de confirmar. Una vez
// que se confirma (OK), la orientación queda fija para todo el lote — no
// hay forma de volver a cambiarla después sin resubir el KMZ de nuevo.
//
// Se muestran LÍNEAS (una por fila de muestreo, "línea 1", "línea 2",
// etc.), no los puntos uno por uno — a pedido del usuario, después de
// pensarlo mejor: una línea entera cruzando el lote de punta a punta
// comunica la ORIENTACIÓN de un vistazo mucho mejor que una nube de
// puntos, que hay que "leer" con más esfuerzo para notar el sentido.
//
// El zoom es el nativo del ScrollView (mismo criterio que MapaManchoneo,
// ver el comentario ahí) — no hace falta pellizcar gestos armados a mano,
// y de paso evita toda la complejidad de invertir una matriz de transform
// a mano. Sin gesto de ROTAR a propósito (a diferencia de vista general):
// acá la orientación se controla con el deslizador/número, no girando la
// vista con los dedos — mezclar las dos formas de "rotar" (una que cambia
// la grilla de verdad, otra que solo gira cómo se ve) sería confuso.

import { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line as SvgLine, Polygon } from "react-native-svg";
import { Check, RotateCcw, X } from "lucide-react-native";

import { generarGrillaDesdePerimetro, type LatLon, type PuntoGrillaGenerado, type XY } from "@/lib/geo/geometria";
import { formatearHectareas } from "@/lib/format";
import { colors } from "@/theme/colors";

const PAD = 24;
const ESCALA_MAX = 3.2;
const ZOOM_MAX = 4;

interface OrientacionGrillaProps {
  visible: boolean;
  perimetro: LatLon[][];
  haPorPunto: number;
  onConfirmar: (anguloGrados: number) => void;
  onCancelar: () => void;
}

/** Agrupa los puntos por línea y los corta en tramos donde hay un salto
 * más grande de lo normal entre dos puntos consecutivos de la misma línea
 * (cruza un hueco entre piezas, o un entrante cóncavo del lote) — así cada
 * segmento dibujado representa un tramo real y continuo de esa línea, sin
 * "puentear" en línea recta por encima de una zona que en realidad no
 * tiene puntos. */
function segmentosDeLineas(puntos: PuntoGrillaGenerado[], espaciado: number): XY[][] {
  const porLinea = new Map<number, PuntoGrillaGenerado[]>();
  for (const p of puntos) {
    const lista = porLinea.get(p.linea);
    if (lista) lista.push(p);
    else porLinea.set(p.linea, [p]);
  }
  const TOLERANCIA = espaciado * 1.5;
  const segmentos: XY[][] = [];
  for (const pts of porLinea.values()) {
    let actual: XY[] = [{ x: pts[0].x, y: pts[0].y }];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (d > TOLERANCIA) {
        segmentos.push(actual);
        actual = [];
      }
      actual.push({ x: cur.x, y: cur.y });
    }
    segmentos.push(actual);
  }
  return segmentos.filter((s) => s.length >= 2); // un solo punto no dibuja nada
}

/** Deslizador de 0 a 360° hecho a mano con PanResponder (no
 * @react-native-community/slider — evita sumar una dependencia nativa
 * nueva, que hubiera hecho falta un build de EAS solo para esto). Los
 * refs que reflejan las props/estado en cada render son necesarios porque
 * el PanResponder se crea UNA sola vez (useRef) — sin ellos, sus callbacks
 * quedarían con los valores de render viejos (closures viejas). */
function SliderAngulo({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  const [anchoTrack, setAnchoTrack] = useState(0);
  const anchoTrackRef = useRef(0);
  anchoTrackRef.current = anchoTrack;
  const valorRef = useRef(valor);
  valorRef.current = valor;
  const valorAlIniciarRef = useRef(valor);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        valorAlIniciarRef.current = valorRef.current;
      },
      onPanResponderMove: (_e, gesture) => {
        if (anchoTrackRef.current <= 0) return;
        const delta = (gesture.dx / anchoTrackRef.current) * 360;
        const nuevo = Math.max(0, Math.min(360, valorAlIniciarRef.current + delta));
        onChangeRef.current(Math.round(nuevo));
      },
    })
  ).current;

  const pct = Math.max(0, Math.min(1, valor / 360));
  return (
    <View style={estilos.track} onLayout={(e) => setAnchoTrack(e.nativeEvent.layout.width)} {...responder.panHandlers}>
      <View style={[estilos.trackRelleno, { width: `${pct * 100}%` }]} />
      <View style={[estilos.thumb, { left: `${pct * 100}%` }]} />
    </View>
  );
}

export function OrientacionGrilla({ visible, perimetro, haPorPunto, onConfirmar, onCancelar }: OrientacionGrillaProps) {
  const insets = useSafeAreaInsets();
  // La grilla automática (sin ángulo manual) se calcula UNA vez, al abrir
  // — de ahí sale tanto el ángulo inicial del deslizador como el valor al
  // que "Restablecer original" tiene que volver.
  const grillaAutomatica = useMemo(() => {
    try {
      return generarGrillaDesdePerimetro(perimetro, haPorPunto);
    } catch {
      return null;
    }
  }, [perimetro, haPorPunto]);

  const [anguloGrados, setAnguloGrados] = useState(() => Math.round(grillaAutomatica?.anguloGrados ?? 0));
  const [anguloTexto, setAnguloTexto] = useState(String(anguloGrados));
  const [cajaSize, setCajaSize] = useState({ ancho: 0, alto: 0 });

  const grilla = useMemo(() => {
    if (!grillaAutomatica) return null;
    try {
      return generarGrillaDesdePerimetro(perimetro, haPorPunto, anguloGrados);
    } catch {
      return null;
    }
  }, [perimetro, haPorPunto, anguloGrados, grillaAutomatica]);

  function cambiarAngulo(v: number) {
    setAnguloGrados(v);
    setAnguloTexto(String(v));
  }

  function confirmarTexto(t: string) {
    setAnguloTexto(t);
    const n = Number(t.replace(",", "."));
    if (Number.isFinite(n)) setAnguloGrados(((Math.round(n) % 360) + 360) % 360);
  }

  function restablecer() {
    if (!grillaAutomatica) return;
    cambiarAngulo(Math.round(grillaAutomatica.anguloGrados));
  }

  const espaciado = Math.sqrt(Math.max(haPorPunto, 0.01) * 10000);
  const segmentos = useMemo(() => (grilla ? segmentosDeLineas(grilla.puntos, espaciado) : []), [grilla, espaciado]);

  const { toPx, escala } = useMemo(() => {
    if (!grilla || cajaSize.ancho <= 0 || cajaSize.alto <= 0) {
      return { toPx: (x: number, y: number) => ({ left: 0, top: 0 }), escala: 1 };
    }
    const todosLosVertices = grilla.piezas.flat();
    const xs = todosLosVertices.map((v) => v.x);
    const ys = todosLosVertices.map((v) => v.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(1, Math.max(...xs) - minX);
    const spanY = Math.max(1, Math.max(...ys) - minY);
    const escala = Math.min((cajaSize.ancho - PAD * 2) / spanX, (cajaSize.alto - PAD * 2) / spanY, ESCALA_MAX);
    return {
      escala,
      toPx: (x: number, y: number) => ({ left: PAD + (x - minX) * escala, top: PAD + (y - minY) * escala }),
    };
  }, [grilla, cajaSize]);

  const piezasPx = grilla?.piezas.map((pieza) => pieza.map((v) => toPx(v.x, v.y))) ?? [];
  const segmentosPx = segmentos.map((s) => s.map((v) => toPx(v.x, v.y)));
  const cantidadLineas = grilla ? new Set(grilla.puntos.map((p) => p.linea)).size : 0;
  // "Ideal" = superficie real / hectáreas por punto — a pedido del usuario,
  // para comparar de un vistazo contra la cantidad real que da la grilla
  // con esta orientación (`grilla.puntos.length`, arriba): casi nunca
  // coinciden exacto (la grilla es una malla regular sobre un perímetro
  // real, no siempre entra justo), pero sirve de referencia de cuánto se
  // aleja una orientación de la otra.
  const puntosIdeal = grilla ? Math.round(grilla.hectareas / haPorPunto) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancelar}>
      <View style={[estilos.pantalla, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={estilos.cabecera}>
          <Text style={estilos.titulo}>Orientación de la grilla</Text>
          <Text style={estilos.subtitulo}>
            Cada línea es una fila de muestreo — {cantidadLineas} en total con esta orientación, {grilla?.puntos.length ?? 0}{" "}
            puntos.
          </Text>
          {grilla && (
            <Text style={estilos.subtitulo}>
              Ideal → {formatearHectareas(grilla.hectareas)} has / {haPorPunto} has por punto = {puntosIdeal} puntos
            </Text>
          )}
        </View>

        <View
          style={estilos.mapaMarco}
          onLayout={(e) => setCajaSize({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })}
        >
          {grilla && cajaSize.ancho > 0 && (
            <ScrollView
              style={{ width: cajaSize.ancho, height: cajaSize.alto }}
              contentContainerStyle={{ width: cajaSize.ancho, height: cajaSize.alto }}
              minimumZoomScale={1}
              maximumZoomScale={ZOOM_MAX}
              pinchGestureEnabled
              bouncesZoom={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Svg width={cajaSize.ancho} height={cajaSize.alto}>
                {piezasPx.map((piezaPx, pi) =>
                  piezaPx.length >= 3 ? (
                    <Polygon
                      key={`pieza-${pi}`}
                      points={piezaPx.map((p) => `${p.left},${p.top}`).join(" ")}
                      fill="rgba(59,143,92,0.08)"
                      stroke={colors.primaryDark}
                      strokeWidth={2}
                    />
                  ) : null
                )}
                {segmentosPx.map((s, i) => (
                  <SvgLine
                    key={`linea-${i}`}
                    x1={s[0].left}
                    y1={s[0].top}
                    x2={s[s.length - 1].left}
                    y2={s[s.length - 1].top}
                    stroke={colors.accentGold}
                    strokeWidth={2}
                  />
                ))}
              </Svg>
            </ScrollView>
          )}
          {!grilla && (
            <Text style={estilos.errorTexto}>No se pudo generar una vista previa con este ángulo — probá otro.</Text>
          )}
        </View>
        <Text style={estilos.hint}>Pellizcá con dos dedos para acercar. Las líneas doradas son las filas de muestreo.</Text>

        <View style={estilos.controles}>
          <View style={estilos.filaAngulo}>
            <Text style={estilos.anguloLabel}>Ángulo</Text>
            <TextInput
              style={estilos.anguloInput}
              keyboardType="number-pad"
              value={anguloTexto}
              onChangeText={confirmarTexto}
            />
            <Text style={estilos.anguloGrado}>°</Text>
            <Pressable style={estilos.restablecerBtn} onPress={restablecer}>
              <RotateCcw size={13} color={colors.primaryDark} />
              <Text style={estilos.restablecerTexto}>Restablecer original</Text>
            </Pressable>
          </View>
          <SliderAngulo valor={anguloGrados} onChange={cambiarAngulo} />
        </View>

        <View style={estilos.botonesFinales}>
          <Pressable style={estilos.botonCancelar} onPress={onCancelar}>
            <X size={16} color={colors.textMuted} />
            <Text style={estilos.botonCancelarTexto}>Cancelar</Text>
          </Pressable>
          <Pressable style={estilos.botonOk} onPress={() => onConfirmar(anguloGrados)} disabled={!grilla}>
            <Check size={16} color={colors.surface} />
            <Text style={estilos.botonOkTexto}>OK, generar grilla</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 10 },
  cabecera: { gap: 2 },
  titulo: { fontSize: 18, fontWeight: "800", color: colors.text },
  subtitulo: { fontSize: 12.5, color: colors.textMuted },
  mapaMarco: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  errorTexto: { fontSize: 13, color: colors.textMuted, textAlign: "center", padding: 20 },
  hint: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
  controles: { gap: 10 },
  filaAngulo: { flexDirection: "row", alignItems: "center", gap: 8 },
  anguloLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  anguloInput: {
    width: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  anguloGrado: { fontSize: 15, fontWeight: "700", color: colors.text },
  restablecerBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" },
  restablecerTexto: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  track: {
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    justifyContent: "center",
    overflow: "visible",
  },
  trackRelleno: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: colors.primaryConfirm,
  },
  thumb: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: -14,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  botonesFinales: { flexDirection: "row", gap: 10 },
  botonCancelar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
  },
  botonCancelarTexto: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  botonOk: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 12,
  },
  botonOkTexto: { fontSize: 14, fontWeight: "700", color: colors.surface },
});
