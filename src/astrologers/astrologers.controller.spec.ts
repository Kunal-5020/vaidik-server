import { Test, TestingModule } from '@nestjs/testing';
import { AstrologersController } from './astrologers.controller';

describe('AstrologersController', () => {
  let controller: AstrologersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AstrologersController],
    }).compile();

    controller = module.get<AstrologersController>(AstrologersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
