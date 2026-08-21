import re

with open('frontend/src/index.css', 'r') as f:
    content = f.read()

content = content.replace(
    'a {\n  color: var(--ink);\n  text-decoration: none;\n}',
    'a {\n  color: var(--ink);\n  text-decoration: none;\n  transition: color var(--transition-fast);\n}'
)

content = content.replace(
    'a:hover {\n  color: var(--accent-deep);\n}',
    'a:hover {\n  color: var(--accent-deep);\n}\n\na:active {\n  color: var(--accent);\n}'
)

content = content.replace(
    '.nav-link {\n  padding: 6px 10px;\n  border-radius: var(--radius);\n  color: var(--muted);\n  font-weight: 500;\n}',
    '.nav-link {\n  padding: 6px 10px;\n  border-radius: var(--radius);\n  color: var(--muted);\n  font-weight: 500;\n  transition: color var(--transition-fast), background-color var(--transition-fast);\n}'
)

content = content.replace(
    '.nav-link.active {\n  box-shadow: inset 0 -2px 0 var(--accent);\n}',
    '.nav-link.active {\n  box-shadow: inset 0 -2px 0 var(--accent);\n}\n\n.nav-link:active:not(.active) {\n  background: #e2e2e2;\n}'
)

content = content.replace(
    '.btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  border-radius: var(--radius);\n  border: 1px solid transparent;\n  padding: 8px 14px;\n  font-weight: 600;\n  line-height: 1.2;\n}',
    '.btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  border-radius: var(--radius);\n  border: 1px solid transparent;\n  padding: 8px 14px;\n  font-weight: 600;\n  line-height: 1.2;\n  transition: background-color var(--transition-fast), transform var(--transition-fast), border-color var(--transition-fast);\n}\n\n.btn:active:not(:disabled) {\n  transform: scale(0.98);\n}'
)

content = content.replace(
    '.btn-primary:hover:not(:disabled) {\n  background: var(--accent-deep);\n}',
    '.btn-primary:hover:not(:disabled) {\n  background: var(--accent-deep);\n}\n\n.btn-primary:active:not(:disabled) {\n  background: #a1040d;\n}'
)

content = content.replace(
    '.btn-secondary:hover:not(:disabled) {\n  background: var(--sb-mist);\n}',
    '.btn-secondary:hover:not(:disabled) {\n  background: var(--sb-mist);\n}\n\n.btn-secondary:active:not(:disabled) {\n  background: #e2e2e2;\n}'
)

content = content.replace(
    '.btn-ghost:hover:not(:disabled) {\n  background: var(--sb-mist);\n}',
    '.btn-ghost:hover:not(:disabled) {\n  background: var(--sb-mist);\n}\n\n.btn-ghost:active:not(:disabled) {\n  background: #e2e2e2;\n}'
)

content = content.replace(
    'tr.clickable {\n  cursor: pointer;\n}',
    'tr.clickable {\n  cursor: pointer;\n  transition: background-color var(--transition-fast);\n}'
)

content = content.replace(
    'tr.clickable:hover {\n  background: #fafafa;\n}',
    'tr.clickable:hover {\n  background: #fafafa;\n}\n\ntr.clickable:active {\n  background: #f0f0f0;\n}'
)

content = content.replace(
    '.linkish {\n  background: none;\n  border: none;\n  padding: 0 6px 0 0;\n  color: var(--muted);\n  font-size: 12px;\n  text-decoration: underline;\n  text-underline-offset: 2px;\n}',
    '.linkish {\n  background: none;\n  border: none;\n  padding: 0 6px 0 0;\n  color: var(--muted);\n  font-size: 12px;\n  text-decoration: underline;\n  text-underline-offset: 2px;\n  transition: color var(--transition-fast);\n}'
)

content = content.replace(
    '.linkish:hover {\n  color: var(--ink);\n}',
    '.linkish:hover {\n  color: var(--ink);\n}\n\n.linkish:active {\n  color: var(--accent-deep);\n}'
)

with open('frontend/src/index.css', 'w') as f:
    f.write(content)
