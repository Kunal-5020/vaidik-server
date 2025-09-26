import { Test, TestingModule } from '@nestjs/testing';
import { CallsGateway } from './calls.gateway';

describe('CallsGateway', () => {
  let gateway: CallsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CallsGateway],
    }).compile();

    gateway = module.get<CallsGateway>(CallsGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
