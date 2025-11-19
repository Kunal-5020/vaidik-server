import { CallBillingService } from './call-billing.service';

// Minimal stubs for constructor dependencies – calculateBilling is pure
const createService = () => {
  const sessionModel = {} as any;
  const walletService = {} as any;
  const orderPaymentService = {} as any;
  return new CallBillingService(sessionModel, walletService, orderPaymentService);
};

describe('CallBillingService', () => {
  describe('calculateBilling', () => {
    it('should round duration up to the nearest minute', () => {
      const service = createService();

      const resultShort = service.calculateBilling(59, 10); // < 1 min
      const resultOver = service.calculateBilling(61, 10);   // just over 1 min

      expect(resultShort.billedMinutes).toBe(1);
      expect(resultShort.billedDuration).toBe(60);
      expect(resultShort.totalAmount).toBe(10);

      expect(resultOver.billedMinutes).toBe(2);
      expect(resultOver.billedDuration).toBe(120);
      expect(resultOver.totalAmount).toBe(20);
    });

    it('should apply platform commission correctly', () => {
      const service = createService();

      const result = service.calculateBilling(120, 100, 25); // 2 min, 100/min, 25% commission

      expect(result.totalAmount).toBe(200);
      expect(result.platformCommission).toBe(50);
      expect(result.astrologerEarning).toBe(150);
    });
  });
});