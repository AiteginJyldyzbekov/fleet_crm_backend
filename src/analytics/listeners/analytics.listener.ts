import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class AnalyticsListener {
  private readonly logger = new Logger(AnalyticsListener.name);

  @OnEvent('analytics.daily.completed')
  handleDailyMetricsCompleted(payload: any) {
    this.logger.log(`Daily metrics completed: ${JSON.stringify(payload)}`);
    // Здесь можно отправить уведомление в Slack, по email и т.д.
  }

  @OnEvent('analytics.daily.failed')
  handleDailyMetricsFailed(payload: any) {
    this.logger.error(`Daily metrics failed: ${JSON.stringify(payload)}`);
    // Здесь можно отправить алерт о проблеме
  }

  @OnEvent('contract.created')
  async handleContractCreated(payload: { contractId: string; companyId: string }) {
    this.logger.log(`Contract created, triggering metrics update: ${payload.contractId}`);
    // Можно запустить пересчет метрик для конкретной компании
  }

  @OnEvent('payment.completed')
  async handlePaymentCompleted(payload: { paymentId: string; companyId: string; driverId: string }) {
    this.logger.log(`Payment completed, updating driver metrics: ${payload.paymentId}`);
    // Обновляем метрики водителя в реальном времени
  }

  @OnEvent('expense.created')
  async handleExpenseCreated(payload: { expenseId: string; companyId: string; amount: number }) {
    this.logger.log(`Expense created: ${payload.expenseId} for ${payload.amount}`);
    // Можно пересчитать финансовые метрики
  }
}