import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'default-secret',
  expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
}));
