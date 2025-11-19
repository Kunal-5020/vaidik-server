import { OtpService } from './otp.service';

describe('OtpService', () => {
  it('should be defined', () => {
    const service = new OtpService(
      {} as any, // configService
      {} as any, // otpStorageService
    );
    expect(service).toBeDefined();
  });
});
