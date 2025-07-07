import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Включаем глобальную валидацию
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Удаляет свойства, которых нет в DTO
    forbidNonWhitelisted: true, // Выбрасывает ошибку при лишних свойствах
    transform: true, // Автоматически преобразует типы
  }));

  // Включаем CORS (если нужно для фронтенда)
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();