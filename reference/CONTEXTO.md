# Zoom Monitoreos — Contexto para migrar a app nativa

Este documento resume el trabajo hecho en un prototipo funcional (React, un solo
archivo `prototipo-app.jsx`) para la app de monitoreo de plagas de Zoom
Agricultura. Es el punto de partida para reconstruirla como app nativa real con
Claude Code — no hace falta empezar de cero, pero sí conviene leer esto antes
de tocar nada, para no repetir pruebas ni pisar decisiones ya tomadas.

## Qué hace la app, en criollo

Una app de monitoreo de plagas de suelo (bichos bolita y babosas) para
productores agropecuarios. El flujo real:

1. Alguien (Socio Fundador, Socio Gerente o Encargado) sube el KMZ de un lote,
   la app arma una grilla de puntos de muestreo sobre el perímetro real.
2. Se le da acceso a uno o varios Monitoreadores para ese lote específico.
3. Cada Monitoreador va al campo, usa el GPS para ubicarse punto por punto, y
   carga los datos de cada estación de muestreo (cantidad de bichos, humedad,
   fotos, observaciones).
4. Los datos se sincronizan cuando hay señal (pensado para funcionar bien
   aunque el campo no tenga cobertura).
5. Se generan mapas de densidad poblacional (interpolación tipo Voronoi,
   recortada al perímetro real) y un informe técnico exportable, con
   recomendación de aplicación de cebo.

## Roles (jerarquía de 4 niveles)

- **Socio Fundador**: todo + único que puede ascender/degradar Socios Gerentes
- **Socio Gerente**: todo + "Mi equipo" + invitar con código
- **Encargado**: todo el árbol de lotes, puede crear pero no eliminar
- **Monitoreador**: solo sus lotes asignados, y dentro de eso — importante —
  solo puede cargar datos de un punto desde "Modo trabajo", no desde la vista
  general (eso fue un pedido explícito: la vista general para el Monitoreador
  es nada más para ubicarse, no para cargar).

## Funcionalidades ya construidas y probadas

- Carga de KMZ real → grilla de puntos con coordenadas geográficas reales
- Dos vistas del mapa de campo: "vista general" (todo el lote, zoom/pan/rotar
  con 2 dedos) y "modo trabajo" (pantalla completa, la cámara te sigue, para
  cuando estás caminando)
- GPS real conectado (`navigator.geolocation`), con detección de punto más
  cercano y habilitación de carga solo dentro de cierto radio
- Sincronización offline: cola de cambios pendientes, resolución de
  conflictos si dos personas cargan el mismo punto sin señal
- Sistema de campañas por lote (25/26, etc.) con historial archivado
- **Recorrido personal** ("ayuda memoria"): cada Monitoreador puede marcar a
  mano, tocando los puntos en el orden que planea visitarlos, una línea que
  lo ayuda a acordarse — se guarda solo en su celular (localStorage), nunca
  se sincroniza con nadie. Solo se edita desde vista general; en modo trabajo
  es de solo lectura.
- Mapa de densidad poblacional con interpolación real (Voronoi + recorte al
  perímetro del lote), no datos simulados
- Imagen satelital real (Esri World Imagery) alineada con precisión matemática
  al polígono del lote (ver sección de líos técnicos abajo — esto costó
  mucho tiempo)
- Informe técnico exportable (PDF vía impresión del navegador) con
  recomendación de cebo calculada según hectáreas y situación de plagas
- Botón "Cómo llegar" — abre Google Maps con la ruta calculada en tiempo real
  desde donde esté cada persona hasta el centro real del lote
- Aviso proactivo para que cada Monitoreador descargue el mapa offline de
  Google Maps la noche/mañana anterior a ir al campo (mientras tiene señal)

## Líos técnicos que ya resolvimos (para no repetirlos)

Estos consumieron bastante tiempo de prueba y error — vale la pena que quien
retome esto en Claude Code los tenga presentes:

1. **Alineación del mapa satelital**: el desajuste entre el polígono del lote
   y la foto satelital de fondo no era un problema de coordenadas simples —
   era que se le pedía la imagen al servidor en coordenadas geográficas
   planas (EPSG:4326) en vez de Web Mercator (la proyección en la que Esri
   guarda la imagen internamente). Pedirla directo en Web Mercator resolvió
   la distorsión por completo.

2. **Safari bloquea que un archivo HTML local abra otra app** (como Google
   Maps) sin que la persona toque un link real — probado y confirmado a
   fondo. La solución que funciona: un `<a href="...">` real, no
   `window.location.href` disparado por código ni `window.open()`. Esto no
   debería ser un problema en la app nativa (ahí no hay esa restricción de
   seguridad de "archivo local").

3. **Vista previa de Claude (dentro del chat) bloquea varias cosas por
   seguridad**: `window.print()`, `window.open()`, popups, diálogos nativos
   (`window.confirm()`, `window.alert()`). Cualquier prueba rara que "no
   ande" primero hay que descartar si es por estar probando ahí adentro
   antes de asumir que es un bug real.

4. **Líneas punteadas largas en SVG no siempre "caen" justo en la puntita
   final** — problema puramente de cómo dibuja rayitas cualquier navegador,
   no un bug de datos. La solución robusta: el último tramo de cada segmento
   se dibuja sólido (sin rayitas), así siempre se ve conectado.

5. **`localStorage` no funciona dentro de la vista previa de artifacts de
   Claude** (usado para guardar el recorrido personal) — sí funciona bien en
   un archivo HTML real o en la app nativa.

## Limitaciones del prototipo (a resolver con la app real)

Esto es un prototipo de UN SOLO ARCHIVO REACT sin backend real — todo lo
siguiente hace falta construirlo de verdad para producción:

- **Sin backend real**: no hay base de datos, no hay servidor, todo vive en
  el estado de React (se pierde al recargar, salvo lo guardado a propósito en
  localStorage). Hace falta: autenticación real (hoy es un selector de
  usuarios de prueba), base de datos, API.
- **Códigos de invitación**: hoy son simulados, sin validación real de un
  solo uso en base de datos.
- **Procesamiento del KMZ**: hoy los datos del lote de ejemplo están
  hardcodeados (ya procesados a mano). Hace falta el pipeline real de
  descomprimir/parsear el KMZ y generar la grilla en el momento.
- **Sincronización offline real**: la lógica de "cola pendiente / resolver
  conflictos" está pensada y probada en el flujo, pero en el prototipo se
  simula con un botón — en la app real esto necesita sync en segundo plano
  nativo del sistema operativo.
- **Notificaciones push**: no implementadas (solo mencionadas en el diseño).
- **Exportación de PDF/KMZ real**: hoy usa el diálogo de impresión del
  navegador como solución alternativa — la app nativa puede generar el PDF
  directamente.
- **Imagen satelital dinámica**: hoy el punto de referencia geográfico está
  fijo al lote de ejemplo — en producción hay que usar las coordenadas reales
  de cada lote según su propio KMZ.

## Decisión pendiente antes de arrancar en Claude Code

Nativas separadas (iOS + Android) vs. algo como React Native (un solo código
para las dos). Conviene definir esto antes de empezar la reconstrucción,
según cuánto control fino necesiten sobre cada plataforma.

## Archivos de este prototipo

- `prototipo-app.jsx` — el código fuente completo, con comentarios explicando
  el "por qué" de varias decisiones no obvias
- `prototipo-zoom-agricultura.html` — versión standalone para probar fuera de
  Claude (con limitaciones: sin librería real de mapas, sin internet real
  para la imagen satelital — ver punto 3 de los líos técnicos)
