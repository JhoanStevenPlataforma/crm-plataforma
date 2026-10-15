/**
 * Compare two secrets without telling an attacker how much of a guess was
 * right.
 *
 * Both sides are hashed first, so the comparison always runs over 32 bytes
 * whatever the lengths were -- a plain `===` returns at the first differing
 * character, and its timing is a ruler laid along the secret.
 */
export const timingSafeEqual = async (
  left: string,
  right: string,
): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < x.length; index += 1) {
    difference |= x[index] ^ y[index];
  }
  return difference === 0;
};
