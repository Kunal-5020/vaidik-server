import { AstrologersController } from './controllers/astrologers.controller';

describe('AstrologersController', () => {
  it('should be defined', () => {
    const controller = new AstrologersController(
      {} as any, // astrologersService
    );
    expect(controller).toBeDefined();
  });
});
