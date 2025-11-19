import { CallGateway } from './gateways/calls.gateway';

describe('CallGateway', () => {
  it('should be defined', () => {
    const gateway = new CallGateway(
      {} as any, // CallSessionService
      {} as any, // CallRecordingService
      {} as any, // AgoraService
      {} as any, // CallBillingService
    );
    expect(gateway).toBeDefined();
  });
});
