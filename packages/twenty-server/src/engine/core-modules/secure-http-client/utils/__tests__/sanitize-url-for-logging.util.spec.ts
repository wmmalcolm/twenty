import {
  sanitizeUrlForLogging,
  sanitizeUrlsInText,
} from 'src/engine/core-modules/secure-http-client/utils/sanitize-url-for-logging.util';

describe('sanitizeUrlForLogging', () => {
  it('removes credentials, query parameters, and fragments', () => {
    expect(
      sanitizeUrlForLogging(
        'https://user:password@example.com/hook?token=secret#fragment',
      ),
    ).toBe('https://example.com/hook');
  });

  it('sanitizes URLs embedded in error text', () => {
    expect(
      sanitizeUrlsInText(
        'Request to https://example.com/hook?token=secret failed',
      ),
    ).toBe('Request to https://example.com/hook failed');
  });
});
