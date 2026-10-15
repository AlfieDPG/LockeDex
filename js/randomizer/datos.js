// ---------- Datos del randomizer que no están en la ROM ----------
//
// De cada objeto, por su número en gen 5: su categoría y su precio en PokeAPI. Con eso se sabe
// cuáles son «malos» (cartas, pañuelos, fragmentos...), cuáles se pueden equipar y cuánto deben
// costar. Y las estadísticas y los ataques de hoy y lo que cambiaron en cada generación (para
// ponerlos como en la que se elija). Va montado en datos/randomizer.json (lo rehace
// herramientas/generar-datos.html).
//
//   { objetos: { numero: [categoría, precio, bolsillo] }, stats: { especie: [6 números] },
//     ataques: { ataque: [tipo, categoría, potencia, precisión, PP] }, statsAntes, ataquesAntes }

import { descargarCSV } from "../comun/datos.js";

// Hasta gen 5
const ULTIMA_ESPECIE = 649;
const ULTIMO_ATAQUE = 559;

function filas(csv) {
  return csv.split("\n").slice(1).map((linea) => linea.trim().split(",")).filter((partes) => partes[0]);
}

export async function montarDatosRandomizer() {
  const [items, categorias, indices, estadisticas, movimientos, estadisticasAntes, cambiosAtaques, grupos] = await Promise.all(
    [
      "items.csv", "item_categories.csv", "item_game_indices.csv", "pokemon_stats.csv", "moves.csv",
      "pokemon_stats_past.csv", "move_changelog.csv", "version_groups.csv"
    ].map(descargarCSV)
  );
  const categoria = new Map(filas(categorias).map(([id, bolsillo, nombre]) => [id, [nombre, Number(bolsillo)]]));
  const objeto = new Map(filas(items).map(([id, , cat, coste]) => [id, [cat, Number(coste) || 0]]));
  // Los objetos según el número que tienen en cada generación (la 5.ª, la de siempre; la 6.ª, en X, Y, Rubí Omega y
  // Zafiro Alfa; la 7.ª, en Sol, Luna, Ultrasol y Ultraluna)
  const porGeneracion = { 5: {}, 6: {}, 7: {} };
  for (const [item, generacion, indice] of filas(indices)) {
    const destino = porGeneracion[Number(generacion)];
    if (!destino) continue;
    const [cat, coste] = objeto.get(item) || [];
    const [nombre, bolsillo] = categoria.get(cat) || [];
    if (nombre) destino[indice] = [nombre, coste, bolsillo];
  }
  const objetos = porGeneracion[5];

  // Estadísticas base de hoy (PS, Ataque, Defensa, At. Esp., Def. Esp., Velocidad)
  const stats = {};
  for (const [pokemon, stat, valor] of filas(estadisticas)) {
    const id = Number(pokemon);
    if (id > ULTIMA_ESPECIE) continue;
    if (!stats[id]) stats[id] = [0, 0, 0, 0, 0, 0];
    stats[id][Number(stat) - 1] = Number(valor);
  }

  // Ataques de hoy: [tipo (0 normal ... 17 hada), categoría (0 estado, 1 física, 2 especial),
  // potencia, precisión, PP] (potencia y precisión, null si no tienen)
  const ataques = {};
  for (const [id, , , tipo, potencia, pp, precision, , , clase] of filas(movimientos)) {
    if (Number(id) > ULTIMO_ATAQUE) continue;
    ataques[id] = [Number(tipo) - 1, Number(clase) - 1, potencia ? Number(potencia) : null, precision ? Number(precision) : null, Number(pp)];
  }

  // Lo que fueron antes. Estadísticas: [especie, generación hasta la que valió, estadística (0-5),
  // valor]. Ataques: [ataque, generación en la que cambió, tipo, potencia, PP, precisión] (lo que
  // tenía antes de ese cambio; null lo que no cambió)
  const generacionDe = new Map(filas(grupos).map(([id, , generacion]) => [id, Number(generacion)]));
  const statsAntes = filas(estadisticasAntes)
    .filter(([pokemon, , stat]) => Number(pokemon) <= ULTIMA_ESPECIE && Number(stat) <= 6)
    .map(([pokemon, generacion, stat, valor]) => [Number(pokemon), Number(generacion), Number(stat) - 1, Number(valor)]);
  const numero = (x) => (x ? Number(x) : null);
  const ataquesAntes = filas(cambiosAtaques)
    .filter(([id]) => Number(id) <= ULTIMO_ATAQUE)
    .map(([id, grupo, tipo, potencia, pp, precision]) => [Number(id), generacionDe.get(grupo), tipo ? Number(tipo) - 1 : null, numero(potencia), numero(pp), numero(precision)]);
  return { objetos, objetosGen: { 6: porGeneracion[6], 7: porGeneracion[7] }, stats, ataques, statsAntes, ataquesAntes };
}

// Las estadísticas y los ataques como eran en la generación «gen»: { stats, ataques } con la
// forma de los de hoy
export function deGeneracion(datos, gen) {
  const stats = {};
  for (const [id, s] of Object.entries(datos.stats)) stats[id] = s.slice();
  // De cada estadística, el valor de la primera generación (desde «gen») hasta la que valió otro
  const elegido = new Map();
  for (const [id, generacion, stat, valor] of datos.statsAntes) {
    if (generacion < gen || !stats[id]) continue;
    const clave = `${id}:${stat}`;
    if (!elegido.has(clave) || generacion < elegido.get(clave)) {
      elegido.set(clave, generacion);
      stats[id][stat] = valor;
    }
  }
  const ataques = {};
  for (const [id, a] of Object.entries(datos.ataques)) ataques[id] = a.slice();
  // De cada dato, lo que tenía antes del primer cambio posterior a «gen»
  const campos = [[2, 0], [3, 2], [4, 4], [5, 3]]; // [posición en ataquesAntes, en ataques]
  const cambio = new Map();
  for (const fila of datos.ataquesAntes) {
    const [id, generacion] = fila;
    if (!(generacion > gen) || !ataques[id]) continue;
    for (const [de, a] of campos) {
      if (fila[de] === null) continue;
      const clave = `${id}:${a}`;
      if (!cambio.has(clave) || generacion < cambio.get(clave)) {
        cambio.set(clave, generacion);
        ataques[id][a] = fila[de];
      }
    }
  }
  return { stats, ataques };
}

const URL_DATOS = new URL("../../datos/randomizer.json", import.meta.url);
let promesa = null;

export function cargarDatosRandomizer() {
  if (!promesa) {
    promesa = (async () => {
      try {
        const respuesta = await fetch(URL_DATOS);
        if (respuesta.ok) return await respuesta.json();
      } catch (error) {
        // sin el archivo, se monta desde PokeAPI
      }
      return montarDatosRandomizer();
    })();
    promesa.catch(() => (promesa = null));
  }
  return promesa;
}

// ---------- Qué objeto es qué ----------

// Los que nunca salen al randomizar (los de la historia, las MT, los que no se usan...)
const NUNCA = new Set(["all-machines", "plot-advancement", "unused", "event-items", "gameplay", "data-cards", "dex-completion", "apricorn-box"]);
// Los «malos»: no sirven para la aventura
const MALOS = new Set(["all-mail", "scarves", "collectibles", "bad-held-items", "mulch", "baking-only"]);
// Los que tiene sentido que lleve un Pokémon
const EQUIPABLES = new Set([
  "held-items", "choice", "effort-training", "type-enhancement", "in-a-pinch", "picky-healing", "type-protection",
  "jewels", "plates", "species-specific", "medicine", "training"
]);
const BOLSILLO_CLAVE = 8;

export function clasificarObjetos(datos, ultimo, generacion) {
  // Los de 6.ª y 7.ª generación tienen su propia numeración
  const tabla = (generacion >= 6 && datos.objetosGen && datos.objetosGen[generacion]) || datos.objetos;
  const usables = [];
  const equipables = [];
  const malos = new Set();
  for (let id = 1; id <= ultimo; id++) {
    const d = tabla[id];
    if (!d) continue;
    const [cat, , bolsillo] = d;
    if (NUNCA.has(cat) || bolsillo === BOLSILLO_CLAVE) continue;
    usables.push(id);
    if (MALOS.has(cat)) malos.add(id);
    if (EQUIPABLES.has(cat)) equipables.push(id);
  }
  return {
    usables, equipables, malos, precio: (id) => (tabla[id] || [])[1] || 0, categoria: (id) => (tabla[id] || [])[0] || "",
    // Los objetos clave (los de la aventura) ni salen ni se mueven
    clave: (id) => (tabla[id] || [])[2] === BOLSILLO_CLAVE
  };
}
