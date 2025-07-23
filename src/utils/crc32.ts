const POLYNOMIAL = 0xedb88320; // This is the standard polynomial used in IEEE 802.3 and must be in sync with the one we are using in the backend.

const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? POLYNOMIAL ^ (c >>> 1) : c >>> 1;
  }
  TABLE[i] = c >>> 0;
}

export function crc32(hexStr: string): number {
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
  }

  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    crc = (crc >>> 8) ^ TABLE[(crc ^ byte!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
