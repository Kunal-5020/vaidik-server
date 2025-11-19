import { CallController } from './controllers/calls.controller';

describe('CallController', () => {
  it('should be defined', () => {
    const controller = new CallController(
      {} as any, // CallSessionService
      {} as any, // CallBillingService
    );
    expect(controller).toBeDefined();
  });
});
