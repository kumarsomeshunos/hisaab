/** Generates a cryptographically random 6-digit OTP string (zero-padded). */
export function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (array[0] % 1_000_000).toString().padStart(6, "0");
}

/** SHA-256 hex hash of a raw OTP code. Works in both Node.js and Edge runtimes. */
export async function hashOtp(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
