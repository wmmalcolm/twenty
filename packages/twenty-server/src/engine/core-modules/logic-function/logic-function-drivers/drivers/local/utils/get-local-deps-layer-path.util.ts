import { join } from 'path';

import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { LOGIC_FUNCTION_EXECUTOR_TMPDIR_FOLDER } from 'src/engine/core-modules/logic-function/logic-function-drivers/constants/logic-function-executor-tmpdir-folder';

export const getLocalDepsLayerPath = (
  flatApplication: FlatApplication,
): string => {
  const checksum = flatApplication.yarnLockChecksum ?? 'default';

  if (
    checksum.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/.test(checksum) ||
    checksum === '.' ||
    checksum === '..'
  ) {
    throw new Error('Invalid yarn lock checksum');
  }

  return join(
    LOGIC_FUNCTION_EXECUTOR_TMPDIR_FOLDER,
    'deps',
    flatApplication.workspaceId,
    flatApplication.universalIdentifier,
    checksum,
  );
};
