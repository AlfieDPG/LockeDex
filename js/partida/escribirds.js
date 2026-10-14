// ---------- Escribir en una partida de DS ----------
//
// Lo mismo que ./escribir3ds.js para gen 4 y 5: meter Pokémon (ya descifrados y cambiados) en
// huecos del equipo o de las cajas, y dejar la partida como la dejaría el juego.
//
//   1) El Pokémon: su suma (0x06), el barajado de sus cuatro trozos y el XOR.
//   2) El CRC de cada bloque tocado (comprobados contra partidas reales: CRC16-CCITT). En gen 4
//      se toca la copia buena (la de contador más alto), que es la que carga el juego. En gen 5,
//      además, la tabla que repite los CRC (y su propio CRC) y la copia de seguridad, si estaba
//      igual que la principal.
//
// Nada se da por bueno: se vuelve a leer, se miran los CRC y los huecos, y fuera de lo tocado
// no puede haber cambiado ni un byte. El pie de DeSmuME se queda como estaba.

import { mapaDS, posicionHuecoDS, leerPartidaDS, descifrarDS, xorDS, sumaDS, ordenDS, crc16, TROZO, TAM_POKEMON } from "./nds.js";

export const JUEGOS_EDITABLES_DS = ["dp", "platino", "hgss", "bw", "b2w2"];

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
function poner16(b, i, valor) {
  b[i] = valor & 0xff;
  b[i + 1] = valor >> 8;
}

// ---------- Checksums ----------

// Los bloques (y la tabla de gen 5) cuyo CRC no cuadra
export function checksumsMalosDS(bytes) {
  const mapa = mapaDS(bytes);
  if (!mapa) return ["partida"];
  const malos = mapa.bloques.filter((b) => crc16(bytes, b.inicio, b.datos) !== u16(bytes, b.crc) || (b.entrada && u16(bytes, b.entrada) !== u16(bytes, b.crc)));
  const nombres = malos.map((b) => b.nombre);
  if (mapa.tabla && crc16(bytes, mapa.tabla.inicio, mapa.tabla.datos) !== u16(bytes, mapa.tabla.crc)) nombres.push("tabla");
  return nombres;
}

export function checksumsBienDS(bytes) {
  return checksumsMalosDS(bytes).length === 0;
}

// Rehace el CRC de los bloques que tocan esos trozos ([{ inicio, fin }]). Devuelve los bytes
// que ha cambiado (para las comprobaciones), también los de la copia de seguridad.
export function arreglarChecksumsDS(bytes, tocados, mapa = mapaDS(bytes)) {
  const cambiados = [];
  const marcar = (inicio, fin) => cambiados.push({ inicio, fin });
  const afectados = mapa.bloques.filter((b) => tocados.some((t) => t.inicio < b.inicio + b.datos && t.fin > b.inicio));
  for (const b of afectados) {
    const crc = crc16(bytes, b.inicio, b.datos);
    poner16(bytes, b.crc, crc);
    marcar(b.crc, b.crc + 2);
    if (b.entrada) {
      poner16(bytes, b.entrada, crc);
      marcar(b.entrada, b.entrada + 2);
    }
  }
  if (mapa.tabla && afectados.length) {
    poner16(bytes, mapa.tabla.crc, crc16(bytes, mapa.tabla.inicio, mapa.tabla.datos));
    marcar(mapa.tabla.crc, mapa.tabla.crc + 2);
  }
  return cambiados;
}

// Gen 5: si la copia de seguridad era igual que la principal, lo cambiado se copia también ahí
function copiarALaCopia(original, nuevo, mapa, cambiados) {
  if (!mapa.copia) return [];
  for (let i = 0; i < mapa.copia; i++) if (original[i] !== original[i + mapa.copia]) return [];
  const extra = [];
  for (const { inicio, fin } of cambiados) {
    nuevo.copyWithin(inicio + mapa.copia, inicio, fin);
    extra.push({ inicio: inicio + mapa.copia, fin: fin + mapa.copia });
  }
  return extra;
}

export function sePuedeEditarDS(bytes) {
  const mapa = mapaDS(bytes);
  if (!mapa) return { ok: false, motivo: "Ese archivo no es una partida que se sepa leer." };
  if (!JUEGOS_EDITABLES_DS.includes(mapa.id)) return { ok: false, motivo: "Todavía no se puede editar la partida de este juego." };
  if (!checksumsBienDS(bytes)) return { ok: false, motivo: "Los checksums de la partida no cuadran: mejor no tocarla." };
  return { ok: true, motivo: "" };
}

// Tras cambiar unos trozos de la partida: CRC, copia de seguridad y que fuera de lo tocado no
// haya cambiado nada. Devuelve la lista de trozos que podían cambiar.
export function cerrarCambiosDS(original, nuevo, tocados) {
  const mapa = mapaDS(original);
  const cambiados = [...tocados, ...arreglarChecksumsDS(nuevo, tocados, mapa)];
  cambiados.push(...copiarALaCopia(original, nuevo, mapa, cambiados));

  if (!checksumsBienDS(nuevo)) throw new Error("Los checksums no han quedado bien.");
  // En gen 4, que el juego siga cargando la copia que se ha cambiado
  const antes = mapaDS(original).bloques.map((b) => b.inicio).join();
  if (mapaDS(nuevo).bloques.map((b) => b.inicio).join() !== antes) throw new Error("Los checksums no han quedado bien.");
  for (let i = 0; i < nuevo.length; i++) {
    if (nuevo[i] !== original[i] && !cambiados.some((r) => i >= r.inicio && i < r.fin)) throw new Error("Ha cambiado algo que no debía.");
  }
  leerPartidaDS(nuevo); // que se siga pudiendo leer entera
  return cambiados;
}

// ---------- Un Pokémon ----------

function descifrarHueco(bytes, sitio) {
  const { inicio, largo } = posicionHuecoDS(mapaDS(bytes), sitio);
  const v = descifrarDS(bytes.slice(inicio, inicio + largo));
  return v ? new Uint8Array(v.buffer) : null;
}

// Descifrado (136 bytes en las cajas; en el equipo, con lo del equipo), o null si está vacío
export function leerHuecoDS(bytes, sitio) {
  const crudo = descifrarHueco(bytes, sitio);
  return crudo && (crudo[0x08] | (crudo[0x09] << 8)) ? crudo : null;
}

export function huecoVacioDS(bytes, sitio) {
  return new Uint8Array(posicionHuecoDS(mapaDS(bytes), sitio).largo);
}

// Lo contrario de descifrar: suma, barajado y XOR. Devuelve una copia.
export function cifrarDS(crudo) {
  const datos = new Uint8Array(crudo);
  const v = new DataView(datos.buffer);
  v.setUint16(6, sumaDS(v), true);
  const copia = datos.slice(8, 8 + TROZO * 4);
  ordenDS(v.getUint32(0, true)).forEach((origen, destino) => datos.set(copia.subarray(destino * TROZO, (destino + 1) * TROZO), 8 + origen * TROZO));
  xorDS(v);
  return datos;
}

function igualesSalvoSuma(uno, otro) {
  return uno.length === otro.length && uno.every((byte, i) => i === 6 || i === 7 || byte === otro[i]);
}

// Como editarHuecos de ./escribir3ds.js: cambios [{ sitio, crudo }], cuantosEquipo si cambia
export function editarHuecosDS(original, cambios, cuantosEquipo) {
  const permiso = sePuedeEditarDS(original);
  if (!permiso.ok) throw new Error(permiso.motivo);

  const mapa = mapaDS(original);
  const nuevo = original.slice();
  const tocados = [];
  for (const { sitio, crudo } of cambios) {
    const { inicio, largo } = posicionHuecoDS(mapa, sitio);
    if (crudo.length !== largo) throw new Error("El Pokémon no tiene el tamaño de ese hueco.");
    nuevo.set(cifrarDS(crudo), inicio);
    tocados.push({ inicio, fin: inicio + largo });
  }
  if (cuantosEquipo !== undefined) {
    if (cuantosEquipo < 1 || cuantosEquipo > 6) throw new Error("El equipo tiene que tener de 1 a 6 Pokémon.");
    nuevo[mapa.cuantos] = cuantosEquipo;
    tocados.push({ inicio: mapa.cuantos, fin: mapa.cuantos + 1 });
  }

  cerrarCambiosDS(original, nuevo, tocados);
  for (const { sitio, crudo } of cambios) {
    const releido = descifrarHueco(nuevo, sitio);
    if (!releido || !igualesSalvoSuma(releido, crudo)) throw new Error("Un Pokémon no se ha guardado bien.");
  }
  return nuevo;
}

export function cuantosEquipoDS(bytes) {
  return Math.min(6, bytes[mapaDS(bytes).cuantos]);
}

export { TAM_POKEMON };
