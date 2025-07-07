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

    // Проверяем, существует ли пользователь
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
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

    // Создаем пользователя
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

    // Удаляем пароль из ответа
    const { password: _, ...userWithoutPassword } = user;

    // Генерируем JWT токен
    const token = await this.generateToken(user);

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Находим пользователя
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Проверяем пароль
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Проверяем, активна ли компания (если пользователь принадлежит компании)
    if (user.company && !user.company.isActive) {
      throw new UnauthorizedException('Company is deactivated');
    }

    // Удаляем пароль из ответа
    const { password: _, ...userWithoutPassword } = user;

    // Генерируем JWT токен
    const token = await this.generateToken(user);

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user && await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return result;
    }

    return null;
  }

  private async generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    return this.jwtService.sign(payload);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}