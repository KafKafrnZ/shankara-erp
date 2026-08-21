import re

with open('frontend/src/App.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "import { UploadPage } from './pages/UploadPage.tsx';",
    "import { UploadPage } from './pages/UploadPage.tsx';\nimport { CatalogPage } from './pages/CatalogPage.tsx';\nimport { CatalogUploadPage } from './pages/CatalogUploadPage.tsx';"
)

content = content.replace(
    '<Route path="/" element={<SearchPage />} />',
    '<Route path="/" element={<SearchPage />} />\n          <Route path="/catalog" element={<CatalogPage />} />\n          <Route path="/catalog/upload" element={<CatalogUploadPage />} />'
)

with open('frontend/src/App.tsx', 'w') as f:
    f.write(content)
