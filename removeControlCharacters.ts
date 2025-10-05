export function removeControlCharacters(str: string): string {
  // Matches control characters in the C0 and C1 ranges, including Delete (U+007F)
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    '',
  );
}
