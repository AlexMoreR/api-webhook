import * as fs from 'fs';

/**
 * Herramienta para el procesamiento de imagenes en base64
 * @returns la funcion de identificacion de tipo de imagen, y los procesadores
 * de audio e imagen
 */
export const mediaInput64 = () => {
  // Constantes para los bytes mágicos de los formatos de imagen comunes
  const magicBytes = {
    jpeg: [0xff, 0xd8, 0xff],
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    gif: [0x47, 0x49, 0x46, 0x38], // GIF87a, GIF89a
  };

  /**
   * Identifica el tipo MIME de una imagen basándose en sus bytes mágicos.
   * @param buffer El buffer de la imagen.
   * @returns El tipo MIME de la imagen (ej. 'image/jpeg') o null si no es reconocido.
   */
  function getMimeTypeFromMagicBytes(buffer: Buffer): string | null {
    if (buffer.length < 8) {
      // Mínimo de bytes para PNG
      return null;
    }

    // Comprobación de JPEG
    if (
      buffer[0] === magicBytes.jpeg[0] &&
      buffer[1] === magicBytes.jpeg[1] &&
      buffer[2] === magicBytes.jpeg[2]
    ) {
      return 'image/jpeg';
    }

    // Comprobación de PNG
    const pngHeader = buffer.subarray(0, magicBytes.png.length);
    if (pngHeader.every((byte, index) => byte === magicBytes.png[index])) {
      return 'image/png';
    }

    // Comprobación de GIF
    const gifHeader = buffer.subarray(0, magicBytes.gif.length);
    if (gifHeader.every((byte, index) => byte === magicBytes.gif[index])) {
      return 'image/gif';
    }

    return null;
  }

  const image = (buffer) => {
    const encode = () => '';
    const decode = () => '';
    return { encode, decode };
  };
  const audio = (buffer) => {
    const encode = () => '';
    const decode = () => '';
    return { encode, decode };
  };
  return { image, audio };
};

const converter = mediaInput64();

// const audioConverter = converter.audio()

// const imageConverter = converter.image()

// const decodeImage = imageConverter.decode()

// const decodeAudio = audioConverter.decode()

// const encodeImage = imageConverter.encode()

// const encodeAudio = imageConverter.encode()
