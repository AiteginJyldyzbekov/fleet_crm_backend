import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DailyBillingCompletedEvent, PaymentFailedEvent } from '../events/billing.events';

@Injectable()
export class BillingEventListener {
  private readonly logger = new Logger(BillingEventListener.name);

  @OnEvent('billing.daily.completed')
  handleDailyBillingCompleted(event: DailyBillingCompletedEvent) {
    this.logger.log(
      `📈 Ежедневное списание завершено: ${event.stats.successful}/${event.stats.total} успешно, ` +
      `сумма: ${event.stats.totalAmount.toFixed(2)} сом`
    );

    // Здесь можно добавить:
    // - Отправку Slack/Telegram уведомлений
    // - Email отчеты администраторам
    // - Webhook для внешних систем
  }

  @OnEvent('billing.payment.failed')
  handlePaymentFailed(event: PaymentFailedEvent) {
    this.logger.warn(
      `❌ Неудачное списание: Контракт ${event.contractId}, ` +
      `Водитель ${event.driverId}, Причина: ${event.reason}`
    );

    // Здесь можно добавить:
    // - SMS уведомления водителю
    // - Email менеджерам
    // - Создание задач в CRM
  }
}