export const maximumUploadImageBytes = 4 * 1024 * 1024;
export const maximumUploadMultipartBytes = 4_450_000;

export const uploadMultipartLimitMessage = "O envio completo de imagens e dados deve ter até 4,4 MB. Reduza o tamanho ou a quantidade de imagens.";

export function uploadMultipartFits(data: FormData): boolean {
  // Reserve room for multipart boundaries, action metadata and encoded headers.
  const encoder = new TextEncoder();
  let bytes = 64 * 1024;
  data.forEach((value, name) => {
    bytes += 1024 + encoder.encode(name).byteLength * 3;
    bytes += typeof value === "string"
      ? encoder.encode(value.replace(/\r\n|\r|\n/g, "\r\n")).byteLength
      : value.size + encoder.encode(value.name).byteLength * 3 + encoder.encode(value.type).byteLength;
  });
  return bytes <= maximumUploadMultipartBytes;
}
