import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { FileFolder } from 'twenty-shared/types';

import { fileFolderConfigs } from 'src/engine/core-modules/file/interfaces/file-folder.interface';

import { type FileTokenJwtPayload } from 'src/engine/core-modules/auth/types/file-token-jwt-payload.type';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';

export const SUPPORTED_FILE_FOLDERS = [
  FileFolder.CorePicture,
  FileFolder.FilesField,
  FileFolder.Workflow,
  FileFolder.AgentChat,
  FileFolder.EmailAttachment,
  FileFolder.EmailImage,
  FileFolder.AppTarball,
  FileFolder.Dpa,
] as const;

export type SupportedFileFolder = (typeof SUPPORTED_FILE_FOLDERS)[number];

@Injectable()
export class FileByIdGuard implements CanActivate {
  constructor(private readonly jwtWrapperService: JwtWrapperService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const fileId = request.params.id;
    const fileFolder = request.params.fileFolder as FileFolder;
    const fileToken = request.query.token;

    if (!this.isSupportedFileFolder(fileFolder)) {
      return false;
    }

    if (!fileToken) {
      return false;
    }

    let payload: FileTokenJwtPayload;

    try {
      payload = await this.jwtWrapperService.verifyJwtToken(fileToken, {
        ignoreExpiration: fileFolderConfigs[fileFolder].ignoreExpirationToken,
      });

      if (
        payload.type !== JwtTokenTypeEnum.FILE ||
        !payload.workspaceId ||
        payload.fileId !== fileId
      ) {
        return false;
      }
    } catch {
      return false;
    }

    request.workspaceId = payload.workspaceId;

    return true;
  }

  private isSupportedFileFolder(
    fileFolder: string,
  ): fileFolder is SupportedFileFolder {
    return SUPPORTED_FILE_FOLDERS.includes(fileFolder as SupportedFileFolder);
  }
}
