import { WalletService } from './wallet.service';

// Helper to mock a Mongoose-style query chain
const mockFindByIdChain = (wallet: any) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(wallet),
});

const createWalletService = (overrides: Partial<Record<string, any>> = {}) => {
  const transactionModel = {
    db: { startSession: jest.fn() },
  } as any;

  const userModel =
    overrides.userModel ??
    ({
      findById: jest.fn(),
    } as any);

  const razorpayService = {} as any;

  const walletRefundModel = {} as any;

  const configService = {} as any;

  const service = new WalletService(transactionModel, userModel, razorpayService, walletRefundModel, configService);
  return { service, userModel };
};

describe('WalletService (behavior)', () => {
  describe('getBalance', () => {
    it('should return wallet balance when user exists', async () => {
      const { service, userModel } = createWalletService();
      (userModel.findById as jest.Mock).mockReturnValue(
        mockFindByIdChain({ wallet: { balance: 250 } }),
      );

      const balance = await service.getBalance('user-1');
      expect(userModel.findById).toHaveBeenCalledWith('user-1');
      expect(balance).toBe(250);
    });
  });

  describe('checkBalance', () => {
    it('should return true when balance is sufficient', async () => {
      const { service, userModel } = createWalletService();
      (userModel.findById as jest.Mock).mockReturnValue(
        mockFindByIdChain({ wallet: { balance: 500 } }),
      );

      await expect(service.checkBalance('user-1', 300)).resolves.toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      const { service, userModel } = createWalletService();
      (userModel.findById as jest.Mock).mockReturnValue(
        mockFindByIdChain({ wallet: { balance: 100 } }),
      );

      await expect(service.checkBalance('user-1', 300)).resolves.toBe(false);
    });
  });
});