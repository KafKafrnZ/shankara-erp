import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: ('steward' | 'finance' | 'branch')[]) => SetMetadata(ROLES_KEY, roles);
