import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companyService.create(createCompanyDto);
  }

  @Get()
  findAll(@User() user: CurrentUser) {
    // Super Admin видит все компании
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.companyService.findAll();
    }

    // Company Admin/Manager видит только свою компанию
    if (user.companyId) {
      return this.companyService.findByCompanyScope(user.companyId);
    }

    throw new ForbiddenException('Access denied');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @User() user: CurrentUser) {
    // Super Admin может получить любую компанию
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.companyService.findOne(id);
    }

    // Company Admin/Manager может получить только свою компанию
    if (user.companyId === id) {
      return this.companyService.findOne(id);
    }

    throw new ForbiddenException('Access denied to this company');
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @User() user: CurrentUser) {
    // Super Admin может получить статистику любой компании
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.companyService.getCompanyStats(id);
    }

    // Company Admin/Manager может получить статистику только своей компании
    if (user.companyId === id) {
      return this.companyService.getCompanyStats(id);
    }

    throw new ForbiddenException('Access denied to this company stats');
  }

  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateCompanyDto: UpdateCompanyDto,
    @User() user: CurrentUser,
  ) {
    // Super Admin может обновить любую компанию
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.companyService.update(id, updateCompanyDto);
    }

    // Company Admin может обновить только свою компанию
    if (user.role === UserRole.COMPANY_ADMIN && user.companyId === id) {
      return this.companyService.update(id, updateCompanyDto);
    }

    throw new ForbiddenException('Access denied to update this company');
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    // Только Super Admin может удалять компании
    return this.companyService.remove(id);
  }

  // Новый endpoint для получения своей компании
  @Get('me/company')
  getMyCompany(@User() user: CurrentUser) {
    if (!user.companyId) {
      throw new ForbiddenException('User is not associated with any company');
    }

    return this.companyService.findOne(user.companyId);
  }
}