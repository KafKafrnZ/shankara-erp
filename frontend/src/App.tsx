import { useState } from 'react'
import './App.css'

function App() {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="erp-container">
      {/* Top Navigation Bar */}
      <nav className="top-nav">
        <div className="nav-brand">
          <h1>Shankara Buildpro <span>ERP Data Layer</span></h1>
        </div>
        <div className="nav-user">
          <span className="steward-badge">Steward Access</span>
          <div className="avatar">A</div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        
        {/* Search Section */}
        <section className="search-section">
          <h2>Universal Search</h2>
          <p>Find vouchers, parties, or items instantly across all branches.</p>
          
          <div className="search-box-container">
            <input 
              type="text" 
              className="search-input"
              placeholder="e.g. INV/HYD/11820, Sri Steel Traders, or 1248500..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button className="search-button">Search</button>
          </div>
          
          <div className="search-filters">
            <span className="filter-pill active">All Entities</span>
            <span className="filter-pill">Vouchers</span>
            <span className="filter-pill">Parties</span>
            <span className="filter-pill">Items</span>
          </div>
        </section>

        {/* Data Grid Placeholder */}
        <section className="data-grid-section">
          <div className="grid-header">
            <h3>Recent Uploads / Hits</h3>
            <span className="data-freshness">Data as of: 17 Aug 2026 14:10 IST</span>
          </div>
          
          <div className="grid-placeholder">
            <div className="grid-icon">📊</div>
            <p>The high-performance Data Grid (AG Grid) will render here.</p>
            <p className="sub-text">Once we connect the NestJS Backend and ingest the Excel data, this area will display millions of rows with instant sub-second scrolling and Excel export capabilities.</p>
          </div>
        </section>

      </main>
    </div>
  )
}

export default App
