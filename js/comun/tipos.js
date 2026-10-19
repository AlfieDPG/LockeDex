import { enIngles } from "./idioma.js";

export const coloresTipo = {
  normal: "#a8a77a", fire: "#ee8130", water: "#6390f0", electric: "#f7d02c",
  grass: "#7ac74c", ice: "#96d9d6", fighting: "#c22e28", poison: "#a33ea1",
  ground: "#e2bf65", flying: "#a98ff3", psychic: "#f95587", bug: "#a6b91a",
  rock: "#b6a136", ghost: "#735797", dragon: "#6f35fc", dark: "#705746",
  steel: "#b7b7ce", fairy: "#d685ad"
};

// Siempre en español: para lo que se guarda (p. ej. «Tipo Fuego» en las formas de Arceus)
export const TIPOS_ES = {
  normal: "Normal", fire: "Fuego", water: "Agua", electric: "Eléctrico",
  grass: "Planta", ice: "Hielo", fighting: "Lucha", poison: "Veneno",
  ground: "Tierra", flying: "Volador", psychic: "Psíquico", bug: "Bicho",
  rock: "Roca", ghost: "Fantasma", dragon: "Dragón", dark: "Siniestro",
  steel: "Acero", fairy: "Hada"
};

export const TIPOS_EN = Object.fromEntries(
  Object.keys(TIPOS_ES).map((tipo) => [tipo, tipo.charAt(0).toUpperCase() + tipo.slice(1)])
);

// Para enseñar: en el idioma de la web (el nombre viene de cuando solo había español)
export const tiposEs = enIngles ? TIPOS_EN : TIPOS_ES;

// Copia en la propia web de los de duiker101/pokemon-type-svg-icons (pesan 1 KB cada uno
// y así no hay que ir a GitHub a por ellos). Tiene que ser una dirección completa: va en
// una variable CSS, y el navegador la resolvería desde la carpeta css/.
const URL_ICONOS_TIPO = new URL("../../img/tipos/", import.meta.url).href;

export function urlIconoTipo(tipo) {
  return `${URL_ICONOS_TIPO}${tipo}.svg`;
}

export function iconoTipo(tipo) {
  return `<span class="icono-tipo" style="--icono: url(${urlIconoTipo(tipo)})"></span>`;
}
