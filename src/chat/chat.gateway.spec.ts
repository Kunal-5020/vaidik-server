import { ChatGateway } from './gateways/chat.gateway';

describe('ChatGateway', () => {
  it('should be defined', () => {
    const gateway = new ChatGateway(
      {} as any, // ChatSessionService
      {} as any, // ChatMessageService
    );
    expect(gateway).toBeDefined();
  });
});
