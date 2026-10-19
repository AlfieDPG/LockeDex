// ---------- La bolsa de una partida de Switch (Espada / Escudo) ----------
//
// Va en su propio bloque (llave 0x1177C2C4, ver ./switch.js). Cada bolsillo tiene sitio fijo y
// cada objeto es un u32: el número en los 11 bits de abajo, la cantidad en los 10 que empiezan en
// el 15 y, arriba del todo, si es nuevo y si es favorito (lo de encima se conserva). Dónde empieza
// cada bolsillo, cuántos caben y qué objetos van en cada uno: PlayerBag8 e ItemStorage8SWSH de
// PKHeX (github.com/kwsch/PKHeX).
//
// Como en ./mochila3ds.js, nada se da por bueno: se vuelve a leer y fuera de la bolsa (y del hash)
// no puede haber cambiado nada (./escribirswitch.js, escribirBloques).

import { LLAVES, abrirSwSh } from "./switch.js";
import { sePuedeEditarSwitch, escribirBloques } from "./escribirswitch.js";

const desde = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Los objetos de cada bolsillo (los que existen en el juego)
const DE_CADA = {
  medicinas: [...desde(17, 43), 54, 134, 504, 591, 708, 709, 852, 903, 1579],
  balls: [...desde(1, 16), ...desde(492, 500), 576, 851],
  combate: [...desde(55, 63), 1580],
  bayas: [...desde(149, 163), ...desde(169, 174), ...desde(184, 212), 686, 687, 688],
  objetos: [
    ...desde(45, 53), 76, 77, ...desde(79, 85), ...desde(107, 110), 112, ...desde(116, 119), 135, 136, 213, 214, 215,
    ...desde(217, 225), ...desde(228, 255), 257, 258, 259, ...desde(265, 326), ...desde(485, 491), ...desde(537, 547),
    ...desde(564, 570), 639, 640, ...desde(644, 650), 846, 849, ...desde(879, 884), ...desde(904, 920), 1103, 1104,
    ...desde(1109, 1129), ...desde(1231, 1254), ...desde(1279, 1578), 1581, 1582, 1588, 1592, 1604, 1606
  ],
  mt: [...desde(328, 419), 618, 619, 620, ...desde(690, 693), ...desde(1130, 1230)],
  tesoros: [...desde(86, 92), 94, 106, 571, ...desde(580, 583), 795, 796, ...desde(1105, 1108)],
  ingredientes: [...desde(1084, 1099), ...desde(1256, 1264)],
  clave: [
    78, 628, 629, 631, 632, 638, 703, 847, ...desde(943, 946), ...desde(1074, 1077), 1080, 1081, 1100, 1255, 1266, 1267,
    ...desde(1269, 1271), 1278, ...desde(1583, 1587), ...desde(1589, 1591), ...desde(1593, 1603), 1605, 1607
  ]
};

// Las MT van de una en una; los DT (1130-1229), como los demás
const esDT = (objeto) => objeto >= 1130 && objeto <= 1229;

// id, dónde empieza, cuántos caben y cuántos de cada objeto como mucho
export const BOLSILLOS_SWSH = [
  { id: "medicinas", inicio: 0x0000, caben: 60, maximo: 999 },
  { id: "balls", inicio: 0x00f0, caben: 30, maximo: 999 },
  { id: "combate", inicio: 0x0168, caben: 20, maximo: 999 },
  { id: "bayas", inicio: 0x01b8, caben: 80, maximo: 999 },
  { id: "objetos", inicio: 0x02f8, caben: 550, maximo: 999 },
  { id: "mt", inicio: 0x0b90, caben: 210, maximo: 999, maximoDe: (objeto) => (esDT(objeto) ? 999 : 1) },
  { id: "tesoros", inicio: 0x0ed8, caben: 100, maximo: 999 },
  { id: "ingredientes", inicio: 0x1068, caben: 100, maximo: 999 },
  { id: "clave", inicio: 0x11f8, caben: 64, maximo: 1 }
];

const BOLSILLO_DE = new Map(Object.entries(DE_CADA).flatMap(([bolsillo, lista]) => lista.map((objeto) => [objeto, bolsillo])));

// El bolsillo en el que va ese objeto, o null si no existe en el juego
export function bolsilloSwSh(objeto) {
  return BOLSILLO_DE.get(objeto) || null;
}

export function bolsillosSwitch() {
  return BOLSILLOS_SWSH;
}

const OBJETO = 0x7ff;
const CANTIDAD = 0x3ff << 15;

function bloque(bytes) {
  const b = abrirSwSh(bytes).get(LLAVES.bolsa);
  if (!b) throw new Error("No se encuentra la bolsa en la partida.");
  return b.datos;
}

// { medicinas: [{ objeto, cantidad }], balls: [...], ... } en el orden en que están
export function leerMochilaSwitch(bytes) {
  const datos = bloque(bytes);
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const mochila = {};
  for (const b of BOLSILLOS_SWSH) {
    const lista = [];
    for (let i = 0; i < b.caben; i++) {
      const x = vista.getUint32(b.inicio + i * 4, true);
      const objeto = x & OBJETO;
      const cantidad = (x & CANTIDAD) >>> 15;
      if (objeto && cantidad) lista.push({ objeto, cantidad });
    }
    mochila[b.id] = lista;
  }
  return mochila;
}

// Escribe la bolsa entera (lo de leerMochilaSwitch, cambiado). Devuelve una partida nueva, comprobada.
export function escribirMochilaSwitch(original, mochila) {
  const permiso = sePuedeEditarSwitch(original);
  if (!permiso.ok) throw new Error(permiso.motivo);

  const datos = bloque(original).slice();
  const vista = new DataView(datos.buffer);
  const limpia = {};
  for (const b of BOLSILLOS_SWSH) {
    const lista = (mochila[b.id] || [])
      .filter((e) => e.objeto > 0 && e.cantidad > 0)
      .map((e) => ({ objeto: e.objeto, cantidad: Math.min(b.maximoDe ? b.maximoDe(e.objeto) : b.maximo, Math.floor(e.cantidad)) }));
    if (lista.length > b.caben) throw new Error("No cabe tanto en ese bolsillo.");
    // Lo de encima de cada objeto que ya estaba (nuevo, favorito...), tal cual
    const restos = new Map();
    for (let i = 0; i < b.caben; i++) {
      const x = vista.getUint32(b.inicio + i * 4, true);
      if (x & OBJETO && !restos.has(x & OBJETO)) restos.set(x & OBJETO, x & ~(OBJETO | CANTIDAD));
    }
    for (let i = 0; i < b.caben; i++) {
      const e = lista[i];
      const valor = e ? (e.objeto | (e.cantidad << 15) | (restos.get(e.objeto) || 0)) >>> 0 : 0;
      vista.setUint32(b.inicio + i * 4, valor, true);
    }
    limpia[b.id] = lista;
  }

  const nuevo = escribirBloques(original, new Map([[LLAVES.bolsa, datos]]));
  if (JSON.stringify(leerMochilaSwitch(nuevo)) !== JSON.stringify(limpia)) throw new Error("La bolsa no se ha guardado bien.");
  return nuevo;
}
