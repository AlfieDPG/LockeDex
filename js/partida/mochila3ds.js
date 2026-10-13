// ---------- La bolsa de una partida de 3DS (gen 6) ----------
//
// Va en el bloque 1. Cada bolsillo es una lista de [objeto (u16), cantidad (u16)] seguida, sin
// huecos, que acaba en el primer objeto 0; lo que sobra, a ceros. Comprobado con partidas de
// X / Y y Rubí Omega / Zafiro Alfa: dónde empieza cada bolsillo dentro del bloque y cuántos
// caben (de un bolsillo al siguiente).
//
// Como en ./escribir3ds.js, nada se da por bueno: se vuelve a leer y fuera de los bolsillos (y
// de los checksums de la tabla) no puede haber cambiado nada.

import { JUEGOS, bloques, leerPartida3DS } from "./tresds.js";
import { sePuedeEditar, checksumsBien, arreglarChecksums } from "./escribir3ds.js";

const BLOQUE = 1;

// id, dónde empieza, cuántos caben y cuántos de cada objeto como mucho
export const BOLSILLOS = {
  xy: [
    { id: "objetos", inicio: 0x000, caben: 400, maximo: 999 },
    { id: "medicinas", inicio: 0x968, caben: 64, maximo: 999 },
    { id: "mt", inicio: 0x7c0, caben: 106, maximo: 1 },
    { id: "bayas", inicio: 0xa68, caben: 72, maximo: 999 },
    { id: "clave", inicio: 0x640, caben: 96, maximo: 1 }
  ],
  oras: [
    { id: "objetos", inicio: 0x000, caben: 400, maximo: 999 },
    { id: "medicinas", inicio: 0x970, caben: 64, maximo: 999 },
    { id: "mt", inicio: 0x7c0, caben: 108, maximo: 1 },
    { id: "bayas", inicio: 0xa70, caben: 72, maximo: 999 },
    { id: "clave", inicio: 0x640, caben: 96, maximo: 1 }
  ]
};

export const CARAMELO_RARO = 50;

export function bolsillosDe(bytes) {
  const juego = JUEGOS[bytes.length];
  const bolsillos = juego && BOLSILLOS[juego.id];
  if (!bolsillos) throw new Error("Todavía no se puede tocar la bolsa en este juego.");
  return bolsillos;
}

function inicioBloque(bytes) {
  return bloques(bytes)[BLOQUE].inicio;
}

// { objetos: [{ objeto, cantidad }], medicinas: [...], ... } en el orden en que están
export function leerMochila(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = inicioBloque(bytes);
  const mochila = {};
  for (const b of bolsillosDe(bytes)) {
    const lista = [];
    for (let i = 0; i < b.caben; i++) {
      const objeto = vista.getUint16(base + b.inicio + i * 4, true);
      if (!objeto) break;
      lista.push({ objeto, cantidad: vista.getUint16(base + b.inicio + i * 4 + 2, true) });
    }
    mochila[b.id] = lista;
  }
  return mochila;
}

// Escribe la bolsa entera (lo de leerMochila, cambiado). Devuelve una partida nueva, comprobada.
export function escribirMochila(original, mochila) {
  const permiso = sePuedeEditar(original);
  if (!permiso.ok) throw new Error(permiso.motivo);

  const nuevo = original.slice();
  const vista = new DataView(nuevo.buffer);
  const base = inicioBloque(nuevo);
  const permitidos = [];
  const limpia = {};
  for (const b of bolsillosDe(nuevo)) {
    const lista = (mochila[b.id] || [])
      .filter((e) => e.objeto > 0 && e.cantidad > 0)
      .map((e) => ({ objeto: e.objeto, cantidad: Math.min(b.maximo, Math.floor(e.cantidad)) }));
    if (lista.length > b.caben) throw new Error("No cabe tanto en ese bolsillo.");
    for (let i = 0; i < b.caben; i++) {
      const e = lista[i] || { objeto: 0, cantidad: 0 };
      vista.setUint16(base + b.inicio + i * 4, e.objeto, true);
      vista.setUint16(base + b.inicio + i * 4 + 2, e.cantidad, true);
    }
    limpia[b.id] = lista;
    permitidos.push({ inicio: base + b.inicio, fin: base + b.inicio + b.caben * 4 });
  }
  arreglarChecksums(nuevo);

  // ---------- Comprobaciones ----------
  if (!checksumsBien(nuevo)) throw new Error("Los checksums no han quedado bien.");
  if (JSON.stringify(leerMochila(nuevo)) !== JSON.stringify(limpia)) throw new Error("La bolsa no se ha guardado bien.");
  for (const b of bloques(nuevo)) permitidos.push({ inicio: b.entrada + 6, fin: b.entrada + 8 });
  for (let i = 0; i < nuevo.length; i++) {
    if (nuevo[i] !== original[i] && !permitidos.some((r) => i >= r.inicio && i < r.fin)) throw new Error("Ha cambiado algo que no debía.");
  }
  leerPartida3DS(nuevo);
  return nuevo;
}

// Cuántos hay de ese objeto (en el bolsillo que sea)
export function cantidadEnMochila(bytes, objeto) {
  const mochila = leerMochila(bytes);
  for (const lista of Object.values(mochila)) {
    const suyo = lista.find((e) => e.objeto === objeto);
    if (suyo) return suyo.cantidad;
  }
  return 0;
}

// Deja «cantidad» de ese objeto en ese bolsillo: si no estaba, al final; con 0, fuera
export function ponerEnMochila(original, objeto, cantidad, bolsillo) {
  const mochila = leerMochila(original);
  const lista = mochila[bolsillo];
  const suyo = lista.find((e) => e.objeto === objeto);
  if (suyo) suyo.cantidad = cantidad;
  else if (cantidad > 0) lista.push({ objeto, cantidad });
  return escribirMochila(original, mochila);
}
