import { pedirJSON, URL_API } from "./api.js";
import { tiposEs, TIPOS_ES, TIPOS_EN } from "./tipos.js";
import { t, enIngles } from "./idioma.js";

// ---------- Formas de tipo: Arceus (tablas) y Silvally (memorias) ----------
//
// Para PokeAPI son UN solo Pokémon con un solo tipo (Normal): el resto no son variedades
// sino «pokemon-form», sin estadísticas propias (son las mismas). Pero el tipo sí cambia,
// y eso importa para el equipo (debilidades, la ficha, el paste de Showdown), así que aquí
// se tratan como formas elegibles más, con un slug inventado: "arceus-fire".
//
// Las imágenes sí existen con ese nombre en el repositorio de sprites ("493-fire.png") y
// Mundo Misterioso tiene un retrato por tipo, aunque cada uno en su propio orden.

// Orden de los juegos (el de la Pokédex de tipos), que es como salen en el selector
const TIPOS_ELEGIBLES = [
  "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel", "fire",
  "water", "grass", "electric", "psychic", "ice", "dragon", "dark", "fairy"
];

const FORMAS_DE_TIPO = {
  arceus: {
    dex: 493,
    // Mundo Misterioso los ordena en inglés por orden alfabético (y Hada al final)
    pmd: {
      bug: 1, dark: 2, dragon: 3, electric: 4, fighting: 5, fire: 6, flying: 7, ghost: 8,
      grass: 9, ground: 10, ice: 11, poison: 12, psychic: 13, rock: 14, steel: 15,
      water: 16, fairy: 17
    }
  },
  silvally: {
    dex: 773,
    // Aquí sí van en el orden de los juegos, el mismo que TIPOS_ELEGIBLES
    pmd: Object.fromEntries(TIPOS_ELEGIBLES.map((tipo, i) => [tipo, i + 1]))
  }
};

// "arceus-fire" -> { especie: "arceus", tipo: "fire", dex: 493, pmd: 6 }. Si no es una
// forma de tipo, null.
export function formaDeTipo(slug) {
  const [especie, tipo, ...resto] = String(slug || "").split("-");
  const datosEspecie = FORMAS_DE_TIPO[especie];
  if (!datosEspecie || resto.length || !datosEspecie.pmd[tipo]) return null;
  return { especie, tipo, dex: datosEspecie.dex, pmd: datosEspecie.pmd[tipo] };
}

export function tieneFormasDeTipo(especie) {
  return Boolean(FORMAS_DE_TIPO[especie]);
}

// Por número de la Pokédex (493 o 773): [{ tipo, pmd, imagenForma: "493-fire" }]; [] si no las tiene
export function formasDeTipoDe(numero) {
  const datosEspecie = Object.values(FORMAS_DE_TIPO).find((cada) => cada.dex === numero);
  if (!datosEspecie) return [];
  return TIPOS_ELEGIBLES.map((tipo) => ({ tipo, pmd: datosEspecie.pmd[tipo], imagenForma: `${numero}-${tipo}` }));
}

// ---------- Formas (Alola, Galar, Héroe...) ----------

// Variedades de PokeAPI que no interesan: gorras de Pikachu, Gigamax, tótems, formas que solo
// existen en combate (Wishiwashi banco, Mimikyu descubierto...), colores de Minior, modos de Koraidon/Miraidon...
const FORMAS_OCULTAS = new RegExp(
  "-(cap|cosplay|rock-star|belle|pop-star|phd|libre|starter|totem|gmax|eternamax|spiky-eared|power-construct|" +
    "stellar|terastal|battle-bond|own-tempo|school|busted|gulping|gorging|noice|hangry|complete|blade)|" +
    "^(minior|koraidon|miraidon)-"
);

export function formaVisible(slug) {
  return !FORMAS_OCULTAS.test(slug);
}

// Nombres para una variedad concreta (cuando el sufijo solo no basta)
const NOMBRES_VARIEDAD = {
  "necrozma-dusk": "Melena Crepuscular", "necrozma-dawn": "Alas del Alba",
  "calyrex-ice": "Jinete Glacial", "calyrex-shadow": "Jinete Espectral",
  "pikachu-starter": "Compañero", "eevee-starter": "Compañero",
  "terapagos-terastal": "Teracristal", "terapagos-stellar": "Astral",
  "minior-red": "Núcleo", // los siete colores del núcleo tienen las mismas estadísticas
  // Formas cuyo sufijo no aporta nada en la tabla de estadísticas: las variantes
  // (Tatsugiri curvada/lánguida/recta, Meowstic macho/hembra) megaevolucionan igual
  "tatsugiri-curly-mega": "Mega", "meowstic-male-mega": "Mega"
};

const NOMBRES_FORMA = {
  "pom-pom": "Animado", "pau": "Plácido", "sensu": "Refinado", "eternal": "Eterna", "dada": "Papá",
  "paldea-combat-breed": "Paldea (Raza Combatiente)", "paldea-blaze-breed": "Paldea (Raza Ardiente)",
  "paldea-aqua-breed": "Paldea (Raza Acuática)", "family-of-three": "Familia de Tres",
  "curly": "Curvada", "droopy": "Lánguida", "stretchy": "Recta", "roaming": "Andante",
  "blue-plumage": "Plumaje Azul", "yellow-plumage": "Plumaje Amarillo", "white-plumage": "Plumaje Blanco",
  "wellspring-mask": "Máscara Fuente", "hearthflame-mask": "Máscara Horno", "cornerstone-mask": "Máscara Cimiento",
  "alola": "Alola", "galar": "Galar", "hisui": "Hisui", "paldea": "Paldea",
  "mega": "Mega", "mega-x": "Mega X", "mega-y": "Mega Y", "primal": "Primigenia",
  "standard": "Normal", "zero": "Normal", "ordinary": "Normal", "average": "Normal",
  "incarnate": "Avatar", "therian": "Tótem", "altered": "Modificada", "origin": "Origen",
  "zen": "Daruma", "hero": "Héroe", "sky": "Cielo", "land": "Tierra",
  "attack": "Ataque", "defense": "Defensa", "speed": "Velocidad",
  "plant": "Planta", "sandy": "Arena", "trash": "Basura",
  "heat": "Calor", "wash": "Lavado", "frost": "Frío", "fan": "Ventilador", "mow": "Corte",
  "male": "Macho", "female": "Hembra", "busted": "Descubierta", "disguised": "Encubierta",
  "low-key": "Grave", "amped": "Aguda", "midday": "Diurna", "midnight": "Nocturna",
  "dusk": "Crepuscular", "solo": "Individual", "school": "Banco",
  "small": "Pequeño", "large": "Grande", "super": "Enorme", "complete": "Completa",
  "10": "10%", "50": "50%", "unbound": "Desatado", "confined": "Contenido",
  "single-strike": "Puño Directo", "rapid-strike": "Puño Fluido",
  "ice": "Hielo", "shadow": "Sombra", "dawn-wings": "Alas del Alba",
  "dusk-mane": "Melena Crepuscular", "ultra": "Ultra", "hangry": "Voraz",
  "full-belly": "Saciada", "noice": "Cara Deshielo", "crowned": "Coronado",
  "rainy": "Lluvia", "snowy": "Nieve", "sunny": "Sol", "blade": "Filo", "shield": "Escudo",
  "resolute": "Brío", "aria": "Lírica", "pirouette": "Pirueta",
  "red-striped": "Raya Roja", "blue-striped": "Raya Azul", "white-striped": "Raya Blanca",
  "bloodmoon": "Luna Carmesí", "hearthflame": "Horno", "wellspring": "Fuente",
  "cornerstone": "Cimiento", "teal": "Turquesa", "black": "Negro", "white": "Blanco"
};

// En inglés casi todas salen solas del nombre de PokeAPI ("alola" -> "Alola"); estas no
const NOMBRES_VARIEDAD_EN = {
  "necrozma-dusk": "Dusk Mane", "necrozma-dawn": "Dawn Wings",
  "calyrex-ice": "Ice Rider", "calyrex-shadow": "Shadow Rider",
  "pikachu-starter": "Partner", "eevee-starter": "Partner",
  "minior-red": "Core", "tatsugiri-curly-mega": "Mega", "meowstic-male-mega": "Mega"
};

const NOMBRES_FORMA_EN = {
  "standard": "Normal", "zero": "Normal", "ordinary": "Normal", "average": "Normal",
  "10": "10%", "50": "50%", "paldea-combat-breed": "Paldea (Combat Breed)",
  "paldea-blaze-breed": "Paldea (Blaze Breed)", "paldea-aqua-breed": "Paldea (Aqua Breed)"
};

// La etiqueta en español de una forma («Alola», «Plumaje Azul», «Fuego») en inglés. Para lo
// que solo se guardó en español (la tabla de la Pokédex, datos/pokedex.json). Si no se sabe,
// la misma.
let etiquetasEn = null;

function inglesDeSufijo(sufijo) {
  return NOMBRES_FORMA_EN[sufijo] || sufijo.split("-").map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" ");
}

export function etiquetaEnIngles(etiqueta) {
  if (!etiquetasEn) {
    etiquetasEn = new Map();
    for (const [sufijo, es] of Object.entries(NOMBRES_FORMA)) etiquetasEn.set(es, inglesDeSufijo(sufijo));
    for (const [slug, es] of Object.entries(NOMBRES_VARIEDAD)) {
      etiquetasEn.set(es, NOMBRES_VARIEDAD_EN[slug] || inglesDeSufijo(slug.split("-").slice(1).join("-")));
    }
    for (const tipo of Object.keys(TIPOS_ES)) etiquetasEn.set(TIPOS_ES[tipo], TIPOS_EN[tipo]);
  }
  if (etiquetasEn.has(etiqueta)) return etiquetasEn.get(etiqueta);
  return etiqueta.split(" ").map((trozo) => etiquetasEn.get(trozo) || trozo).join(" ");
}

// «Raticate (Alola)» (como en la Pokédex) en inglés, con el nombre inglés de la especie
export function nombreConFormaEnIngles(nombreEs, especieEn) {
  const partes = /^(.*?) \((.+)\)$/.exec(nombreEs);
  if (!partes) return especieEn || nombreEs;
  return `${especieEn || partes[1]} (${etiquetaEnIngles(partes[2])})`;
}

// Texto de cada opción del selector de forma: «Forma Alola», «Tipo Fuego»...
export function nombreOpcionForma(slug, especie) {
  const deTipo = formaDeTipo(slug);
  if (deTipo) return t("Tipo {tipo}", { tipo: tiposEs[deTipo.tipo] });
  if (tieneFormasDeTipo(especie) && slug === especie) return t("Tipo {tipo}", { tipo: tiposEs.normal });
  return t("Forma {forma}", { forma: etiquetaForma(slug, especie) });
}

// "persian-alola" + "persian" -> "Alola". En el idioma de la web; con idioma "es", siempre
// en español (lo que se guarda en el equipo, ver pokemon.js).
export function etiquetaForma(slug, especie, idioma = enIngles ? "en" : "es") {
  const ingles = idioma === "en";
  const deTipo = formaDeTipo(slug);
  if (deTipo) return (ingles ? TIPOS_EN : TIPOS_ES)[deTipo.tipo];

  const variedad = ingles ? NOMBRES_VARIEDAD_EN : NOMBRES_VARIEDAD;
  const forma = ingles ? NOMBRES_FORMA_EN : NOMBRES_FORMA;
  const sufijo = especie && slug.startsWith(especie + "-") ? slug.slice(especie.length + 1) : "";
  if (!sufijo) return "Normal";
  if (variedad[slug]) return variedad[slug];
  if (forma[sufijo]) return forma[sufijo];

  let tokens = sufijo.split("-").map((t) => forma[t] || t.charAt(0).toUpperCase() + t.slice(1));
  if (tokens.length > 1) tokens = tokens.filter((t) => t !== "Normal");
  return tokens.join(" ");
}

// Formas elegibles de una especie. La primera es la normal.
// La posición en la lista se usa también para buscar el retrato de Mundo Misterioso.
export async function obtenerVariedades(idEspecie) {
  const sp = await pedirJSON(`${URL_API}pokemon-species/${idEspecie}`);
  const porDefecto = (sp.varieties.find((v) => v.is_default) || sp.varieties[0]).pokemon.name;
  const otras = sp.varieties
    .map((v) => v.pokemon.name)
    .filter((n) => n !== porDefecto && !FORMAS_OCULTAS.test(n));

  // Arceus y Silvally: un tipo por tabla o memoria (ver FORMAS_DE_TIPO)
  const deTipo = tieneFormasDeTipo(sp.name) ? TIPOS_ELEGIBLES.map((tipo) => `${sp.name}-${tipo}`) : [];

  return { especie: sp.name, lista: [porDefecto, ...otras, ...deTipo] };
}
