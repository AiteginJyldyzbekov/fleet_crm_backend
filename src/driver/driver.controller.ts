import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DriverService } from './driver.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('drivers')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  // Специальные endpoints для водителей - ДОЛЖНЫ БЫТЬ ПЕРВЫМИ!
  @Roles(UserRole.DRIVER)
  @Get('me/profile')
  getMyProfile(@User() user: CurrentUser) {
    return this.driverService.findOne(user.id, user);
  }

  @Roles(UserRole.DRIVER)
  @Get('me/payments')
  getMyPayments(@User() user: CurrentUser) {
    return this.driverService.getPaymentHistory(user.id, user);
  }

  @Roles(UserRole.DRIVER)
  @Get('me/stats')
  getMyStats(@User() user: CurrentUser) {
    return this.driverService.getDriverStats(user.id, user);
  }

  // Основные CRUD endpoints - ПОСЛЕ специальных маршрутов!
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDriverDto: CreateDriverDto, @User() user: CurrentUser) {
    return this.driverService.create(createDriverDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @Get()
  findAll(@User() user: CurrentUser, @Query('companyId') companyId?: string) {
    return this.driverService.findAll(user, companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @User() user: CurrentUser) {
    return this.driverService.findOne(id, user);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @User() user: CurrentUser) {
    return this.driverService.getDriverStats(id, user);
  }

  @Get(':id/payments')
  getPaymentHistory(
    @Param('id') id: string, 
    @User() user: CurrentUser,
    @Query('limit') limit?: number,
  ) {
    return this.driverService.getPaymentHistory(id, user, limit);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateDriverDto: UpdateDriverDto,
    @User() user: CurrentUser,
  ) {
    return this.driverService.update(id, updateDriverDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @Patch(':id/balance')
  updateBalance(
    @Param('id') id: string,
    @Body() updateBalanceDto: UpdateBalanceDto,
    @User() user: CurrentUser,
  ) {
    return this.driverService.updateBalance(id, updateBalanceDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @User() user: CurrentUser) {
    return this.driverService.remove(id, user);
  }
}