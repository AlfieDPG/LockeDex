// ---------- Azar con semilla ----------
//
// La misma semilla da siempre el mismo resultado (para poder repetir una ROM si hace falta);
// cada jugador saca la suya al randomizar. Generador xoshiro128**, sembrado con el SHA-256 de
// la semilla (texto).

import { sha256 } from "../partida/firma7.js";

const LETRAS = "abcdefghijkmnpqrstuvwxyz23456789"; // sin las que se confunden (l, o, 0, 1)

export function nuevaSemilla() {
  const n = new Uint8Array(12);
  crypto.getRandomValues(n);
  return Array.from(n, (b) => LETRAS[b % LETRAS.length]).join("");
}

export function crearAzar(semilla) {
  const h = sha256(new TextEncoder().encode(String(semilla)));
  const v = new DataView(h.buffer);
  const s = [0, 4, 8, 12].map((i) => v.getUint32(i, true));
  if (!s.some(Boolean)) s[0] = 1;
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));

  // Un número de 32 bits
  function siguiente() {
    const resultado = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return resultado;
  }

  const azar = {
    numero: () => siguiente() / 2 ** 32, // [0, 1)
    entero: (n) => Math.floor(azar.numero() * n), // [0, n)
    elegir: (lista) => lista[azar.entero(lista.length)],
    barajar(lista) {
      const copia = lista.slice();
      for (let i = copia.length - 1; i > 0; i--) {
        const j = azar.entero(i + 1);
        [copia[i], copia[j]] = [copia[j], copia[i]];
      }
      return copia;
    }
  };
  return azar;
}
