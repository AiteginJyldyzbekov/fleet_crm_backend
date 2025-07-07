// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId?: string;
  company?: any;
  userType?: 'user' | 'driver';
  balance?: number; // Для водителей
}

export const User = createParamDecorator(
  (data: keyof CurrentUser | undefined, ctx: ExecutionContext): CurrentUser | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);