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
import { VehicleService } from './vehicle.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, VehicleStatus } from '@prisma/client';

@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  // Специальные endpoints - ДОЛЖНЫ БЫТЬ ПЕРВЫМИ!
  @Get('available')
  getAvailable(@User() user: CurrentUser, @Query('companyId') companyId?: string) {
    return this.vehicleService.getAvailableVehicles(user, companyId);
  }

  // Основные CRUD endpoints
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createVehicleDto: CreateVehicleDto, @User() user: CurrentUser) {
    return this.vehicleService.create(createVehicleDto, user);
  }

  @Get()
  findAll(
    @User() user: CurrentUser, 
    @Query('companyId') companyId?: string,
    @Query('status') status?: VehicleStatus,
  ) {
    return this.vehicleService.findAll(user, companyId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @User() user: CurrentUser) {
    return this.vehicleService.findOne(id, user);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @User() user: CurrentUser) {
    return this.vehicleService.getVehicleStats(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateVehicleDto: UpdateVehicleDto,
    @User() user: CurrentUser,
  ) {
    return this.vehicleService.update(id, updateVehicleDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @User() user: CurrentUser,
  ) {
    return this.vehicleService.updateStatus(id, updateStatusDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @User() user: CurrentUser) {
    return this.vehicleService.remove(id, user);
  }
}