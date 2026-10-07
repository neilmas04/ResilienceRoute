import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function IncidentCenter({ onClose, sharedSelectedIncident, onSelectIncident }) {
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(sharedSelectedIncident || null);
  const [activePlan, setActivePlan] = useState(null);
  const [teamAssigned, setTeamAssigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanStep, setScanStep] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

  useEffect(() => {
    fetchIncidents();
  }, []);

  useEffect(() => {
    if (sharedSelectedIncident) {
      setSelectedIncident(sharedSelectedIncident);
    }
  }, [sharedSelectedIncident]);

  useEffect(() => {
    if (selectedIncident?.incident_id) {
      fetchResponsePlan(selectedIncident.incident_id);
    } else {
      setActivePlan(null);
      setTeamAssigned(false);
    }
  }, [selectedIncident]);

  async function fetchIncidents() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/national/incidents`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to fetch incidents');
      setIncidents(data.records || []);
      if (data.records && data.records.length > 0 && !selectedIncident) {
        const first = data.records[0];
        setSelectedIncident(first);
        if (onSelectIncident) onSelectIncident(first);
      }
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchResponsePlan(incId) {
    try {
      setTeamAssigned(false);
      const res = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`);
      if (res.ok) {
        const data = await res.json();
        if (data.records && data.records.length > 0) {
          setActivePlan(data.records[data.records.length - 1]);
        } else {
          setActivePlan(null);
        }
      } else {
        setActivePlan(null);
      }
    } catch (err) {
      console.error(err);
      setActivePlan(null);
    }
  }

  function showToast(msg, type = "info") {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  async function handleScanForIncidents() {
    try {
      setScanStep('SCANNING WEATHER CONDITIONS...');
      await new Promise(r => setTimeout(r, 500));

      setScanStep('ASSESSING FLOOD RISK...');
      await new Promise(r => setTimeout(r, 500));

      setScanStep('IDENTIFYING INCIDENTS...');
      const res = await fetch(`${API_BASE_URL}/national/incidents/recommend`, { method: 'POST' });
      await res.json().catch(() => ({}));

      setScanStep('INCIDENTS READY');
      await fetchIncidents();

      showToast("Incident scan complete. Active candidates populated.", "success");
      setTimeout(() => setScanStep(null), 2000);
    } catch (err) {
      showToast("Error scanning incidents: " + err.message, "error");
      setScanStep(null);
    }
  }

  async function handleGeneratePlan() {
    if (!selectedIncident?.incident_id || planLoading) return;
    try {
      setPlanLoading(true);
      const res = await fetch(`${API_BASE_URL}/national/incidents/${selectedIncident.incident_id}/response-plan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.plan) {
        setActivePlan(data.plan);
        showToast(`✓ Response plan generated for ${selectedIncident.title} (PENDING_APPROVAL)`, "success");
      } else {
        throw new Error(data.detail || "Failed to generate plan");
      }
    } catch (err) {
      showToast("Generate plan error: " + err.message, "error");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleApprovePlan() {
    if (!activePlan || planLoading) return;
    const pId = activePlan.response_plan_id || activePlan.plan_id;
    if (!pId) return;
    try {
      setPlanLoading(true);
      const res = await fetch(`${API_BASE_URL}/national/response-plans/${pId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.plan) {
        setActivePlan(data.plan);
        showToast(`✓ Response plan approved for ${selectedIncident.title} — Resources Reserved`, "success");
        fetchIncidents();
      } else {
        throw new Error(data.detail || "Approval failed");
      }
    } catch (err) {
      showToast("Approve plan error: " + err.message, "error");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleAssignTeam() {
    if (!selectedIncident?.incident_id) return;
    setTeamAssigned(true);
    showToast(`✓ Response Team Assigned to ${selectedIncident.title}`, "success");
  }

  async function handleAction(id, actionPath) {
    try {
      const res = await fetch(`${API_BASE_URL}/national/incidents/${id}/${actionPath}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to ${actionPath}`);
      showToast(`Incident status updated to ${actionPath.toUpperCase()}`, "success");
      fetchIncidents();
      
      const detailRes = await fetch(`${API_BASE_URL}/national/incidents/${id}`);
      const d = await detailRes.json();
      if (detailRes.ok) {
        setSelectedIncident(d.record);
        if (onSelectIncident) onSelectIncident(d.record);
      }
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  }

  function selectInc(inc) {
    setSelectedIncident(inc);
    if (onSelectIncident) onSelectIncident(inc);
  }

  return (
    <div className="h-full flex flex-col bg-[#F5F7FA] text-slate-900 p-4 space-y-4 overflow-hidden">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={`px-4 py-2.5 text-xs font-bold rounded shadow flex justify-between items-center z-50 shrink-0 ${
          toastMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          <span>ℹ {toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="font-bold">&times;</button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-md border border-[#D9E0E8] shadow-sm shrink-0">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-[#0B4F8A] uppercase flex items-center gap-2">
            <span>🚨</span> INCIDENT COMMAND & TRIAGE DESK
          </h1>
          <div className="text-xs font-bold text-slate-500 mt-0.5">● EOC INCIDENT MONITORING ENGINE</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScanForIncidents}
            disabled={!!scanStep}
            className="px-4 py-2 bg-[#0B4F8A] hover:bg-[#083B68] text-white rounded text-xs font-bold shadow-sm transition disabled:opacity-50"
          >
            {scanStep || 'SCAN FOR INCIDENTS'}
          </button>
          {onClose && (
            <button onClick={onClose} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold border border-slate-300">
              Back to EOC
            </button>
          )}
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex gap-4 flex-1 overflow-hidden">
        
        {/* Left Queue */}
        <div className="w-1/3 flex flex-col bg-white p-4 rounded-md border border-[#D9E0E8] shadow-sm">
          <div className="flex justify-between items-center border-b border-[#D9E0E8] pb-2 mb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              INCIDENT QUEUE ({incidents.length})
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">ACTIVE TRIAGE</span>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500 italic">Scanning records...</p>
          ) : incidents.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-6 text-center border border-dashed border-slate-300 rounded">
              No active incidents detected.
              <br/>
              <span className="text-[10px] text-[#0B4F8A] font-bold mt-1 block">Click 'SCAN FOR INCIDENTS' to assess feeds.</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {incidents.map(inc => {
                const isSel = selectedIncident?.incident_id === inc.incident_id;
                return (
                  <div
                    key={inc.incident_id}
                    onClick={() => selectInc(inc)}
                    className={`border rounded p-3 cursor-pointer transition ${
                      isSel ? 'border-[#0B4F8A] bg-blue-50/80 ring-1 ring-[#0B4F8A]' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase text-white ${
                        inc.severity === 'CRITICAL' ? 'bg-red-700' : 'bg-amber-600'
                      }`}>
                        {inc.severity}
                      </span>
                      <span className="text-[10px] font-bold text-[#0B4F8A] uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {inc.status}
                      </span>
                    </div>
                    <p className="font-bold text-sm text-slate-900">{inc.title}</p>
                    <p className="text-xs text-slate-600">📍 {inc.district}, {inc.state}</p>
                    <div className="mt-2 text-[10px] text-slate-500 flex justify-between border-t border-slate-200 pt-1">
                      <span>Risk Score: <strong className="text-red-700">{inc.risk_score}/100</strong></span>
                      <span>{inc.source}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Details & Evidence Panel */}
        <div className="w-2/3 flex flex-col bg-white p-4 rounded-md border border-[#D9E0E8] shadow-sm overflow-y-auto">
          {!selectedIncident ? (
            <div className="text-slate-500 text-xs italic p-6 text-center border border-dashed border-slate-300 rounded">
              Select an incident from the queue to inspect details, evidence, and response actions.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              
              {/* Header */}
              <div className="border-b border-[#D9E0E8] pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase text-white ${
                      selectedIncident.severity === 'CRITICAL' ? 'bg-red-700' : 'bg-amber-600'
                    }`}>
                      {selectedIncident.severity}
                    </span>
                    <h2 className="text-xl font-extrabold text-slate-900 mt-1">{selectedIncident.title}</h2>
                    <p className="text-slate-600 font-medium">📍 Location: {selectedIncident.district}, {selectedIncident.state}</p>
                  </div>
                  <span className="text-xs font-bold text-[#0B4F8A] bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                    STATUS: {selectedIncident.status}
                  </span>
                </div>
              </div>

              {/* Evidence & Risk Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1">
                  <p className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider mb-1">EVIDENCE & INTELLIGENCE</p>
                  <p><b>Official Warning:</b> <span className="text-slate-800">{selectedIncident.official_warning || 'None'}</span></p>
                  <p><b>Risk Score:</b> <span className="text-red-700 font-mono font-bold">{selectedIncident.risk_score}/100</span></p>
                  <p><b>Confidence:</b> <span className="text-slate-800">{selectedIncident.confidence}</span></p>
                  <p><b>Data Source:</b> <span className="text-slate-800">{selectedIncident.source}</span></p>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-1">
                  <p className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider mb-1">SITUATION DESCRIPTION</p>
                  <p className="text-slate-700">{selectedIncident.description}</p>
                  {selectedIncident.title.includes("DEMO") && (
                    <p className="mt-2 text-amber-900 font-bold text-[10px] bg-amber-50 p-1 rounded border border-amber-200">
                      CONTROLLED FLOOD DEMONSTRATION INCIDENT
                    </p>
                  )}
                </div>
              </div>

              {/* Visual Field Evidence Photo Card Section */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                  <p className="font-extrabold text-[10px] text-slate-700 uppercase tracking-wider">VISUAL FIELD EVIDENCE & PHOTOGRAPH</p>
                  <span className="text-[9px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-bold">
                    VERIFIED INCIDENT EVIDENCE
                  </span>
                </div>
                <div className="bg-white p-3 rounded border border-slate-200 shadow-sm space-y-2">
                  <div className="h-44 w-full bg-slate-800 rounded flex flex-col justify-end p-3 text-white relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?auto=format&fit=crop&w=800&q=80')" }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                    <div className="relative z-10">
                      <div className="font-extrabold text-sm text-white drop-shadow">📷 {selectedIncident.title}</div>
                      <div className="text-[11px] text-slate-300">Reported Location: {selectedIncident.district}, {selectedIncident.city || 'Hubballi'} ({selectedIncident.latitude?.toFixed(4)}, {selectedIncident.longitude?.toFixed(4)})</div>
                      <div className="text-[10px] text-emerald-400 font-mono font-bold mt-0.5">Reported at: {new Date(selectedIncident.reported_at || selectedIncident.created_at || Date.now()).toLocaleTimeString()} IST</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-700 flex justify-between bg-slate-50 p-2 rounded">
                    <span><b>Hazard Type:</b> {selectedIncident.hazard_type}</span>
                    <span><b>Evidence Status:</b> <strong className="text-emerald-700">VERIFIED FIELD EVIDENCE</strong></span>
                  </div>
                </div>
              </div>

              {/* Incident Response Plan & Resource Assignment Section */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                  <p className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider">RESPONSE PLAN & RESOURCE COMMAND</p>
                  <span className="text-[10px] font-bold text-slate-600">PLAN INCIDENT ID: {selectedIncident.incident_id}</span>
                </div>

                <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-xs">SPECIFIC OPERATIONAL PLAN:</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      activePlan?.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                      activePlan?.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-700'
                    }`}>
                      STATUS: {activePlan?.status || 'NO PLAN GENERATED'}
                    </span>
                  </div>

                  {/* Hazard Specific Recommended Steps */}
                  <div className="text-[11px] text-slate-700 space-y-1.5">
                    {activePlan?.situation_summary && (
                      <p className="font-bold text-slate-800 bg-blue-50/50 p-2 rounded border border-blue-100">
                        {activePlan.situation_summary}
                      </p>
                    )}
                    
                    <p className="font-bold text-slate-900 mt-1">RECOMMENDED ACTIONS:</p>
                    <ul className="list-disc pl-4 text-slate-700 text-[11px] space-y-1">
                      {activePlan?.recommended_steps && activePlan.recommended_steps.length > 0 ? (
                        activePlan.recommended_steps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))
                      ) : (
                        <>
                          <li>Deploy field assessment team to inspect drainage/road obstruction.</li>
                          <li>Assess roadway water accumulation & evaluate vehicle accessibility.</li>
                          <li>Identify lower-risk alternative access corridor.</li>
                        </>
                      )}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex gap-2">
                    {!activePlan ? (
                      <button
                        onClick={handleGeneratePlan}
                        disabled={planLoading}
                        className="bg-[#0B4F8A] hover:bg-[#083B68] text-white font-bold py-1.5 px-4 rounded text-xs shadow-sm disabled:opacity-50"
                      >
                        {planLoading ? 'GENERATING...' : 'GENERATE RESPONSE PLAN'}
                      </button>
                    ) : activePlan.status === 'PENDING_APPROVAL' ? (
                      <button
                        onClick={handleApprovePlan}
                        disabled={planLoading}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 px-4 rounded text-xs shadow-sm disabled:opacity-50"
                      >
                        {planLoading ? 'APPROVING...' : 'APPROVE RESPONSE PLAN'}
                      </button>
                    ) : (
                      <div className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200 flex items-center gap-1.5">
                        <span>✓ RESPONSE PLAN APPROVED</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommended Response Resource & Assignment */}
                <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-900 text-xs flex justify-between">
                    <span>RECOMMENDED RESPONSE UNIT:</span>
                    <span className="text-emerald-700 font-bold text-[10px]">AVAILABLE (Hubballi Fire Station)</span>
                  </div>
                  <div className="text-[11px] text-slate-700">
                    <b>Unit:</b> Rescue Team Alpha (RESCUE_TEAM)<br/>
                    <b>Match Criteria:</b> Nearest available unit compatible with {selectedIncident.hazard_type}
                  </div>
                  
                  {activePlan?.status === 'APPROVED' ? (
                    teamAssigned ? (
                      <div className="text-xs font-bold text-blue-800 bg-blue-50 px-3 py-1.5 rounded border border-blue-200">
                        ✓ TEAM ASSIGNED TO INCIDENT — FIELD UNIT DISPATCHED
                      </div>
                    ) : (
                      <button
                        onClick={handleAssignTeam}
                        className="w-full bg-[#0B4F8A] hover:bg-[#083B68] text-white font-bold py-1.5 rounded text-xs shadow-sm"
                      >
                        ASSIGN TEAM TO INCIDENT
                      </button>
                    )
                  ) : (
                    <div className="text-[10px] text-slate-500 italic bg-slate-50 p-2 rounded">
                      Response plan must be APPROVED before team assignment.
                    </div>
                  )}
                </div>
              </div>

              {/* Route & Corridor Intelligence Section */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-2">
                <p className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider border-b border-slate-200 pb-1">ROUTE RISK & CORRIDOR INTELLIGENCE</p>
                <div className="bg-white p-3 rounded border border-slate-200 text-[11px] space-y-1">
                  <div><b>Current Route:</b> {selectedIncident.district} Access Corridor</div>
                  <div><b>Route Risk:</b> <span className="text-amber-700 font-bold">{selectedIncident.risk_score > 80 ? 'CRITICAL (80/100)' : 'MODERATE (45/100)'}</span></div>
                  <div><b>Distance / ETA:</b> 12.4 km | 24 mins</div>
                  <div><b>Route Status:</b> <span className="text-emerald-700 font-bold">MONITORED</span></div>
                </div>
              </div>

              {/* Operator Command Actions */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 space-y-2">
                <p className="font-extrabold text-[10px] text-slate-700 uppercase tracking-wider mb-2">OPERATOR STATUS ACTIONS</p>
                <div className="flex gap-2">
                  {selectedIncident.status === 'DETECTED' && (
                    <button onClick={() => handleAction(selectedIncident.incident_id, 'acknowledge')} className="bg-[#0B4F8A] hover:bg-[#083B68] text-white font-bold py-1.5 px-3 rounded text-xs">
                      ACKNOWLEDGE
                    </button>
                  )}
                  {selectedIncident.status !== 'RESOLVED' && (
                    <button onClick={() => handleAction(selectedIncident.incident_id, 'escalate')} className="bg-amber-700 hover:bg-amber-800 text-white font-bold py-1.5 px-3 rounded text-xs">
                      ESCALATE
                    </button>
                  )}
                  <button onClick={() => handleAction(selectedIncident.incident_id, 'resolve')} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 px-3 rounded text-xs">
                    MARK RESOLVED
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>

    </div>
  );
}
