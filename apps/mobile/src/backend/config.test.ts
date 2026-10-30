import { readBackendConfig } from './config';

describe('readBackendConfig', () => {
  it('returns the trimmed url (no trailing slash) and key when both are valid', () => {
    expect(
      readBackendConfig({ url: ' https://abc.supabase.co/ ', anonKey: ' anon.key.value ' }),
    ).toEqual({ url: 'https://abc.supabase.co', anonKey: 'anon.key.value' });
  });

  it.each([
    ['missing url', { anonKey: 'k' }],
    ['missing key', { url: 'https://abc.supabase.co' }],
    ['empty values', { url: '', anonKey: '' }],
    ['plain http', { url: 'http://abc.supabase.co', anonKey: 'k' }],
    ['not a url', { url: 'https://', anonKey: 'k' }],
    ['no scheme', { url: 'abc.supabase.co', anonKey: 'k' }],
  ])('returns null for %s, so the app runs offline exactly as before', (_name, env) => {
    expect(readBackendConfig(env)).toBeNull();
  });
});
