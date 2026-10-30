// The anonymous user's access token, in memory only: nothing is persisted (no new native module)
// and nothing is ever logged. A new launch signs in again.

let accessToken: string | undefined;

export const getAccessToken = (): string | undefined => accessToken;

export function setAccessToken(token: string | undefined): void {
  accessToken = token;
}
