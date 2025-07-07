import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Делаем модуль глобальным, чтобы не импортировать его в каждом модуле
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Экспортируем сервис для использования в других модулях
})
export class PrismaModule {}