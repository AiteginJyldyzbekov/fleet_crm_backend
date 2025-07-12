export class DailyBillingCompletedEvent {
  constructor(
    public readonly stats: {
      total: number;
      successful: number;
      failed: number;
      totalAmount: number;
    },
    public readonly timestamp: Date = new Date(),
  ) {}
}

export class PaymentFailedEvent {
  constructor(
    public readonly contractId: string,
    public readonly driverId: string,
    public readonly amount: number,
    public readonly reason: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}