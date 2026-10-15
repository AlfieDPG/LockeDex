// ---------- Scripts de 6.ª generación (AMX de Pawn) ----------
//
// Cada script es un AMX: una cabecera (hasta «cod»; en 0x00 el tamaño del archivo, en 0x04 la marca 0xF1E0, en 0x08 las
// banderas, en 0x0c «cod», en 0x10 «dat», en 0x14 «hea») y, desde «cod», el código y los datos en formato compacto
// (la bandera 0x04): cada celda de 32 bits son de 1 a 5 bytes, de 7 bits cada uno, el primero el más significativo (con
// su bit 6 como signo) y el bit 7 puesto en todos menos en el último.

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
function poner32(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
  b[i + 2] = (v >>> 16) & 0xff;
  b[i + 3] = (v >>> 24) & 0xff;
}

// { cabecera, imagen } (la imagen: las celdas descomprimidas desde «cod», como bytes), o null si no es un AMX compacto
export function leerAmx(b) {
  if (b.length < 0x30 || u16(b, 4) !== 0xf1e0 || !(u16(b, 8) & 4)) return null;
  const cod = u32(b, 12);
  const hea = u32(b, 20);
  const celdas = [];
  for (let i = cod; i < b.length; ) {
    let v = (b[i] & 0x40) !== 0 ? -1 : 0;
    for (;;) {
      v = v * 128 + (b[i] & 0x7f);
      if (!(b[i++] & 0x80)) break;
    }
    celdas.push(v | 0);
  }
  return { cabecera: b.slice(0, cod), cod, dat: u32(b, 16), hea, celdas };
}

// Una celda con signo a sus bytes compactos
function codificar(v, salida) {
  let n = 1;
  while (n < 5 && (v < -Math.pow(2, 7 * n - 1) || v > Math.pow(2, 7 * n - 1) - 1)) n++;
  for (let i = n - 1; i >= 0; i--) {
    const grupo = Math.floor(v / Math.pow(2, 7 * i)) & 0x7f;
    salida.push(i > 0 ? grupo | 0x80 : grupo);
  }
}

// El archivo AMX con sus celdas (iguales o cambiadas)
export function escribirAmx(amx) {
  const bytes = [];
  for (const v of amx.celdas) codificar(v, bytes);
  const salida = new Uint8Array(amx.cabecera.length + bytes.length);
  salida.set(amx.cabecera);
  salida.set(bytes, amx.cabecera.length);
  poner32(salida, 0, salida.length);
  return salida;
}

// Un u16 de la imagen descomprimida (desde "cod"), por su posición en bytes
export function leer16(amx, pos) {
  return ((amx.celdas[pos >> 2] >>> ((pos & 2) * 8)) & 0xffff);
}

export function poner16(amx, pos, valor) {
  const desplazo = (pos & 2) * 8;
  amx.celdas[pos >> 2] = (amx.celdas[pos >> 2] & ~(0xffff << desplazo)) | ((valor & 0xffff) << desplazo);
}
