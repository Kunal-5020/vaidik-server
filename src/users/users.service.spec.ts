import { UsersService } from './services/users.service';

describe('UsersService', () => {
  it('should be defined', () => {
    const service = new UsersService(
      {} as any, // userModel
    );
    expect(service).toBeDefined();
  });
});
