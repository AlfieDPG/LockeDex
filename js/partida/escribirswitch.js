// ---------- Escribir en una partida de Switch (Espada / Escudo) ----------
//
// Lo contrario de ./switch.js: meter un Pokémon (ya descifrado y cambiado) en un hueco del equipo
// o de una caja, o vaciarlo, y dejar la partida como la dejaría el juego. Mover cosas de sitio
// está en ./huecos.js, igual que en 3DS y DS.
//
//   1) El Pokémon: su suma (0x06), el barajado de sus cuatro trozos de 80 bytes y el XOR.
//   2) El bloque: cada byte cambiado se vuelve a cifrar con el xorshift de su bloque (desde su
//      sitio: los bloques no cambian de tamaño) y con el XOR fijo de todo el archivo.
//   3) El SHA-256 del final, con la sal del principio y la del final (SwishCrypto de PKHeX).
//      Comprobado contra partidas reales: el de la partida tal cual sale igual.
//
// Nada se da por bueno: antes de devolver la partida cambiada se vuelve a leer y se mira que el
// hash cuadra, que cada hueco tiene lo que se ha metido y que fuera de lo tocado y del hash no ha
// cambiado ni un byte. Si algo falla, se lanza un error y no se escribe.

import {
  TAM_HUECO, POR_CAJA, CAJAS, XOR, HASH, LLAVES, TROZO, abrirSwSh, xorshift, xorPokemon, ordenDe, sumaPokemon, descifrar,
  leerPartidaSwSh
} from "./switch.js";
import { sha256 } from "./firma7.js"; // síncrono: así todo el editor lo sigue siendo

export const JUEGOS_EDITABLES_SWITCH = ["swsh"];

// ---------- Hash ----------

const SAL_INICIO = deHex("9ec99cd70ed33c44fb9303dceb39b42a1947e9634ba2334416bf82a2ba6355b63d9df24b5f7b6ab2621dc21b68e5c8b53a059000e8a8103de2ecf00cb2ed4f6d");
const SAL_FINAL = deHex("d6c01c598bc8b8cb46e153fc828c757513e045df32693c75f059f8d9a25fb217e08052dbea8973997579afcb2e8007e6f126e0030ae66ff641bf7e59c2ae55fd");

function deHex(texto) {
  return Uint8Array.from(texto.match(/../g), (x) => parseInt(x, 16));
}

// SHA-256 de la sal del principio, la partida (sin el hash) y la del final
function hashDe(bytes) {
  const datos = new Uint8Array(SAL_INICIO.length + bytes.length - HASH + SAL_FINAL.length);
  datos.set(SAL_INICIO);
  datos.set(bytes.subarray(0, bytes.length - HASH), SAL_INICIO.length);
  datos.set(SAL_FINAL, datos.length - SAL_FINAL.length);
  return sha256(datos);
}

export function hashBien(bytes) {
  const calculado = hashDe(bytes);
  return calculado.every((b, i) => b === bytes[bytes.length - HASH + i]);
}

function rehacerHash(bytes) {
  bytes.set(hashDe(bytes), bytes.length - HASH);
}

export function sePuedeEditarSwitch(bytes) {
  if (!abrirSwSh(bytes)) return { ok: false, motivo: "Ese archivo no es una partida que se sepa leer." };
  if (!hashBien(bytes)) return { ok: false, motivo: "El hash de la partida no cuadra: mejor no tocarla." };
  return { ok: true, motivo: "" };
}

// ---------- Bloques ----------

// Escribe en «bytes» (la copia que se va a cambiar) los datos nuevos de un bloque: solo los bytes
// que cambian. bloque: el de la partida original (abrirSwSh): la copia no se abre hasta acabar,
// o se quedaría en la caché tal como estaba antes de cambiarla. Devuelve dónde ha cambiado.
function escribirBloque(bytes, llave, bloque, nuevos) {
  if (!bloque || nuevos.length !== bloque.datos.length) throw new Error("El bloque no tiene el tamaño de antes.");
  const siguiente = xorshift(llave);
  for (let i = 0; i < bloque.cabecera; i++) siguiente();
  const tocados = [];
  for (let i = 0; i < nuevos.length; i++) {
    const clave = siguiente();
    if (nuevos[i] === bloque.datos[i]) continue;
    const donde = bloque.inicio + i;
    bytes[donde] = nuevos[i] ^ clave ^ XOR[donde % XOR.length];
    tocados.push(donde);
  }
  return tocados;
}

// Para cambiar varios bloques: la partida nueva, con el hash al día. cambios: Map llave -> datos.
// Comprueba que se vuelve a leer igual y que fuera de esos bloques y del hash no cambia nada.
export function escribirBloques(original, cambios) {
  const mapa = abrirSwSh(original);
  const nuevo = original.slice();
  const tocados = new Set();
  for (const [llave, datos] of cambios) for (const i of escribirBloque(nuevo, llave, mapa.get(llave), datos)) tocados.add(i);
  rehacerHash(nuevo);

  if (!hashBien(nuevo)) throw new Error("El hash no ha quedado bien.");
  const releida = abrirSwSh(nuevo);
  if (!releida) throw new Error("La partida no se ha guardado bien.");
  for (const [llave, datos] of cambios) {
    const otra = releida.get(llave).datos;
    if (otra.length !== datos.length || otra.some((b, i) => b !== datos[i])) throw new Error("Un bloque no se ha guardado bien.");
  }
  const inicioHash = nuevo.length - HASH;
  for (let i = 0; i < inicioHash; i++) {
    if (nuevo[i] !== original[i] && !tocados.has(i)) throw new Error("Ha cambiado algo que no debía.");
  }
  leerPartidaSwSh(nuevo); // que se siga pudiendo leer entera
  return nuevo;
}

// ---------- Un Pokémon ----------

function posicion(sitio) {
  if (sitio.equipo !== undefined) {
    if (sitio.equipo < 0 || sitio.equipo >= 6) throw new Error("Ese hueco del equipo no existe.");
    return { llave: LLAVES.equipo, inicio: sitio.equipo * TAM_HUECO };
  }
  if (sitio.caja < 0 || sitio.caja >= CAJAS || sitio.hueco < 0 || sitio.hueco >= POR_CAJA) throw new Error("Ese hueco no existe.");
  return { llave: LLAVES.cajas, inicio: (sitio.caja * POR_CAJA + sitio.hueco) * TAM_HUECO };
}

function descifrarHueco(bytes, sitio) {
  const { llave, inicio } = posicion(sitio);
  const datos = abrirSwSh(bytes).get(llave).datos;
  const vista = descifrar(datos.buffer.slice(datos.byteOffset + inicio, datos.byteOffset + inicio + TAM_HUECO));
  return vista ? new Uint8Array(vista.buffer) : null;
}

// Descifrado, tal cual está en el archivo (0x158 bytes, en el equipo y en las cajas), o null si
// el hueco está vacío o no cuadra. Es lo que se cambia y se devuelve a editarHuecosSwitch.
export function leerHuecoSwitch(bytes, sitio) {
  const crudo = descifrarHueco(bytes, sitio);
  return crudo && new DataView(crudo.buffer).getUint16(0x08, true) ? crudo : null;
}

// Lo que el juego deja en un hueco vacío: en el equipo, todo a ceros; en las cajas, un «Egg» de
// nivel 1 sin especie (comprobado con partidas reales: todos los huecos libres son iguales)
const VACIO_CAJA = { 0x58: 0x45, 0x5a: 0x67, 0x5c: 0x67, 0x8a: 0x0b, 0xe2: 2, 0x148: 1, 0x14a: 0x0b, 0x14c: 5, 0x14e: 5, 0x150: 5, 0x152: 5, 0x154: 5 };

export function huecoVacioSwitch(bytes, sitio) {
  const datos = new Uint8Array(TAM_HUECO);
  if (sitio.equipo === undefined) for (const [o, valor] of Object.entries(VACIO_CAJA)) datos[Number(o)] = valor;
  return datos;
}

// Lo contrario de descifrar: suma, barajado y XOR. Devuelve una copia.
export function cifrarPokemon(crudo) {
  const datos = new Uint8Array(crudo);
  const vista = new DataView(datos.buffer);
  vista.setUint16(6, sumaPokemon(vista), true);
  const llave = vista.getUint32(0, true);
  const copia = datos.slice(8, 8 + TROZO * 4);
  ordenDe(llave).forEach((origen, destino) => datos.set(copia.subarray(destino * TROZO, (destino + 1) * TROZO), 8 + origen * TROZO));
  xorPokemon(vista, llave);
  return datos;
}

export function cuantosEquipoSwitch(bytes) {
  return Math.min(6, abrirSwSh(bytes).get(LLAVES.equipo).datos[6 * TAM_HUECO]);
}

function igualesSalvoSuma(uno, otro) {
  return uno.length === otro.length && uno.every((byte, i) => i === 6 || i === 7 || byte === otro[i]);
}

// cambios: [{ sitio, crudo }] (crudo de huecoVacioSwitch para vaciarlo). cuantosEquipo: los que
// quedan en el equipo, si cambia. Devuelve una partida nueva (la original no se toca) o lanza
// un error con el motivo si algo no cuadra.
export function editarHuecosSwitch(original, cambios, cuantosEquipo) {
  const permiso = sePuedeEditarSwitch(original);
  if (!permiso.ok) throw new Error(permiso.motivo);

  const mapa = abrirSwSh(original);
  const bloques = new Map();
  const datosDe = (llave) => {
    if (!bloques.has(llave)) bloques.set(llave, mapa.get(llave).datos.slice());
    return bloques.get(llave);
  };
  for (const { sitio, crudo } of cambios) {
    if (crudo.length !== TAM_HUECO) throw new Error("El Pokémon no tiene el tamaño de ese hueco.");
    const { llave, inicio } = posicion(sitio);
    datosDe(llave).set(cifrarPokemon(crudo), inicio);
  }
  if (cuantosEquipo !== undefined) {
    if (cuantosEquipo < 1 || cuantosEquipo > 6) throw new Error("El equipo tiene que tener de 1 a 6 Pokémon.");
    datosDe(LLAVES.equipo)[6 * TAM_HUECO] = cuantosEquipo;
  }
  const nuevo = escribirBloques(original, bloques);

  for (const { sitio, crudo } of cambios) {
    const releido = descifrarHueco(nuevo, sitio);
    if (!releido || !igualesSalvoSuma(releido, crudo)) throw new Error("Un Pokémon no se ha guardado bien.");
  }
  return nuevo;
}
