// ---------- La firma de las partidas de Sol / Luna y Ultrasol / Ultraluna ----------
//
// Gen 7 firma la tabla de checksums del final de la partida (lo que Game Freak llama
// «MemeCrypto»). En un trozo de 0x80 bytes (0x6BB00 en Sol / Luna, 0x6C100 en USUM) van:
//
//   [0x00..0x20]  SHA-256 de la tabla de checksums (0x140 o 0x150 bytes desde el final - 0x200)
//   [0x20..0x80]  la firma: los 0x78 primeros bytes más 8 del SHA-1 de ellos, cifrados con AES
//                 (clave: SHA-1 de la clave pública + los 0x20 primeros bytes) en un modo propio,
//                 y luego con la clave RSA privada (la de las partidas y la Pokédex, que se conoce)
//
// El bloque que la lleva calcula su checksum con este trozo a ceros, antes de firmar.
//
// Todo síncrono y sin librerías: SHA-1, SHA-256, AES-128 y RSA (con BigInt) van aquí.
// Comprobado verificando la firma de partidas reales de Sol y Ultrasol.

// ---------- Clave (pública en DER, con el módulo dentro, y exponente privado) ----------

const hexA = (texto) => Uint8Array.from(texto.match(/../g), (h) => parseInt(h, 16));

const DER = hexA(
  "307c300d06092a864886f70d0101010500036b003068026100" +
  "b61e192091f90a8f76a6eaaa9a3ce58c863f39ae253f037816f5975854e07a9a" +
  "456601e7c94c29759fe155c064eddfa111443f81ef1a428cf6cd32f9dac9d48e" +
  "94cfb3f690120e8e6b9111addaf11e7c96208c37c0143ff2bf3d7e831141a973" +
  "0203010001"
);
const PRIVADO = hexA(
  "00775455668fff3cba3026c2d0b26b8085895958341157aeb03b6b0495ee5780" +
  "3e2186eb6cb2eb62a71df18a3c9c6579077670961b3a6102dabe5a194ab58c32" +
  "50aed597fc78978a326db1d7b28dcccb2a3e014edbd397ad33b8f28cd525054251"
);

const aNumero = (bytes) => bytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);
const N = aNumero(DER.subarray(0x18, 0x18 + 0x61));
const E = aNumero(DER.subarray(0x7b, 0x7e));
const D = aNumero(PRIVADO);

export const LARGO_FIRMA = 0x80;
const LARGO_RSA = 0x60;

function potencia(base, exponente, modulo) {
  let resultado = 1n;
  base %= modulo;
  while (exponente > 0n) {
    if (exponente & 1n) resultado = (resultado * base) % modulo;
    base = (base * base) % modulo;
    exponente >>= 1n;
  }
  return resultado;
}

// RSA sobre 0x60 bytes (big-endian, con ceros delante si hace falta)
function rsa(bytes, exponente) {
  let n = potencia(aNumero(bytes), exponente, N);
  const salida = new Uint8Array(LARGO_RSA);
  for (let i = LARGO_RSA - 1; i >= 0; i--) {
    salida[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return salida;
}

// ---------- SHA-1 y SHA-256 ----------

function rellenar(datos) {
  const largo = Math.ceil((datos.length + 9) / 64) * 64;
  const m = new Uint8Array(largo);
  m.set(datos);
  m[datos.length] = 0x80;
  const bits = datos.length * 8;
  const v = new DataView(m.buffer);
  v.setUint32(largo - 8, Math.floor(bits / 2 ** 32));
  v.setUint32(largo - 4, bits >>> 0);
  return v;
}

const rotl = (x, n) => (x << n) | (x >>> (32 - n));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha1(datos) {
  const v = rellenar(datos);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Int32Array(80);
  for (let bloque = 0; bloque < v.byteLength; bloque += 64) {
    for (let i = 0; i < 16; i++) w[i] = v.getInt32(bloque + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20 ? [(b & c) | (~b & d), 0x5a827999] :
        i < 40 ? [b ^ c ^ d, 0x6ed9eba1] :
        i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] :
        [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      [e, d, c, b, a] = [d, c, rotl(b, 30), a, t];
    }
    [a, b, c, d, e].forEach((x, i) => (h[i] = (h[i] + x) | 0));
  }
  const salida = new DataView(new ArrayBuffer(20));
  h.forEach((x, i) => salida.setInt32(i * 4, x));
  return new Uint8Array(salida.buffer);
}

// Las constantes de SHA-256 salen de las raíces de los primeros primos
const PRIMOS = [];
for (let n = 2; PRIMOS.length < 64; n++) if (PRIMOS.every((p) => n % p)) PRIMOS.push(n);
const fraccion = (x) => ((x - Math.floor(x)) * 2 ** 32) | 0;
const K256 = PRIMOS.map((p) => fraccion(Math.cbrt(p)));
const H256 = PRIMOS.slice(0, 8).map((p) => fraccion(Math.sqrt(p)));

export function sha256(datos) {
  const v = rellenar(datos);
  const h = H256.slice();
  const w = new Int32Array(64);
  for (let bloque = 0; bloque < v.byteLength; bloque += 64) {
    for (let i = 0; i < 16; i++) w[i] = v.getInt32(bloque + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
    }
    [a, b, c, d, e, f, g, hh].forEach((x, i) => (h[i] = (h[i] + x) | 0));
  }
  const salida = new DataView(new ArrayBuffer(32));
  h.forEach((x, i) => salida.setInt32(i * 4, x));
  return new Uint8Array(salida.buffer);
}

// ---------- AES-128 (un bloque) ----------

const SBOX = new Uint8Array(256);
const SBOX_INV = new Uint8Array(256);
{
  // La S-box sale del inverso en GF(2^8) y la transformación afín
  let p = 1;
  let q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 0xff;
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const r = (x, n) => ((x << n) | (x >> (8 - n))) & 0xff;
    SBOX[p] = q ^ r(q, 1) ^ r(q, 2) ^ r(q, 3) ^ r(q, 4) ^ 0x63;
  } while (p !== 1);
  SBOX[0] = 0x63;
  SBOX.forEach((s, i) => (SBOX_INV[s] = i));
}

const xtime = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
function mul(a, b) {
  let r = 0;
  for (; b; b >>= 1, a = xtime(a)) if (b & 1) r ^= a;
  return r;
}

function expandirClave(clave) {
  const w = new Uint8Array(176);
  w.set(clave);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t = w.slice(i - 4, i);
    if (i % 16 === 0) {
      t = Uint8Array.of(SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]);
      rcon = xtime(rcon);
    }
    for (let k = 0; k < 4; k++) w[i + k] = w[i - 16 + k] ^ t[k];
  }
  return w;
}

// El estado va por columnas: el byte (fila r, columna c) está en c * 4 + r
const FILAS = (s, desplazar) => {
  const t = s.slice();
  for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c + desplazar * r + 4 * 4) % 4) * 4 + r];
};

function cifrarBloque(w, entrada) {
  const s = entrada.slice();
  for (let i = 0; i < 16; i++) s[i] ^= w[i];
  for (let ronda = 1; ronda <= 10; ronda++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    FILAS(s, 1);
    if (ronda < 10) {
      for (let c = 0; c < 16; c += 4) {
        const [a, b, cc, d] = s.slice(c, c + 4);
        s[c] = xtime(a) ^ mul(b, 3) ^ cc ^ d;
        s[c + 1] = a ^ xtime(b) ^ mul(cc, 3) ^ d;
        s[c + 2] = a ^ b ^ xtime(cc) ^ mul(d, 3);
        s[c + 3] = mul(a, 3) ^ b ^ cc ^ xtime(d);
      }
    }
    for (let i = 0; i < 16; i++) s[i] ^= w[ronda * 16 + i];
  }
  return s;
}

function descifrarBloque(w, entrada) {
  const s = entrada.slice();
  for (let i = 0; i < 16; i++) s[i] ^= w[160 + i];
  for (let ronda = 9; ronda >= 0; ronda--) {
    FILAS(s, -1);
    for (let i = 0; i < 16; i++) s[i] = SBOX_INV[s[i]];
    for (let i = 0; i < 16; i++) s[i] ^= w[ronda * 16 + i];
    if (ronda > 0) {
      for (let c = 0; c < 16; c += 4) {
        const [a, b, cc, d] = s.slice(c, c + 4);
        s[c] = mul(a, 14) ^ mul(b, 11) ^ mul(cc, 13) ^ mul(d, 9);
        s[c + 1] = mul(a, 9) ^ mul(b, 14) ^ mul(cc, 11) ^ mul(d, 13);
        s[c + 2] = mul(a, 13) ^ mul(b, 9) ^ mul(cc, 14) ^ mul(d, 11);
        s[c + 3] = mul(a, 11) ^ mul(b, 13) ^ mul(cc, 9) ^ mul(d, 14);
      }
    }
  }
  return s;
}

// ---------- El cifrado de la firma ----------
//
// Sobre los 0x60 bytes de la firma, en trozos de 16: CBC hacia delante, un XOR con una subclave
// (el XOR del primer y último trozo, desplazado un bit a la izquierda como en CMAC) y otro CBC
// hacia atrás. La clave AES: los 16 primeros bytes del SHA-1 de la clave pública y lo que va
// delante de la firma.

const TROZO = 16;

function xor(a, b) {
  for (let i = 0; i < a.length; i++) a[i] ^= b[i];
}

function subclave(t) {
  const s = new Uint8Array(TROZO);
  for (let i = 0; i < TROZO; i++) s[i] = ((t[i] << 1) | (i + 1 < TROZO ? t[i + 1] >> 7 : 0)) & 0xff;
  if (t[0] & 0x80) s[TROZO - 1] ^= 0x87;
  return s;
}

function claveAes(delante) {
  const datos = new Uint8Array(DER.length + delante.length);
  datos.set(DER);
  datos.set(delante, DER.length);
  return expandirClave(sha1(datos).subarray(0, TROZO));
}

function trozos(firma) {
  return Array.from({ length: firma.length / TROZO }, (_, i) => firma.subarray(i * TROZO, (i + 1) * TROZO));
}

function cifrarFirma(w, firma) {
  const t = trozos(firma);
  let anterior = new Uint8Array(TROZO);
  for (const trozo of t) {
    xor(trozo, anterior);
    trozo.set(cifrarBloque(w, trozo));
    anterior = trozo.slice();
  }
  const mezcla = anterior.slice();
  xor(mezcla, t[0]);
  const sub = subclave(mezcla);
  for (const trozo of t) xor(trozo, sub);
  let siguiente = new Uint8Array(TROZO);
  for (let i = t.length - 1; i >= 0; i--) {
    const original = t[i].slice();
    t[i].set(cifrarBloque(w, t[i]));
    xor(t[i], siguiente);
    siguiente = original;
  }
}

function descifrarFirma(w, firma) {
  const t = trozos(firma);
  let siguiente = new Uint8Array(TROZO);
  for (let i = t.length - 1; i >= 0; i--) {
    xor(siguiente, t[i]);
    siguiente = descifrarBloque(w, siguiente);
    t[i].set(siguiente);
  }
  const mezcla = siguiente.slice();
  xor(mezcla, t[t.length - 1]);
  const sub = subclave(mezcla);
  for (const trozo of t) xor(trozo, sub);
  let anterior = new Uint8Array(TROZO);
  for (const trozo of t) {
    const original = trozo.slice();
    trozo.set(descifrarBloque(w, trozo));
    xor(trozo, anterior);
    anterior = original;
  }
}

// ---------- Firmar y comprobar 0x80 bytes ----------

// Lo que hay debajo de una firma (los 0x80 bytes en claro), o null si no es válida
export function abrirFirma(trozo) {
  const delante = trozo.subarray(0, LARGO_FIRMA - LARGO_RSA);
  const descifrada = rsa(trozo.subarray(LARGO_FIRMA - LARGO_RSA), E);
  for (const alto of [false, true]) {
    const datos = trozo.slice();
    datos.set(descifrada, LARGO_FIRMA - LARGO_RSA);
    if (alto) datos[LARGO_FIRMA - LARGO_RSA] |= 0x80; // al firmar se quita este bit
    descifrarFirma(claveAes(delante), datos.subarray(LARGO_FIRMA - LARGO_RSA));
    const resumen = sha1(datos.subarray(0, LARGO_FIRMA - 8)).subarray(0, 8);
    if (resumen.every((b, i) => b === datos[LARGO_FIRMA - 8 + i])) return datos;
  }
  return null;
}

// Firma los 0x80 bytes (en claro) y los devuelve firmados
export function cerrarFirma(claro) {
  const datos = claro.slice();
  datos.set(sha1(datos.subarray(0, LARGO_FIRMA - 8)).subarray(0, 8), LARGO_FIRMA - 8);
  const firma = datos.subarray(LARGO_FIRMA - LARGO_RSA);
  cifrarFirma(claveAes(datos.subarray(0, LARGO_FIRMA - LARGO_RSA)), firma);
  firma[0] &= 0x7f; // que quede por debajo del módulo
  firma.set(rsa(firma, D));
  return datos;
}

// ---------- En la partida ----------

// La tabla de checksums que se firma: [inicio, largo]
export function zonaTabla(bytes, usum) {
  return [bytes.length - 0x200, usum ? 0x150 : 0x140];
}

// Firma otra vez la partida (con la tabla de checksums ya puesta al día). Lo que iba en claro
// detrás del SHA-256 se conserva si la firma anterior era válida.
export function firmar(bytes, posicion, usum) {
  const anterior = abrirFirma(bytes.subarray(posicion, posicion + LARGO_FIRMA));
  const claro = anterior || new Uint8Array(LARGO_FIRMA);
  const [inicio, largo] = zonaTabla(bytes, usum);
  claro.set(sha256(bytes.subarray(inicio, inicio + largo)), 0);
  bytes.set(cerrarFirma(claro), posicion);
}
