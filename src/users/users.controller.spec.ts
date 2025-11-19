import { UsersController } from './controllers/users.controller';

describe('UsersController', () => {
  it('should be defined', () => {
    const controller = new UsersController(
      {} as any, // usersService
    );
    expect(controller).toBeDefined();
  });
});
