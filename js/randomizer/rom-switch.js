// ---------- Juegos de Switch ----------
//
// No hay ROM: se elige la carpeta «romfs» sacada desde el emulador (ver el «?» del randomizer).
// La sesión lee de antemano los archivos que hacen falta (después todo es síncrono, como en los
// motores de DS y 3DS) y lo que cambia sale en un .zip, como un mod de LayeredFS:
// «LockeDex/romfs/...», con las mismas rutas que en el juego.

export class SesionSwitch {
  // rutas: Map de la ruta dentro del romfs («bin/pml/...») al File (o a algo con arrayBuffer())
  constructor(rutas, juego, nombre) {
    this.rutas = rutas;
    this.juego = juego;
    this.titulo = nombre || juego;
    this.esSwitch = true;
    this.cache = new Map();
    this.cambios = new Map(); // ruta -> Uint8Array
  }

  tiene(ruta) {
    return this.rutas.has(ruta) || this.cambios.has(ruta);
  }

  // Las rutas que empiezan por «prefijo» (para recorrer una carpeta)
  listar(prefijo) {
    return [...this.rutas.keys()].filter((r) => r.startsWith(prefijo)).sort();
  }

  // Lee de antemano los archivos que se van a necesitar
  async cargar(rutas) {
    const faltan = rutas.filter((r) => !this.cache.has(r));
    for (const r of faltan) if (!this.rutas.has(r)) throw new Error(`Falta un archivo en la carpeta: romfs/${r}. ¿Es la carpeta «romfs» entera?`);
    // De poco en poco, que son muchos archivos pequeños
    for (let i = 0; i < faltan.length; i += 64) {
      const tanda = faltan.slice(i, i + 64);
      const leidos = await Promise.all(tanda.map((r) => this.rutas.get(r).arrayBuffer()));
      tanda.forEach((r, k) => this.cache.set(r, new Uint8Array(leidos[k])));
    }
  }

  archivo(ruta) {
    const a = this.cambios.get(ruta) || this.cache.get(ruta);
    if (!a) throw new Error("No cargado: " + ruta);
    return a.slice();
  }

  cambiar(ruta, bytes) {
    this.cambios.set(ruta, bytes);
  }

  get cambiados() {
    return new Set(this.cambios.keys());
  }

  // El .zip con lo cambiado (sin comprimir: casi todo va ya comprimido o es pequeño). Lo que empieza por «@exefs/»
  // (parches del programa) va a la carpeta «exefs» del mod
  zip(carpeta = "LockeDex") {
    const destino = (ruta) => (ruta.startsWith("@exefs/") ? `${carpeta}/exefs/${ruta.slice(7)}` : `${carpeta}/romfs/${ruta}`);
    return crearZip([...this.cambios].sort(([a], [b]) => (a < b ? -1 : 1)).map(([ruta, bytes]) => [destino(ruta), bytes]));
  }
}

// ---------- .zip ----------

let tablaCRC = null;
function crc32(bytes) {
  if (!tablaCRC) {
    tablaCRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tablaCRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tablaCRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// archivos: [[nombre, Uint8Array]]. Devuelve un Blob (en Node, las partes: { partes })
export function crearZip(archivos) {
  const partes = [];
  const central = [];
  let pos = 0;
  // La fecha de los archivos (el formato de MS-DOS)
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  for (const [nombre, bytes] of archivos) {
    const n = new TextEncoder().encode(nombre);
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + n.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // nombres en UTF-8
    v.setUint16(8, 0, true); // sin comprimir
    v.setUint16(10, hora, true);
    v.setUint16(12, fecha, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, bytes.length, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, n.length, true);
    local.set(n, 30);
    const c = new Uint8Array(46 + n.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(12, hora, true);
    w.setUint16(14, fecha, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, bytes.length, true);
    w.setUint32(24, bytes.length, true);
    w.setUint16(28, n.length, true);
    w.setUint32(42, pos, true);
    c.set(n, 46);
    partes.push(local, bytes);
    central.push(c);
    pos += local.length + bytes.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, pos, true);
  const todo = [...partes, ...central, fin];
  return typeof Blob !== "undefined" ? new Blob(todo, { type: "application/zip" }) : { partes: todo };
}
