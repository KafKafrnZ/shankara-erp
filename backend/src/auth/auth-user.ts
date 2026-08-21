export type AuthRole = 'steward' | 'finance' | 'branch';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: AuthRole;
  companyId: string | null;
  branchId: string | null;
};

export function toAuthUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: AuthRole;
  companyId: string | null;
  branchId: string | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    companyId: user.companyId,
    branchId: user.branchId,
  };
}

export type JwtPayload = {
  sub: string;
  role: AuthRole;
};
