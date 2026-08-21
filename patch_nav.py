import re

with open('frontend/src/components/AppShell.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    '''            <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Search
            </NavLink>
            {user.role === 'steward' && (
              <NavLink to="/upload" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                Upload
              </NavLink>
            )}''',
    '''            <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Vouchers
            </NavLink>
            <NavLink to="/catalog" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Catalog
            </NavLink>
            {user.role === 'steward' && (
              <>
                <NavLink to="/upload" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                  Upload
                </NavLink>
                <NavLink to="/catalog/upload" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                  Catalog Upload
                </NavLink>
              </>
            )}'''
)

with open('frontend/src/components/AppShell.tsx', 'w') as f:
    f.write(content)
