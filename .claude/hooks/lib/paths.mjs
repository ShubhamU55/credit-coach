const FORMATTABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.css',
]);

/** Lower-cased basename, treating both `\` and `/` as separators (Windows-safe). */
function basename(filePath) {
  const normalised = String(filePath).replace(/\\/g, '/');
  return normalised.slice(normalised.lastIndexOf('/') + 1).toLowerCase();
}

/** True for `.env` and `.env.<anything>` files, except the committed `.env.example` template. */
export function isProtectedPath(filePath) {
  const name = basename(filePath);
  if (name === '.env.example') return false;
  return name === '.env' || /^\.env\..+/.test(name);
}

/** True when prettier should format the file after an edit. */
export function isFormattable(filePath) {
  const name = basename(filePath);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return FORMATTABLE_EXTENSIONS.has(name.slice(dot));
}
