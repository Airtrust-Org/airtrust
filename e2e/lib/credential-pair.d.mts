export function resolveCredentialPair(env?: Record<string, string | undefined>): {
  email: string;
  password: string;
  profile: 'admin' | 'smoke';
};
