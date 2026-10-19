// ---------- GFPAK (Espada y Escudo) ----------
//
// Paquetes de archivos de Game Freak («GFLXPACK»). Cada archivo va por su nombre como hash
// (FNV-1a de 64 bits) y casi siempre comprimido con LZ4 (bloque suelto, sin cabecera).
//
//   0x00 «GFLXPACK»  0x08 u32 versión  0x0c u32  0x10 u32 archivos  0x14 u32 carpetas
//   0x18 u64 dónde está la tabla de archivos  0x20 u64 dónde están los hashes de las rutas
//   0x28 u64 × carpetas: dónde está cada carpeta (u64 hash, u32 cuántos, u32; y por archivo
//   [u64 hash del nombre, u32 número, u32])
//   tabla de archivos: 0x18 bytes cada uno: u16, u8 compresión (0 nada, 1 zlib, 2 LZ4...),
//   u32 tamaño, u32 comprimido (en 0x08), u32 dónde (en 0x10)

const LZ4 = 2;

// FNV-1a de 64 bits de un nombre de archivo
export function fnv1a64(texto) {
  let h = 0xcbf29ce484222645n;
  for (let i = 0; i < texto.length; i++) {
    h ^= BigInt(texto.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h;
}

// ---------- LZ4 ----------

export function descomprimirLZ4(src, tam) {
  const dst = new Uint8Array(tam);
  let i = 0;
  let o = 0;
  while (i < src.length) {
    const token = src[i++];
    let literales = token >> 4;
    if (literales === 15) {
      let b;
      do {
        b = src[i++];
        literales += b;
      } while (b === 255);
    }
    dst.set(src.subarray(i, i + literales), o);
    i += literales;
    o += literales;
    if (i >= src.length) break;
    const distancia = src[i] | (src[i + 1] << 8);
    i += 2;
    let largo = token & 15;
    if (largo === 15) {
      let b;
      do {
        b = src[i++];
        largo += b;
      } while (b === 255);
    }
    largo += 4;
    for (let k = 0; k < largo; k++, o++) dst[o] = dst[o - distancia];
  }
  if (o !== tam) throw new Error("LZ4: tamaño inesperado");
  return dst;
}

// Comprime buscando repeticiones de 4 bytes (con una tabla de dónde se vio cada una por última vez)
export function comprimirLZ4(src) {
  const n = src.length;
  const salida = [];
  const longitud = (v) => {
    while (v >= 255) {
      salida.push(255);
      v -= 255;
    }
    salida.push(v);
  };
  const emitir = (desde, hasta, distancia, largo) => {
    const lit = hasta - desde;
    const m = largo ? largo - 4 : 0;
    salida.push(((lit >= 15 ? 15 : lit) << 4) | (largo ? (m >= 15 ? 15 : m) : 0));
    if (lit >= 15) longitud(lit - 15);
    for (let k = desde; k < hasta; k++) salida.push(src[k]);
    if (!largo) return;
    salida.push(distancia & 0xff, distancia >> 8);
    if (m >= 15) longitud(m - 15);
  };
  const tabla = new Int32Array(1 << 16).fill(-1);
  const clave = (p) => (Math.imul(src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24), 2654435761) >>> 16);
  // Las reglas del formato: las 5 últimas son siempre literales y no empieza nada en las 12 últimas
  const tope = n - 12;
  const finCoincidencia = n - 5;
  let ancla = 0;
  let p = 0;
  while (p < tope) {
    const h = clave(p);
    const r = tabla[h];
    tabla[h] = p;
    if (r >= 0 && p - r <= 0xffff && src[r] === src[p] && src[r + 1] === src[p + 1] && src[r + 2] === src[p + 2] && src[r + 3] === src[p + 3]) {
      let largo = 4;
      while (p + largo < finCoincidencia && src[r + largo] === src[p + largo]) largo++;
      emitir(ancla, p, p - r, largo);
      p += largo;
      ancla = p;
    } else p++;
  }
  emitir(ancla, n, 0, 0);
  return Uint8Array.from(salida);
}

// ---------- El paquete ----------

const u32 = (v, i) => v.getUint32(i, true);

export function leerGfpak(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder("latin1").decode(bytes.subarray(0, 8)) !== "GFLXPACK") throw new Error("No es un GFPAK");
  const cuantos = u32(v, 0x10);
  const carpetas = u32(v, 0x14);
  const tabla = Number(v.getBigUint64(0x18, true));
  const nombres = new Map(); // hash del nombre -> número
  for (let c = 0; c < carpetas; c++) {
    const p = Number(v.getBigUint64(0x28 + c * 8, true));
    const n = u32(v, p + 8);
    for (let k = 0; k < n; k++) nombres.set(v.getBigUint64(p + 0x10 + k * 0x10, true), u32(v, p + 0x10 + k * 0x10 + 8));
  }
  const entradas = [];
  for (let i = 0; i < cuantos; i++) {
    const o = tabla + i * 0x18;
    entradas.push({ tipo: v.getUint8(o + 2), tam: u32(v, o + 4), comprimido: u32(v, o + 8), desde: u32(v, o + 0x10) });
  }
  const cache = new Map();
  return {
    bytes, tabla, entradas,
    indice(nombre) {
      const i = nombres.get(fnv1a64(nombre));
      if (i === undefined) throw new Error("No está en el GFPAK: " + nombre);
      return i;
    },
    archivo(i) {
      if (!cache.has(i)) {
        const e = entradas[i];
        const crudo = bytes.subarray(e.desde, e.desde + e.comprimido);
        if (e.tipo === 0) cache.set(i, crudo.slice());
        else if (e.tipo === LZ4) cache.set(i, descomprimirLZ4(crudo, e.tam));
        else throw new Error("Compresión de GFPAK que no se sabe leer: " + e.tipo);
      }
      return cache.get(i).slice();
    },
    porNombre(nombre) {
      return this.archivo(this.indice(nombre));
    }
  };
}

// El paquete con algunos archivos cambiados (nuevos: { número: bytes }). La cabecera y las tablas
// se copian tal cual; los datos van detrás, de 0x10 en 0x10, y los cambiados, comprimidos otra vez.
export function escribirGfpak(pack, nuevos) {
  const { bytes, tabla, entradas } = pack;
  const inicio = Math.min(...entradas.map((e) => e.desde));
  const partes = entradas.map((e, i) => (nuevos[i] ? comprimirLZ4(nuevos[i]) : bytes.subarray(e.desde, e.desde + e.comprimido)));
  let total = inicio;
  const sitios = partes.map((p) => {
    const s = total;
    total = Math.ceil((total + p.length) / 0x10) * 0x10;
    return s;
  });
  const salida = new Uint8Array(total);
  salida.set(bytes.subarray(0, inicio));
  const v = new DataView(salida.buffer);
  partes.forEach((p, i) => {
    salida.set(p, sitios[i]);
    const o = tabla + i * 0x18;
    if (nuevos[i]) {
      v.setUint8(o + 2, LZ4);
      v.setUint32(o + 4, nuevos[i].length, true);
    }
    v.setUint32(o + 8, p.length, true);
    v.setUint32(o + 0x10, sitios[i], true);
  });
  return salida;
}
