export interface SheetSegment { url: string; width: number; height: number }
export interface ImageSheet { id: string; title: string; segments: SheetSegment[] }
export const MAX_SEGMENTS = 40;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export function validateSheet(value: ImageSheet): ImageSheet {
  if (!value || !/^[a-f0-9]{32}$/.test(value.id) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || !Array.isArray(value.segments) || !value.segments.length || value.segments.length > MAX_SEGMENTS) throw new Error('Invalid screenshot sheet.');
  const segments = value.segments.map(segment => {
    if (!segment || typeof segment.url !== 'string' || segment.url.length > 2048 || !/^(https:\/\/|\/(?!\/))/.test(segment.url) || !Number.isInteger(segment.width) || segment.width < 1 || segment.width > 1600 || !Number.isInteger(segment.height) || segment.height < 1 || segment.height > 2048) throw new Error('Invalid screenshot segment.');
    return { url: segment.url, width: segment.width, height: segment.height };
  });
  if (segments.some(segment => segment.width !== segments[0].width)) throw new Error('Screenshot widths must match.');
  return { id: value.id, title: value.title.trim(), segments };
}

export function validateJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes.length > MAX_IMAGE_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error('Choose a JPEG segment up to 3 MB.');
}
