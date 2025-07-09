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
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, ContractStatus } from '@prisma/client';

@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  // Специальные endpoints для водителей - ДОЛЖНЫ БЫТЬ ПЕРВЫМИ!
  @Roles(UserRole.DRIVER)
  @Get('me/active')
  getMyActiveContract(@User() user: CurrentUser) {
    return this.contractService.findAll(user, undefined, ContractStatus.ACTIVE);
  }

  @Roles(UserRole.DRIVER)
  @Get('me/history')
  getMyContracts(@User() user: CurrentUser) {
    return this.contractService.findAll(user);
  }

  // Общие endpoints
  @Get('active')
  getActiveContracts(
    @User() user: CurrentUser, 
    @Query('companyId') companyId?: string
  ) {
    return this.contractService.getActiveContracts(user, companyId);
  }

  // Основные CRUD endpoints
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createContractDto: CreateContractDto, @User() user: CurrentUser) {
    return this.contractService.create(createContractDto, user);
  }

  @Get()
  findAll(
    @User() user: CurrentUser,
    @Query('companyId') companyId?: string,
    @Query('status') status?: ContractStatus,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.contractService.findAll(user, companyId, status, driverId, vehicleId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @User() user: CurrentUser) {
    return this.contractService.findOne(id, user);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @User() user: CurrentUser) {
    return this.contractService.getContractStats(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateContractDto: UpdateContractDto,
    @User() user: CurrentUser,
  ) {
    return this.contractService.update(id, updateContractDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @User() user: CurrentUser,
  ) {
    return this.contractService.updateStatus(id, updateStatusDto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @User() user: CurrentUser) {
    return this.contractService.remove(id, user);
  }
}