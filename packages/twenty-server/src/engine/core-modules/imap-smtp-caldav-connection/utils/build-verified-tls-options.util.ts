import { isIP } from 'node:net';

type VerifiedTlsOptions = {
  rejectUnauthorized: true;
  servername?: string;
};

export const buildVerifiedTlsOptions = (
  originalHost: string,
): VerifiedTlsOptions => {
  const hostWithoutIpv6Brackets = originalHost.replace(/^\[|\]$/g, '');

  return {
    rejectUnauthorized: true,
    ...(isIP(hostWithoutIpv6Brackets) === 0
      ? { servername: hostWithoutIpv6Brackets }
      : {}),
  };
};
