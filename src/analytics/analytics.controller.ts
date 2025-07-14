import { Controller, Get, Query, Param, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { User } from '@prisma/client';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { FinancialAnalyticsService } from './financial-analytics.service';
import { FleetAnalyticsService } from './fleet-analytics.service';
import { DriverAnalyticsService } from './driver-analytics.service';

// Расширяем интерфейс Request для типизации пользователя
interface AuthenticatedRequest extends Request {
  user: User;
}

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(
    private readonly financialAnalyticsService: FinancialAnalyticsService,
    private readonly fleetAnalyticsService: FleetAnalyticsService,
    private readonly driverAnalyticsService: DriverAnalyticsService,
  ) {}

  private validateCompanyId(user: User): string {
    if (!user.companyId) {
      throw new BadRequestException('User must be associated with a company');
    }
    return user.companyId;
  }

  @Get('financial/summary')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get financial summary' })
  @ApiResponse({ status: 200, description: 'Financial summary retrieved successfully' })
  async getFinancialSummary(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.financialAnalyticsService.getFinancialSummary(companyId, query);
  }

  @Get('financial/time-series')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get revenue time series data' })
  async getRevenueTimeSeries(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.financialAnalyticsService.getRevenueTimeSeries(companyId, query);
  }

  @Get('financial/revenue-by-driver')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get revenue breakdown by driver' })
  async getRevenueByDriver(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.financialAnalyticsService.getRevenueByDriver(companyId, query);
  }

  @Get('financial/revenue-by-vehicle')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get revenue breakdown by vehicle' })
  async getRevenueByVehicle(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.financialAnalyticsService.getRevenueByVehicle(companyId, query);
  }

  @Get('financial/cash-flow-forecast')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get cash flow forecast' })
  async getCashFlowForecast(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: number,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.financialAnalyticsService.getCashFlowForecast(companyId, days);
  }

  @Get('fleet/kpi')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get fleet KPIs' })
  async getFleetKPI(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.fleetAnalyticsService.getFleetKPI(companyId, query);
  }

  @Get('fleet/utilization-history')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get vehicle utilization history' })
  async getVehicleUtilizationHistory(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.fleetAnalyticsService.getVehicleUtilizationHistory(companyId, query);
  }

  @Get('fleet/maintenance-schedule')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get maintenance schedule' })
  async getMaintenanceSchedule(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: number,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.fleetAnalyticsService.getMaintenanceSchedule(companyId, days);
  }

  @Get('fleet/performance-comparison')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get vehicle performance comparison' })
  async getVehiclePerformanceComparison(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.fleetAnalyticsService.getVehiclePerformanceComparison(companyId, query);
  }

  @Get('fleet/vehicle/:vehicleId')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get specific vehicle KPIs' })
  async getVehicleKPI(
    @Req() req: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.fleetAnalyticsService.getVehicleKPI(companyId, vehicleId, query);
  }

  @Get('drivers/ranking')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get driver performance ranking' })
  async getDriverPerformanceRanking(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.driverAnalyticsService.getDriverPerformanceRanking(companyId, query);
  }

  @Get('drivers/:driverId')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get specific driver KPIs' })
  async getDriverKPI(
    @Req() req: AuthenticatedRequest,
    @Param('driverId') driverId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.driverAnalyticsService.getDriverKPI(companyId, driverId, query);
  }

  @Get('drivers/:driverId/timeline')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get driver activity timeline' })
  async getDriverActivityTimeline(
    @Req() req: AuthenticatedRequest,
    @Param('driverId') driverId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.driverAnalyticsService.getDriverActivityTimeline(companyId, driverId, query);
  }

  @Get('drivers/:driverId/financial')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get driver financial summary' })
  async getDriverFinancialSummary(
    @Req() req: AuthenticatedRequest,
    @Param('driverId') driverId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.driverAnalyticsService.getDriverFinancialSummary(companyId, driverId, query);
  }

  @Get('insights')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get analytics insights and recommendations' })
  async getRiskAnalysis(@Req() req: AuthenticatedRequest) {
    const companyId = this.validateCompanyId(req.user);
    return this.driverAnalyticsService.getRiskAnalysis(companyId);
  }
}