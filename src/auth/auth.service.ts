// src/auth/auth.service.ts - ОБНОВЛЕННАЯ ВЕРСИЯ
import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, phone, role, companyId } = registerDto;

    // Проверяем, существует ли пользователь в любой из таблиц
    const [existingUser, existingDriver] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.driver.findUnique({ where: { email } }),
    ]);

    if (existingUser || existingDriver) {
      throw new ConflictException('User with this email already exists');
    }

    // Валидация: для ролей кроме SUPER_ADMIN нужна компания
    if (role !== UserRole.SUPER_ADMIN && !companyId) {
      throw new BadRequestException('Company ID is required for this role');
    }

    // Валидация: SUPER_ADMIN не должен принадлежать компании
    if (role === UserRole.SUPER_ADMIN && companyId) {
      throw new BadRequestException('Super Admin cannot belong to a company');
    }

    // Проверяем, существует ли компания (если указана)
    if (companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        throw new BadRequestException('Company not found');
      }

      if (!company.isActive) {
        throw new BadRequestException('Company is not active');
      }
    }

    // Хешируем пароль
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Создаем пользователя (только для ролей кроме DRIVER)
    if (role !== UserRole.DRIVER) {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          role,
          companyId,
        },
        include: {
          company: true,
        },
      });

      const { password: _, ...userWithoutPassword } = user;
      const token = await this.generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        userType: 'user',
      });

      return {
        user: userWithoutPassword,
        token,
        userType: 'user',
      };
    } else {
      throw new BadRequestException('Drivers should be created through the Driver API');
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Сначала ищем в таблице User
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (user) {
      return this.handleUserLogin(user, password);
    }

    // Если не найден в User, ищем в таблице Driver
    const driver = await this.prisma.driver.findUnique({
      where: { email },
      include: { company: true },
    });

    if (driver) {
      return this.handleDriverLogin(driver, password);
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  private async handleUserLogin(user: any, password: string) {
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.company && !user.company.isActive) {
      throw new UnauthorizedException('Company is deactivated');
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = await this.generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      userType: 'user',
    });

    return {
      user: userWithoutPassword,
      token,
      userType: 'user',
    };
  }

  private async handleDriverLogin(driver: any, password: string) {
    if (!driver.isActive) {
      throw new UnauthorizedException('Driver account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, driver.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (driver.company && !driver.company.isActive) {
      throw new UnauthorizedException('Company is deactivated');
    }

    const { password: _, ...driverWithoutPassword } = driver;
    const token = await this.generateToken({
      id: driver.id,
      email: driver.email,
      role: UserRole.DRIVER,
      companyId: driver.companyId,
      userType: 'driver',
    });

    return {
      user: driverWithoutPassword,
      token,
      userType: 'driver',
    };
  }

  async validateUser(email: string, password: string) {
    // Проверяем в обеих таблицах
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user && await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return { ...result, userType: 'user' };
    }

    const driver = await this.prisma.driver.findUnique({
      where: { email },
    });

    if (driver && await bcrypt.compare(password, driver.password)) {
      const { password: _, ...result } = driver;
      return { ...result, userType: 'driver', role: UserRole.DRIVER };
    }

    return null;
  }

  private async generateToken(payload: any) {
    // Убеждаемся, что payload содержит все необходимые поля
    const tokenPayload = {
      sub: payload.id,        // user/driver ID
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId || null,
      userType: payload.userType,
    };

    console.log('Generating token with payload:', tokenPayload); // Временный лог для отладки

    return this.jwtService.sign(tokenPayload);
  }

  async getProfile(userId: string, userType: string = 'user') {
    if (userType === 'driver') {
      const driver = await this.prisma.driver.findUnique({
        where: { id: userId },
        include: { 
          company: true,
          _count: {
            select: {
              contracts: true,
              payments: true,
            },
          },
        },
      });

      if (!driver) {
        throw new UnauthorizedException('Driver not found');
      }

      const { password: _, ...driverWithoutPassword } = driver;
      return { ...driverWithoutPassword, userType: 'driver', role: UserRole.DRIVER };
    }

    // Существующий код для User
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { password: _, ...userWithoutPassword } = user;
    return { ...userWithoutPassword, userType: 'user' };
  }
}