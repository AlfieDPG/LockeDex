// ---------- FlatBuffers (Espada y Escudo) ----------
//
// Muchos datos de Espada y Escudo (encuentros, regalos, intercambios, tiendas, ataques...) son
// FlatBuffers. Aquí se leen a objetos de JS con un esquema y se vuelven a escribir enteros.
//
// Un esquema es la lista de campos de una tabla, en el orden del .fbs (el orden es el número de
// campo): [nombre, tipo]. Tipos: "u8", "i8", "bool", "u16", "i16", "u32", "i32", "u64", "i64", "f32",
// "f64", "str", un esquema (otra tabla) o { vector: tipo }. Los u64 e i64 son BigInt.
//
// Al escribir, como flatc: los números que valen 0 y lo que es null no se escriben, y las vtables
// iguales se comparten. Las tablas van por delante de lo que cuelga de ellas, así todas las
// referencias apuntan hacia delante.

const TAMANO = { u8: 1, i8: 1, bool: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4, u64: 8, i64: 8, f64: 8 };
const esEscalar = (tipo) => typeof tipo === "string" && tipo in TAMANO;

function leerEscalar(v, pos, tipo) {
  switch (tipo) {
    case "u8": return v.getUint8(pos);
    case "i8": return v.getInt8(pos);
    case "bool": return v.getUint8(pos) !== 0;
    case "u16": return v.getUint16(pos, true);
    case "i16": return v.getInt16(pos, true);
    case "u32": return v.getUint32(pos, true);
    case "i32": return v.getInt32(pos, true);
    case "f32": return v.getFloat32(pos, true);
    case "u64": return v.getBigUint64(pos, true);
    case "i64": return v.getBigInt64(pos, true);
    case "f64": return v.getFloat64(pos, true);
  }
  throw new Error("Tipo desconocido: " + tipo);
}

function ponerEscalar(v, pos, tipo, valor) {
  switch (tipo) {
    case "u8": return v.setUint8(pos, Number(valor) & 0xff);
    case "i8": return v.setInt8(pos, Number(valor));
    case "bool": return v.setUint8(pos, valor ? 1 : 0);
    case "u16": return v.setUint16(pos, Number(valor) & 0xffff, true);
    case "i16": return v.setInt16(pos, Number(valor), true);
    case "u32": return v.setUint32(pos, Number(valor) >>> 0, true);
    case "i32": return v.setInt32(pos, Number(valor) | 0, true);
    case "f32": return v.setFloat32(pos, Number(valor), true);
    case "u64": return v.setBigUint64(pos, BigInt(valor), true);
    case "i64": return v.setBigInt64(pos, BigInt(valor), true);
    case "f64": return v.setFloat64(pos, Number(valor), true);
  }
  throw new Error("Tipo desconocido: " + tipo);
}

// ---------- Leer ----------

function leerTabla(v, t, esquema) {
  const vt = t - v.getInt32(t, true);
  const campos = (v.getUint16(vt, true) - 4) >> 1;
  const obj = {};
  esquema.forEach(([nombre, tipo], k) => {
    const desfase = k < campos ? v.getUint16(vt + 4 + k * 2, true) : 0;
    if (esEscalar(tipo)) {
      obj[nombre] = desfase ? leerEscalar(v, t + desfase, tipo) : tipo === "bool" ? false : tipo === "u64" || tipo === "i64" ? 0n : 0;
      return;
    }
    if (!desfase) {
      obj[nombre] = null;
      return;
    }
    const p = t + desfase;
    obj[nombre] = leerReferencia(v, p + v.getUint32(p, true), tipo);
  });
  // Campos que no están en el esquema: se avisa (se perderían al escribir)
  if (campos > esquema.length) {
    for (let k = esquema.length; k < campos; k++) {
      if (v.getUint16(vt + 4 + k * 2, true)) throw new Error(`FlatBuffer con más campos de los conocidos (${campos} > ${esquema.length})`);
    }
  }
  return obj;
}

function leerReferencia(v, pos, tipo) {
  if (tipo === "str") {
    const largo = v.getUint32(pos, true);
    return new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset + pos + 4, largo));
  }
  if (Array.isArray(tipo)) return leerTabla(v, pos, tipo);
  if (tipo.vector) {
    const n = v.getUint32(pos, true);
    const lista = [];
    const elem = tipo.vector;
    for (let i = 0; i < n; i++) {
      if (esEscalar(elem)) lista.push(leerEscalar(v, pos + 4 + i * TAMANO[elem], elem));
      else {
        const p = pos + 4 + i * 4;
        lista.push(leerReferencia(v, p + v.getUint32(p, true), elem));
      }
    }
    return lista;
  }
  throw new Error("Tipo desconocido");
}

export function leerFB(bytes, esquema) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return leerTabla(v, v.getUint32(0, true), esquema);
}

// ---------- Escribir ----------

class Constructor {
  constructor() {
    this.buf = new Uint8Array(1 << 16);
    this.pos = 0;
    this.vtables = new Map(); // las ya escritas, para no repetirlas
  }
  get v() {
    return new DataView(this.buf.buffer);
  }
  reservar(n) {
    if (this.pos + n <= this.buf.length) return;
    let largo = this.buf.length * 2;
    while (largo < this.pos + n) largo *= 2;
    const nuevo = new Uint8Array(largo);
    nuevo.set(this.buf);
    this.buf = nuevo;
  }
  // Rellena con ceros hasta que pos % modulo === resto
  alinear(modulo, resto = 0) {
    while (this.pos % modulo !== resto) {
      this.reservar(1);
      this.buf[this.pos++] = 0;
    }
  }
  avanzar(n) {
    this.reservar(n);
    const p = this.pos;
    this.pos += n;
    return p;
  }
  // Una referencia (uoffset) en «donde» hacia «destino»
  enlazar(donde, destino) {
    this.v.setUint32(donde, destino - donde, true);
  }
}

// Un número que vale lo de por defecto (0) no se escribe, como hace flatc
const esCero = (v) => v === 0 || v === false || v === 0n || v === undefined || v === null;

function escribirTabla(c, obj, esquema) {
  // Los campos que van: los números que no son 0; lo demás, si no es null
  const van = esquema
    .map(([nombre, tipo], k) => ({ nombre, tipo, k, tam: esEscalar(tipo) ? TAMANO[tipo] : 4 }))
    .filter((f) => (esEscalar(f.tipo) ? !esCero(obj[f.nombre]) : obj[f.nombre] !== null && obj[f.nombre] !== undefined));
  const ultimo = van.reduce((m, f) => Math.max(m, f.k), -1);
  // La tabla: el soffset y, detrás, los campos de mayor a menor (así quedan alineados)
  const orden = van.slice().sort((a, b) => b.tam - a.tam);
  let desfase = 4;
  for (const f of orden) {
    while (desfase % f.tam) desfase++;
    f.desfase = desfase;
    desfase += f.tam;
  }
  const tamTabla = desfase;
  const ocho = orden.some((f) => f.tam === 8);
  // La vtable: si ya hay una igual, esa; si no, una nueva justo antes de la tabla
  const huecos = new Array(ultimo + 1).fill(0);
  for (const f of van) huecos[f.k] = f.desfase;
  const clave = `${tamTabla}:${huecos.join(",")}`;
  let vt = c.vtables.get(clave);
  if (vt === undefined) {
    c.alinear(2);
    vt = c.avanzar(4 + (ultimo + 1) * 2);
    const v = c.v;
    v.setUint16(vt, 4 + (ultimo + 1) * 2, true);
    v.setUint16(vt + 2, tamTabla, true);
    huecos.forEach((d, k) => v.setUint16(vt + 4 + k * 2, d, true));
    c.vtables.set(clave, vt);
  }
  // La tabla empieza en múltiplo de 4 (de 8 tras el soffset, si lleva campos de 8 bytes)
  if (ocho) c.alinear(8, 4);
  else c.alinear(4);
  const t = c.avanzar(tamTabla);
  const v = c.v;
  v.setInt32(t, t - vt, true);
  for (const f of van) if (esEscalar(f.tipo)) ponerEscalar(v, t + f.desfase, f.tipo, obj[f.nombre]);
  // Lo que cuelga, detrás
  for (const f of van) {
    if (esEscalar(f.tipo)) continue;
    const destino = escribirReferencia(c, obj[f.nombre], f.tipo);
    c.enlazar(t + f.desfase, destino);
  }
  return t;
}

function escribirReferencia(c, valor, tipo) {
  if (tipo === "str") {
    const bytes = new TextEncoder().encode(valor);
    c.alinear(4);
    const p = c.avanzar(4 + bytes.length + 1);
    c.v.setUint32(p, bytes.length, true);
    c.buf.set(bytes, p + 4);
    c.buf[p + 4 + bytes.length] = 0;
    return p;
  }
  if (Array.isArray(tipo)) return escribirTabla(c, valor, tipo);
  if (tipo.vector) {
    const elem = tipo.vector;
    if (esEscalar(elem)) {
      const tam = TAMANO[elem];
      // Los elementos (desde p + 4) alineados a su tamaño
      if (tam === 8) c.alinear(8, 4);
      else c.alinear(4);
      const p = c.avanzar(4 + valor.length * tam);
      const v = c.v;
      v.setUint32(p, valor.length, true);
      valor.forEach((x, i) => ponerEscalar(v, p + 4 + i * tam, elem, x));
      return p;
    }
    c.alinear(4);
    const p = c.avanzar(4 + valor.length * 4);
    c.v.setUint32(p, valor.length, true);
    valor.forEach((x, i) => {
      const destino = escribirReferencia(c, x, elem);
      c.enlazar(p + 4 + i * 4, destino);
    });
    return p;
  }
  throw new Error("Tipo desconocido");
}

// ---------- Cambiar en su sitio ----------
//
// Para archivos grandes de los que solo se toca algún número (sin esquema entero): se va de tabla
// en tabla por el número de campo y se cambia el valor donde está. Solo vale si el campo está
// escrito (un número que vale 0 suele no estarlo).

export function raizFB(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
}

// Dónde está el campo k de la tabla que empieza en t (0 si no está)
export function campoFB(bytes, t, k) {
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  const vt = t - v.getInt32(t, true);
  return k < (v.getUint16(vt, true) - 4) >> 1 ? (v.getUint16(vt + 4 + k * 2, true) ? t + v.getUint16(vt + 4 + k * 2, true) : 0) : 0;
}

// Lo que apunta la referencia del campo k de la tabla t (una tabla, un vector...), o 0
export function refFB(bytes, t, k) {
  const p = campoFB(bytes, t, k);
  return p ? p + new DataView(bytes.buffer, bytes.byteOffset).getUint32(p, true) : 0;
}

// Las tablas de un vector de tablas (el campo k de la tabla t)
export function tablasFB(bytes, t, k) {
  const p = refFB(bytes, t, k);
  if (!p) return [];
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return Array.from({ length: v.getUint32(p, true) }, (_, i) => p + 4 + i * 4 + v.getUint32(p + 4 + i * 4, true));
}

export function escribirFB(obj, esquema) {
  const c = new Constructor();
  c.avanzar(4); // la referencia a la raíz
  const raiz = escribirTabla(c, obj, esquema);
  c.enlazar(0, raiz);
  c.alinear(4);
  return c.buf.slice(0, c.pos);
}
