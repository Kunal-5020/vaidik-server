import { JwtAuthService } from './jwt-auth.service';

describe('JwtAuthService', () => {
  it('should be defined', () => {
    const service = new JwtAuthService(
      {} as any, // NestJwtService
      {} as any, // ConfigService
    );
    expect(service).toBeDefined();
  });
});
