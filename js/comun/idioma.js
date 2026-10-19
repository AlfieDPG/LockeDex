// Idiomas de la web: español (en el que está escrito todo) e inglés.
//
// La clave de cada texto es el propio texto en español: t("Crear equipo") da «Create team»
// en inglés y el mismo texto en español, así el código se sigue leyendo igual. Las
// traducciones están en js/idiomas/en/ (un archivo por sección) y solo se descargan en inglés.
//
//   · Huecos: t("Hola, {nombre}", { nombre }) → «Hello, Ana». En el diccionario van igual.
//   · Contexto: si una palabra se traduce distinto según dónde (cambiar → «change» o
//     «switch»), t("cuenta|Cambiar"): en español sale «Cambiar», y en el diccionario va
//     con su contexto.
//   · Los espacios y saltos de línea no cuentan: un texto partido en varias líneas en el
//     código es la misma clave que en una sola.
//   · Lo que está escrito tal cual en index.html se traduce solo al cargar (traducirPagina):
//     cada texto suelto, y los atributos title, placeholder, aria-label y alt. Un elemento
//     con data-t se traduce entero, con su HTML dentro (para párrafos con <b>, <a>...).
//
// Cambiar de idioma recarga la página (js/comun/ajustes.js): así todo sale ya traducido.
// En inglés, lo que aún no tiene traducción sale en español; la lista está en la consola
// con textosSinTraducir().

import { CLAVE_AJUSTES } from "./claves-ajustes.js";

// Quien no haya elegido idioma: con true, el del navegador (español si lo tiene en español; si
// no, inglés); con false, siempre español (p. ej. mientras falte algo por traducir).
const TRADUCCION_COMPLETA = true;

function elegido() {
  try {
    return (JSON.parse(localStorage.getItem(CLAVE_AJUSTES)) || {}).idioma;
  } catch (error) {
    return undefined;
  }
}

function delNavegador() {
  // Fuera del navegador (las pruebas con Node), español
  if (!TRADUCCION_COMPLETA || typeof document === "undefined") return "es";
  const idiomas = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  return idiomas.some((cada) => /^es\b/i.test(cada || "")) ? "es" : "en";
}

export const IDIOMAS = ["es", "en"];
export const idioma = IDIOMAS.includes(elegido()) ? elegido() : delNavegador();
export const enIngles = idioma === "en";

// Para Intl y localeCompare: fechas, números y orden alfabético en el idioma de la web
export const LOCALE = enIngles ? "en-GB" : "es-ES";

const normalizar = (texto) => String(texto).replace(/\s+/g, " ").trim();

let diccionario = null;
if (enIngles) {
  try {
    const { default: textos } = await import("../idiomas/en/index.js");
    diccionario = new Map(Object.entries(textos).map(([es, en]) => [normalizar(es), en]));
  } catch (error) {
    console.error("No se ha podido cargar el inglés", error);
  }
}

const sinTraducir = new Set();

function buscar(texto) {
  if (!diccionario) return null;
  const clave = normalizar(texto);
  if (!clave) return null;
  const traducido = diccionario.get(clave);
  if (traducido === undefined) sinTraducir.add(clave);
  return traducido === undefined ? null : traducido;
}

function rellenar(texto, datos) {
  return datos ? texto.replace(/\{(\w+)\}/g, (hueco, nombre) => (nombre in datos ? datos[nombre] : hueco)) : texto;
}

const CONTEXTO = /^[a-z-]+\|/;

export function t(texto, datos) {
  return rellenar(buscar(texto) ?? String(texto).replace(CONTEXTO, ""), datos);
}

// Para los textos que el desarrollador escribe en los dos idiomas a la vez ({ es, en } o
// un objeto con campo «en»): el del idioma de la web, o el español si no hay otro
export function segunIdioma(es, en) {
  return enIngles && en ? en : es;
}

// Nombre de un Pokémon, ataque, habilidad, objeto o naturaleza ({ es, en }) en el idioma de
// la web. Si le falta el inglés (copias antiguas), el español.
export function nombre(cosa) {
  if (!cosa) return "";
  return (enIngles && cosa.en) || cosa.es || cosa.en || "";
}

// ---------- Lo que ya está escrito en la página ----------

const ATRIBUTOS = ["title", "placeholder", "aria-label", "alt"];

export function traducirPagina(raiz = document.body) {
  if (!diccionario) return;

  for (const elemento of raiz.querySelectorAll("[data-t]")) {
    const traducido = buscar(elemento.innerHTML);
    if (traducido !== null) elemento.innerHTML = traducido;
  }

  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (nodo) =>
      nodo.parentElement.closest("script, style, svg, [data-t], [data-no-traducir]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
  });
  for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
    const traducido = buscar(nodo.nodeValue);
    if (traducido === null) continue;
    // Se respetan los espacios de alrededor (los que separan el texto de un icono, p. ej.)
    const [, antes, , despues] = nodo.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
    nodo.nodeValue = antes + traducido + despues;
  }

  for (const atributo of ATRIBUTOS) {
    for (const elemento of raiz.querySelectorAll(`[${atributo}]`)) {
      const traducido = buscar(elemento.getAttribute(atributo));
      if (traducido !== null) elemento.setAttribute(atributo, traducido);
    }
  }
}

if (diccionario) {
  document.documentElement.lang = "en";
  const descripcion = document.querySelector('meta[name="description"]');
  if (descripcion) descripcion.content = t(descripcion.content);
  traducirPagina();
  globalThis.textosSinTraducir = () => [...sinTraducir];
}
