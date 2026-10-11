// ---------- Exportar un equipo como paste de Showdown ----------
//
// Nivel, naturaleza, EVs e IVs: los que se le hayan puesto (js/equipos/entreno.js). Si no se
// han tocado, Showdown los pide igual, así que van siempre los mismos: nivel 100, naturaleza
// neutra, 1 EV en todo y 31 IVs en todo.

import { lineasShowdown } from "./entreno.js";
import { generoDe } from "../comun/pokemon.js";

const NIVEL = 100;
const NATURALEZA = "Serious"; // neutra: no sube ni baja ninguna estadística
const EVS = "1 HP / 1 Atk / 1 Def / 1 SpA / 1 SpD / 1 Spe";
const IVS = "31 HP / 31 Atk / 31 Def / 31 SpA / 31 SpD / 31 Spe";

// Showdown abrevia el género: "meowstic-female-mega" -> "Meowstic-F-Mega"
const ABREVIATURAS = { female: "F", male: "M" };

function trozoForma(trozo) {
  return ABREVIATURAS[trozo] || trozo.charAt(0).toUpperCase() + trozo.slice(1);
}

// Formas por defecto que PokeAPI nombra y Showdown no: "darmanitan-standard" es "Darmanitan"
const FORMAS_POR_DEFECTO = new Set([
  "standard", "normal", "male", "incarnate", "altered", "land", "aria", "ordinary", "average",
  "red-striped", "plant", "baile", "midday", "solo", "disguised", "amped", "full-belly",
  "single-strike", "zero", "family-of-four", "green-plumage", "two-segment", "curly", "red-meteor",
  "shield", "50", "overcast", "west", "spring"
]);

// "Meowstic" + "female-mega" -> "Meowstic-F-Mega"
function nombreShowdown(poke) {
  if (!poke.formaSlug) return poke.en; // guardado antes de que se apuntara la forma
  if (!poke.imagenForma && FORMAS_POR_DEFECTO.has(poke.formaSlug)) return poke.en;
  return [poke.en, ...poke.formaSlug.split("-").map(trozoForma)].join("-");
}

function bloque(poke) {
  const lineas = [];

  // Con mote, Showdown espera "Mote (Especie)"; y el género, detrás: "(F)". Las formas que ya
  // son de un género (Meowstic-F) no lo llevan.
  const genero = generoDe(poke);
  const conGenero = genero && !/-(f|m)(-|$)/i.test(nombreShowdown(poke)) ? ` (${genero})` : "";
  const nombre = (poke.mote ? `${poke.mote} (${nombreShowdown(poke)})` : nombreShowdown(poke)) + conGenero;
  lineas.push(poke.objeto ? `${nombre} @ ${poke.objeto.en}` : nombre);
  if (poke.habilidad) lineas.push(`Ability: ${poke.habilidad.en}`);
  const entreno = lineasShowdown(poke);
  if (entreno) {
    lineas.push(entreno.nivel);
    if (poke.shiny) lineas.push("Shiny: Yes");
    if (entreno.evs) lineas.push(entreno.evs);
    lineas.push(entreno.naturaleza);
    if (entreno.ivs) lineas.push(entreno.ivs);
  } else {
    lineas.push(`Level: ${NIVEL}`);
    if (poke.shiny) lineas.push("Shiny: Yes");
    lineas.push(`EVs: ${EVS}`);
    lineas.push(`${NATURALEZA} Nature`);
    lineas.push(`IVs: ${IVS}`);
  }

  for (const ataque of poke.ataques) {
    if (ataque) lineas.push(`- ${ataque.en}`);
  }

  return lineas.join("\n");
}

export function pasteDelEquipo(pokemon) {
  return pokemon.map(bloque).join("\n\n");
}

// Todos los equipos, como la copia de seguridad de Showdown: cada uno con su
// «=== [gen9] Nombre ===» delante; los de un grupo, «=== [gen9] Grupo/Nombre ===» (las carpetas
// de Showdown). Por eso «/» no va en los nombres.
export function pasteDeTodos(guardados, grupos = []) {
  const nombreGrupo = new Map(grupos.map((g) => [g.id, g.nombre]));
  const sinBarra = (texto) => texto.replace(/\//g, "-");
  return guardados
    .map((g) => {
      const carpeta = nombreGrupo.get(g.grupo);
      const nombre = (carpeta ? `${sinBarra(carpeta)}/` : "") + sinBarra(g.nombre);
      return `=== [gen9] ${nombre} ===\n\n${pasteDelEquipo(g.pokemon)}\n`;
    })
    .join("\n");
}

// Copia al portapapeles. El método moderno solo va con https (GitHub Pages lo es);
// si no está disponible se usa el truco de la caja de texto oculta.
export async function copiarAlPortapapeles(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (error) {
    // lo intentamos de la otra forma
  }

  try {
    const caja = document.createElement("textarea");
    caja.value = texto;
    caja.setAttribute("readonly", "");
    caja.style.position = "fixed";
    caja.style.opacity = "0";
    document.body.appendChild(caja);
    caja.select();
    const copiado = document.execCommand("copy");
    caja.remove();
    return copiado;
  } catch (error) {
    return false;
  }
}
