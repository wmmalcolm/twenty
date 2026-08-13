import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-one.pre-query.hook';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';

describe('WorkflowUpdateOnePreQueryHook', () => {
  const hook = new WorkflowUpdateOnePreQueryHook();

  it('should strip the server-managed coreWorkflowId', async () => {
    const payload = {
      data: {
        name: 'Updated workflow',
        coreWorkflowId: '2b72bea5-b9cd-47e8-a223-79b5ed60f117',
      },
      id: '1fe3f1e0-49e4-4df5-8f8f-dd7ec09fab5d',
    } as unknown as UpdateOneResolverArgs<WorkflowWorkspaceEntity>;

    const result = await hook.execute(
      {} as WorkspaceAuthContext,
      'workflow',
      payload,
    );

    expect(result.data).not.toHaveProperty('coreWorkflowId');
    expect(result.data.name).toBe('Updated workflow');
  });
});
