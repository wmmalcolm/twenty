export const sanitizeUrlForLogging = (
  value: string | undefined,
  baseUrl?: string,
): string => {
  if (!value) {
    return '<unknown-url>';
  }

  try {
    const parsedUrl = new URL(value, baseUrl);

    parsedUrl.username = '';
    parsedUrl.password = '';
    parsedUrl.search = '';
    parsedUrl.hash = '';

    return parsedUrl.toString();
  } catch {
    return '<invalid-url>';
  }
};

export const sanitizeUrlsInText = (value: string): string =>
  value.replace(/https?:\/\/[^\s"'<>]+/giu, (url) =>
    sanitizeUrlForLogging(url),
  );
