// ---------- Fondos de la tarjeta de jugador ----------
//
// La tarjeta de «Amigos» (la tuya y la de tus amigos) puede llevar un fondo con dibujo. Cada
// uno elige el suyo en su perfil («Fondo de tu tarjeta»). Va en el perfil
// (perfiles/{uid}.fondo), que es lo que leen tus amigos; y al pintarlo se vuelve a mirar que de
// verdad lo tenga desbloqueado.
//
//   · De metal (plata, oro, platino): por número de logros conseguidos. El dibujo, en CSS
//     (css/amigos.css, .fondo-plata...).
//   · De tipo (uno por cada uno de los 18): con su logro de tipo (logros.js, «t-fire»...). El
//     dibujo es un mosaico con el icono del tipo (img/fondos/<tipo>.svg, hecho a partir de
//     img/tipos/) del color del tipo: un solo estilo para todos (.fondo-tipo).

import { LOGROS } from "./logros.js";
import { coloresTipo, tiposEs } from "./tipos.js";

const URL_PATRONES = new URL("../../img/fondos/", import.meta.url).href;

export const FONDOS_METAL = [
  { id: "plata", nombre: "Plata", logros: 25 },
  { id: "oro", nombre: "Oro", logros: 50 },
  { id: "platino", nombre: "Platino", logros: 80 }
];

export const FONDOS_TIPO = Object.keys(tiposEs).map((tipo) => ({
  id: `tipo-${tipo}`, nombre: tiposEs[tipo], tipo, logro: `t-${tipo}`
}));

export const FONDOS = [...FONDOS_METAL, ...FONDOS_TIPO];

// Los logros que tiene (solo los que existen)
export function logrosDe(perfil) {
  const suyos = (perfil && perfil.logros) || {};
  return LOGROS.filter((logro) => suyos[logro.id]).length;
}

export function desbloqueado(fondo, perfil) {
  if (fondo.logro) return Boolean(((perfil && perfil.logros) || {})[fondo.logro]);
  return logrosDe(perfil) >= fondo.logros;
}

// Lo que pide, para cuando aún no lo tienes
export function requisito(fondo) {
  if (!fondo.logro) return `${fondo.logros} logros`;
  const logro = LOGROS.find((cada) => cada.id === fondo.logro);
  return logro ? logro.descripcion : "";
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
  return fondo.tipo ? "fondo-tipo" : `fondo-${fondo.id}`;
}

export function estiloFondo(id) {
  const fondo = FONDOS.find((cada) => cada.id === id);
  if (!fondo || !fondo.tipo) return "";
  return `--color-tipo: ${coloresTipo[fondo.tipo]}; --patron: url(${URL_PATRONES}${fondo.tipo}.svg)`;
}
