// ---------- Lo que necesita el editor de partidas, ya preparado ----------
//
// Para que abrir un Pokémon sea al momento, sin esperar a PokeAPI. La web lo lleva montado en
// datos/partida-3ds.json (lo rehace herramientas/generar-datos.html con montarDatosEditor):
//
//   ataques:     [tipo, pp] por número de ataque (null los que no hay)
//   especies:    { especie: [gender_rate, base_happiness, hatch_counter, diferencias de hembra 0/1] }
//   habilidades: { pokemon (id de PokeAPI, formas incluidas): [[habilidad, hueco 1-3], ...] }
//   aprende:     { xy | oras: { pokemon: [[ataque, nivel], ...] } } (subiendo de nivel)
//   bolsillos:   { objeto (número en el juego, gen 6): bolsillo de PokeAPI (1-8) }
//   maquinas:    { xy | oras: { objeto: ataque } } (qué enseña cada MT / MO)
//
// Sale de los CSV de PokeAPI (moves, pokemon_species, pokemon, pokemon_abilities, version_groups,
// pokemon_moves, items, item_categories, item_game_indices y machines). Solo hasta la gen 7.

import { descargarCSV } from "../comun/datos.js";
import { TIPOS_POR_ID } from "../calculadora/ataques.js";

const ULTIMA_ESPECIE = 807;
const GRUPOS = { xy: "x-y", oras: "omega-ruby-alpha-sapphire" };
const SUBIENDO_DE_NIVEL = 1; // pokemon_move_methods.csv

function filas(csv) {
  return csv.split("\n").slice(1).map((linea) => linea.trim().split(",")).filter((partes) => partes[0]);
}

export async function montarDatosEditor() {
  const [moves, species, pokemon, abilities, groups, learnset, items, categories, indices, machines] = await Promise.all(
    [
      "moves.csv", "pokemon_species.csv", "pokemon.csv", "pokemon_abilities.csv", "version_groups.csv", "pokemon_moves.csv",
      "items.csv", "item_categories.csv", "item_game_indices.csv", "machines.csv"
    ].map(descargarCSV)
  );

  const ataques = [];
  for (const [id, , , tipo, , pp] of filas(moves)) {
    if (Number(id) < 10000 && TIPOS_POR_ID[Number(tipo)]) ataques[Number(id)] = [TIPOS_POR_ID[Number(tipo)], Number(pp) || 1];
  }
  for (let i = 0; i < ataques.length; i++) if (!ataques[i]) ataques[i] = null;

  // id, identifier, generation_id, evolves_from, chain, color, shape, habitat, gender_rate,
  // capture_rate, base_happiness, is_baby, hatch_counter, has_gender_differences...
  const especies = {};
  for (const p of filas(species)) {
    const id = Number(p[0]);
    if (id > ULTIMA_ESPECIE) continue;
    especies[id] = [Number(p[8]), p[10] === "" ? 70 : Number(p[10]), Number(p[12]) || 20, Number(p[13]) ? 1 : 0];
  }

  // Los Pokémon (formas incluidas) de las especies de hasta gen 7
  const especieDe = new Map(filas(pokemon).map((p) => [Number(p[0]), Number(p[2])]));
  const vale = (id) => (especieDe.get(id) || Infinity) <= ULTIMA_ESPECIE;

  const habilidades = {};
  for (const [id, habilidad, , hueco] of filas(abilities)) {
    if (!vale(Number(id))) continue;
    (habilidades[id] = habilidades[id] || []).push([Number(habilidad), Number(hueco)]);
  }

  const idGrupo = new Map(filas(groups).map((p) => [p[1], Number(p[0])]));
  const deGrupo = new Map(Object.entries(GRUPOS).map(([juego, nombre]) => [idGrupo.get(nombre), juego]));
  const aprende = Object.fromEntries(Object.keys(GRUPOS).map((juego) => [juego, {}]));
  for (const [id, grupo, ataque, metodo, nivel] of filas(learnset)) {
    const juego = deGrupo.get(Number(grupo));
    if (!juego || Number(metodo) !== SUBIENDO_DE_NIVEL || !vale(Number(id))) continue;
    (aprende[juego][id] = aprende[juego][id] || []).push([Number(ataque), Number(nivel) || 1]);
  }
  for (const delJuego of Object.values(aprende)) {
    for (const lista of Object.values(delJuego)) lista.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }

  // Objetos por su número en el juego de gen 6 (item_game_indices): en qué bolsillo de PokeAPI
  // van (item_pockets: 1 objetos, 2 medicinas, 3 balls, 4 máquinas, 5 bayas, 6 cartas,
  // 7 de combate, 8 clave)
  const bolsilloDeCategoria = new Map(filas(categories).map((p) => [Number(p[0]), Number(p[1])]));
  const categoriaDe = new Map(filas(items).map((p) => [Number(p[0]), Number(p[2])]));
  const enJuego = new Map(); // id de PokeAPI -> número en gen 6
  const bolsillos = {};
  for (const [item, generacion, indice] of filas(indices)) {
    if (Number(generacion) !== 6) continue;
    enJuego.set(Number(item), Number(indice));
    const bolsillo = bolsilloDeCategoria.get(categoriaDe.get(Number(item)));
    if (bolsillo) bolsillos[indice] = bolsillo;
  }

  // Qué ataque enseña cada MT / MO, por su número en el juego
  const maquinas = Object.fromEntries(Object.keys(GRUPOS).map((juego) => [juego, {}]));
  for (const [, grupo, item, ataque] of filas(machines)) {
    const juego = deGrupo.get(Number(grupo));
    const indice = enJuego.get(Number(item));
    if (juego && indice) maquinas[juego][indice] = Number(ataque);
  }

  return { ataques, especies, habilidades, aprende, bolsillos, maquinas };
}

const URL_DATOS = new URL("../../datos/partida-3ds.json", import.meta.url);
let promesa = null;

// Lo de datos/partida-3ds.json (o, sin el archivo, montado ahora desde PokeAPI)
export function cargarDatosEditor() {
  if (!promesa) {
    promesa = (async () => {
      try {
        const respuesta = await fetch(URL_DATOS);
        if (respuesta.ok) return await respuesta.json();
      } catch (error) {
        // sin el archivo, se monta desde PokeAPI
      }
      return montarDatosEditor();
    })();
    promesa.catch(() => (promesa = null));
  }
  return promesa;
}
