// ---------- Bundles de Unity (Diamante Brillante y Perla Reluciente) ----------
//
// Los datos de BDSP van en «asset bundles» de Unity (UnityFS) con objetos MonoBehaviour. Cada
// bundle lleva dentro un archivo serializado (CAB-...) con la descripción de cada tipo (el árbol de
// tipos), así que cualquier objeto se puede leer a un objeto de JS y volver a escribir.
//
//   UnityFS: «UnityFS», u32 versión (7), versión de Unity, u64 tamaño, u32 info comprimida, u32 info,
//   u32 marcas (0x3F compresión de la info: 0 nada, 2-3 LZ4; 0x80 la info va al final); en la 7, se
//   alinea a 16. La info: 16 bytes, u32 bloques [u32 tamaño, u32 comprimido, u16 marcas], u32 nodos
//   [u64 desde, u64 tamaño, u32 marcas, ruta]. Todo en big endian. Los bloques, seguidos, son un solo
//   flujo de datos de donde salen los nodos.
//   Serializado (versión 21): cabecera big endian, metadatos en little endian (tipos con su árbol,
//   objetos, scripts, externos) y los datos de los objetos desde dataOffset, alineados a 8.

import { descomprimirLZ4, comprimirLZ4 } from "./gfpak.js";

// ---------- Leer y escribir números ----------

class Lector {
  constructor(bytes, pos = 0, grande = false) {
    this.b = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
    this.grande = grande; // big endian
  }
  u8() { return this.b[this.pos++]; }
  i8() { return this.v.getInt8(this.pos++); }
  u16() { const x = this.v.getUint16(this.pos, !this.grande); this.pos += 2; return x; }
  i16() { const x = this.v.getInt16(this.pos, !this.grande); this.pos += 2; return x; }
  u32() { const x = this.v.getUint32(this.pos, !this.grande); this.pos += 4; return x; }
  i32() { const x = this.v.getInt32(this.pos, !this.grande); this.pos += 4; return x; }
  u64() { const x = this.v.getBigUint64(this.pos, !this.grande); this.pos += 8; return x; }
  i64() { const x = this.v.getBigInt64(this.pos, !this.grande); this.pos += 8; return x; }
  f32() { const x = this.v.getFloat32(this.pos, !this.grande); this.pos += 4; return x; }
  f64() { const x = this.v.getFloat64(this.pos, !this.grande); this.pos += 8; return x; }
  bytes(n) { const x = this.b.subarray(this.pos, this.pos + n); this.pos += n; return x; }
  cadena() {
    let fin = this.pos;
    while (this.b[fin]) fin++;
    const s = new TextDecoder().decode(this.b.subarray(this.pos, fin));
    this.pos = fin + 1;
    return s;
  }
  alinear(n = 4) { this.pos = Math.ceil(this.pos / n) * n; }
}

class Escritor {
  constructor(grande = false) {
    this.buf = new Uint8Array(1 << 16);
    this.pos = 0;
    this.grande = grande;
  }
  reservar(n) {
    if (this.pos + n <= this.buf.length) return;
    let largo = this.buf.length * 2;
    while (largo < this.pos + n) largo *= 2;
    const nuevo = new Uint8Array(largo);
    nuevo.set(this.buf.subarray(0, this.pos));
    this.buf = nuevo;
  }
  dv(n) { this.reservar(n); const v = new DataView(this.buf.buffer, this.pos, n); this.pos += n; return v; }
  u8(x) { this.reservar(1); this.buf[this.pos++] = x & 0xff; }
  i8(x) { this.dv(1).setInt8(0, x); }
  u16(x) { this.dv(2).setUint16(0, x, !this.grande); }
  i16(x) { this.dv(2).setInt16(0, x, !this.grande); }
  u32(x) { this.dv(4).setUint32(0, x >>> 0, !this.grande); }
  i32(x) { this.dv(4).setInt32(0, x | 0, !this.grande); }
  u64(x) { this.dv(8).setBigUint64(0, BigInt(x), !this.grande); }
  i64(x) { this.dv(8).setBigInt64(0, BigInt(x), !this.grande); }
  f32(x) { this.dv(4).setFloat32(0, x, !this.grande); }
  f64(x) { this.dv(8).setFloat64(0, x, !this.grande); }
  bytes(b) { this.reservar(b.length); this.buf.set(b, this.pos); this.pos += b.length; }
  cadena(s) { this.bytes(new TextEncoder().encode(s)); this.u8(0); }
  alinear(n = 4) { while (this.pos % n) this.u8(0); }
  final() { return this.buf.slice(0, this.pos); }
}

// ---------- El bundle ----------

function descomprimir(datos, tam, tipo) {
  if (tipo === 0) return datos.slice();
  if (tipo === 2 || tipo === 3) return descomprimirLZ4(datos, tam);
  throw new Error("Compresión de Unity que no se sabe leer: " + tipo);
}

// { cabecera, nodos: [{ ruta, marcas, datos }] }
export function leerBundle(bytes) {
  const r = new Lector(bytes, 0, true);
  if (r.cadena() !== "UnityFS") throw new Error("No es un bundle de Unity");
  const version = r.u32();
  const versionMotor = r.cadena();
  const revision = r.cadena();
  r.u64(); // tamaño
  const infoComprimida = r.u32();
  const infoTam = r.u32();
  const marcas = r.u32();
  if (version >= 7) r.alinear(16);
  const infoDesde = marcas & 0x80 ? bytes.length - infoComprimida : r.pos;
  const info = new Lector(descomprimir(bytes.subarray(infoDesde, infoDesde + infoComprimida), infoTam, marcas & 0x3f), 0, true);
  if (!(marcas & 0x80)) r.pos += infoComprimida;
  if (marcas & 0x200) r.alinear(16);
  info.bytes(16);
  const bloques = [];
  for (let i = info.u32(); i > 0; i--) bloques.push({ tam: info.u32(), comprimido: info.u32(), marcas: info.u16() });
  const nodos = [];
  for (let i = info.u32(); i > 0; i--) nodos.push({ desde: Number(info.u64()), tam: Number(info.u64()), marcas: info.u32(), ruta: info.cadena() });
  // Todos los bloques, seguidos
  const total = bloques.reduce((s, b) => s + b.tam, 0);
  const flujo = new Uint8Array(total);
  let o = 0;
  for (const b of bloques) {
    flujo.set(descomprimir(r.bytes(b.comprimido), b.tam, b.marcas & 0x3f), o);
    o += b.tam;
  }
  return {
    cabecera: { version, versionMotor, revision, marcas },
    nodos: nodos.map((n) => ({ ruta: n.ruta, marcas: n.marcas, datos: flujo.subarray(n.desde, n.desde + n.tam) }))
  };
}

const TAM_BLOQUE = 0x20000;

// El bundle otra vez, con los datos de los nodos que se den (en bloques LZ4 de 128 KB, como los del juego)
export function escribirBundle(bundle) {
  const total = bundle.nodos.reduce((s, n) => s + n.datos.length, 0);
  const flujo = new Uint8Array(total);
  const desde = [];
  let o = 0;
  for (const n of bundle.nodos) {
    desde.push(o);
    flujo.set(n.datos, o);
    o += n.datos.length;
  }
  const bloques = [];
  for (let p = 0; p < total; p += TAM_BLOQUE) {
    const crudo = flujo.subarray(p, Math.min(total, p + TAM_BLOQUE));
    const lz = comprimirLZ4(crudo);
    bloques.push(lz.length < crudo.length ? { tam: crudo.length, datos: lz, marcas: 2 } : { tam: crudo.length, datos: crudo, marcas: 0 });
  }
  const info = new Escritor(true);
  info.bytes(new Uint8Array(16));
  info.u32(bloques.length);
  for (const b of bloques) {
    info.u32(b.tam);
    info.u32(b.datos.length);
    info.u16(b.marcas);
  }
  info.u32(bundle.nodos.length);
  bundle.nodos.forEach((n, i) => {
    info.u64(desde[i]);
    info.u64(n.datos.length);
    info.u32(n.marcas);
    info.cadena(n.ruta);
  });
  const infoBytes = info.final();
  const { version, versionMotor, revision } = bundle.cabecera;
  const w = new Escritor(true);
  w.cadena("UnityFS");
  w.u32(version);
  w.cadena(versionMotor);
  w.cadena(revision);
  const sitioTam = w.pos;
  w.u64(0);
  w.u32(infoBytes.length); // la info, sin comprimir
  w.u32(infoBytes.length);
  w.u32(0x40); // info junto a los bloques, sin comprimir
  if (version >= 7) w.alinear(16);
  w.bytes(infoBytes);
  for (const b of bloques) w.bytes(b.datos);
  const salida = w.final();
  new DataView(salida.buffer).setBigUint64(sitioTam, BigInt(salida.length));
  return salida;
}

// ---------- El archivo serializado ----------

// Las cadenas comunes de Unity (las que tienen el bit alto en el árbol de tipos), en su orden
const COMUNES = [
  "AABB", "AnimationClip", "AnimationCurve", "AnimationState", "Array", "Base", "BitField", "bitset", "bool", "char",
  "ColorRGBA", "Component", "data", "deque", "double", "dynamic_array", "FastPropertyName", "first", "float", "Font",
  "GameObject", "Generic Mono", "GradientNEW", "GUID", "GUIStyle", "int", "list", "long long", "map", "Matrix4x4f",
  "MdFour", "MonoBehaviour", "MonoScript", "m_ByteSize", "m_Curve", "m_EditorClassIdentifier", "m_EditorHideFlags",
  "m_Enabled", "m_ExtensionPtr", "m_GameObject", "m_Index", "m_IsArray", "m_IsStatic", "m_MetaFlag", "m_Name",
  "m_ObjectHideFlags", "m_PrefabInternal", "m_PrefabParentObject", "m_Script", "m_StaticEditorFlags", "m_Type",
  "m_Version", "Object", "pair", "PPtr<Component>", "PPtr<GameObject>", "PPtr<Material>", "PPtr<MonoBehaviour>",
  "PPtr<MonoScript>", "PPtr<Object>", "PPtr<Prefab>", "PPtr<Sprite>", "PPtr<TextAsset>", "PPtr<Texture>",
  "PPtr<Texture2D>", "PPtr<Transform>", "Prefab", "Quaternionf", "Rectf", "RectInt", "RectOffset", "second", "set",
  "short", "size", "SInt16", "SInt32", "SInt64", "SInt8", "staticvector", "string", "TextAsset", "TextMesh", "Texture",
  "Texture2D", "Transform", "TypelessData", "UInt16", "UInt32", "UInt64", "UInt8", "unsigned int", "unsigned long long",
  "unsigned short", "vector", "Vector2f", "Vector3f", "Vector4f", "m_ScriptingClassIdentifier", "Gradient", "Type*",
  "int2_storage", "int3_storage", "BoundsInt", "m_CorrespondingSourceObject", "m_PrefabInstance", "m_PrefabAsset",
  "FileSize", "Hash128"
];
let comunes = null;
function cadenaComun(desfase) {
  if (!comunes) {
    comunes = new Map();
    let o = 0;
    for (const s of COMUNES) {
      comunes.set(o, s);
      o += s.length + 1;
    }
  }
  const s = comunes.get(desfase);
  if (s === undefined) throw new Error("Cadena común de Unity desconocida: " + desfase);
  return s;
}

// El árbol de un tipo: nodos { tipo, nombre, tam, marca, hijos }
function leerArbol(r, version) {
  const cuantos = r.i32();
  const tamCadenas = r.i32();
  const planos = [];
  for (let i = 0; i < cuantos; i++) {
    const n = { version: r.u16(), nivel: r.u8(), marcasTipo: r.u8(), tipoDesde: r.u32(), nombreDesde: r.u32(), tam: r.i32(), indice: r.i32(), marca: r.i32() };
    if (version >= 19) r.u64();
    planos.push(n);
  }
  const cadenas = r.bytes(tamCadenas);
  const cadena = (d) => {
    if (d & 0x80000000) return cadenaComun(d & 0x7fffffff);
    let fin = d;
    while (cadenas[fin]) fin++;
    return new TextDecoder().decode(cadenas.subarray(d, fin));
  };
  const pila = [];
  let raiz = null;
  for (const p of planos) {
    const nodo = { tipo: cadena(p.tipoDesde), nombre: cadena(p.nombreDesde), tam: p.tam, marca: p.marca, hijos: [] };
    pila.length = p.nivel;
    if (p.nivel === 0) raiz = nodo;
    else pila[p.nivel - 1].hijos.push(nodo);
    pila[p.nivel] = nodo;
  }
  return raiz;
}

// { version, cabecera, tipos, objetos: [{ id, desde, tam, tipo }], datos, metadatos... }
export function leerSerializado(bytes) {
  const c = new Lector(bytes, 0, true);
  const tamMeta = c.u32();
  c.u32(); // tamaño
  const version = c.u32();
  const datosDesde = c.u32();
  if (version < 17 || version > 21) throw new Error("Versión de archivo serializado de Unity que no se sabe leer: " + version);
  const grande = c.u8() !== 0;
  c.bytes(3);
  const r = new Lector(bytes, c.pos, grande);
  const versionMotor = r.cadena();
  r.i32(); // plataforma
  const conArbol = r.u8() !== 0;
  if (!conArbol) throw new Error("El bundle no trae los árboles de tipos");
  const tipos = [];
  for (let i = r.i32(); i > 0; i--) {
    const t = { clase: r.i32(), recortado: r.u8(), script: r.i16() };
    if (t.clase === 114) r.bytes(16);
    r.bytes(16);
    t.arbol = leerArbol(r, version);
    if (version >= 21) r.bytes(4 * r.i32());
    tipos.push(t);
  }
  const objetos = [];
  const cuantos = r.i32();
  for (let i = 0; i < cuantos; i++) {
    r.alinear(4);
    const sitio = r.pos;
    objetos.push({ id: r.i64(), desde: r.u32(), tam: r.u32(), tipo: r.i32(), sitio });
  }
  return { bytes, version, grande, versionMotor, datosDesde, tamMeta, tipos, objetos };
}

// Los datos de un objeto
export function datosObjeto(sf, obj) {
  return sf.bytes.subarray(sf.datosDesde + obj.desde, sf.datosDesde + obj.desde + obj.tam);
}

// El archivo serializado con algunos objetos cambiados (nuevos: Map id -> bytes). Los metadatos
// no cambian de tamaño: solo dónde empieza y cuánto ocupa cada objeto
export function escribirSerializado(sf, nuevos) {
  const orden = sf.objetos.slice().sort((a, b) => a.desde - b.desde);
  const partes = [];
  let pos = 0;
  const sitios = new Map();
  for (const o of orden) {
    while (pos % 8) pos++;
    const d = nuevos.get(o.id) || datosObjeto(sf, o);
    sitios.set(o, { desde: pos, tam: d.length });
    partes.push([pos, d]);
    pos += d.length;
  }
  const salida = new Uint8Array(sf.datosDesde + pos);
  salida.set(sf.bytes.subarray(0, sf.datosDesde));
  for (const [p, d] of partes) salida.set(d, sf.datosDesde + p);
  const v = new DataView(salida.buffer);
  v.setUint32(4, salida.length, false);
  for (const [o, s] of sitios) {
    v.setUint32(o.sitio + 8, s.desde, !sf.grande);
    v.setUint32(o.sitio + 12, s.tam, !sf.grande);
  }
  return salida;
}

// ---------- Objetos por su árbol de tipos ----------

const ALINEAR = 0x4000;

function leerValor(r, nodo) {
  let alinear = (nodo.marca & ALINEAR) !== 0;
  let valor;
  switch (nodo.tipo) {
    case "SInt8": valor = r.i8(); break;
    case "UInt8": case "char": valor = r.u8(); break;
    case "bool": valor = r.u8() !== 0; break;
    case "SInt16": case "short": valor = r.i16(); break;
    case "UInt16": case "unsigned short": valor = r.u16(); break;
    case "SInt32": case "int": valor = r.i32(); break;
    case "UInt32": case "unsigned int": case "Type*": valor = r.u32(); break;
    case "SInt64": case "long long": valor = r.i64(); break;
    case "UInt64": case "unsigned long long": case "FileSize": valor = r.u64(); break;
    case "float": valor = r.f32(); break;
    case "double": valor = r.f64(); break;
    case "string": {
      const n = r.i32();
      valor = new TextDecoder().decode(r.bytes(n));
      if (nodo.hijos[0] && nodo.hijos[0].marca & ALINEAR) alinear = true;
      break;
    }
    case "TypelessData": valor = r.bytes(r.i32()).slice(); break;
    default: {
      const primero = nodo.hijos[0];
      if (primero && primero.tipo === "Array") {
        if (primero.marca & ALINEAR) alinear = true;
        const n = r.i32();
        const elemento = primero.hijos[1];
        valor = [];
        for (let i = 0; i < n; i++) valor.push(leerValor(r, elemento));
      } else {
        valor = {};
        for (const h of nodo.hijos) valor[h.nombre] = leerValor(r, h);
      }
    }
  }
  if (alinear) r.alinear(4);
  return valor;
}

function escribirValor(w, nodo, valor) {
  let alinear = (nodo.marca & ALINEAR) !== 0;
  switch (nodo.tipo) {
    case "SInt8": w.i8(valor); break;
    case "UInt8": case "char": w.u8(valor); break;
    case "bool": w.u8(valor ? 1 : 0); break;
    case "SInt16": case "short": w.i16(valor); break;
    case "UInt16": case "unsigned short": w.u16(valor); break;
    case "SInt32": case "int": w.i32(valor); break;
    case "UInt32": case "unsigned int": case "Type*": w.u32(valor); break;
    case "SInt64": case "long long": w.i64(valor); break;
    case "UInt64": case "unsigned long long": case "FileSize": w.u64(valor); break;
    case "float": w.f32(valor); break;
    case "double": w.f64(valor); break;
    case "string": {
      const b = new TextEncoder().encode(valor);
      w.i32(b.length);
      w.bytes(b);
      if (nodo.hijos[0] && nodo.hijos[0].marca & ALINEAR) alinear = true;
      break;
    }
    case "TypelessData": w.i32(valor.length); w.bytes(valor); break;
    default: {
      const primero = nodo.hijos[0];
      if (primero && primero.tipo === "Array") {
        if (primero.marca & ALINEAR) alinear = true;
        w.i32(valor.length);
        for (const x of valor) escribirValor(w, primero.hijos[1], x);
      } else {
        for (const h of nodo.hijos) escribirValor(w, h, valor[h.nombre]);
      }
    }
  }
  if (alinear) w.alinear(4);
}

export function leerObjeto(sf, obj) {
  const r = new Lector(datosObjeto(sf, obj), 0, sf.grande);
  const valor = leerValor(r, sf.tipos[obj.tipo].arbol);
  if (r.pos !== obj.tam) throw new Error(`Objeto de Unity mal leído (${r.pos} de ${obj.tam} bytes)`);
  return valor;
}

export function escribirObjeto(sf, obj, valor) {
  const w = new Escritor(sf.grande);
  escribirValor(w, sf.tipos[obj.tipo].arbol, valor);
  return w.final();
}

// El nombre (m_Name) de un MonoBehaviour sin leerlo entero: lo que va antes son referencias y números
export function nombreObjeto(sf, obj) {
  const arbol = sf.tipos[obj.tipo].arbol;
  const r = new Lector(datosObjeto(sf, obj), 0, sf.grande);
  for (const h of arbol.hijos) {
    if (h.nombre === "m_Name") return leerValor(r, h);
    leerValor(r, h);
  }
  return null;
}

// ---------- Todo junto ----------

// Un bundle con su archivo serializado (el primer nodo que no es .resS) listo para buscar objetos por nombre
export function abrirBundle(bytes) {
  const bundle = leerBundle(bytes);
  const nodo = bundle.nodos.find((n) => !/\.res[Ss]?$/.test(n.ruta));
  const sf = leerSerializado(nodo.datos);
  const porNombre = new Map();
  for (const o of sf.objetos) {
    if (sf.tipos[o.tipo].clase !== 114) continue; // solo MonoBehaviour
    const n = nombreObjeto(sf, o);
    if (n) porNombre.set(n, o);
  }
  return { bundle, nodo, sf, porNombre, cambios: new Map() };
}

// Un objeto por su nombre (si ya se ha cambiado, como ha quedado; siempre una copia)
export function leerPorNombre(ab, nombre) {
  const o = ab.porNombre.get(nombre);
  if (!o) throw new Error("No está en el bundle: " + nombre);
  if (ab.valores && ab.valores.has(nombre)) return structuredClone(ab.valores.get(nombre));
  return leerObjeto(ab.sf, o);
}

// El objeto original, aunque ya se haya cambiado
export function leerOriginal(ab, nombre) {
  return leerObjeto(ab.sf, ab.porNombre.get(nombre));
}

export function cambiarPorNombre(ab, nombre, valor) {
  const o = ab.porNombre.get(nombre);
  if (!ab.valores) ab.valores = new Map();
  ab.valores.set(nombre, structuredClone(valor));
  ab.cambios.set(o.id, escribirObjeto(ab.sf, o, valor));
}

// El bundle con lo cambiado (null si no ha cambiado nada)
export function guardarBundle(ab) {
  if (!ab.cambios.size) return null;
  const datos = escribirSerializado(ab.sf, ab.cambios);
  return escribirBundle({ ...ab.bundle, nodos: ab.bundle.nodos.map((n) => (n === ab.nodo ? { ...n, datos } : n)) });
}
