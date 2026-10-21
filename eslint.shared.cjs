// Shared ESLint rule fragments used by the root, mobile and admin flat configs.
// Keep this CommonJS so `apps/mobile/eslint.config.js` (CJS) can `require()` it
// and `apps/admin/eslint.config.mjs` / `eslint.config.mjs` (ESM) can import its
// default export.

/** `no-restricted-imports` options object: engine packages stay pure (no I/O,
 * no UI framework, no network). CLAUDE.md non-negotiable #1. */
const engineRestrictedImports = {
  patterns: [
    {
      group: [
        'react',
        'react-*',
        'react-native*',
        '@supabase/*',
        'expo',
        'expo-*',
        'next',
        'next/*',
        'fs',
        'node:*',
        'http',
        'https',
        'child_process',
        'net',
        'path',
        'os',
        'crypto',
      ],
      message:
        'packages/engine is pure: no framework, filesystem or network imports (CLAUDE.md non-negotiable #1).',
    },
  ],
};

/** `no-restricted-syntax` entries: ban argless `new Date()` / `Date.now()` so
 * "today" is always passed in, per CLAUDE.md non-negotiable #1. */
const noArglessDate = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "Do not call `new Date()` with no arguments; pass 'today' in explicitly.",
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "Do not call `Date.now()`; pass 'today' in explicitly.",
  },
];

/** Engine-only `no-restricted-syntax` entries, alongside noArglessDate in the same config
 * object (flat config replaces a rule's options, it doesn't merge them): a bare `Date()`
 * call reads the clock too, and `Math.random` breaks "same inputs, same outputs". */
const engineNondeterminism = [
  {
    selector: "CallExpression[callee.name='Date']",
    message: "Do not call `Date()`; it returns the current time. Pass 'today' in explicitly.",
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'Do not use `Math.random`; the engine is deterministic (CLAUDE.md non-negotiable #1).',
  },
];

/** `no-restricted-globals` entries for the engine: no network, no process, and no
 * `globalThis` escape hatch around the other bans. */
const engineRestrictedGlobals = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'process',
  'globalThis',
].map((name) => ({
  name,
  message: `packages/engine is pure: \`${name}\` is not allowed (CLAUDE.md non-negotiable #1).`,
}));

/** `no-restricted-syntax` entries: ban raw hex color literals outside the
 * theme so screens stay on design tokens (docs/design.md). */
const noRawHex = [
  {
    selector: "Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
    message: 'Use a design token from src/ui/theme instead of a raw hex color literal.',
  },
];

/** `no-restricted-imports` options for banning one app from importing the
 * other; apps/mobile and apps/admin must stay independent. */
function crossAppImport(otherApp) {
  return {
    patterns: [
      {
        group: [`@credit-coach/${otherApp}`, `@credit-coach/${otherApp}/*`],
        message: `Do not import from @credit-coach/${otherApp}; apps/mobile and apps/admin must stay independent.`,
      },
    ],
  };
}

/** Shared size-limit warnings (not errors): keep files and functions small. */
const sizeLimits = { 'max-lines': ['warn', 400], complexity: ['warn', 10] };

module.exports = {
  engineRestrictedImports,
  engineRestrictedGlobals,
  engineNondeterminism,
  noArglessDate,
  noRawHex,
  crossAppImport,
  sizeLimits,
};
