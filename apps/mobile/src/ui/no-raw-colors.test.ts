import * as fs from 'fs';
import * as path from 'path';

// Components and primitives may only use design tokens: no hex literal, no raw boxShadow string.
const SCANNED_DIRS = ['components', 'primitives'];
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_SHADOW = /boxShadow:\s*['"`]/;

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('no raw colors or shadows outside the theme', () => {
  const files = SCANNED_DIRS.flatMap((d) => listSourceFiles(path.join(__dirname, d)));

  test.each(files.length > 0 ? files : [null])('%s has no raw hex or boxShadow literal', (file) => {
    if (file === null) return; // nothing to scan yet
    const text = fs.readFileSync(file, 'utf8');
    expect(HEX.exec(text)).toBeNull();
    expect(RAW_SHADOW.exec(text)).toBeNull();
  });

  test('the scanner flags a hex literal and a raw shadow string', () => {
    expect(HEX.test("const c = '#9F86FF';")).toBe(true);
    expect(RAW_SHADOW.test("{ boxShadow: '4px 4px 0px red' }")).toBe(true);
    expect(RAW_SHADOW.test('{ boxShadow: shadow.pop }')).toBe(false);
  });
});
