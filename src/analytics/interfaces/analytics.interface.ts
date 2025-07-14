export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  profitMargin: number;
  revenueByType: Record<string, number>;
  expensesByCategory: Record<string, number>;
  outstandingDebts: number;
  averageRevenuePerDriver: number;
  averageRevenuePerVehicle: number;
}

export interface FleetKPI {
  totalVehicles: number;
  activeVehicles: number;
  utilization: number;
  averageRentalDuration: number;
  totalRevenue: number;
  revenuePerVehicle: number;
  maintenanceCosts: number;
  idleTime: number;
  topPerformingVehicles: VehicleKPI[];
  underPerformingVehicles: VehicleKPI[];
}

export interface VehicleKPI {
  vehicleId: string;
  model: string;
  plateNumber: string;
  utilization: number;
  revenue: number;
  expenses: number;
  profit: number;
  totalDaysRented: number;
  averageDailyRate: number;
}

export interface DriverKPI {
  driverId: string;
  name: string;
  totalRevenue: number;
  averageBalance: number;
  totalContracts: number;
  averageContractDuration: number;
  paymentDelays: number;
  currentDebt: number;
  rating: number;
}

export interface TimeSeriesData {
  date: string;
  revenue: number;
  expenses: number;
  profit: number;
  activeVehicles: number;
  activeDrivers: number;
  utilization: number;
}

export interface AnalyticsInsights {
  riskDrivers: DriverKPI[];
  underPerformingVehicles: VehicleKPI[];
  recommendations: string[];
  alerts: AnalyticsAlert[];
}

export interface AnalyticsAlert {
  type: 'WARNING' | 'CRITICAL' | 'INFO';
  message: string;
  entityId?: string;
  entityType?: 'DRIVER' | 'VEHICLE' | 'CONTRACT';
  value?: number;
  threshold?: number;
}