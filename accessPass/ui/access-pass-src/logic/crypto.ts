import sodium from "libsodium-wrappers";

export async function deterministicUuid(scope: string, roleId: string, principalId: string): Promise<string> {
  const data = new TextEncoder().encode(`${scope}|${roleId}|${principalId}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const h = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export async function encryptSecret(publicKey: string, value: string): Promise<string> {
  await sodium.ready;
  const keyBin = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const valueBin = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(valueBin, keyBin);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}
