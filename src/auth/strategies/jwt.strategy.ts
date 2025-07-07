// src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // user/driver ID
  email: string;
  role: string;
  companyId?: string;
  userType: 'user' | 'driver'; // Новое поле
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    // Проверяем, что payload содержит необходимые данные
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.userType === 'driver') {
      const driver = await this.prisma.driver.findUnique({
        where: { id: payload.sub },
        include: { company: true },
      });

      if (!driver || !driver.isActive) {
        throw new UnauthorizedException('Driver not found or inactive');
      }

      return {
        id: driver.id,
        email: driver.email,
        firstName: driver.firstName,
        lastName: driver.lastName,
        role: 'DRIVER',
        companyId: driver.companyId,
        company: driver.company,
        userType: 'driver',
        balance: driver.balance, // Добавляем баланс для водителей
      };
    }

    // Существующий код для User
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { company: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      company: user.company,
      userType: 'user',
    };
  }
}