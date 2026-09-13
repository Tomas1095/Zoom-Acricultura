import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";
import { Check, Navigation } from "lucide-react-native";

import type { XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";

const MAP_PAD = 26; // px de margen alrededor de la grilla
const MAP_SCALE_MAX = 3.2; // px por metro, a zoom 1x
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
// Techo del pellizcar en VISTA GENERAL únicamente (el pinch de ahí abajo,
// no los botones +/- de modo trabajo — ver NIVELES_ZOOM, que sigue usando
// ZOOM_MAX tal cual). Bastante más alto que ZOOM_MAX: a pedido del
// usuario, con puntos muy juntos (grilla densa, o varias piezas cerca
// unas de otras) hace falta poder acercar mucho más para separarlos —
// junto con el tamaño real (recalculado en cada `zoomAsentado`, ver más
// abajo) de cada punto, que evita que los círculos y la numeración se
// agranden 1 a 1 con el zoom y se sigan tapando entre sí.
const ZOOM_MAX_VISTA_GENERAL = 9;

// Niveles fijos de zoom para modo trabajo — botones +/- en vez de pellizcar
// con los dedos (como un GPS de mano tipo Garmin eTrex, que tiene dos
// botones físicos de zoom, sin pinch). De paso resuelve que pellizcar
// contaba como "interacción" y disparaba "Volver a mi marcha" sin querer:
// como ya no hay gesto de pinch en modo trabajo, ese problema desaparece
// solo. Vista general sigue con pellizcar para zoom, como antes (ver
// ZOOM_MIN/ZOOM_MAX, sin relación con esta lista).
//
// El piso baja bastante más que ZOOM_MIN (0.6): en modo trabajo la escala
// base ya arranca bastante más acercada que en vista general (a propósito,
// para leer los puntos caminando — ver baseScale más abajo), así que en un
// lote grande (probado con uno real de ~117ha) ni el mínimo de antes
// alcanzaba para que el límite completo entrara en pantalla — se veía
// "cortado" no por un error de dibujo sino porque esas esquinas quedaban
// directamente afuera de la pantalla. El productor puede tener lotes de
// 500ha o más, así que el piso baja bastante (500ha son ~2x más grandes
// en cada dimensión que el lote de 117ha con el que se probó, y esto deja
// margen de sobra incluso para algo más grande todavía).
// Techo agregado más allá de ZOOM_MAX (2.5, el de antes) a pedido del
// usuario: con una grilla muy densa (un lote con muchos puntos muy juntos)
// 250% no alcanzaba para separar los círculos/números lo suficiente como
// para poder leerlos — necesitaba poder acercar bastante más con los
// botones +/- para llegar a esa zona en particular. Los pasos de acá
// arriba (hasta 2) se dejan igual (para no cambiar el "sentir" del zoom
// que ya venía andando bien), y de acá para abajo se agregan escalones
// más finos, llegando hasta el mismo techo que el pellizco de vista
// general (ZOOM_MAX_VISTA_GENERAL, 900%) — de la mano del recorte por
// vecino más cercano (ver distanciaVecinoPorId, más abajo), que ya
// garantiza que ningún círculo se pise con el de al lado sea cual sea el
// zoom: lo que este techo más alto suma es la POSIBILIDAD de acercarse lo
// suficiente como para que el número de cada punto, en una zona puntual,
// vuelva a entrar (dejar de ocultarse por chico, ver UMBRAL_LEGIBLE_PX).
const NIVELES_ZOOM = [0.04, 0.07, 0.15, 0.25, 0.4, 0.6, 0.8, 1, 1.3, 1.6, 2, ZOOM_MAX, 3.5, 5, 7, ZOOM_MAX_VISTA_GENERAL];
const NIVEL_ZOOM_INICIAL = NIVELES_ZOOM.indexOf(1);

export interface PuntoMapa {
  id: string;
  x: number;
  y: number;
  confirmado: boolean;
}

interface MapaCampoProps {
  puntos: PuntoMapa[];
  /** Una lista de vértices por pieza de terreno — casi siempre una sola
   * pieza; más de una si el lote es en realidad un campo compuesto por
   * varios lotes no contiguos (ver Lote["perimetro"] en types/domain.ts). */
  perimetro: XY[][];
  miPos: XY | null;
  puntoCercanoId: string | null;
  enRango: boolean;
  heading: number;
  /** "Modo trabajo": pantalla completa, la cámara te sigue. Si es false es
   * la vista general: encuadra todo el lote, fija. */
  pantallaCompleta: boolean;
  puedeTocarPuntos: boolean;
  onTapPunto: (id: string) => void;
  /** Recorrido personal (ayuda memoria) — portado de `miRuta` del
   * prototipo: los ids de los puntos, en el orden en que se van a
   * recorrer. Solo se dibuja la línea (celeste, entre esos puntos en ese
   * orden); marcarlo/editarlo es siempre desde vista general (ver
   * `modoMarcarRuta`), en modo trabajo es de solo lectura. */
  miRuta?: string[];
  /** Solo tiene efecto en vista general — mientras está en true, tocar un
   * punto lo agrega/saca del recorrido en vez de abrir su carga de datos. */
  modoMarcarRuta?: boolean;
  onTogglePuntoRuta?: (id: string) => void;
  ancho: number;
  alto: number;
  /** Avisa cuando el mapa deja de estar en su posición original (zoom 1x,
   * sin arrastrar, sin girar) — para que la pantalla que lo contiene pueda
   * mostrar un botón "Restablecer"/"Volver a mi marcha". */
  onInteraccion?: (interactuado: boolean) => void;
  /** Solo modo trabajo: el mapa entero rota para que "arriba" sea siempre
   * hacia donde estás caminando (heading-up), portado de `contenidoMapa`
   * del prototipo (rotate(-heading) sobre todo el mapa). Se pausa apenas el
   * usuario toca el mapa con los dedos — cualquier gesto manual gana. */
  seguirRumbo?: boolean;
  /** Solo modo trabajo: dónde ubicar la brújula ("N", ver más abajo) del
   * lado derecho — quien llama (modo-trabajo.tsx) mide en vivo hasta dónde
   * llega su propia pila de indicadores (📡 sin señal / GPS / mi recorrido
   * / volver a mi marcha) y pasa ese borde de abajo acá, así la brújula
   * siempre queda justo debajo, sea cual sea la combinación de indicadores
   * visible en ese momento (no es fija, varios son opcionales). Sin esto
   * (vista general, o mientras todavía no se midió nada), va en la
   * esquina superior izquierda. */
  brujulaOffsetTop?: number;
}

export interface MapaCampoHandle {
  /** Vuelve a zoom 1x, sin arrastre ni giro — animado. */
  restablecer: () => void;
  /** Solo modo trabajo: sube/baja un escalón fijo de zoom (ver
   * NIVELES_ZOOM). No cuenta como interacción — no dispara "Volver a mi
   * marcha". */
  acercar: () => void;
  alejar: () => void;
}

/** El mapa de campo — portado de `contenidoMapa` del prototipo. En vez de
 * recalcular el layout en cada frame de gesto (como hacía el prototipo con
 * CSS), acá el layout base se calcula una sola vez con `toPx` y el
 * pinch/pan/rotate interactivo se aplica como una transformada GPU sobre
 * todo el grupo — más fluido en un dispositivo real. */
export const MapaCampo = forwardRef<MapaCampoHandle, MapaCampoProps>(function MapaCampo(
  {
    puntos,
    perimetro,
    miPos,
    puntoCercanoId,
    enRango,
    heading,
    pantallaCompleta,
    puedeTocarPuntos,
    onTapPunto,
    miRuta,
    modoMarcarRuta,
    onTogglePuntoRuta,
    ancho,
    alto,
    onInteraccion,
    seguirRumbo,
    brujulaOffsetTop,
  },
  ref
) {
  const bounds = useMemo(() => {
    const todosLosVertices = perimetro.flat();
    const xs = todosLosVertices.map((p) => p.x);
    const ys = todosLosVertices.map((p) => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [perimetro]);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);

  const baseScaleFit = Math.min((ancho - MAP_PAD * 2) / spanX, (alto - MAP_PAD * 2) / spanY, MAP_SCALE_MAX);
  const baseScale = pantallaCompleta ? Math.min(baseScaleFit * 1.8, MAP_SCALE_MAX) : baseScaleFit;

  // Distancia (en metros, mismas unidades que p.x/p.y) de cada punto a su
  // VECINO MÁS CERCANO — a pedido del usuario, para que en una grilla muy
  // densa el círculo y el número de un punto nunca se dibujen tan grandes
  // como para pisar al de al lado, sea cual sea el zoom. O(n²) (cada punto
  // contra todos los demás) — con una grilla real de unos pocos cientos de
  // puntos esto es una cuenta trivial para el dispositivo, así que no hace
  // falta nada más sofisticado (una grilla en cuadrantes, etc.).
  //
  // La cuenta clave (por qué el tope de tamaño mantiene la MISMA
  // proporción sea cual sea el zoom, ver el `* zoomEfectivo` en el tope,
  // más abajo en el .map() de puntos): tanto el círculo como la
  // separación entre puntos en pantalla se multiplican por el MISMO
  // factor de zoom (uno viene horneado en la posición — ver toPx, más
  // abajo — el otro en este mismo tope) — entonces, si el tamaño de un
  // punto nunca supera una fracción fija de la distancia (ya en pantalla,
  // a ese zoom) a su vecino, esa proporción se mantiene sin importar
  // cuánto se acerque o aleje el zoom: los círculos JAMÁS se llegan a
  // tocar, en vez de solo "tocarse menos" a más zoom.
  const distanciaVecinoPorId = useMemo(() => {
    const mapa = new Map<string, number>();
    for (let i = 0; i < puntos.length; i++) {
      let minDist = Infinity;
      for (let j = 0; j < puntos.length; j++) {
        if (i === j) continue;
        const d = Math.hypot(puntos[i].x - puntos[j].x, puntos[i].y - puntos[j].y);
        if (d < minDist) minDist = d;
      }
      mapa.set(puntos[i].id, minDist);
    }
    return mapa;
  }, [puntos]);
  // El diámetro de un punto nunca ocupa más que esta fracción de la
  // distancia (en pantalla) a su vecino más cercano — deja un huequito
  // entre los dos círculos en vez de que apenas se toquen borde con borde.
  const FRACCION_MAX_CIRCULO = 0.8;
  // Por debajo de este tamaño en pantalla (px reales, ya con el zoom
  // aplicado) el número deja de ser legible — mejor mostrar el puntito
  // solo, sin número encimado e ilegible, que forzarlo igual. Acercando el
  // zoom en esa zona puntual el número vuelve a aparecer (ver
  // NIVELES_ZOOM, ahora con más escalones para poder llegar más cerca).
  const UMBRAL_LEGIBLE_PX = 7;
  const anclaX = ancho / 2;
  const anclaY = alto * 0.72; // como en cualquier GPS de navegación: más lote "adelante" que "atrás"

  // El zoom (una vez asentado — ver `zoomAsentado`/`nivelZoomIndex`, justo
  // abajo) ya viene HORNEADO acá adentro, en la POSICIÓN real de cada
  // punto — no es más algo que se le aplica después con un transform. Ver
  // el comentario grande, más abajo, junto a `pinch`/`irANivelZoom`, que
  // explica el motivo (probado en un dispositivo real: dejar el zoom
  // como una transformación pegada — aunque sea matemáticamente
  // "cancelada" por otra transformación puesta a propósito en el círculo/
  // número, ver el historial de este archivo — se ve peor cuanto más lejos
  // esté el zoom de 1x, no mejor).
  //
  // `pivoteX`/`pivoteY`: el pellizco (o los botones +/- de modo trabajo)
  // siempre agrandó/achicó alrededor del CENTRO de este grupo (el `scale`
  // de `estiloAnimado`, más abajo, pivotea ahí por default — ver ese
  // comentario) — para que hornear el zoom acá (adentro de `toPx`, justo
  // debajo) se vea IDÉNTICO a como se veía con la transformación en vivo,
  // el cálculo tiene que crecer/achicarse alrededor de ese MISMO punto. En
  // modo trabajo ese centro YA es el ancla (anclaX/anclaY, más arriba);
  // en vista general es el centro geométrico del recuadro (ancho/2,
  // alto/2 — ahí `altoGrupo`, más abajo, coincide con `alto` a secas).
  const pivoteX = anclaX;
  const pivoteY = pantallaCompleta ? anclaY : alto / 2;

  function toPx(xm: number, ym: number): { left: number; top: number } {
    let left: number, top: number;
    if (pantallaCompleta) {
      if (!miPos) return { left: anclaX, top: anclaY };
      left = anclaX + (xm - miPos.x) * baseScale;
      top = anclaY + (ym - miPos.y) * baseScale;
    } else {
      left = MAP_PAD + (xm - bounds.minX) * baseScale;
      top = MAP_PAD + (ym - bounds.minY) * baseScale;
    }
    return {
      left: pivoteX + (left - pivoteX) * zoomEfectivo,
      top: pivoteY + (top - pivoteY) * zoomEfectivo,
    };
  }

  // Espejo en React state del zoom ya asentado (no el que se mueve en vivo
  // mientras pellizcás — ver `scale`, más abajo, junto al resto de los
  // gestos). Mientras estás pellizcando, la POSICIÓN/TAMAÑO real de cada
  // punto quedan con el zoom ya asentado (`toPx`/`tamPunto`, ver más
  // abajo) — el pellizco en sí se ve como una transformación en vivo sobre
  // ESE layout (ver `scale`/`estiloAnimado`, un poco más abajo), nada
  // distinto de cualquier foto que agrandás con dos dedos. Apenas soltás
  // (ver pinch.onEnd), el zoom nuevo se HORNEA acá (React vuelve a
  // calcular posiciones/tamaños reales para el zoom nuevo) y la
  // transformación en vivo se lleva de nuevo a su estado neutro — recién
  // ahí queda nítido de nuevo, porque en reposo NO hay ninguna
  // transformación de escala aplicada, todos son valores reales.
  const [zoomAsentado, setZoomAsentado] = useState(1);

  // Índice actual dentro de NIVELES_ZOOM (solo modo trabajo, con los
  // botones +/-) — movido acá arriba (antes vivía más abajo, junto al
  // resto de los gestos) porque zoomEfectivo, un par de líneas más abajo,
  // lo necesita para saber el zoom REAL de modo trabajo en vez de un valor
  // fijo. El ref alcanzaba para que acercar()/alejar()/restablecer() supieran
  // en qué nivel están, pero el badge de zoom (ver más abajo) necesita un
  // state en paralelo para poder mostrarlo.
  const indiceZoomRef = useRef(NIVEL_ZOOM_INICIAL);
  const [nivelZoomIndex, setNivelZoomIndex] = useState(NIVEL_ZOOM_INICIAL);

  // Zoom real actual — modo trabajo lo saca de NIVELES_ZOOM (botones +/-),
  // vista general de `zoomAsentado` (pellizco, ya asentado). Se usa acá
  // para el recorte por vecino más cercano (ver tamPunto, en el .map() de
  // puntos) y en `toPx`, más arriba.
  const zoomEfectivo = pantallaCompleta ? NIVELES_ZOOM[nivelZoomIndex] : zoomAsentado;
  // "Base": el tamaño que tendría cada punto si no hubiera vecinos cerca —
  // el tope real, por vecino más cercano, se aplica más abajo (dentro del
  // .map() de puntos, ver tamPunto) porque es DISTINTO para cada punto.
  // Ya NO se divide por zoomEfectivo acá (antes sí, en dos intentos
  // distintos que terminaron ambos peor de lo que estaban — ver el
  // historial de este archivo y el comentario grande junto a `toPx`, más
  // arriba): como el zoom ahora se hornea en la POSICIÓN de cada punto, el
  // tamaño del círculo/número puede ser directamente el valor final
  // deseado en pantalla, constante a cualquier zoom (24px en modo
  // trabajo, igual que "Yo" — ver yoMarker, más abajo; 18px en vista
  // general) — el recorte por vecino más cercano (ver tamPunto) sigue
  // funcionando igual arriba de esto: en una zona densa, un punto puede
  // terminar más chico (nunca más grande).
  const tamPuntoBase = pantallaCompleta ? 24 : 18;
  const tamFuenteBase = pantallaCompleta ? 11 : 8.5;
  const colorBorderPendiente = pantallaCompleta ? colors.text : colors.warning;
  const colorFillCompleto = pantallaCompleta ? "#6FCF5C" : colors.primaryConfirm;
  const colorBorderCompleto = pantallaCompleta ? colors.text : colors.primary;
  // Fondo claro en los dos modos (no oscuro en pantalla completa como en
  // una primera versión) — así que la etiqueta necesita un color oscuro
  // legible sobre claro en ambos casos, no el hueso que se pensó para
  // fondo oscuro. `colors.text` (casi negro), no `textMuted` (un marrón
  // apagado) — a pedido del usuario, para que el número resalte más,
  // sobre todo a zoom alto donde queda chico.
  const colorEtiqueta = colors.text;

  // ---- Gestos: pinch (zoom, solo vista general) + pan (arrastrar) +
  // rotación con 2 dedos ----
  // `scale`: YA NO es "el zoom actual" en reposo (antes sí, ver el
  // historial) — ahora sólo se usa como transformación TRANSITORIA,
  // mientras el zoom nuevo todavía no terminó de hornearse en las
  // posiciones/tamaños reales (ver toPx/tamPunto, más arriba). En reposo
  // vale 1 (ninguna transformación de escala aplicada) — ver el
  // comentario grande junto a `pinch`, más abajo, con el detalle de por
  // qué y cómo. Ya no hace falta un "savedScale" aparte (antes lo había,
  // para acumular el pellizco entre gestos) — la base contra la que se
  // pellizca ahora es directamente `zoomAsentado`/`nivelZoomIndex`
  // (siempre al día, siempre el zoom real ya horneado).
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const rotacion = useSharedValue(0);
  const savedRotacion = useSharedValue(0);
  // Espejo en React state de "hay un gesto manual pisando la vista" — lo
  // necesitamos acá adentro (no solo afuera, vía onInteraccion) para poder
  // pausar el useEffect de seguirRumbo de abajo.
  const [interactuado, setInteractuado] = useState(false);

  function avisarInteraccion() {
    setInteractuado(true);
    onInteraccion?.(true);
  }

  function restablecer() {
    // El destino es 1x — la proporción entre el zoom actual (ya horneado
    // en las posiciones/tamaños reales) y ese destino es, justamente, el
    // propio zoom actual (ver el comentario grande junto a `pinch`, más
    // abajo, con el detalle completo de esta cuenta). Arrancar `scale`
    // ahí y animarlo a 1 se ve como una transición suave de "achicarse
    // hasta volver a 1x" — exactamente lo mismo que se veía antes, sólo
    // que ahora, en cuanto la animación llega a 1, no queda pixelado:
    // React ya actualizó (ver setZoomAsentado/setNivelZoomIndex, abajo)
    // las posiciones/tamaños reales al destino, así que a partir de ahí
    // no hay ninguna transformación de escala de más aplicada.
    const zoomActual = pantallaCompleta ? NIVELES_ZOOM[nivelZoomIndex] : zoomAsentado;
    scale.value = zoomActual;
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    savedTranslateX.value = 0;
    translateY.value = withTiming(0);
    savedTranslateY.value = 0;
    rotacion.value = withTiming(0);
    savedRotacion.value = 0;
    indiceZoomRef.current = NIVEL_ZOOM_INICIAL;
    setNivelZoomIndex(NIVEL_ZOOM_INICIAL);
    setInteractuado(false);
    onInteraccion?.(false);
    setZoomAsentado(1);
  }

  function irANivelZoom(indice: number) {
    const clamped = Math.max(0, Math.min(NIVELES_ZOOM.length - 1, indice));
    const actual = NIVELES_ZOOM[indiceZoomRef.current];
    const destino = NIVELES_ZOOM[clamped];
    indiceZoomRef.current = clamped;
    // Ver el comentario grande junto a `pinch`, más abajo: acá también el
    // zoom nuevo ya queda horneado (este `setNivelZoomIndex` hace que
    // toPx/tamPunto recalculen posiciones/tamaños reales al nuevo nivel),
    // y `scale` sólo sirve para la SENSACIÓN de transición animada — arranca
    // en la proporción vieja/nueva (coincide exacto con cómo se veía el
    // frame anterior) y se anima hasta 1, momento en el que el transform
    // deja de sumar nada sobre el layout ya recalculado: ahí el render
    // vuelve a ser 100% nativo, nítido a cualquier zoom.
    scale.value = actual / destino;
    scale.value = withTiming(1);
    setNivelZoomIndex(clamped);
    // A propósito NO se llama avisarInteraccion acá — acercar/alejar con
    // los botones no tiene que pausar el seguimiento de rumbo ni mostrar
    // "Volver a mi marcha", que era justo la queja con el pellizco.
  }

  useImperativeHandle(
    ref,
    () => ({
      restablecer,
      acercar: () => irANivelZoom(indiceZoomRef.current + 1),
      alejar: () => irANivelZoom(indiceZoomRef.current - 1),
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Gira el grupo entero para que arriba sea tu rumbo real, mientras nadie
  // tocó el mapa a mano — signo NEGATIVO (mismo que el prototipo,
  // `rotate(-headingUsado)`). Hubo idas y vueltas con este signo en esta
  // misma sesión (se había probado positivo por un reporte de campo,
  // caminando hacia un punto) — pero ese test tenía una trampa: al
  // caminar en línea recta HACIA un punto que ya está "arriba", el punto
  // se va acercando al ancla (más abajo en la pantalla) a medida que
  // reducís la distancia real — eso es lo ESPERADO, no un signo de que el
  // giro esté al revés (el heading casi ni cambiaba en ese test, caminando
  // derecho). La prueba que sí aísla el signo del giro es girar el
  // TELÉFONO en el lugar (sin caminar) y mirar hacia dónde se mueve la
  // brújula fija del mapa (ver estiloRosaNorte, más abajo): girando el
  // cuerpo/teléfono 90° hacia la derecha (para pasar de mirar al norte a
  // mirar al este), el norte real pasa a quedar a tu IZQUIERDA — o sea el
  // mapa (y la brujulita) tienen que girar hacia la IZQUIERDA (sentido
  // antihorario) cuando vos girás hacia la derecha (sentido horario) —
  // exactamente como una brújula de mano de verdad, que al girarla en tu
  // mano se ve "quieta" respecto al norte real (la aguja no gira con vos,
  // gira al revés tuyo). Esa cuenta da signo NEGATIVO, y es la que quedó.
  useEffect(() => {
    if (!seguirRumbo || interactuado) return;
    const rad = (-heading * Math.PI) / 180;
    rotacion.value = withTiming(rad, { duration: 350 });
    savedRotacion.value = rad;
  }, [heading, seguirRumbo, interactuado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pellizcar para hacer zoom solo en vista general — en modo trabajo el
  // zoom es con los botones +/- (ver acercar/alejar), no con los dedos,
  // así que acá directamente no hay gesto de pinch que pueda pisar el
  // seguimiento de rumbo por accidente (era el reclamo: pellizcar
  // disparaba "Volver a mi marcha" sin querer).
  //
  // Probado en un dispositivo real (los dos modos): dejar el zoom
  // aplicado como una transformación en vivo TODO el tiempo — aunque en
  // el círculo/número se ponga, a propósito, una segunda transformación
  // que la cancele matemáticamente (se probaron dos variantes de esto en
  // esta misma sesión) — se ve CADA VEZ PEOR cuanto más lejos esté el
  // zoom de 1x, arrancando desde zooms bastante bajos (130-140%). La
  // composición de transformaciones (por más que el resultado matemático
  // sea "neutro") no se termina dibujando nítido en este dispositivo/
  // versión de React Native — algo que solo se pudo confirmar probando
  // en un celular real, no leyendo el código.
  //
  // El cambio de fondo: en reposo (dedos sueltos, sin pellizcar) el zoom
  // ya NO es una transformación — está HORNEADO directo en la posición y
  // el tamaño reales de cada punto (ver toPx/tamPunto, más arriba),
  // recalculados por React con el zoom nuevo apenas soltás los dedos
  // (ver onEnd, acá abajo). En ese momento no queda NINGUNA
  // transformación de escala puesta sobre nada — el sistema dibuja cada
  // círculo/número de una, ya a su tamaño/posición final, sin componer
  // nada — así no hay margen para que se pixele, sea cual sea el zoom.
  //
  // `scale` (ver más arriba) pasa a usarse solo DURANTE el pellizco en
  // sí (para que se sienta en vivo, con los dedos) — `e.scale` de
  // react-native-gesture-handler ya viene como la proporción respecto al
  // COMIENZO del gesto (arranca en 1 y crece/achica desde ahí), que es
  // justo la proporción respecto al último zoom ya asentado (la base de
  // ahora en más es siempre `zoomAsentado`, no un "savedScale" propio) —
  // por eso no hace falta multiplicar por nada más. Al soltar los dedos,
  // se calcula el zoom nuevo (zoomAsentado × la proporción del pellizco)
  // y se manda a React (setZoomAsentado) para que hornee las posiciones/
  // tamaños reales — `scale` se resetea a 1 en el mismo instante: como el
  // pellizco YA terminó justo en ese punto (nada sigue animándose), no
  // hay salto visible, sólo pasa de "transformación en vivo" a "valores
  // reales ya recalculados", que dan exactamente lo mismo en pantalla.
  const pinch = Gesture.Pinch()
    .enabled(!pantallaCompleta)
    .onUpdate((e) => {
      "worklet";
      const minRatio = ZOOM_MIN / zoomAsentado;
      const maxRatio = ZOOM_MAX_VISTA_GENERAL / zoomAsentado;
      scale.value = Math.min(maxRatio, Math.max(minRatio, e.scale));
    })
    .onEnd(() => {
      "worklet";
      const nuevoZoom = Math.min(ZOOM_MAX_VISTA_GENERAL, Math.max(ZOOM_MIN, zoomAsentado * scale.value));
      scale.value = 1;
      runOnJS(avisarInteraccion)();
      runOnJS(setZoomAsentado)(nuevoZoom);
    });

  const pan = Gesture.Pan()
    // En vista general (no pantalla completa) el mapa vive adentro de un
    // ScrollView — con 1 solo dedo tiene que scrollear la pantalla, no
    // mover el mapa, así que acá el pan pide 2 dedos como mínimo. En modo
    // trabajo no hay scroll alrededor, así que se mantiene con 1 dedo.
    .minPointers(pantallaCompleta ? 1 : 2)
    .averageTouches(true)
    .onUpdate((e) => {
      "worklet";
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      "worklet";
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(avisarInteraccion)();
    });

  const rotar = Gesture.Rotation()
    .onUpdate((e) => {
      "worklet";
      rotacion.value = savedRotacion.value + e.rotation;
    })
    .onEnd(() => {
      "worklet";
      savedRotacion.value = rotacion.value;
      runOnJS(avisarInteraccion)();
    });

  const gestoCompuesto = Gesture.Simultaneous(pinch, pan, rotar);

  // Escala y rotación pivotean, por default, sobre el centro geométrico de
  // la vista a la que se aplican — no hay forma de pedirles otro pivote sin
  // arriesgarse a APIs nuevas de estilo poco probadas (transformOrigin dio
  // un crash nativo en una prueba real, ver historial). En vez de eso, en
  // modo trabajo agrandamos la altura de esta vista para que SU centro
  // natural caiga justo sobre el ancla (donde está "Yo", fijo — ver más
  // abajo): como el ancla ya está centrada en X, alcanza con estirar el
  // alto para 2×anclaY manteniendo el borde de arriba en el mismo lugar
  // (top:0) — así ningún punto/etiqueta necesita recalcular su posición,
  // sólo cambia dónde cae el centro de la vista. El sobrante de abajo
  // queda recortado por el overflow:hidden del contenedor de afuera, igual
  // que ya se recorta cualquier otro contenido que se sale al girar/hacer
  // zoom.
  const altoGrupo = pantallaCompleta ? anclaY * 2 : alto;
  // Margen extra alrededor de la caja del SVG del contorno (vista general
  // — ver el comentario grande junto al <Svg>, en el JSX) — con el zoom
  // horneado en la posición (toPx, más arriba), un vértice que arranca en
  // el borde mismo del recuadro puede terminar, al zoom máximo
  // (ZOOM_MAX_VISTA_GENERAL), varias veces más lejos del centro que el
  // recuadro original. Multiplicar por ese mismo techo de zoom cubre ese
  // peor caso con comodidad.
  const margenSvg = Math.max(ancho, altoGrupo) * ZOOM_MAX_VISTA_GENERAL;
  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotateZ: `${rotacion.value}rad` },
    ],
  }));

  // Contra-rotación, para que la numeración de cada punto se lea siempre en
  // horizontal, gire lo que gire el mapa — un solo estilo animado
  // reutilizado en todas las etiquetas (no se puede llamar
  // useAnimatedStyle adentro del .map() de abajo, así que va una vez acá
  // arriba). Ya NO contra-escala acá (antes sí) — ver el comentario de
  // `zoomAsentado`/tamPunto más arriba: el tamaño real de cada círculo/
  // número ahora se resuelve con un valor real (que react-native-svg/Text
  // dibujan nítido) en vez de con un transform, que es lo que los
  // pixelaba. La rotación no tiene ese problema (rotar no pixela, solo
  // estirar/agrandar), así que sigue con Reanimated como siempre, en vivo.
  const estiloContraRotacionEtiqueta = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ rotateZ: `${-rotacion.value}rad` }] };
  });

  // Brújula fija en pantalla (la "N", ver JSX) — a pedido del usuario, para
  // poder confirmar a simple vista que el norte real cae donde tiene que
  // caer, gire lo que gire el mapa (por seguir el rumbo en modo trabajo, o
  // por el gesto de 2 dedos en vista general). Ojo, ACÁ SÍ es con el MISMO
  // signo que `rotacion` (no el negativo, a diferencia de
  // estiloContraRotacionEtiqueta de arriba) — son dos cosas opuestas a
  // propósito: la etiqueta de un punto se contra-rota para deshacer el
  // giro del mapa y quedar siempre horizontal (no me importa hacia dónde
  // señala, me importa que se lea); la brújula tiene que hacer exactamente
  // lo contrario — ACOMPAÑAR el giro del mapa, para seguir señalando el
  // norte real (que en pantalla se mueve para donde se mueva el mapa
  // entero). Si tocara el norte queda "arriba" siempre (sin importar el
  // giro), dejaría de servir para confirmar nada.
  const estiloRosaNorte = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ rotateZ: `${rotacion.value}rad` }] };
  });

  // Solo modo trabajo: el marcador "Yo" está fuera del grupo que
  // gira/escala/arrastra (ver JSX), pero necesita moverse CON el arrastre
  // (pan) — arrastrar el mapa con dos dedos tiene que mover "Yo" también,
  // es lo lógico, y "Volver a mi marcha" te devuelve a los dos al lugar
  // original. Lo que "Yo" no hace es rotar ni escalar con el resto: girar
  // o hacer zoom tienen que pivotear alrededor suyo, no moverlo — por eso
  // solo toma translateX/Y acá, nunca scale ni rotateZ.
  const estiloYoArrastrado = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  // Una lista de puntos-en-pantalla por pieza (ver `perimetro` — casi
  // siempre una sola pieza, más de una en un campo con lotes no
  // contiguos).
  const piezasPx = perimetro.map((pieza) => pieza.map((p) => toPx(p.x, p.y)));
  // El relleno usa Path (M...L...Z, uno por pieza, todo en el mismo `d`)
  // armado a mano con las mismas coordenadas — sirve para el área
  // sombreada, pero el CONTORNO (lo que de verdad se está evaluando acá)
  // se dibuja aparte, como líneas sueltas (ver más abajo): con datos
  // reales de un lote real, tanto Polygon como Path (como un solo trazo
  // con stroke) dejaban alguna arista sin dibujar — un bug de esta
  // versión de react-native-svg al armar una figura de varios segmentos
  // de una sola vez. Una <Line> por lado, cada una con sus 4 números
  // sueltos (nada de texto para parsear), es lo más básico que se puede
  // pedirle a la librería — si esto también falla, el problema no está en
  // cómo se arma la figura.
  const perimetroPath = piezasPx
    .filter((pieza) => pieza.length > 0)
    .map(
      (pieza) =>
        `M ${pieza[0].left},${pieza[0].top} L ${pieza
          .slice(1)
          .map((p) => `${p.left},${p.top}`)
          .join(" L ")} Z`
    )
    .join(" ");

  const posMi = miPos ? toPx(miPos.x, miPos.y) : null;
  // Mientras se está marcando el recorrido (no una vez confirmado — ver
  // `marcandoRuta` más abajo), cada punto ya tocado muestra un tilde adentro
  // del círculo, para saber de un vistazo cuáles ya se agregaron. Al
  // confirmar el recorrido esto se apaga solo (deja de estar "marcandoRuta")
  // y solo queda la línea celeste, sin el tilde de cada punto — no suma
  // ruido visual una vez que el camino ya está trazado.
  const miRutaSet = useMemo(() => new Set(miRuta ?? []), [miRuta]);
  const miRutaPx = (miRuta ?? [])
    .map((id) => puntos.find((p) => p.id === id))
    .filter((p): p is PuntoMapa => !!p)
    .map((p) => toPx(p.x, p.y));

  return (
    <View
      style={[
        styles.contenedor,
        pantallaCompleta ? styles.contenedorPantallaCompleta : styles.contenedorEncuadrado,
        { width: ancho, height: alto },
      ]}
    >
      <GestureDetector gesture={gestoCompuesto}>
        <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: ancho, height: altoGrupo }, estiloAnimado]}>
          {/* El width/height "de base" del SVG tienen que coincidir con el
              tamaño real de esta vista (altoGrupo, no el `alto` de la
              pantalla) — si no coinciden, el SVG reescala su contenido
              para "entrar" en el tamaño real, desalineando el perímetro de
              los puntos (que se posicionan aparte, con estilos normales,
              sin ese reescalado).
              `margenSvg`: a diferencia de los puntos (que sólo pintan un
              puñado de vistas comunes, sin caja propia — la única que
              recorta es `contenedor`, más abajo), el SVG SÍ recorta su
              propio contenido en su propio borde — con el zoom horneado
              en la posición de cada punto (ver toPx, más arriba) las
              esquinas del contorno del lote, a mucho zoom, terminan MUY
              lejos de esta caja (`ancho`×`altoGrupo`) y quedaban cortadas.
              Se agranda la caja del SVG bastante más allá de lo que
              cualquier zoom real puede llegar a necesitar (con
              ZOOM_MAX_VISTA_GENERAL de margen, para cubrir con comodidad
              el peor caso: un vértice en el borde mismo del recuadro,
              pellizcado hasta el tope) y se la recentra con `viewBox`, así
              las coordenadas de `piezasPx`/`miRutaPx` (que no cambian)
              siguen cayendo en el mismo lugar de siempre — la única
              diferencia es que ahora hay margen de sobra alrededor antes
              de que algo se corte. El recorte real y visible en pantalla
              lo sigue haciendo `contenedor` (una vista común, sin este
              problema), así que agrandar esto no muestra nada de más. */}
          <Svg
            width={ancho + 2 * margenSvg}
            height={altoGrupo + 2 * margenSvg}
            viewBox={`${-margenSvg} ${-margenSvg} ${ancho + 2 * margenSvg} ${altoGrupo + 2 * margenSvg}`}
            style={{ position: "absolute", top: -margenSvg, left: -margenSvg }}
          >
            {/* El relleno sombreado (Path con fill) tenía el mismo problema
                que el contorno — se veía "cortado" en franjas, con datos
                reales de un lote real. El contorno con vistas comunes (ver
                más abajo) ya se ve perfecto y es lo que de verdad importa
                para saber si estás adentro o afuera, así que en modo
                trabajo se saca el relleno en vez de seguir peleando con la
                misma librería. Vista general sí lo mantiene — ahí nunca
                dio problema. */}
            {!pantallaCompleta && <Path d={perimetroPath} fill="rgba(59,143,92,0.08)" stroke="none" />}
            {/* Vista general: el contorno con <Line> anda bien acá (lote
                chico, sin la rotación grande de seguir rumbo) — se deja
                como estaba. Un loop por pieza (el `(i+1) % length` de
                adentro cierra CADA pieza sobre sí misma, nunca salta de
                una pieza a la siguiente). */}
            {!pantallaCompleta &&
              piezasPx.map((piezaPx, pi) =>
                piezaPx.map((a, i) => {
                  const b = piezaPx[(i + 1) % piezaPx.length];
                  return (
                    <Line
                      key={`lado-${pi}-${i}`}
                      x1={a.left}
                      y1={a.top}
                      x2={b.left}
                      y2={b.top}
                      stroke={colors.primary}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  );
                })
              )}

            {/* Recorrido personal — vista general nomás (en modo trabajo se
                dibuja con vistas comunes más abajo, mismo motivo que el
                perímetro: SVG con la rotación grande de seguir rumbo no
                dibuja bien todos los tramos). */}
            {!pantallaCompleta &&
              miRutaPx.length > 1 &&
              miRutaPx.slice(1).map((b, i) => {
                const a = miRutaPx[i];
                return (
                  <Line
                    key={`ruta-${i}`}
                    x1={a.left}
                    y1={a.top}
                    x2={b.left}
                    y2={b.top}
                    stroke={colors.info}
                    strokeWidth={2.5}
                    strokeDasharray="7 6"
                    strokeLinecap="round"
                  />
                );
              })}
          </Svg>

          {/* Modo trabajo: el contorno se dibuja con vistas comunes (un
              rectángulo finito por lado, rotado para calzar con el ángulo
              de cada arista), no con SVG — ni <Polygon>, ni <Path>, ni
              <Line> sueltas dibujaban bien las dos aristas que tocan un
              vértice en particular, con datos reales de un lote real y la
              rotación grande que aplica seguir el rumbo. Las vistas
              comunes sí vienen andando perfecto en todo este mapa (los
              puntos, "Yo", los marcadores de prueba), así que el contorno
              pasa a usar el mismo mecanismo. */}
          {pantallaCompleta &&
            piezasPx.map((piezaPx, pi) =>
              piezaPx.map((a, i) => {
                const b = piezaPx[(i + 1) % piezaPx.length];
                const dx = b.left - a.left;
                const dy = b.top - a.top;
                const longitud = Math.hypot(dx, dy);
                const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
                const grosor = 2.5;
                return (
                  <View
                    key={`lado-${pi}-${i}`}
                    style={{
                      position: "absolute",
                      left: (a.left + b.left) / 2 - longitud / 2,
                      top: (a.top + b.top) / 2 - grosor / 2,
                      width: longitud,
                      height: grosor,
                      backgroundColor: colors.primary,
                      transform: [{ rotate: `${angulo}deg` }],
                    }}
                  />
                );
              })
            )}

          {/* Recorrido personal en modo trabajo — de solo lectura (se marca
              y edita siempre desde vista general), mismas vistas comunes
              rotadas que el perímetro. */}
          {pantallaCompleta &&
            miRutaPx.length > 1 &&
            miRutaPx.slice(1).map((b, i) => {
              const a = miRutaPx[i];
              const dx = b.left - a.left;
              const dy = b.top - a.top;
              const longitud = Math.hypot(dx, dy);
              const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
              const grosor = 3;
              return (
                <View
                  key={`ruta-${i}`}
                  style={{
                    position: "absolute",
                    left: (a.left + b.left) / 2 - longitud / 2,
                    top: (a.top + b.top) / 2 - grosor / 2,
                    width: longitud,
                    height: grosor,
                    backgroundColor: colors.info,
                    transform: [{ rotate: `${angulo}deg` }],
                  }}
                />
              );
            })}

          {puntos.map((p) => {
            const pos = toPx(p.x, p.y);
            const cercano = puntoCercanoId === p.id;
            // Portado del prototipo: la distancia al punto (enRango) es
            // solo informativa (ver tarjeta de distancia en modo trabajo,
            // que muestra "Acercate al punto" / "En rango"), no bloquea el
            // toque — cualquier punto se puede cargar desde cualquier
            // distancia. Lo único que sí restringe es el rol (Monitoreador
            // solo desde Modo trabajo, ver `puedeTocarPuntos`). Marcar el
            // recorrido personal es otro permiso aparte — no depende de
            // `puedeTocarPuntos` (un Monitoreador también puede armarse su
            // propio recorrido, aunque no pueda cargar datos desde acá).
            const marcandoRuta = modoMarcarRuta && !pantallaCompleta;
            const tocable = marcandoRuta || puedeTocarPuntos;
            const marcadoEnRuta = marcandoRuta && miRutaSet.has(p.id);
            const colorFondo = marcadoEnRuta ? colors.info : p.confirmado ? colorFillCompleto : colors.surface;
            const colorBorde = marcadoEnRuta ? colors.info : p.confirmado ? colorBorderCompleto : colorBorderPendiente;

            // Tope de tamaño por vecino más cercano (ver el comentario
            // grande de distanciaVecinoPorId, más arriba) — el tamaño
            // "base" (tamPuntoBase) es el que tendría este punto si
            // estuviera solo; acá se lo recorta si eso lo haría más grande
            // que la fracción permitida de la distancia real a su vecino.
            // dVecino === Infinity (un solo punto en toda la grilla, sin
            // nadie más cerca) deja pasar el tamaño base sin tocar nada.
            // Ahora multiplicado por zoomEfectivo (antes no hacía falta):
            // como la posición de cada punto ya viene horneada con el zoom
            // (ver toPx, más arriba), la distancia EN PANTALLA a un vecino
            // también crece con el zoom — este tope tiene que reflejar esa
            // distancia real, no la de 1x.
            const dVecino = distanciaVecinoPorId.get(p.id) ?? Infinity;
            const tamPunto = Number.isFinite(dVecino)
              ? Math.min(tamPuntoBase, Math.max(3, FRACCION_MAX_CIRCULO * dVecino * baseScale * zoomEfectivo))
              : tamPuntoBase;
            // La letra se achica en la misma proporción que el círculo, así
            // el número sigue "calzando" adentro/al lado del círculo como
            // siempre.
            const tamFuente = tamFuenteBase * (tamPunto / tamPuntoBase);
            // Legibilidad en pantalla de VERDAD — ya NO hace falta
            // multiplicar por zoomEfectivo acá (antes sí: tamFuente era un
            // tamaño "antes" de que el grupo entero se escalara con el
            // zoom, ver el historial). Ahora tamFuente YA es el tamaño
            // final real en pantalla (el zoom viene horneado más arriba,
            // en tamPunto), así que se compara directo contra el umbral.
            const mostrarEtiqueta = tamFuente >= UMBRAL_LEGIBLE_PX;
            return (
              <Pressable
                key={p.id}
                disabled={!tocable}
                // Antes tenía hitSlop 10, después 3 (un área de toque
                // invisible más grande que el círculo) — con una grilla
                // densa de verdad (100+ puntos, como la real) esa área
                // extra de puntos vecinos se solapaba, y terminabas
                // abriendo el punto de al lado en vez del que tocaste, sobre
                // todo a poco zoom (círculos más chicos, más juntos entre
                // sí en pantalla). En 0 el área de toque es EXACTAMENTE el
                // círculo visible — nada de margen invisible que se meta en
                // el círculo de al lado — así que ya no puede haber
                // ambigüedad salvo que los círculos se toquen entre sí de
                // verdad en pantalla, y ahí lo que corresponde es acercar
                // más con el pellizco (para eso está), no adivinar cuál.
                hitSlop={0}
                onPress={() => (marcandoRuta ? onTogglePuntoRuta?.(p.id) : onTapPunto(p.id))}
                style={[
                  styles.punto,
                  {
                    width: tamPunto,
                    height: tamPunto,
                    left: pos.left - tamPunto / 2,
                    top: pos.top - tamPunto / 2,
                  },
                  // La sombra (shadowColor/Radius/Offset/elevation) antes
                  // estaba siempre puesta en TODOS los puntos, solo con
                  // shadowOpacity en 0 para que no se viera en los que no
                  // corresponde — pero iOS arma la sombra igual (aunque
                  // quede invisible) para cualquier vista que tenga esas
                  // propiedades. Con una grilla densa de verdad (100+
                  // puntos) eso es una sombra de más por punto, en TODOS a
                  // la vez, adentro del grupo que se pellizca para hacer
                  // zoom — buen sospechoso de por qué el círculo/número se
                  // seguía viendo pixelado incluso después de sacar SVG y
                  // el tamaño real. Ahora la sombra directamente no se
                  // arma (ni las propiedades están puestas) salvo en el
                  // único punto que de verdad la necesita.
                  cercano && enRango ? styles.puntoConSombra : null,
                ]}
              >
                {/* El círculo va en una vista aparte (adentro del área de
                    toque, que mantiene su tamaño/posición real siempre) —
                    `tamPunto` ya es directamente el tamaño FINAL deseado en
                    pantalla (ver el comentario grande de tamPuntoBase, más
                    arriba: el zoom viene horneado en la posición, no hace
                    falta cancelar nada acá) así que esta vista no lleva
                    ningún transform — se dibuja nativo, nítido, a
                    cualquier zoom. Sin el recorte por vecino más cercano
                    (ver dVecino, más arriba) el círculo se agrandaría
                    tanto como separa a los puntos entre sí y, en una
                    grilla densa, terminarían tapándose igual por más zoom
                    que se haga — por eso el tope, no por esto.

                    Vista nativa (borderRadius/backgroundColor/borderWidth),
                    no SVG, en los dos modos — se había probado con SVG acá
                    (pensando que así se evitaba el pixelado del zoom), pero
                    esta librería de SVG ya tenía un bug conocido de
                    renderizado con rotaciones grandes (ver el contorno del
                    lote, más abajo, que por eso tampoco usa SVG en modo
                    trabajo) — y vista general TAMBIÉN se puede rotar con
                    dos dedos, no solo pellizcar. Una vista nativa con
                    borderRadius no tiene ese problema (son propiedades que
                    dibuja el sistema directo, no una imagen que se pueda
                    corromper con la rotación) — y ya sin la sombra puesta
                    de más (ver estilo `punto`, arriba) tampoco se pixela
                    con el zoom, así que no hacía falta el SVG para nada. */}
                <View style={[styles.puntoCirculo, { width: tamPunto, height: tamPunto }]}>
                  <View
                    style={{
                      width: tamPunto,
                      height: tamPunto,
                      borderRadius: tamPunto / 2,
                      backgroundColor: colorFondo,
                      borderColor: colorBorde,
                      borderWidth: pantallaCompleta ? 3 : 2,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {marcadoEnRuta && <Check size={tamPunto * 0.6} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                </View>
                {/* Mismo motivo que el círculo de arriba: `tamFuente` ya
                    es el tamaño final real en pantalla (el zoom viene
                    horneado en la posición, no en un transform), así que
                    tampoco lleva ningún transform de escala — Vista
                    nativa (Text), no SVG, de paso evita el bug de SVG con
                    la rotación de dos dedos, que vista general también
                    tiene.

                    Si `mostrarEtiqueta` da false (el número, ya recortado
                    por su vecino más cercano, quedaría demasiado chico para
                    leerse en pantalla) directamente no se dibuja nada acá —
                    mejor un puntito solo, sin número, que un montón de
                    números ilegibles amontonados unos sobre otros. Ver el
                    comentario grande de distanciaVecinoPorId, más arriba:
                    acercando el zoom en esa zona puntual el número vuelve a
                    aparecer solo. */}
                {mostrarEtiqueta && (
                  <Animated.Text
                    numberOfLines={1}
                    style={[
                      styles.puntoLabel,
                      { color: colorEtiqueta, fontSize: tamFuente, top: tamPunto + 1, left: tamPunto / 2 - 20 },
                      estiloContraRotacionEtiqueta,
                    ]}
                  >
                    {p.id}
                  </Animated.Text>
                )}
              </Pressable>
            );
          })}

          {/* Vista general: "Yo" es un punto más del mapa, gira y se mueve
              con el resto (no hay "ancla" en esta vista). En modo trabajo
              va afuera, fijo — ver más abajo.
              `- 45` fijo: el ícono "Navigation" de lucide, sin rotar, NO
              apunta derecho para arriba — su dibujo (un polígono tipo
              flecha de ubicación) sale de fábrica apuntando hacia el
              noreste, 45° para la derecha de "arriba" (se puede comprobar
              con las coordenadas de su polygon). Sin este ajuste, a
              heading=0 (mirando al norte) la flecha se veía apuntando en
              diagonal en vez de derecho hacia arriba — es lo mismo que se
              corrige en el marcador de modo trabajo, más abajo. */}
          {!pantallaCompleta && posMi && (
            <View style={[styles.yoMarker, { left: posMi.left - 12, top: posMi.top - 12 }]}>
              <View style={styles.yoMarkerPulso} />
              <Navigation size={13} color="#FFFFFF" style={{ transform: [{ rotate: `${heading - 45}deg` }] }} />
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Modo trabajo: "Yo" arranca en el ancla (centro, un poco hacia
          abajo) y se mueve CON el arrastre (estiloYoArrastrado), pero girar
          o hacer zoom pivotea a su alrededor en vez de moverlo — por eso
          está fuera del grupo con el transform animado completo, no
          adentro (ese grupo sí tiene scale/rotateZ, que "Yo" no debe
          heredar). "Volver a mi marcha" devuelve todo al lugar original.

          La flechita interior va FIJA apuntando para arriba, sin rotar
          (a diferencia de vista general, donde sí rota con `heading` —
          ahí el mapa no gira, así que ahí la flecha es la única forma de
          ver hacia dónde apunta el teléfono). Acá el mapa entero YA rota
          para que tu rumbo quede siempre "arriba" (ver seguirRumbo más
          arriba) — con eso, una flecha fija apuntando arriba ya representa
          bien "hacia dónde vas", mismo criterio que el marcador de
          posición de Google Maps en modo navegación (el mapa gira, la
          flecha del usuario se queda fija apuntando arriba). Antes esta
          flecha rotaba también por su cuenta (sumando heading + la
          rotación del mapa) para terminar SIEMPRE cancelando en 0° —o sea,
          ya apuntaba fija para arriba, pero por una cuenta innecesaria en
          vez de simplemente no rotar nunca — a pedido del usuario, que la
          quiere así (fija hacia arriba) de forma explícita.

          Ojo, "0°" acá NO es sin ningún transform: el ícono "Navigation" de
          lucide, tal cual sale de fábrica (sin rotar), apunta hacia el
          NORESTE, no hacia arriba — su dibujo interno es un polígono tipo
          flecha de ubicación orientado 45° a la derecha de "arriba" (mismo
          motivo que el ajuste `heading - 45` de la flecha de vista general,
          más arriba). Por eso acá el fijo real es `-45deg`, no sin
          transform — es lo que hace que se vea derecha hacia arriba de
          verdad, en vez de ligeramente inclinada hacia la derecha.

          `pointerEvents="none"`: este marcador queda dibujado JUSTO arriba
          del punto donde estás parado (por diseño — es lo que te dice
          "estás acá") pero al ser el último en el árbol, sin esto se
          quedaba con el toque y no dejaba tocar el punto de abajo para
          cargarlo — a pedido del usuario, que notó que parado sobre un
          punto no podía abrirlo. Con esto el marcador se ve igual pero deja
          pasar el toque directo al punto. */}
      {pantallaCompleta && miPos && (
        <Animated.View
          style={[styles.yoMarker, { left: anclaX - 12, top: anclaY - 12 }, estiloYoArrastrado]}
          pointerEvents="none"
        >
          <View style={styles.yoMarkerPulso} />
          <Navigation size={13} color="#FFFFFF" style={{ transform: [{ rotate: "-45deg" }] }} />
        </Animated.View>
      )}

      {/* A pedido del usuario, para poder mandar una captura y que del otro
          lado se sepa exactamente a qué zoom está sacada, sin tener que
          adivinar — en los dos modos, no solo vista general. Va AFUERA del
          grupo con el transform animado (ver GestureDetector, más arriba)
          a propósito, para que quede fijo en la esquina en vez de girar/
          moverse con el mapa.
          OJO: el % de un modo no es comparable 1 a 1 contra el del otro —
          cada uno es relativo a su propia escala base (`baseScale`, más
          arriba), que ya arranca distinta entre modo trabajo y vista
          general (ahí ya empieza más acercada, pensada para leer los
          puntos caminando).
          En modo trabajo, pegado justo arriba del control +/- de zoom (no
          en la esquina como en vista general) — a pedido del usuario, para
          que quede claro que el % es DE ESE control. El control (rocker)
          vive en modo-trabajo.tsx, no acá — mismo right:16 y mismo
          top:"50%" como referencia para quedar alineado con él, con un
          translateY que lo deja pegado justo arriba de su borde superior
          (rocker: 88px de alto centrado con translateY:-44 — ver
          modo-trabajo.tsx, styles.rockerZoom). */}
      <View style={[styles.zoomBadge, pantallaCompleta && styles.zoomBadgeModoTrabajo]}>
        <Text style={styles.zoomBadgeTexto}>
          {Math.round((pantallaCompleta ? NIVELES_ZOOM[nivelZoomIndex] : zoomAsentado) * 100)}%
        </Text>
      </View>

      {/* Brújula fija ("N") — a pedido del usuario, para poder confirmar a
          simple vista hacia dónde cae el norte real, gire lo que gire el
          mapa (siguiendo el rumbo en modo trabajo, o con el gesto manual de
          2 dedos en vista general). Va AFUERA del grupo con el transform
          animado (mismo motivo que el badge de zoom, arriba): si estuviera
          ADENTRO, giraría junto con el resto y nunca señalaría nada —acá
          el truco es lo contrario, la flechita de adentro es la que gira
          (con `estiloRosaNorte`, mismo signo que el mapa) mientras el
          circulito de fondo se queda fijo en su esquina de la pantalla.

          Posición: en modo trabajo, del lado derecho, debajo de la pila de
          indicadores (📡/GPS/mi recorrido/volver a mi marcha) — a pedido
          del usuario, para que no tape ni quede tapada por ningún botón.
          `brujulaOffsetTop` lo mide y pasa modo-trabajo.tsx en vivo (esa
          pila cambia de alto según qué indicadores estén visibles en cada
          momento); mientras no haya nada medido todavía usa 100 como
          valor razonable (la pila con solo el GPS, el caso más común).
          Vista general no manda `brujulaOffsetTop` — ahí se queda en la
          esquina superior izquierda, como al principio. */}
      <View
        style={[
          styles.rosaNorte,
          pantallaCompleta ? { top: brujulaOffsetTop ?? 100, right: 16 } : { top: 12, left: 16 },
        ]}
        pointerEvents="none"
      >
        <Animated.View style={estiloRosaNorte}>
          <View style={styles.rosaNorteFlecha} />
          <Text style={styles.rosaNorteTexto}>N</Text>
        </Animated.View>
      </View>
    </View>
  );
});

export { ZOOM_MIN, ZOOM_MAX };

const styles = StyleSheet.create({
  contenedor: { overflow: "hidden" },
  // Vista general: recuadro clarito con borde, como una tarjeta más.
  contenedorEncuadrado: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Modo trabajo: mismo fondo claro que vista general, pero de borde a
  // borde (sin recuadro ni radio, ya que ocupa toda la pantalla).
  contenedorPantallaCompleta: { backgroundColor: colors.background },
  zoomBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(27,46,31,0.65)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // Ver el comentario largo en el JSX — reemplaza top/right de arriba
  // para quedar pegado justo arriba del rocker de +/- en modo trabajo.
  zoomBadgeModoTrabajo: { top: "50%", right: 16, transform: [{ translateY: -72 }] },
  zoomBadgeTexto: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  // Sin top/left/right acá — se aplican dinámicamente en el JSX (distinto
  // según el modo, ver el comentario grande ahí).
  rosaNorte: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  // Triángulo apuntando hacia arriba armado con bordes (sin ícono/SVG de
  // más) — rojo como la aguja de una brújula real, para que se distinga de
  // un vistazo de cualquier otro elemento del mapa.
  rosaNorteFlecha: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#D32F2F",
  },
  rosaNorteTexto: { fontSize: 9, fontWeight: "800", color: colors.text, marginTop: 1 },
  punto: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  // Solo para el punto más cercano dentro de rango (ver el comentario en
  // el JSX) — nunca puesto en el resto de los puntos.
  puntoConSombra: {
    shadowColor: colors.primary,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    elevation: 3,
  },
  // El área de toque (`punto`, arriba) mantiene el tamaño/posición real
  // siempre; este círculo visual va adentro, ya con el tamaño final real
  // en pantalla (ver tamPunto, más arriba — el zoom viene horneado ahí,
  // no en un transform).
  puntoCirculo: {
    alignItems: "center",
    justifyContent: "center",
  },
  puntoLabel: {
    position: "absolute",
    width: 40,
    fontWeight: "700",
    textAlign: "center",
  },
  yoMarker: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.info,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  yoMarkerPulso: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.info,
    opacity: 0.35,
  },
});
