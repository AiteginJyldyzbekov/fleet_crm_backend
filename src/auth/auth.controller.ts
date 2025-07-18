// src/auth/auth.controller.ts
import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';
import { User, CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@User() user: CurrentUser) {
    return this.authService.getProfile(user.id, user.userType);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getCurrentUser(@User() user: CurrentUser) {
    return user;
  }

  // Дополнительный endpoint для проверки типа пользователя
  @UseGuards(JwtAuthGuard)
  @Get('user-type')
  getUserType(@User() user: CurrentUser) {
    return {
      userType: user.userType,
      role: user.role,
      hasCompany: !!user.companyId,
      isDriver: user.userType === 'driver',
    };
  }
}