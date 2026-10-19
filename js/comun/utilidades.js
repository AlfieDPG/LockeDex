import { LOCALE } from "./idioma.js";

export function quitarAcentos(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// "Heavy-Duty Boots" -> "heavydutyboots": para comparar nombres sin fijarse en símbolos
export function normalizarNombre(texto) {
  return quitarAcentos(texto).replace(/[^a-z0-9]/g, "");
}

export function copiaProfunda(objeto) {
  return JSON.parse(JSON.stringify(objeto));
}

// ---------- Fechas ----------
//
// Se guardan como "2025-06-01", que es lo que dan y aceptan los <input type="date">.
// Siempre con la fecha local: con toISOString() un locke cerrado a las 00:30 en España
// saldría con el día anterior.

export function hoyComoTexto() {
  const ahora = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

// "2025-06-01" -> "1 de junio de 2025". Si no es una fecha, "".
export function fechaLarga(texto) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ""));
  if (!partes) return "";
  const fecha = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  return fecha.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

// Para meter texto escrito por una persona dentro de una plantilla HTML sin que
// unos <> o unas comillas rompan la página (o metan código de otro).
export function escaparHTML(texto) {
  return String(texto == null ? "" : texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
