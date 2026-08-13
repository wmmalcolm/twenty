import { ResetPasswordService } from 'src/engine/core-modules/auth/services/reset-password.service';

describe('ResetPasswordService.consumePasswordResetToken', () => {
  const userId = 'user-id';
  const token = {
    userId,
    value: 'hashed-token',
  };
  const user = {
    id: userId,
    email: 'owner@example.com',
    passwordHash: 'password-hash',
  };

  const buildService = () => {
    const appTokenRepository = {
      findOne: jest.fn().mockResolvedValue(token),
      update: jest.fn(),
    };
    const userService = {
      findUserByIdOrThrow: jest.fn().mockResolvedValue(user),
    };
    const service = new ResetPasswordService(
      {} as never,
      {} as never,
      {} as never,
      appTokenRepository as never,
      {} as never,
      {} as never,
      userService as never,
    );

    return { appTokenRepository, service };
  };

  it('atomically claims one token and revokes every sibling token', async () => {
    const { service } = buildService();
    const transactionalRepository = {
      update: jest
        .fn()
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 2 }),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(transactionalRepository),
    };

    await expect(
      service.consumePasswordResetToken('raw-token', entityManager as never),
    ).resolves.toEqual({
      id: userId,
      email: user.email,
      hasPassword: true,
    });

    expect(transactionalRepository.update).toHaveBeenCalledTimes(2);
    expect(transactionalRepository.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('rejects a concurrent second claim without revoking again', async () => {
    const { service } = buildService();
    const transactionalRepository = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(transactionalRepository),
    };

    await expect(
      service.consumePasswordResetToken('raw-token', entityManager as never),
    ).rejects.toThrow('Token is invalid');

    expect(transactionalRepository.update).toHaveBeenCalledTimes(1);
  });
});
