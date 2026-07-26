import crypto from 'node:crypto';

/** Unambiguous alphabet — no 0/O/1/I so codes are easy to read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

/** Appends -2, -3, … until `isTaken` says the slug is free. */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let counter = 2;
  // Bounded so a pathological data set cannot spin forever.
  while (counter < 500 && (await isTaken(candidate))) {
    candidate = `${root}-${counter}`;
    counter += 1;
  }
  return candidate;
}

export function randomFileKey(originalName: string): string {
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
  const safeExt = /^\.[a-zA-Z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : '';
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
}
