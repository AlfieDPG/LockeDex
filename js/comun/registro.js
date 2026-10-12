// ---------- Pokémon registrados ----------
//
// Los Pokémon (por especie) que has tenido alguna vez: en un equipo de «Mis equipos», en la
// partida vinculada a un locke (equipo y cajas), apuntados como captura en «Rutas» o en tu
// cementerio. Lo usan los logros de la Pokédex («Hazte con todos», los de Eevee...).
//
// Se apunta lo que se va viendo y no se borra: un Pokémon sigue registrado aunque luego se
// borre el equipo en el que estaba.
//
//   localStorage «poketeams-registrados-v1»: [número de la Pokédex, ...]

import { leer, escribir } from "./almacen.js";

// NO cambiar esta clave: si se cambia, se pierden los registrados
const CLAVE = "poketeams-registrados-v1";

export const TOTAL_ESPECIES = 1025;

function valido(numero) {
  const n = Number(numero);
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_ESPECIES ? n : null;
}

// Los que hay ahora mismo en tus cosas. muertos: los de tu cementerio en tus lockes.
function deAhora(muertos) {
  const numeros = [];
  for (const equipo of leer("poketeams-equipos-v1", []) || []) {
    for (const p of (equipo && equipo.pokemon) || []) numeros.push(p && p.id);
  }
  for (const partida of Object.values(leer("poketeams-partidas-v1", {}) || {})) {
    for (const p of (partida && partida.equipo) || []) if (!p.huevo) numeros.push(p.id);
    for (const caja of (partida && partida.cajas) || []) {
      for (const p of caja.pokemon || []) if (!p.huevo) numeros.push(p.id);
    }
  }
  for (const delJuego of Object.values(leer("poketeams-capturas-v1", {}) || {})) {
    for (const captura of Object.values(delJuego || {})) numeros.push(captura && captura.especie);
  }
  for (const muerto of muertos) numeros.push(muerto && muerto.especie);
  return numeros.map(valido).filter(Boolean);
}

// Los registrados (un Set), apuntando antes los nuevos
export function registrados(muertos = []) {
  const guardados = (leer(CLAVE, []) || []).map(valido).filter(Boolean);
  const todos = new Set([...guardados, ...deAhora(muertos)]);
  if (todos.size > guardados.length) escribir(CLAVE, [...todos].sort((a, b) => a - b));
  return todos;
}
