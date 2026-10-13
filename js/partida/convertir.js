// ---------- De la partida a la web ----------
//
// Pasa lo leído de una partida (js/partida/tresds.js) a como lo usa la web: cada Pokémon con
// su especie, su forma (para el retrato de Mundo Misterioso), su nombre en español, su nivel
// y el lugar donde se capturó.

import { cargarPokedex } from "../pokedex/datos.js";
import { cargarDatos, datos } from "../comun/datos.js";
import { formasDeTipoDe } from "../comun/formas.js";
import { LUGARES_GEN6, LUGARES_GEN7, OBJETOS_EN, CRECIMIENTO } from "./datos-3ds.js";

// Formas que importan (las que cambian el aspecto o los tipos), por el número que les da el
// juego: [id de PokeAPI, nombre en Showdown]. Las que no están (Vivillon, Pikachu con gorra,
// los dominantes...) salen como la normal.
const ALOLA = (id, ...otras) => Object.fromEntries([1, ...otras].map((n) => [n, [id, "Alola"]]));
export const FORMAS = {
  19: ALOLA(10091), 20: ALOLA(10092, 2), 26: ALOLA(10100), 27: ALOLA(10101), 28: ALOLA(10102),
  37: ALOLA(10103), 38: ALOLA(10104), 50: ALOLA(10105), 51: ALOLA(10106), 52: ALOLA(10107),
  53: ALOLA(10108), 74: ALOLA(10109), 75: ALOLA(10110), 76: ALOLA(10111), 88: ALOLA(10112),
  89: ALOLA(10113), 103: ALOLA(10114), 105: ALOLA(10115, 2),
  386: { 1: [10001, "Attack"], 2: [10002, "Defense"], 3: [10003, "Speed"] },
  413: { 1: [10004, "Sandy"], 2: [10005, "Trash"] },
  479: { 1: [10008, "Heat"], 2: [10009, "Wash"], 3: [10010, "Frost"], 4: [10011, "Fan"], 5: [10012, "Mow"] },
  487: { 1: [10007, "Origin"] },
  492: { 1: [10006, "Sky"] },
  550: { 1: [10016, "Blue-Striped"] },
  641: { 1: [10019, "Therian"] },
  642: { 1: [10020, "Therian"] },
  645: { 1: [10021, "Therian"] },
  646: { 1: [10022, "White"], 2: [10023, "Black"] },
  647: { 1: [10024, "Resolute"] },
  670: { 5: [10061, "Eternal"] },
  678: { 1: [10025, "F"] },
  718: { 1: [10181, "10%"], 3: [10181, "10%"] },
  720: { 1: [10086, "Unbound"] },
  741: { 1: [10123, "Pom-Pom"], 2: [10124, "Pa'u"], 3: [10125, "Sensu"] },
  745: { 1: [10126, "Midnight"], 2: [10152, "Dusk"] },
  800: { 1: [10155, "Dusk-Mane"], 2: [10156, "Dawn-Wings"] }
};

// Arceus y Silvally: el juego numera sus tipos en el mismo orden que formas.js
const DE_TIPO = { 493: true, 773: true };

const NATURALEZAS = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax",
  "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash",
  "Calm", "Gentle", "Sassy", "Careful", "Quirky"
];

// ---------- Nivel ----------

export function experienciaPara(ritmo, n) {
  const cubo = n ** 3;
  switch (ritmo) {
    case 1: return Math.floor((5 * cubo) / 4);
    case 3: return Math.floor((4 * cubo) / 5);
    case 4: return Math.floor((6 * cubo) / 5 - 15 * n * n + 100 * n - 140);
    case 5:
      if (n < 50) return Math.floor((cubo * (100 - n)) / 50);
      if (n < 68) return Math.floor((cubo * (150 - n)) / 100);
      if (n < 98) return Math.floor((cubo * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((cubo * (160 - n)) / 100);
    case 6:
      if (n < 15) return Math.floor((cubo * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n < 36) return Math.floor((cubo * (n + 14)) / 50);
      return Math.floor((cubo * (Math.floor(n / 2) + 32)) / 50);
    default: return cubo;
  }
}

export function ritmoDe(especie) {
  return Number(CRECIMIENTO[especie - 1]) || 2;
}

export function nivelDe(especie, experiencia) {
  const ritmo = ritmoDe(especie);
  let nivel = 1;
  while (nivel < 100 && experienciaPara(ritmo, nivel + 1) <= experiencia) nivel++;
  return nivel;
}

// ---------- Pokémon ----------

let tablas = null;

// Lo que hace falta tener cargado para convertir: la Pokédex (formas y retratos) y los nombres
export async function prepararConversion() {
  if (!tablas) {
    const [pokedex] = await Promise.all([cargarPokedex(), cargarDatos()]);
    tablas = {
      formas: new Map(pokedex.map((fila) => [fila.clave, fila])),
      especies: new Map(datos.pokemon.map((p) => [p.id, p]))
    };
  }
  return tablas;
}

function nombreLugar(gen, numero) {
  return (gen === 7 ? LUGARES_GEN7 : LUGARES_GEN6)[numero / 2] || "";
}

// Un Pokémon de la partida tal y como se guarda (sin «undefined»: va a la nube)
function convertir(p, gen, conDetalle) {
  const { formas, especies } = tablas;
  const especie = especies.get(p.especie) || { es: `#${p.especie}`, en: "" };
  const salida = {
    id: p.especie,
    es: especie.es,
    nombre: especie.es,
    mote: p.mote || "",
    genero: p.genero,
    shiny: p.shiny,
    nivel: p.nivel || nivelDe(p.especie, p.experiencia),
    llave: p.llave
  };

  const forma = (FORMAS[p.especie] || {})[p.forma];
  const fila = forma && formas.get(forma[0]);
  if (fila) {
    Object.assign(salida, { idForma: fila.clave, formaPMD: fila.forma, nombre: fila.nombre, showdown: forma[1] });
  } else if (forma) {
    // Una forma que no está en la Pokédex de la web (Meowstic hembra): al menos su nombre
    Object.assign(salida, { idForma: forma[0], showdown: forma[1] });
  } else if (DE_TIPO[p.especie] && p.forma) {
    const deTipo = formasDeTipoDe(p.especie)[p.forma - 1];
    if (deTipo) Object.assign(salida, { formaPMD: deTipo.pmd, imagenForma: deTipo.imagenForma, showdown: deTipo.tipo });
  }

  // De dónde viene: los huevos, de donde se recibieron; los demás, de donde se capturaron
  if (!p.huevo && !p.lugarHuevo && p.lugar && nombreLugar(gen, p.lugar)) {
    salida.lugar = nombreLugar(gen, p.lugar);
    salida.lugarN = p.lugar;
  }
  if (p.origen) salida.origen = p.origen;
  salida.fecha = p.fechaCaptura;
  if (p.huevo) salida.huevo = true;

  if (conDetalle) {
    Object.assign(salida, {
      ataques: p.ataques, habilidad: p.habilidad, objeto: p.objeto, naturaleza: p.naturaleza,
      evs: p.evs, ivs: p.ivs
    });
  }
  return salida;
}

// La partida entera, lista para guardar: el equipo con todo y las cajas con lo justo
export async function convertirPartida(leida) {
  await prepararConversion();
  return {
    juego: leida.juego,
    version: leida.version,
    entrenador: leida.entrenador,
    equipo: leida.equipo.map((p) => convertir(p, leida.gen, true)),
    cajas: leida.cajas.map((caja) => ({
      nombre: caja.nombre,
      pokemon: caja.pokemon.map((p) => ({ ...convertir(p, leida.gen, false), hueco: p.hueco }))
    }))
  };
}

// ---------- Paste de Showdown (para «Copiar a Mis equipos») ----------

const STATS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

export function pasteDeEquipo(equipo) {
  const { especies } = tablas;
  const habilidad = (id) => (datos.habilidades.find((h) => h.id === id) || {}).en || "";
  const ataque = (id) => (datos.ataques.find((a) => a.id === id) || {}).en || "";

  return equipo
    .filter((p) => !p.huevo)
    .map((p) => {
      const en = (especies.get(p.id) || {}).en || "";
      const nombre = p.showdown ? `${en}-${p.showdown.charAt(0).toUpperCase()}${p.showdown.slice(1)}` : en;
      const objeto = OBJETOS_EN[p.objeto] || "";
      const lineas = [
        `${p.mote ? `${p.mote} (${nombre})` : nombre}${p.genero ? ` (${p.genero})` : ""}${objeto ? ` @ ${objeto}` : ""}`,
        habilidad(p.habilidad) && `Ability: ${habilidad(p.habilidad)}`,
        `Level: ${p.nivel}`,
        p.shiny && "Shiny: Yes",
        (p.evs || []).some(Boolean) && `EVs: ${p.evs.map((v, i) => v && `${v} ${STATS[i]}`).filter(Boolean).join(" / ")}`,
        NATURALEZAS[p.naturaleza] && `${NATURALEZAS[p.naturaleza]} Nature`,
        `IVs: ${(p.ivs || []).map((v, i) => `${v} ${STATS[i]}`).join(" / ")}`,
        ...(p.ataques || []).map((id) => ataque(id) && `- ${ataque(id)}`)
      ];
      return lineas.filter(Boolean).join("\n");
    })
    .join("\n\n");
}
