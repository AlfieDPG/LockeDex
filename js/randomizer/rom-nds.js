// ---------- ROM de DS: sus archivos ----------
//
// Una ROM de DS es una cabecera, los dos programas (ARM9 y ARM7), los overlays y un sistema de
// archivos (NitroFS): la FNT dice los nombres y carpetas, y la FAT dónde empieza y acaba cada
// archivo. Aquí se lee eso, se sacan archivos por su ruta («a/1/2/7») y se cambian.
//
// Al cambiar un archivo: si cabe en su sitio, ahí; si no, al hueco libre que hay detrás del
// último archivo (sin pisar nunca la parte DSi de las ROM «NDSi Enhanced», que va después).
// Una ROM sin cambios se escribe idéntica byte a byte.

import { descomprimirBLZ } from "./blz.js";

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
function poner32(b, i, v) {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
  b[i + 2] = (v >>> 16) & 0xff;
  b[i + 3] = (v >>> 24) & 0xff;
}

// CRC-16 de la cabecera (0x000-0x15D, en 0x15E): el de Modbus
function crcCabecera(b) {
  let c = 0xffff;
  for (let i = 0; i < 0x15e; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
  }
  return c;
}

// Dónde está la marca del ARM9 (0xDEC00621, 0x2106C0DE); dos palabras antes va
// «compressed_static_end» (0 si no está comprimido)
function marcaArm9(datos) {
  for (let i = 0; i + 8 <= datos.length; i++) if (u32(datos, i) === 0xdec00621 && u32(datos, i + 4) === 0x2106c0de) return i;
  return -1;
}

const ALINEADO = 0x200;
const alinear = (n) => Math.ceil(n / ALINEADO) * ALINEADO;

export class RomNDS {
  constructor(bytes) {
    if (bytes.length < 0x200 || crcCabecera(bytes) !== u16(bytes, 0x15e)) throw new Error("Eso no parece una ROM de DS.");
    this.bytes = bytes;
    this.codigo = new TextDecoder("latin1").decode(bytes.subarray(0x0c, 0x10)); // «IRDS»: Blanco 2, España
    this.titulo = new TextDecoder("latin1").decode(bytes.subarray(0, 12)).replace(/\0+$/, "");
    this.fat = u32(bytes, 0x48);
    this.cuantos = u32(bytes, 0x4c) / 8;
    this.rutas = leerNombres(bytes, u32(bytes, 0x40)); // ruta -> id
    this.cambiados = new Set();
  }

  // Dónde está cada archivo: [inicio, fin)
  sitio(id) {
    return [u32(this.bytes, this.fat + id * 8), u32(this.bytes, this.fat + id * 8 + 4)];
  }

  id(ruta) {
    const id = this.rutas.get(ruta);
    if (id === undefined) throw new Error(`La ROM no tiene ${ruta}.`);
    return id;
  }

  // Una copia del archivo (por ruta o por id)
  archivo(cual) {
    const [inicio, fin] = this.sitio(typeof cual === "number" ? cual : this.id(cual));
    return this.bytes.slice(inicio, fin);
  }

  // Overlay N del ARM9 (su id de archivo va en la tabla de overlays)
  idOverlay(n) {
    return u32(this.bytes, u32(this.bytes, 0x50) + n * 32 + 0x18);
  }

  // Lo ocupado por algo que no se puede pisar: la cabecera, los programas, la FNT, la FAT, el
  // icono, los archivos y, en las «NDSi Enhanced», la parte DSi
  ocupado() {
    const b = this.bytes;
    const trozos = [...this.fijos(), [u32(b, 0x50), u32(b, 0x50) + u32(b, 0x54)], [u32(b, 0x58), u32(b, 0x58) + u32(b, 0x5c)]];
    for (let id = 0; id < this.cuantos; id++) trozos.push(this.sitio(id));
    return trozos.filter(([i, f]) => f > i).sort((x, y) => x[0] - y[0]);
  }

  // Lo que nunca se mueve (lo demás, archivos y tablas de overlays, se puede apartar)
  fijos() {
    const b = this.bytes;
    const trozos = [
      [0, u32(b, 0x84)], [u32(b, 0x20), u32(b, 0x20) + u32(b, 0x2c)], [u32(b, 0x30), u32(b, 0x30) + u32(b, 0x3c)],
      [u32(b, 0x40), u32(b, 0x40) + u32(b, 0x44)], [this.fat, this.fat + this.cuantos * 8], [u32(b, 0x68), u32(b, 0x68) + 0xa00]
    ];
    if (b[0x12] & 2) trozos.push([u32(b, 0x1c0), u32(b, 0x1c0) + u32(b, 0x1cc)], [u32(b, 0x1d0), u32(b, 0x1d0) + u32(b, 0x1dc)]);
    return trozos.filter(([i, f]) => f > i);
  }

  // Hasta dónde puede haber archivos: en las «NDSi Enhanced», hasta donde empieza la parte DSi
  // (0x90, en bloques de 0x80000; si algo pasa de ahí, el juego no arranca). Las tablas de
  // comprobación de la parte DS (solo las mira una DSi en su modo) sí se pueden pisar.
  tope() {
    const b = this.bytes;
    return b[0x12] & 2 && u16(b, 0x90) ? u16(b, 0x90) * 0x80000 : b.length;
  }

  // El primer hueco libre de «largo» bytes, alineado, dentro de la parte de DS
  hueco(largo) {
    const tope = this.tope();
    let desde = 0;
    for (const [inicio, fin] of this.ocupado()) {
      if (inicio >= alinear(desde) + largo && alinear(desde) + largo <= tope) return alinear(desde);
      desde = Math.max(desde, fin);
    }
    if (alinear(desde) + largo <= tope) return alinear(desde);
    throw new Error("La ROM no tiene sitio para el archivo cambiado.");
  }

  // Si algo queda más allá de lo usado, lo usado crece hasta ahí (y la cabecera, con su CRC)
  ampliarUsado(fin) {
    if (fin > u32(this.bytes, 0x80)) poner32(this.bytes, 0x80, fin);
    const crc = crcCabecera(this.bytes);
    this.bytes[0x15e] = crc & 0xff;
    this.bytes[0x15f] = crc >> 8;
  }

  // El programa principal (ARM9), descomprimido (si ya se escribió descomprimido, tal cual)
  leerArm9() {
    const inicio = u32(this.bytes, 0x20);
    const datos = this.bytes.slice(inicio, inicio + u32(this.bytes, 0x2c));
    const marca = marcaArm9(datos);
    return marca >= 8 && u32(datos, marca - 8) === 0 ? datos : descomprimirBLZ(datos);
  }

  // Lo escribe descomprimido. «datos» tiene que ser lo de leerArm9; la palabra
  // «compressed_static_end» (dos palabras antes de la marca 0xDEC00621, 0x2106C0DE) se pone a 0:
  // así el juego sabe que ya no está comprimido. Se queda en su sitio (los emuladores no arrancan
  // si se mueve): lo que haya detrás y estorbe (la tabla de overlays, algunos overlays) se aparta.
  escribirArm9(datos) {
    const nuevo = datos.slice();
    const marca = marcaArm9(nuevo);
    if (marca < 8) throw new Error("No se ha encontrado la marca del programa principal.");
    poner32(nuevo, marca - 8, 0);
    const inicio = u32(this.bytes, 0x20);
    const fin = inicio + nuevo.length;
    poner32(this.bytes, 0x2c, nuevo.length); // desde ya, ese sitio cuenta como ocupado
    this.despejar(inicio, fin);
    this.bytes.set(nuevo, inicio);
    this.ampliarUsado(fin);
  }

  // Aparta todo lo que esté en [inicio, fin) salvo la cabecera, el ARM9 y el archivo «salvo»
  despejar(inicio, fin, salvo = -1) {
    const estorba = (a, b) => b > a && a < fin && b > inicio;
    // Tablas de overlays (ARM9 y ARM7)
    for (const campo of [0x50, 0x58]) {
      const a = u32(this.bytes, campo);
      const largo = u32(this.bytes, campo + 4);
      if (!estorba(a, a + largo)) continue;
      const tabla = this.bytes.slice(a, a + largo);
      poner32(this.bytes, campo + 4, 0); // libre mientras se busca sitio
      const donde = this.hueco(largo);
      this.bytes.set(tabla, donde);
      poner32(this.bytes, campo, donde);
      poner32(this.bytes, campo + 4, largo);
    }
    for (let id = 0; id < this.cuantos; id++) {
      const [a, b] = this.sitio(id);
      if (id === salvo || !estorba(a, b)) continue;
      const datos = this.bytes.slice(a, b);
      poner32(this.bytes, this.fat + id * 8 + 4, a); // libre mientras se busca sitio
      const donde = this.hueco(datos.length);
      this.bytes.set(datos, donde);
      poner32(this.bytes, this.fat + id * 8, donde);
      poner32(this.bytes, this.fat + id * 8 + 4, donde + datos.length);
      this.ampliarUsado(donde + datos.length);
    }
  }

  // Un overlay del ARM9, descomprimido (en su fila de la tabla, el bit 24 de 0x1C dice si lo está)
  leerOverlay(n) {
    const datos = this.archivo(this.idOverlay(n));
    const comprimido = u32(this.bytes, u32(this.bytes, 0x50) + n * 32 + 0x1c) & 0x1000000;
    return comprimido ? descomprimirBLZ(datos) : datos;
  }

  // Lo escribe descomprimido y quita su marca de comprimido en la tabla de overlays
  escribirOverlay(n, datos) {
    this.cambiar(this.idOverlay(n), datos);
    poner32(this.bytes, u32(this.bytes, 0x50) + n * 32 + 0x1c, 0);
  }
  // Cambia un archivo (por ruta o por id)
  cambiar(cual, nuevo) {
    const id = typeof cual === "number" ? cual : this.id(cual);
    const [inicio, fin] = this.sitio(id);
    // Su sitio llega hasta lo siguiente que haya ocupado (sin contarse a sí mismo)
    const siguiente = this.ocupado().find(([i]) => i >= fin && !(i === inicio));
    const cabe = Math.min(siguiente ? siguiente[0] : this.bytes.length, this.tope()) - inicio;
    let donde = inicio;
    const hasta = inicio + nuevo.length;
    // Lo que hay detrás y estorba: si es poco (y se puede mover), se aparta y el archivo se queda
    // en su sitio (mover uno grande, como los textos, puede no caber en ningún otro)
    const estorban = this.ocupado().filter(([i, f]) => f > fin && i < hasta && i !== inicio);
    const apartable = hasta <= this.tope() &&
      !this.fijos().some(([i, f]) => f > fin && i < hasta) &&
      estorban.reduce((t, [i, f]) => t + f - i, 0) < nuevo.length / 4;
    if (nuevo.length > cabe && apartable) {
      poner32(this.bytes, this.fat + id * 8 + 4, hasta); // reservado mientras se aparta lo demás
      this.despejar(fin, hasta, id);
    } else if (nuevo.length > cabe) {
      // Fuera de su sitio: se libera el viejo antes de buscar
      poner32(this.bytes, this.fat + id * 8 + 4, inicio);
      donde = this.hueco(nuevo.length);
    }
    this.bytes.fill(0xff, inicio, fin);
    this.bytes.set(nuevo, donde);
    poner32(this.bytes, this.fat + id * 8, donde);
    poner32(this.bytes, this.fat + id * 8 + 4, donde + nuevo.length);
    // Lo usado por la parte de DS (0x80) tiene que llegar hasta el último archivo
    if (donde + nuevo.length > u32(this.bytes, 0x80)) this.ampliarUsado(donde + nuevo.length);
    this.cambiados.add(id);
  }
}

// FNT: tabla de carpetas (8 bytes cada una: dónde está su lista, el id de su primer archivo y
// el padre) y, por carpeta, la lista de nombres: un byte con el largo (con 0x80, carpeta, y
// detrás su id) y el nombre; un 0 acaba la lista
function leerNombres(b, fnt) {
  const rutas = new Map();
  const recorrer = (carpeta, prefijo) => {
    const entrada = fnt + (carpeta & 0xfff) * 8;
    let pos = fnt + u32(b, entrada);
    let id = u16(b, entrada + 4);
    for (;;) {
      const tipo = b[pos++];
      if (!tipo) break;
      const nombre = new TextDecoder("latin1").decode(b.subarray(pos, pos + (tipo & 0x7f)));
      pos += tipo & 0x7f;
      if (tipo & 0x80) {
        recorrer(u16(b, pos), `${prefijo}${nombre}/`);
        pos += 2;
      } else rutas.set(prefijo + nombre, id++);
    }
  };
  recorrer(0xf000, "");
  return rutas;
}

// ---------- NARC: un archivo con archivos dentro ----------
//
// «NARC» y tres secciones: BTAF (dónde empieza y acaba cada uno, desde el principio de los
// datos), BTNF (nombres; en los de Pokémon, vacía) y GMIF (los datos, cada uno alineado a 4).

export function leerNarc(bytes) {
  const texto = (i) => new TextDecoder("latin1").decode(bytes.subarray(i, i + 4));
  if (texto(0) !== "NARC") throw new Error("No es un NARC.");
  let pos = u16(bytes, 0x0c);
  const secciones = {};
  for (let i = 0; i < 3; i++) {
    secciones[texto(pos)] = { inicio: pos, largo: u32(bytes, pos + 4) };
    pos += u32(bytes, pos + 4);
  }
  const fat = secciones.BTAF;
  const cuantos = u16(bytes, fat.inicio + 8);
  const datos = secciones.GMIF.inicio + 8;
  const archivos = [];
  for (let i = 0; i < cuantos; i++) {
    const inicio = u32(bytes, fat.inicio + 12 + i * 8);
    const fin = u32(bytes, fat.inicio + 16 + i * 8);
    archivos.push(bytes.slice(datos + inicio, datos + fin));
  }
  const nombres = bytes.slice(secciones.BTNF.inicio, secciones.BTNF.inicio + secciones.BTNF.largo);
  return { archivos, nombres };
}

export function crearNarc({ archivos, nombres }) {
  const al4 = (n) => Math.ceil(n / 4) * 4;
  const largoDatos = archivos.reduce((t, a, i) => t + (i < archivos.length - 1 ? al4(a.length) : a.length), 0);
  const largoFat = 12 + archivos.length * 8;
  const largoGmif = 8 + al4(largoDatos);
  const total = 0x10 + largoFat + nombres.length + largoGmif;
  const b = new Uint8Array(total);
  const v = new DataView(b.buffer);
  b.set([0x4e, 0x41, 0x52, 0x43, 0xfe, 0xff, 0x00, 0x01]);
  v.setUint32(8, total, true);
  v.setUint16(12, 0x10, true);
  v.setUint16(14, 3, true);
  let pos = 0x10;
  b.set([0x42, 0x54, 0x41, 0x46], pos);
  v.setUint32(pos + 4, largoFat, true);
  v.setUint16(pos + 8, archivos.length, true);
  let dentro = 0;
  archivos.forEach((a, i) => {
    v.setUint32(pos + 12 + i * 8, dentro, true);
    v.setUint32(pos + 16 + i * 8, dentro + a.length, true);
    dentro += i < archivos.length - 1 ? al4(a.length) : a.length;
  });
  pos += largoFat;
  b.set(nombres, pos);
  pos += nombres.length;
  b.set([0x47, 0x4d, 0x49, 0x46], pos);
  v.setUint32(pos + 4, largoGmif, true);
  const datos = pos + 8;
  b.fill(0xff, datos, total); // el relleno entre archivos
  dentro = 0;
  archivos.forEach((a, i) => {
    b.set(a, datos + dentro);
    dentro += al4(a.length);
  });
  return b;
}
