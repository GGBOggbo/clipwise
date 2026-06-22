import type { ExportStatus, PreviewStatus } from "@clipwise/shared";

export function requestExport(previewStatus: PreviewStatus): ExportStatus {
  return previewStatus === "previewed" ? "preparing" : "confirming";
}
