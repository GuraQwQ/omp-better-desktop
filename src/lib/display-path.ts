export function displayPath(value: string): string {
  return value
    .replace(/^\\\\\?\\UNC\\(?=[^\\]+\\[^\\]+)/i, '\\\\')
    .replace(/^\\\\\?\\(?=[a-z]:\\)/i, '');
}
