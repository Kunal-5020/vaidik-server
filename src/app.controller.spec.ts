import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('should be defined', () => {
    const controller = new AppController(
      new AppService(),
      {} as any, // mongoConnection stub
      {} as any, // cacheManager stub
    );
    expect(controller).toBeDefined();
  });

  it('getHello should return welcome message', () => {
    const controller = new AppController(
      new AppService(),
      {} as any,
      {} as any,
    );
    expect(controller.getHello()).toBe('Welcome to Vaidik Talk Backend API! 🚀');
  });
});
