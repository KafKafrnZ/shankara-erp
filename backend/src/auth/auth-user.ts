export type AuthRole = 'steward' | 'finance' | 'branch';

export type AuthUser = {
  id: string;
  email: string;
  role: AuthRole;
  companyId: string | null;
  branchId: string | null;
};

export type JwtPayload = {
  sub: string;
  role: AuthRole;
};
