import logoUrl from '../assets/shankara-logo.svg';

type BrandLogoProps = {
  height?: number;
  className?: string;
};

export function BrandLogo({ height = 46, className }: BrandLogoProps) {
  return (
    <img
      src={logoUrl}
      alt="Shankara Buildpro"
      width={114}
      height={46}
      className={className}
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
}

export function LogoChip({ height = 28 }: { height?: number }) {
  return (
    <span className="logo-chip">
      <BrandLogo height={height} />
    </span>
  );
}
