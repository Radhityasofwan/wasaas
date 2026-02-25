export function fmtDate(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  try {
    return new Date(isoString).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false // Pakai format 24 jam
    });
  } catch {
    return "-";
  }
}