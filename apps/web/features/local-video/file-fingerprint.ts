export type FingerprintMetadata = {
  name: string;
  size: number;
  durationMs: number;
};

export function createFingerprintMetadata(
  file: File,
  durationMs: number,
): FingerprintMetadata {
  return {
    name: file.name,
    size: file.size,
    durationMs,
  };
}
