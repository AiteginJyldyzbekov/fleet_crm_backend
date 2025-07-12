import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const CompanyFilter = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    const queryCompanyId = request.query.companyId;

    // Super Admin может фильтровать по любой компании
    if (user.role === UserRole.SUPER_ADMIN && queryCompanyId) {
      return queryCompanyId;
    }

    // Остальные видят только свою компанию
    return user.companyId;
  },
);