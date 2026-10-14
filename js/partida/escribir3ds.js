// ---------- Escribir en una partida de 3DS ----------
//
// Lo contrario de ./tresds.js: meter un Pokémon (ya descifrado y cambiado) en un hueco del
// equipo o de una caja, o vaciarlo, y dejar la partida como la dejaría el juego. Mover cosas
// de sitio está en ./huecos.js.
//
//   1) El Pokémon: su suma (0x06), el barajado de sus cuatro trozos y el XOR.
//   2) Los checksums de bloque de la tabla del final (tras «BEEF»). Comprobados contra
//      partidas reales: en gen 6, CRC16-CCITT; en gen 7, CRC16 reflejado e invertido.
//   3) Gen 7 lleva además una firma sobre esa tabla: hasta que no se haga, solo se escribe
//      en X / Y y Rubí Omega / Zafiro Alfa (JUEGOS_EDITABLES).
//
// Nada se da por bueno: antes de devolver la partida cambiada se vuelve a leer y se mira que
// los checksums cuadran, que cada hueco tiene lo que se ha metido y que fuera de los huecos
// y de la tabla no ha cambiado ni un byte. Si algo falla, se lanza un error y no se escribe.

import {
  JUEGOS, TROZO, TAM_POKEMON, TAM_POKEMON_EQUIPO, bloques, ordenDe, xorPokemon, sumaPokemon, descifrar, posicionHueco,
  posicionCuantos, leerPartida3DS
} from "./tresds.js";

export const JUEGOS_EDITABLES = ["xy", "oras"];

export function sePuedeEditar(bytes) {
  const juego = JUEGOS[bytes.length];
  if (!juego) return { ok: false, motivo: "Ese archivo no es una partida que se sepa leer." };
  if (!JUEGOS_EDITABLES.includes(juego.id)) return { ok: false, motivo: "Todavía no se puede editar la partida de este juego." };
  if (!checksumsBien(bytes)) return { ok: false, motivo: "Los checksums de la partida no cuadran: mejor no tocarla." };
  return { ok: true, motivo: "" };
}

// ---------- Checksums de bloque ----------

function tabla(polinomio, reflejado) {
  const t = new Uint16Array(256);
  for (let n = 0; n < 256; n++) {
    let c = reflejado ? n : n << 8;
    for (let k = 0; k < 8; k++) {
      if (reflejado) c = c & 1 ? (c >>> 1) ^ polinomio : c >>> 1;
      else c = c & 0x8000 ? ((c << 1) ^ polinomio) & 0xffff : (c << 1) & 0xffff;
    }
    t[n] = c;
  }
  return t;
}

const TABLA_6 = tabla(0x1021, false);
const TABLA_7 = tabla(0xa001, true);

function crc6(datos) {
  let c = 0xffff;
  for (const b of datos) c = ((c << 8) & 0xffff) ^ TABLA_6[(c >>> 8) ^ b];
  return c;
}

function crc7(datos) {
  let c = 0xffff;
  for (const b of datos) c = (c >>> 8) ^ TABLA_7[(c ^ b) & 0xff];
  return ~c & 0xffff;
}

// El número del bloque de la firma (gen 7), o -1: su checksum no cuadra nunca (lo deshace la firma)
function bloqueFirma(bytes, lista) {
  const juego = JUEGOS[bytes.length];
  if (!juego.firma) return -1;
  return lista.findIndex((b) => juego.firma >= b.inicio && juego.firma < b.inicio + b.largo);
}

function checksumDe(bytes, bloque) {
  const datos = bytes.subarray(bloque.inicio, bloque.inicio + bloque.largo);
  return JUEGOS[bytes.length].gen === 7 ? crc7(datos) : crc6(datos);
}

// Los bloques cuyo checksum no cuadra (sin contar el de la firma)
export function checksumsMalos(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lista = bloques(bytes);
  const firma = bloqueFirma(bytes, lista);
  return lista
    .map((bloque, i) => ({ bloque, i }))
    .filter(({ bloque, i }) => i !== firma && checksumDe(bytes, bloque) !== vista.getUint16(bloque.entrada + 6, true))
    .map(({ i }) => i);
}

export function checksumsBien(bytes) {
  return checksumsMalos(bytes).length === 0;
}

export function arreglarChecksums(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lista = bloques(bytes);
  const firma = bloqueFirma(bytes, lista);
  lista.forEach((bloque, i) => {
    if (i !== firma) vista.setUint16(bloque.entrada + 6, checksumDe(bytes, bloque), true);
  });
}

// ---------- Un Pokémon ----------

// Descifrado, tal cual está en el archivo (232 bytes en las cajas y 260 en el equipo), o null
// si el hueco está vacío o no cuadra. Es lo que se cambia y se devuelve a editarHuecos.
export function leerHueco(bytes, sitio) {
  const crudo = descifrarHueco(bytes, sitio);
  return crudo && new DataView(crudo.buffer).getUint16(0x08, true) ? crudo : null;
}

// Lo mismo, aunque esté vacío (null solo si no cuadra)
function descifrarHueco(bytes, sitio) {
  const { inicio, largo } = posicionHueco(bytes, sitio);
  const vista = descifrar(bytes.slice(inicio, inicio + largo));
  return vista ? new Uint8Array(vista.buffer) : null;
}

// Lo que se escribe en un hueco para dejarlo vacío: todo a ceros (como lo deja el juego)
export function huecoVacio(sitio) {
  return new Uint8Array(sitio.equipo !== undefined ? TAM_POKEMON_EQUIPO : TAM_POKEMON);
}

// Lo contrario de descifrar: suma, barajado y XOR. Devuelve una copia.
export function cifrar(crudo) {
  const datos = new Uint8Array(crudo);
  const vista = new DataView(datos.buffer);
  vista.setUint16(6, sumaPokemon(vista), true);

  const llave = vista.getUint32(0, true);
  const copia = datos.slice(8, 8 + TROZO * 4);
  ordenDe(llave).forEach((origen, destino) => datos.set(copia.subarray(destino * TROZO, (destino + 1) * TROZO), 8 + origen * TROZO));

  xorPokemon(vista, llave);
  return datos;
}

// ---------- Cambiar la partida ----------

function igualesSalvoSuma(uno, otro) {
  return uno.length === otro.length && uno.every((byte, i) => i === 6 || i === 7 || byte === otro[i]);
}

// cambios: [{ sitio, crudo }] (crudo de huecoVacio para vaciarlo). cuantosEquipo: los que
// quedan en el equipo, si cambia. Devuelve una partida nueva (la original no se toca) o lanza
// un error con el motivo si algo no cuadra.
export function editarHuecos(original, cambios, cuantosEquipo) {
  const permiso = sePuedeEditar(original);
  if (!permiso.ok) throw new Error(permiso.motivo);

  const nuevo = original.slice();
  const tocados = [];
  for (const { sitio, crudo } of cambios) {
    const { inicio, largo } = posicionHueco(nuevo, sitio);
    if (crudo.length !== largo) throw new Error("El Pokémon no tiene el tamaño de ese hueco.");
    nuevo.set(cifrar(crudo), inicio);
    tocados.push({ inicio, fin: inicio + largo });
  }
  if (cuantosEquipo !== undefined) {
    if (cuantosEquipo < 1 || cuantosEquipo > 6) throw new Error("El equipo tiene que tener de 1 a 6 Pokémon.");
    const posicion = posicionCuantos(nuevo);
    nuevo[posicion] = cuantosEquipo;
    tocados.push({ inicio: posicion, fin: posicion + 1 });
  }
  arreglarChecksums(nuevo);

  // ---------- Comprobaciones ----------

  if (!checksumsBien(nuevo)) throw new Error("Los checksums no han quedado bien.");
  for (const { sitio, crudo } of cambios) {
    const releido = descifrarHueco(nuevo, sitio);
    if (!releido || !igualesSalvoSuma(releido, crudo)) throw new Error("Un Pokémon no se ha guardado bien.");
  }
  // Fuera de los huecos tocados, solo puede cambiar el checksum de cada bloque en la tabla
  for (const b of bloques(nuevo)) tocados.push({ inicio: b.entrada + 6, fin: b.entrada + 8 });
  for (let i = 0; i < nuevo.length; i++) {
    if (nuevo[i] !== original[i] && !tocados.some((r) => i >= r.inicio && i < r.fin)) {
      throw new Error("Ha cambiado algo que no debía.");
    }
  }
  leerPartida3DS(nuevo); // que se siga pudiendo leer entera
  return nuevo;
}
