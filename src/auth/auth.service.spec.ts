import { AuthService } from './auth.service';

// Simple stubs – only jwtAuthService is behaviorally tested here
const createService = (overrides: Partial<Record<string, any>> = {}) => {
  const jwtAuthService = overrides.jwtAuthService ?? ({
    refreshAccessToken: jest.fn(),
  } as any);

  const service = new AuthService(
    {} as any, // userModel
    {} as any, // otpService
    jwtAuthService,
    {} as any, // truecallerService
    {} as any, // configService
    {} as any, // cacheService
  );

  return { service, jwtAuthService };
};

describe('AuthService', () => {
  it('should be defined', () => {
    const { service } = createService();
    expect(service).toBeDefined();
  });

  describe('refreshToken', () => {
    it('should delegate to JwtAuthService.refreshAccessToken and return its result', async () => {
      const expected = {
        success: true,
        message: 'Token refreshed successfully',
        data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      };

      const { service, jwtAuthService } = createService();
      (jwtAuthService.refreshAccessToken as jest.Mock).mockReturnValue(expected.data);

      const result = await service.refreshToken('dummy-refresh-token');

      expect(jwtAuthService.refreshAccessToken).toHaveBeenCalledWith(
        'dummy-refresh-token',
      );
      expect(result).toEqual(expected);
    });

    it('should reject when JwtAuthService throws', async () => {
      const { service, jwtAuthService } = createService();
      (jwtAuthService.refreshAccessToken as jest.Mock).mockImplementation(() => {
        throw new Error('bad token');
      });

      await expect(service.refreshToken('bad-token')).rejects.toBeDefined();
    });
  });
});
