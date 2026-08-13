import { buildVerifiedTlsOptions } from 'src/engine/core-modules/imap-smtp-caldav-connection/utils/build-verified-tls-options.util';

describe('buildVerifiedTlsOptions', () => {
  it('keeps certificate verification and SNI bound to the original DNS host', () => {
    expect(buildVerifiedTlsOptions('imap.example.com')).toEqual({
      rejectUnauthorized: true,
      servername: 'imap.example.com',
    });
  });

  it.each(['203.0.113.10', '2001:db8::1', '[2001:db8::1]'])(
    'does not send an IP address as TLS servername: %s',
    (host) => {
      expect(buildVerifiedTlsOptions(host)).toEqual({
        rejectUnauthorized: true,
      });
    },
  );
});
