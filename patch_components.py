import re

with open('frontend/src/pages/LoginPage.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "import { isApiError } from '../lib/api.ts';",
    "import { isApiError } from '../lib/api.ts';\nimport { DotField } from '../components/DotField.tsx';"
)
content = content.replace(
    '<div className="login-page">',
    '<div className="login-page">\n      <DotField variant="dark" />'
)
with open('frontend/src/pages/LoginPage.tsx', 'w') as f:
    f.write(content)

with open('frontend/src/components/AppShell.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "import { LogoChip } from './BrandLogo.tsx';",
    "import { LogoChip } from './BrandLogo.tsx';\nimport { DotField } from './DotField.tsx';"
)
content = content.replace(
    '<div className="app-shell">',
    '<div className="app-shell">\n      <DotField variant="light" />'
)
with open('frontend/src/components/AppShell.tsx', 'w') as f:
    f.write(content)
