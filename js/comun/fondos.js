// ---------- Fondos de la tarjeta de jugador ----------
//
// La tarjeta de «Amigos» (la tuya y la de tus amigos) puede llevar un fondo con dibujo. Cada
// uno elige el suyo en su perfil («Fondo de tu tarjeta»). Va en el perfil
// (perfiles/{uid}.fondo), que es lo que leen tus amigos; y al pintarlo se vuelve a mirar que de
// verdad lo tenga desbloqueado.
//
//   · De metal (plata, oro, platino): con los logros de conseguir 25, 50 y todos los logros.
//     El dibujo, en CSS (css/amigos.css, .fondo-plata...).
//   · De tipo (uno por cada uno de los 18): con su logro de tipo (logros.js, «t-fire»...). El
//     dibujo es un mosaico con el icono del tipo (img/fondos/<tipo>.svg, hecho a partir de
//     img/tipos/) del color del tipo: un solo estilo para todos (.fondo-tipo).
//   · De Eevee (uno por Eeveelution y el de Eevee): con los logros de registrarlas (logros.js,
//     «x-vaporeon»... y «x-eeveelutions»). Cada uno con su dibujo en CSS
//     (css/amigos.css, .fondo-eevee-vaporeon...).

import { LOGROS, EEVEELUTIONS } from "./logros.js";
import { coloresTipo, tiposEs } from "./tipos.js";
import { t } from "./idioma.js";

const URL_PATRONES = new URL("../../img/fondos/", import.meta.url).href;

// Los de metal, con los logros de logros (25, 50 y todos: ver logros.js)
export const FONDOS_METAL = [
  { id: "plata", nombre: t("Plata"), logro: "m-30" },
  { id: "oro", nombre: t("Oro"), logro: "m-60" },
  { id: "platino", nombre: t("Platino"), logro: "m-todos" }
];

export const FONDOS_TIPO = Object.keys(tiposEs).map((tipo) => ({
  id: `tipo-${tipo}`, nombre: tiposEs[tipo], tipo, logro: `t-${tipo}`
}));

// El de Eevee (las ocho) primero; luego cada Eeveelution
export const FONDOS_EEVEE = [
  { id: "eevee-eevee", nombre: "Eevee", eevee: 133, logro: "x-eeveelutions" },
  ...EEVEELUTIONS.map((eevee) => ({ id: `eevee-${eevee.especie}`, nombre: eevee.nombre, eevee: eevee.numero, logro: `x-${eevee.especie}` }))
];

export const FONDOS = [...FONDOS_METAL, ...FONDOS_TIPO, ...FONDOS_EEVEE];

// Los logros que tiene (solo los que existen)
export function logrosDe(perfil) {
  const suyos = (perfil && perfil.logros) || {};
  return LOGROS.filter((logro) => suyos[logro.id]).length;
}

export function desbloqueado(fondo, perfil) {
  return Boolean(((perfil && perfil.logros) || {})[fondo.logro]);
}

// Lo que pide, para cuando aún no lo tienes: «Logro «Toque de oro»: Consigue 50 logros.»
export function requisito(fondo) {
  const logro = LOGROS.find((cada) => cada.id === fondo.logro);
  return logro ? t("Logro «{nombre}»: {descripcion}", { nombre: logro.nombre, descripcion: logro.descripcion }) : "";
}

// Lo que pide, en corto, para debajo de la muestra («50 logros»), o "" si no hace falta
export function requisitoCorto(fondo) {
  const logro = LOGROS.find((cada) => cada.id === fondo.logro);
  if (!logro || logro.tipo) return "";
  if (logro.categoria === "pokedex") return logro.id === "x-eeveelutions" ? t("Las 8 Eeveelutions") : t("Regístralo");
  return logro.id === "m-todos" ? t("Todos los logros") : t("{n} logros", { n: logro.meta });
}

// El que lleva puesto ("" si ninguno o si no lo tiene desbloqueado)
export function fondoDe(perfil) {
  const fondo = FONDOS.find((cada) => cada.id === (perfil && perfil.fondo));
  return fondo && desbloqueado(fondo, perfil) ? fondo.id : "";
}

// Clase y estilo para el elemento que lo lleva: class="${clase}" style="${estilo}"
export function claseFondo(id) {
  const fondo = FONDOS.find((cada) => cada.id === id);
  if (!fondo) return "";
  if (fondo.eevee) return `fondo-eevee fondo-${fondo.id}`;
  return fondo.tipo ? "fondo-tipo" : `fondo-${fondo.id}`;
}

export function estiloFondo(id) {
  const fondo = FONDOS.find((cada) => cada.id === id);
  if (!fondo) return "";
  if (!fondo.tipo) return "";
  return `--color-tipo: ${coloresTipo[fondo.tipo]}; --patron: url(${URL_PATRONES}${fondo.tipo}.svg)`;
}
