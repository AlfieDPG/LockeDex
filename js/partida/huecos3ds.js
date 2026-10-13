// ---------- Mover, meter y quitar Pokémon de una partida de 3DS ----------
//
// Sobre una copia descifrada de los huecos (abrirHuecos) se cambian cosas de sitio, y al final
// cambiosDe dice qué hay que escribir (para editarHuecos, de ./escribir3ds.js). Como en el
// juego, el equipo va siempre seguido: al sacar uno, los de detrás suben; y siempre le queda
// al menos un Pokémon que no es un huevo.
//
//   sitio: { equipo: 0..5 } o { caja, hueco }. En el equipo, el hueco justo detrás del último
//   también vale para poner (es añadirlo).

import { JUEGOS, POR_CAJA, posicionCuantos } from "./tresds.js";
import { leerHueco, huecoVacio } from "./escribir3ds.js";
import { paraEquipo, paraCaja, esHuevo } from "./pokemon3ds.js";

// basesDe(especie, forma): sus estadísticas base (al pasar uno de la caja al equipo, que lleva
// las estadísticas guardadas)
export function abrirHuecos(bytes, basesDe) {
  const juego = JUEGOS[bytes.length];
  const cuantos = Math.min(6, bytes[posicionCuantos(bytes)]);
  const equipo = [];
  for (let i = 0; i < cuantos; i++) {
    const crudo = leerHueco(bytes, { equipo: i });
    if (!crudo) throw new Error("No se ha podido leer el equipo de la partida.");
    equipo.push(crudo);
  }
  return { bytes, juego, basesDe, equipo, equipoAntes: equipo.slice(), cajas: new Map() };
}

function clave(sitio) {
  return `${sitio.caja}-${sitio.hueco}`;
}

// El Pokémon (descifrado) que hay ahora en ese sitio, o null
export function mirar(h, sitio) {
  if (sitio.equipo !== undefined) return h.equipo[sitio.equipo] || null;
  return h.cajas.has(clave(sitio)) ? h.cajas.get(clave(sitio)) : leerHueco(h.bytes, sitio);
}

export function llaveDe(crudo) {
  return crudo ? new DataView(crudo.buffer, crudo.byteOffset, crudo.byteLength).getUint32(0, true) : 0;
}

// Pone un Pokémon en ese sitio, o lo vacía con null (en el equipo, los de detrás suben)
export function poner(h, sitio, crudo) {
  if (sitio.equipo === undefined) {
    if (sitio.caja >= h.juego.cajas || sitio.hueco >= POR_CAJA) throw new Error("Ese hueco no existe.");
    h.cajas.set(clave(sitio), crudo ? paraCaja(crudo) : null);
    return;
  }
  const i = sitio.equipo;
  if (i > h.equipo.length || i >= 6) throw new Error("Ese hueco del equipo no existe.");
  if (!crudo) h.equipo.splice(i, 1);
  else {
    const v = new DataView(crudo.buffer, crudo.byteOffset, crudo.byteLength);
    h.equipo[i] = paraEquipo(crudo, h.basesDe(v.getUint16(0x08, true), crudo[0x1d] >> 3));
  }
}

// El primer hueco libre de las cajas (desde la caja «desde»), o null si están llenas
export function huecoLibre(h, desde = 0) {
  for (let caja = desde; caja < h.juego.cajas; caja++) {
    for (let hueco = 0; hueco < POR_CAJA; hueco++) {
      if (!mirar(h, { caja, hueco })) return { caja, hueco };
    }
  }
  return desde ? huecoLibre(h, 0) : null;
}

// Lo de «desde» va a «hasta»; si ahí había otro, pasa a «desde»
export function mover(h, desde, hasta) {
  const uno = mirar(h, desde);
  if (!uno) throw new Error("Ahí no hay ningún Pokémon.");
  if (desde.equipo !== undefined && hasta.equipo !== undefined) {
    // Dentro del equipo: se cambian de sitio (o va al final)
    const j = Math.min(hasta.equipo, h.equipo.length - 1);
    h.equipo[desde.equipo] = h.equipo[j];
    h.equipo[j] = uno;
    return;
  }
  const otro = mirar(h, hasta);
  poner(h, hasta, uno);
  poner(h, desde, otro);
}

// Lo que hay que escribir: { cambios: [{ sitio, crudo }], cuantosEquipo }
export function cambiosDe(h) {
  if (!h.equipo.some((crudo) => !esHuevo(crudo))) {
    throw new Error("En el equipo tiene que quedar al menos un Pokémon que no sea un huevo.");
  }
  const cambios = [];
  const antes = h.equipoAntes;
  for (let i = 0; i < 6; i++) {
    const sitio = { equipo: i };
    if (i < h.equipo.length) {
      if (!antes[i] || !iguales(antes[i], h.equipo[i])) cambios.push({ sitio, crudo: h.equipo[i] });
    } else if (i < antes.length) cambios.push({ sitio, crudo: huecoVacio(sitio) });
  }
  for (const [texto, crudo] of h.cajas) {
    const [caja, hueco] = texto.split("-").map(Number);
    const sitio = { caja, hueco };
    const habia = leerHueco(h.bytes, sitio);
    if (crudo ? !habia || !iguales(habia, crudo) : habia) cambios.push({ sitio, crudo: crudo || huecoVacio(sitio) });
  }
  return { cambios, cuantosEquipo: h.equipo.length !== antes.length ? h.equipo.length : undefined };
}

function iguales(uno, otro) {
  return uno.length === otro.length && uno.every((byte, i) => byte === otro[i]);
}
