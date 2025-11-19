import { AstrologersService } from './services/astrologers.service';

describe('AstrologersService', () => {
  it('should be defined', () => {
    const service = new AstrologersService(
      {} as any, // astrologerModel
    );
    expect(service).toBeDefined();
  });
});
