import React, { useState } from 'react';

export default function ThreatPanel({ threats = [], onSelectThreat, selectedThreatId }) {
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const activeThreats = threats.filter(t => t.status !== 'CLOSED' && t.status !== 'RESOLVED');
  
  const filteredThreats = activeThreats.filter(t => {
    const matchesSev = filterSeverity === 'ALL' || t.severity === filterSeverity;
    const matchesQuery = !searchQuery || 
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSev && matchesQuery;
  });

  const criticalCount = activeThreats.filter(t => t.severity === 'CRITICAL').length;
  const highCount = activeThreats.filter(t => t.severity === 'HIGH').length;
  const modLowCount = activeThreats.filter(t => t.severity === 'MODERATE' || t.severity === 'LOW').length;

  return (
    <div className="bg-white border border-[#D9E0E8] rounded-md shadow-sm flex flex-col h-full overflow-hidden text-slate-900 font-sans">
      {/* Panel Header */}
      <div className="p-3 border-b border-[#D9E0E8] bg-slate-50 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
          <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#0B4F8A]">
            COP THREAT INTELLIGENCE
          </h3>
        </div>
        <span className="bg-red-100 text-red-800 text-[10px] font-black px-2 py-0.5 rounded-full">
          {activeThreats.length} Active
        </span>
      </div>

      {/* Severity Breakdown Bar */}
      <div className="grid grid-cols-3 text-center border-b border-[#D9E0E8] bg-white text-[10px] shrink-0 font-bold">
        <button 
          onClick={() => setFilterSeverity('CRITICAL')}
          className={`py-1.5 border-r border-[#D9E0E8] transition ${filterSeverity === 'CRITICAL' ? 'bg-red-50 text-red-800 font-extrabold' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <span className="text-red-700">CRITICAL:</span> {criticalCount}
        </button>
        <button 
          onClick={() => setFilterSeverity('HIGH')}
          className={`py-1.5 border-r border-[#D9E0E8] transition ${filterSeverity === 'HIGH' ? 'bg-amber-50 text-amber-800 font-extrabold' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <span className="text-amber-700">HIGH:</span> {highCount}
        </button>
        <button 
          onClick={() => setFilterSeverity('ALL')}
          className={`py-1.5 transition ${filterSeverity === 'ALL' ? 'bg-blue-50 text-blue-900 font-extrabold' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <span>ALL:</span> {activeThreats.length}
        </button>
      </div>

      {/* Search Filter */}
      <div className="p-2 border-b border-[#D9E0E8] bg-slate-50 shrink-0">
        <input 
          type="text"
          placeholder="Filter threats by category or title..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full text-xs px-2.5 py-1 bg-white border border-slate-300 rounded focus:border-[#0B4F8A] outline-none"
        />
      </div>

      {/* Threat List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredThreats.length === 0 ? (
          <div className="text-slate-400 italic text-xs text-center py-6">
            No active threat events found.
          </div>
        ) : (
          filteredThreats.map(t => {
            const isSelected = selectedThreatId === t.id;
            return (
              <div 
                key={t.id}
                onClick={() => onSelectThreat && onSelectThreat(t)}
                className={`p-2.5 rounded border transition cursor-pointer text-xs space-y-1 ${
                  isSelected 
                    ? 'bg-blue-50 border-[#0B4F8A] ring-1 ring-[#0B4F8A]' 
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-start gap-1">
                  <span className="font-extrabold text-slate-900 leading-snug line-clamp-1">
                    {t.title}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black text-white shrink-0 ${
                    t.severity === 'CRITICAL' ? 'bg-red-700' :
                    t.severity === 'HIGH' ? 'bg-amber-600' : 'bg-yellow-600'
                  }`}>
                    {t.severity}
                  </span>
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-600">
                  <span className="font-bold text-[#0B4F8A]">{t.category}</span>
                  <span>Confidence: <strong className="text-slate-800">{t.confidence}</strong></span>
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                  <span>Radius: <strong>{t.radius_m}m</strong></span>
                  <span className="font-mono text-[9px] text-slate-400">{t.id}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
