import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo, LogoChip } from '../components/BrandLogo.tsx';
import { DotField } from '../components/DotField.tsx';

// Deliberately NOT a real <button> wrapping the whole panel: DotField
// suppresses its reactive glow over anything matching its interactive
// selector (which includes "button"), and the glow reacting across this
// whole panel — the actual visual point of this screen — is exactly what
// we want. So each panel is a div acting as a big custom button (role +
// keyboard handling for real accessibility), with only the small CTA
// label itself marked role="button" so the glow still politely steps
// aside right on that one label, same as any other real button in the app.
export function ChooserPage() {
  const navigate = useNavigate();

  const enterVouchers = () => navigate('/login?next=%2F');
  const enterCatalog = () => navigate('/login?next=%2Fcatalog');

  const onPanelKeyDown = (e: KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="chooser-page">
      <div
        className="chooser-panel chooser-panel-red"
        role="button"
        tabIndex={0}
        aria-label="Enter Day Book and Vouchers"
        onClick={enterVouchers}
        onKeyDown={(e) => onPanelKeyDown(e, enterVouchers)}
      >
        <DotField variant="dark" dotColor="0, 0, 0" fill="container" />
        <div className="chooser-panel-content">
          <LogoChip height={32} />
          <h2>Day Book &amp; Vouchers</h2>
          <p>The book of record. Search-first, published data only.</p>
          <span className="chooser-cta chooser-cta-dark" role="button">Enter Vouchers →</span>
        </div>
      </div>

      <div className="chooser-divider" aria-hidden="true" />

      <div
        className="chooser-panel chooser-panel-black"
        role="button"
        tabIndex={0}
        aria-label="Enter Catalog and Uploads"
        onClick={enterCatalog}
        onKeyDown={(e) => onPanelKeyDown(e, enterCatalog)}
      >
        <DotField variant="dark" fill="container" />
        <div className="chooser-panel-content">
          <BrandLogo height={32} />
          <h2>Catalog &amp; Uploads</h2>
          <p>Upload, search, and manage any item catalog — fast.</p>
          <span className="chooser-cta chooser-cta-red" role="button">Enter Catalog →</span>
        </div>
      </div>
    </div>
  );
}
