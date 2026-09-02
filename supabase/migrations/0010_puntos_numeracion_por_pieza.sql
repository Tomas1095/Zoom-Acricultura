-- Migración 10: la numeración de línea de los puntos de muestreo ahora
-- reinicia en 1 para cada pieza de terreno de un lote (ver migración de
-- generarGrillaDesdePerimetro en geometria.ts, a pedido del usuario: un
-- campo con lotes no contiguos tiene que verse "1.1, 1.2, 1.3..." en cada
-- pieza, no seguir corrida desde la pieza anterior tipo "8.1, 8.2...").
--
-- Como `linea` ya no es única por lote sola (dos piezas distintas pueden
-- tener las dos una "línea 1"), hace falta una columna más para saber a
-- qué pieza pertenece cada punto y así poder seguir garantizando que no
-- se dupliquen — 0 para todo lo ya generado antes de este cambio (todos
-- esos lotes tenían una sola pieza).

alter table puntos add column if not exists pieza int not null default 0;

alter table puntos drop constraint if exists puntos_lote_id_linea_punto_num_key;
alter table puntos add constraint puntos_lote_id_pieza_linea_punto_num_key unique (lote_id, pieza, linea, punto_num);
