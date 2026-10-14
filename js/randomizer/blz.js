// ---------- BLZ: la compresión del programa principal y de los overlays ----------
//
// Es una compresión «hacia atrás»: se lee y se escribe desde el final. Los datos acaban con 8
// bytes: la longitud de lo comprimido (24 bits) y la de la cabecera (8 bits), y la cantidad
// que crece al descomprimir. Delante de lo comprimido puede haber un trozo sin comprimir.
//
// Solo se descomprime. Para cambiar algo, el archivo se escribe ya descomprimido y se avisa de
// ello (en el programa principal, con la palabra «compressed_static_end» a 0; en los overlays,
// con la marca de comprimido a 0): el juego lo lee igual.

const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

export function descomprimirBLZ(datos) {
  const total = datos.length;
  const crece = u32(datos, total - 4);
  if (!crece) return datos.slice(0, total - 4); // sin comprimir
  const cabecera = datos[total - 5];
  const comprimido = u32(datos, total - 8) & 0xffffff;
  const sinComprimir = total - comprimido;
  const largoPak = comprimido - cabecera;
  const largoRaw = sinComprimir + comprimido + crece;

  const raw = new Uint8Array(largoRaw);
  raw.set(datos.subarray(0, sinComprimir));
  // Lo comprimido, del revés
  const pak = datos.slice(sinComprimir, sinComprimir + largoPak).reverse();

  let r = sinComprimir;
  let p = 0;
  let mascara = 0;
  let banderas = 0;
  while (r < largoRaw) {
    mascara >>= 1;
    if (!mascara) {
      if (p >= largoPak) break;
      banderas = pak[p++];
      mascara = 0x80;
    }
    if (!(banderas & mascara)) {
      if (p >= largoPak) break;
      raw[r++] = pak[p++];
    } else {
      if (p + 1 >= largoPak + 1) break;
      const dato = (pak[p++] << 8) | pak[p++];
      let largo = (dato >> 12) + 3;
      const distancia = (dato & 0xfff) + 3;
      if (r + largo > largoRaw) largo = largoRaw - r;
      while (largo--) {
        raw[r] = raw[r - distancia];
        r++;
      }
    }
  }
  // Lo descomprimido también está del revés
  raw.subarray(sinComprimir).reverse();
  return raw;
}
