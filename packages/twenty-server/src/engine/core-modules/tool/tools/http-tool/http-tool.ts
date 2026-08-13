import { Injectable } from '@nestjs/common';

import { type AxiosRequestConfig, isAxiosError } from 'axios';
import { isDefined } from 'twenty-shared/utils';
import { parseDataFromContentType } from 'twenty-shared/workflow';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import {
  sanitizeUrlForLogging,
  sanitizeUrlsInText,
} from 'src/engine/core-modules/secure-http-client/utils/sanitize-url-for-logging.util';
import { HttpRequestInputZodSchema } from 'src/engine/core-modules/tool/tools/http-tool/http-tool.schema';
import { type HttpRequestInput } from 'src/engine/core-modules/tool/tools/http-tool/types/http-request-input.type';
import { type ToolInput } from 'src/engine/core-modules/tool/types/tool-input.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

const WORKFLOW_HTTP_TIMEOUT_MS = 15_000;
const WORKFLOW_HTTP_MAX_BYTES = 10 * 1024 * 1024;
const WORKFLOW_HTTP_ERROR_MAX_CHARS = 4096;

const sanitizeErrorPayload = (value: unknown): string => {
  let stringValue = 'HTTP request failed';

  try {
    stringValue =
      typeof value === 'string'
        ? value
        : (JSON.stringify(value) ?? 'HTTP request failed');
  } catch {
    stringValue = 'HTTP request failed';
  }

  return sanitizeUrlsInText(stringValue).slice(0, WORKFLOW_HTTP_ERROR_MAX_CHARS);
};

@Injectable()
export class HttpTool implements Tool {
  description =
    'Make an HTTP request to any URL with configurable method, headers, and body.';
  inputSchema = HttpRequestInputZodSchema;

  constructor(
    private readonly secureHttpClientService: SecureHttpClientService,
  ) {}

  async execute(
    parameters: ToolInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const { url, method, headers, body } = parameters as HttpRequestInput;
    const headersCopy = { ...headers };
    const isMethodForBody = ['POST', 'PUT', 'PATCH'].includes(method);
    const sanitizedUrl = sanitizeUrlForLogging(url);
    const sensitiveValues = [
      ...(() => {
        try {
          const parsedUrl = new URL(url);

          return [
            parsedUrl.username,
            parsedUrl.password,
            ...parsedUrl.searchParams.values(),
          ];
        } catch {
          return [];
        }
      })(),
      ...Object.entries(headersCopy)
        .filter(([name]) =>
          /^(authorization|cookie|proxy-authorization|x-api-key)$/iu.test(name),
        )
        .map(([, value]) => String(value)),
    ].filter((value) => value.length > 0);
    const sanitizeRequestSecrets = (value: string) =>
      sensitiveValues.reduce(
        (sanitized, secret) => sanitized.split(secret).join('[REDACTED]'),
        value,
      );

    try {
      const axiosConfig: AxiosRequestConfig = {
        url,
        method: method,
        headers: headersCopy,
        timeout: WORKFLOW_HTTP_TIMEOUT_MS,
        maxContentLength: WORKFLOW_HTTP_MAX_BYTES,
        maxBodyLength: WORKFLOW_HTTP_MAX_BYTES,
      };

      if (isMethodForBody && body) {
        const contentType = headers?.['content-type'];

        axiosConfig.data = parseDataFromContentType(body, contentType);
        if (isDefined(headersCopy) && contentType === 'multipart/form-data') {
          delete headersCopy['content-type'];
        }
      }

      const axiosClient = this.secureHttpClientService.getHttpClient(
        undefined,
        {
          workspaceId: context.workspaceId,
          userId: context.userId,
          source: 'workflow-http',
        },
      );
      const response = await axiosClient(axiosConfig);

      return {
        success: true,
        message: `HTTP ${method} request to ${sanitizedUrl} completed successfully`,
        result: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      if (isAxiosError(error)) {
        const sanitizedError = sanitizeRequestSecrets(
          sanitizeErrorPayload(error.response?.data ?? error.message),
        );

        return {
          success: false,
          message: `HTTP ${method} request to ${sanitizedUrl} failed`,
          error: sanitizedError,
          status: error.response?.status,
          statusText: error.response?.statusText,
          headers: error.response?.headers as
            | Record<string, string>
            | undefined,
          result: sanitizedError,
        };
      }

      return {
        success: false,
        message: `HTTP ${method} request to ${sanitizedUrl} failed`,
          error:
            error instanceof Error
            ? sanitizeRequestSecrets(sanitizeUrlsInText(error.message))
            : 'HTTP request failed',
      };
    }
  }
}
