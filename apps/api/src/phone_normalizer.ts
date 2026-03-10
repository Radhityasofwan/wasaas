export function normalizeIndonesiaPhoneE164(raw: string | null | undefined): string | null {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let national = "";
  if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else if (digits.startsWith("62")) {
    national = digits.slice(2);
  } else if (digits.startsWith("8")) {
    national = digits;
  } else {
    national = digits;
  }

  // Indonesia mobile numbering guard: must start with 8 and 10-13 digits after +62.
  if (!national.startsWith("8")) return null;
  if (national.length < 10 || national.length > 13) return null;

  return `+62${national}`;
}

export function normalizeIndonesiaDigits(raw: string | null | undefined): string | null {
  const e164 = normalizeIndonesiaPhoneE164(raw);
  if (!e164) return null;
  return e164.slice(1); // +62812... -> 62812...
}

export function isValidIndonesiaPhoneE164(phone: string | null | undefined): boolean {
  const p = String(phone || "").trim();
  if (!p.startsWith("+62")) return false;
  const digits = p.slice(1);
  if (!/^\d+$/.test(digits)) return false;
  const national = digits.slice(2);
  if (!national.startsWith("8")) return false;
  return national.length >= 10 && national.length <= 13;
}
