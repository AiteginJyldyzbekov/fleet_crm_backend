import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from '@prisma/client';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    try {
      return await this.prisma.company.create({
        data: createCompanyDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Company with this email already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<Company[]> {
    return this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            drivers: true,
            vehicles: true,
            contracts: true,
          },
        },
      },
    });
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            drivers: true,
            vehicles: true,
            contracts: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    try {
      return await this.prisma.company.update({
        where: { id },
        data: updateCompanyDto,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Company with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Company with this email already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<Company> {
    try {
      return await this.prisma.company.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Company with ID ${id} not found`);
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<Company | null> {
    return this.prisma.company.findUnique({
      where: { email },
    });
  }

  async findByCompanyScope(companyId: string): Promise<Company[]> {
    // Для Company Admin/Manager возвращаем только их компанию в массиве
    const company = await this.findOne(companyId);
    return [company];
  }

  async getCompanyStats(id: string) {
    const company = await this.findOne(id);
    
    const [
      totalDrivers,
      activeDrivers, 
      totalVehicles,
      availableVehicles,
      activeContracts,
      totalRevenue
    ] = await Promise.all([
      this.prisma.driver.count({ where: { companyId: id } }),
      this.prisma.driver.count({ where: { companyId: id, isActive: true } }),
      this.prisma.vehicle.count({ where: { companyId: id } }),
      this.prisma.vehicle.count({ where: { companyId: id, status: 'AVAILABLE' } }),
      this.prisma.contract.count({ where: { companyId: id, status: 'ACTIVE' } }),
      this.prisma.payment.aggregate({
        where: { 
          companyId: id,
          type: 'DAILY_RENT'
        },
        _sum: { amount: true }
      })
    ]);

    return {
      company,
      stats: {
        totalDrivers,
        activeDrivers,
        totalVehicles,
        availableVehicles,
        activeContracts,
        totalRevenue: totalRevenue._sum.amount || 0,
      }
    };
  }
}