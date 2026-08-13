import { HttpTool } from 'src/engine/core-modules/tool/tools/http-tool/http-tool';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';

describe('HttpTool', () => {
  const context = {
    workspaceId: 'workspace-id',
    userId: 'user-id',
  } as ToolExecutionContext;
  const parameters = {
    url: 'https://user:password@example.com/hook?token=secret#fragment',
    method: 'GET',
    headers: {},
  };

  const buildTool = (request: jest.Mock) =>
    new HttpTool({
      getHttpClient: jest.fn().mockReturnValue(request),
    } as never);

  it('does not persist URL credentials or query tokens on success', async () => {
    const tool = buildTool(
      jest.fn().mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
      }),
    );

    const output = await tool.execute(parameters, context);

    expect(output.message).toContain('https://example.com/hook');
    expect(output.message).not.toContain('secret');
    expect(output.message).not.toContain('password');
  });

  it('sanitizes an Axios error message', async () => {
    const tool = buildTool(
      jest.fn().mockRejectedValue({
        isAxiosError: true,
        message: 'Request to https://example.com/hook?token=secret failed',
      }),
    );

    const output = await tool.execute(parameters, context);

    expect(output.message).not.toContain('secret');
    expect(output.error).not.toContain('secret');
  });

  it('sanitizes a URL echoed in an Axios response body', async () => {
    const tool = buildTool(
      jest.fn().mockRejectedValue({
        isAxiosError: true,
        message: 'Bad request',
        response: {
          data: 'Invalid https://user:password@example.com/hook?token=secret',
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        },
      }),
    );

    const output = await tool.execute(parameters, context);

    expect(output.error).not.toContain('secret');
    expect(output.error).not.toContain('password');
    expect(output.result).not.toContain('secret');
  });

  it('sanitizes a non-Axios error message', async () => {
    const tool = buildTool(
      jest
        .fn()
        .mockRejectedValue(
          new Error(
            'Request to https://example.com/hook?token=secret failed',
          ),
        ),
    );

    const output = await tool.execute(parameters, context);

    expect(output.message).not.toContain('secret');
    expect(output.error).not.toContain('secret');
  });
});
