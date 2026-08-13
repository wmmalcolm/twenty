import { isIP } from 'node:net';

type VerifiedTlsOptions = {
  rejectUnauthorized: true;
  servername?: string;
};

export const buildVerifiedTlsOptions = (
  originalHost: string,
): VerifiedTlsOptions => {
  const normalizedHost = (() => {
    try {
      return new URL(originalHost).hostname;
    } catch {
      return originalHost;
    }
  })();
  const hostWithoutIpv6Brackets = normalizedHost.replace(/^\[|\]$/g, '');

  return {
    rejectUnauthorized: true,
    ...(isIP(hostWithoutIpv6Brackets) === 0
      ? { servername: hostWithoutIpv6Brackets }
      : {}),
  };
};
