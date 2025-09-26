import { Test, TestingModule } from '@nestjs/testing';
import { AstrologersService } from './astrologers.service';

describe('AstrologersService', () => {
  let service: AstrologersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AstrologersService],
    }).compile();

    service = module.get<AstrologersService>(AstrologersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
