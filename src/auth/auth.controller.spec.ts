import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('should be defined', () => {
    const controller = new AuthController(
      {} as any, // authService
      {} as any, // truecallerService
    );
    expect(controller).toBeDefined();
  });
});
