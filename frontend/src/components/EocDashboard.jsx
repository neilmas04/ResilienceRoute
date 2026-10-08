import { useState, useEffect } from 'react';
import MapComponent from './Map';
import NationalView from './NationalView';
import ResourceCenter from './ResourceCenter';
import IncidentCenter from './IncidentCenter';
import AlertCenter from './AlertCenter';
import WeatherDashboard from './WeatherDashboard';
import ThreatPanel from './ThreatPanel';
import { useCOP } from '../hooks/useCOP';
import { API_BASE_URL } from '../config';

export default function EocDashboard({
  viewMode,
  setViewMode,
  weatherStatus,
  systemStatus,
  scenarioStatus,
  toggleScenario,
  onRunFloodDemo,
  onOpenCitizenApp
}) {
  // Common Operating Picture (COP) Data Hook (10s polling refresh)
  const { data: copData, loading: copLoading, error: copError } = useCOP(10000);

  // Navigation active tab: 'overview' | 'incidents' | 'field' | 'weather' | 'satellite' | 'national'
  const [activeTab, setActiveTab] = useState('overview');
  const [weatherForecast, setWeatherForecast] = useState(null);

  // Shared Global Selected Incident State
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedIncidentDetail, setSelectedIncidentDetail] = useState(null);
  const [activePlan, setActivePlan] = useState(null);

  // Backend Data States
  const [incidents, setIncidents] = useState([]);
  const [riskData, setRiskData] = useState(null);
  const [resources, setResources] = useState([]);
  const [fieldUnits, setFieldUnits] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [eocStatus, setEocStatus] = useState(null);
  const [satLayers, setSatLayers] = useState([]);

  // Route Monitoring & Replacement State
  const [monitoredRoute, setMonitoredRoute] = useState(null);
  const [monitorStatus, setMonitorStatus] = useState(null); // 'ACTIVE' | 'CHECKING' | 'INVALIDATED' | 'REPLACED'
  const [replacementRec, setReplacementRec] = useState(null);

  // Field Operations State Machine
  const [fieldUnitStates, setFieldUnitStates] = useState({
    'FU-001': 'EN_ROUTE',
    'FU-002': 'AT_SCENE',
    'FU-003': 'OPERATING'
  });
  const [reassessmentAlert, setReassessmentAlert] = useState(false);

  // Drawer & Toast State
  const [toastMessage, setToastMessage] = useState(null);

  // Satellite view controls
  const [satProduct, setSatProduct] = useState('TRUE_COLOR');

  // Map layer controls
  const [layers, setLayers] = useState({
    incidents: true,
    risk: true,
    resources: true,
    fieldUnits: true,
    satellite: false,
    routing: true,
    floodRisk: true,
    waterlogging: true,
    drainage: true,
  });

  const [demoStep, setDemoStep] = useState(null);
  const [planActionStatus, setPlanActionStatus] = useState(null);
  const [dispatchStatus, setDispatchStatus] = useState(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date().toLocaleTimeString() + ' IST');

  const [routeInfo, setRouteInfo] = useState(null);
  const [floodOverlay, setFloodOverlay] = useState(null);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchAllData();
      setLastUpdatedTime(new Date().toLocaleTimeString() + ' IST');
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedIncident?.incident_id) {
      fetchIncidentResponsePlan(selectedIncident.incident_id);
    } else {
      setActivePlan(null);
    }
  }, [selectedIncident]);

  async function fetchIncidentResponsePlan(incId) {
    try {
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
    } catch (e) {
      setActivePlan(null);
    }
  }

  function showToast(msg, type = "info") {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  async function fetchAllData() {
    try {
      const [eocRes, incRes, riskRes, resRes, fuRes, altRes, satRes, wfRes] = await Promise.all([
        fetch(`${API_BASE_URL}/national/eoc/status`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/incidents`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/risk`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/resources`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/field-units`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/alerts`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/national/satellite/layers`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE_URL}/weather/forecast`).then(r => r.json()).catch(() => null),
      ]);

      if (eocRes) setEocStatus(eocRes);
      if (incRes?.records) {
        setIncidents(incRes.records);
        if (!selectedIncident && incRes.records.length > 0) {
          setSelectedIncident(incRes.records[0]);
          fetchIncidentDetail(incRes.records[0].incident_id);
        }
      }
      if (riskRes) setRiskData(riskRes);
      if (resRes?.records) setResources(resRes.records);
      if (fuRes?.records) setFieldUnits(fuRes.records);
      if (altRes?.records) setAlerts(altRes.records);
      if (satRes?.records) setSatLayers(satRes.records);
      if (wfRes) setWeatherForecast(wfRes);

    } catch (err) {
      console.error("Failed to fetch EOC data:", err);
    }
  }

  async function fetchIncidentDetail(incidentId) {
    try {
      const res = await fetch(`${API_BASE_URL}/national/incidents/${incidentId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedIncidentDetail(data.record);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function handleSelectIncident(inc) {
    setSelectedIncident(inc);
    fetchIncidentDetail(inc.incident_id);
  }

  // ============================================================
  // REALISTIC CONTROLLED FLOOD DEMO SCENARIO ENGINE
  // ============================================================
  const handleRunFloodResponseDemo = async () => {
    try {
      setDemoStep('ACTIVATING_SCENARIO');
      showToast("Activating controlled heavy rain scenario...", "info");
      await fetch(`${API_BASE_URL}/scenario/activate`, { method: 'POST' });

      setDemoStep('REFRESHING_RISK');
      showToast("Updating regional flood risk scores...", "info");
      await fetch(`${API_BASE_URL}/national/risk`);

      setDemoStep('ASSESSING_INCIDENTS');
      showToast("Scanning feeds & generating incident candidates...", "info");
      await fetch(`${API_BASE_URL}/national/incidents/recommend`, { method: 'POST' }).catch(() => {});

      setDemoStep('PREPARING_RESPONSE');
      showToast("Running 3-hour inundation nowcast model...", "info");
      await fetch(`${API_BASE_URL}/flood/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rainfall_mm_hr: 80, blockage_percent: 50, forecast_minutes: 180 })
      }).catch(() => {});

      setDemoStep('DEMO_READY');
      await fetchAllData();
      showToast("✓ Controlled Flood Scenario Active — EOC Operations Ready", "success");

      setTimeout(() => setDemoStep(null), 3000);
    } catch (e) {
      showToast("Demo initiation failed: " + e.message, "error");
      setDemoStep(null);
    }
  };

  // ============================================================
  // ROUTE MONITORING ENGINE
  // ============================================================
  const handleStartRouteMonitoring = async () => {
    try {
      setMonitorStatus('ACTIVE');
      const payload = {
        origin: { lat: 15.4589, lng: 75.0078 },
        destination: { lat: 15.3647, lng: 75.1240 },
        route_nodes: [245631, 245632, 245633],
        hazard_score: 32
      };
      const res = await fetch(`${API_BASE_URL}/route-monitor/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setMonitoredRoute(data);
        showToast("Route Monitoring Active — Continuously assessing flood risk", "success");
      }
    } catch (e) {
      showToast("Failed to register route monitor", "error");
    }
  };

  const handleCheckRouteNow = async () => {
    if (!monitoredRoute?.route_id) return;
    try {
      setMonitorStatus('CHECKING');
      const res = await fetch(`${API_BASE_URL}/route-monitor/${monitoredRoute.route_id}/check`, { method: 'POST' });
      if (res.ok) {
        setMonitorStatus('ACTIVE');
        showToast("Route checked: Segment hazard within safe threshold", "success");
      }
    } catch (e) {
      setMonitorStatus('ACTIVE');
    }
  };

  const handleTriggerRouteReassessment = async () => {
    try {
      let routeId = monitoredRoute?.route_id;
      if (!routeId) {
        // Register route first if not registered
        const regRes = await fetch(`${API_BASE_URL}/route-monitor/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: { lat: 15.4589, lng: 75.0078 },
            destination: { lat: 15.3647, lng: 75.1240 },
            route_nodes: [245631, 245632, 245633],
            hazard_score: 32
          })
        });
        if (regRes.ok) {
          const regData = await regRes.json();
          routeId = regData.route_id;
          setMonitoredRoute(regData);
        }
      }

      if (routeId) {
        // Mark backend route as invalidated
        await fetch(`${API_BASE_URL}/route-monitor/${routeId}/invalidate`, { method: 'POST' });

        // Request replacement recommendation
        const recRes = await fetch(`${API_BASE_URL}/route-monitor/${routeId}/replacement/recommend`, { method: 'POST' });
        if (recRes.ok) {
          const recData = await recRes.json();
          setReplacementRec(recData);
        }
      }

      setReassessmentAlert(true);
      setMonitorStatus('INVALIDATED');
      showToast("⚠ ROUTE INVALIDATED: Road Obstruction reported — Replacement Route Proposed", "error");
    } catch (e) {
      setReassessmentAlert(true);
      setMonitorStatus('INVALIDATED');
      showToast("⚠ ROUTE INVALIDATED: Obstruction reported", "error");
    }
  };

  const handleFindReplacementRoute = async () => {
    let routeId = monitoredRoute?.route_id;
    if (!routeId) {
      await handleTriggerRouteReassessment();
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/route-monitor/${routeId}/replacement/recommend`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setReplacementRec(data);
        showToast("Lower-Risk Replacement Route Recommended", "info");
      }
    } catch (e) {
      showToast("Failed to find replacement route", "error");
    }
  };

  const handleApproveReplacementRoute = async () => {
    const routeId = monitoredRoute?.route_id;
    const recId = replacementRec?.recommendation_id;
    if (!routeId || !recId) {
      showToast("Missing recommendation ID for replacement approval", "error");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/route-monitor/${routeId}/replacement/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: recId, approved: true })
      });
      if (res.ok) {
        setMonitorStatus('REPLACED');
        setReassessmentAlert(false);

        if (replacementRec?.candidate_route?.coordinates) {
          const newCoords = replacementRec.candidate_route.coordinates.map(c => [c[1], c[0]]);
          setRouteInfo(prev => ({ ...(prev || {}), coordinates: newCoords, distance_m: replacementRec.candidate_route.distance_m }));
        }

        showToast("✓ Replacement Route Approved & Activated by EOC Operator", "success");
      } else {
        const errData = await res.json();
        showToast("Approval failed: " + (errData.detail || "Error approving route"), "error");
      }
    } catch (e) {
      showToast("Failed to approve replacement route: " + e.message, "error");
    }
  };

  // ============================================================
  // RESPONSE PLAN & DISPATCH ENGINE
  // ============================================================
  async function handleGenerateResponsePlan() {
    setPlanActionStatus({ type: 'loading', message: 'GENERATING RESPONSE PLAN...' });
    const incId = selectedIncident?.incident_id;
    if (!incId) {
      showToast("Select an incident first", "error");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.plan) {
        setActivePlan(data.plan);
        setPlanActionStatus({ type: 'success', message: '✓ RESPONSE PLAN GENERATED (PENDING_APPROVAL)' });
        showToast(`✓ Response plan generated for ${selectedIncident.title}`, "success");
      } else {
        throw new Error(data.detail || "Failed to generate plan");
      }
    } catch (e) {
      setPlanActionStatus({ type: 'error', message: 'Generate error: ' + e.message });
    }
  }

  async function handleApproveResponsePlan() {
    setPlanActionStatus({ type: 'loading', message: 'APPROVING RESPONSE PLAN...' });
    const incId = selectedIncident?.incident_id || (incidents[0]?.incident_id);

    if (!incId) {
      setPlanActionStatus({ type: 'error', message: 'NO INCIDENT SELECTED' });
      showToast("Select an incident first", "error");
      return;
    }

    try {
      let currentPlan = activePlan;
      if (!currentPlan) {
        let planRes = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`);
        let pData = await planRes.json();

        if (!pData.records || pData.records.length === 0) {
          const genRes = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`, { method: 'POST' });
          const genData = await genRes.json();
          currentPlan = genData.plan;
        } else {
          currentPlan = pData.records[pData.records.length - 1];
        }
      }

      const pId = currentPlan?.response_plan_id || currentPlan?.plan_id;
      if (pId) {
        const approveRes = await fetch(`${API_BASE_URL}/national/response-plans/${pId}/approve`, { method: 'POST' });
        const aData = await approveRes.json();
        if (approveRes.ok && aData.plan) {
          setActivePlan(aData.plan);
          setPlanActionStatus({ type: 'success', message: '✓ RESPONSE PLAN APPROVED — Resources Reserved' });
          showToast("✓ Response plan approved and resources reserved", "success");
          fetchIncidentDetail(incId);
          fetchAllData();
        } else {
          setPlanActionStatus({ type: 'error', message: 'APPROVAL FAILED: ' + (aData.detail || 'Error') });
        }
      }
    } catch (e) {
      setPlanActionStatus({ type: 'error', message: 'Approval error: ' + e.message });
    }
  }

  async function handleSimulateDispatchUnit() {
    setDispatchStatus({ type: 'loading', message: 'SIMULATING DISPATCH...' });
    const incId = selectedIncident?.incident_id || (incidents[0]?.incident_id);

    if (!incId) {
      setDispatchStatus({ type: 'error', message: 'NO INCIDENT SELECTED' });
      return;
    }

    try {
      const planRes = await fetch(`${API_BASE_URL}/national/incidents/${incId}/response-plan`);
      const pData = await planRes.json();

      if (pData.records && pData.records.length > 0) {
        const plan = pData.records[pData.records.length - 1];
        const action = plan.actions ? plan.actions[0] : null;

        if (action && action.action_id) {
          const dispatchRes = await fetch(`${API_BASE_URL}/national/response-actions/${action.action_id}/dispatch`, { method: 'POST' });
          if (dispatchRes.ok) {
            setDispatchStatus({ type: 'success', message: '✓ DISPATCH RECORDED' });
            showToast("✓ Dispatch recorded. Unit set to EN_ROUTE", "success");
            
            // Advance Field Unit State Machine
            setFieldUnitStates(prev => ({ ...prev, 'FU-001': 'EN_ROUTE' }));
            if (activePlan) {
              setActivePlan(prev => ({ ...prev, status: 'DISPATCHED' }));
            }
            fetchIncidentDetail(incId);
            fetchAllData();
          } else {
            setDispatchStatus({ type: 'error', message: 'DISPATCH FAILED: Plan must be APPROVED first' });
            showToast("Action must be APPROVED first", "error");
          }
        } else {
          setDispatchStatus({ type: 'error', message: 'NO RESPONSE ACTION AVAILABLE' });
        }
      } else {
        setDispatchStatus({ type: 'error', message: 'NO RESPONSE PLAN AVAILABLE' });
      }
    } catch (e) {
      setDispatchStatus({ type: 'error', message: e.message });
    }
  }

  const handleUpdateUnitState = async (unitId, nextState) => {
    setFieldUnitStates(prev => ({ ...prev, [unitId]: nextState }));
    setFieldUnits(prev => prev.map(u => u.field_unit_id === unitId ? { ...u, status: nextState } : u));
    try {
      await fetch(`${API_BASE_URL}/national/field-units/${unitId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: nextState, actor: 'EOC Operator', role: 'EOC_OPERATOR' })
      });
    } catch (e) {}
    showToast(`✓ Field Unit status updated to ${nextState}`, "info");
  };

  const activeIncidentsCount = incidents.filter(i => i.status !== 'RESOLVED').length;
  const availableResourcesCount = resources.filter(r => r.status === 'AVAILABLE' || r.status === 'PARTIALLY_AVAILABLE').length;

  // State for Start Operation Modal
  const [activeOperationModal, setActiveOperationModal] = useState(null);

  // Smooth live vehicle movement animation hook for dispatched teams
  useEffect(() => {
    const moveInterval = setInterval(() => {
      setFieldUnits(prevUnits => {
        return prevUnits.map(unit => {
          const st = fieldUnitStates[unit.field_unit_id] || unit.status;
          if (st === 'EN_ROUTE' && selectedIncident?.latitude && selectedIncident?.longitude) {
            const targetLat = selectedIncident.latitude;
            const targetLng = selectedIncident.longitude;
            const currLat = unit.latitude || 15.3647;
            const currLng = unit.longitude || 75.1240;

            const dLat = targetLat - currLat;
            const dLng = targetLng - currLng;
            const dist = Math.sqrt(dLat * dLat + dLng * dLng);

            if (dist < 0.002) {
              // Arrived at destination
              setFieldUnitStates(prev => ({ ...prev, [unit.field_unit_id]: 'AT_SCENE' }));
              showToast(`📍 ${unit.name} HAS ARRIVED AT SCENE (${selectedIncident.title})`, "success");
              return { ...unit, latitude: targetLat, longitude: targetLng, status: 'AT_SCENE' };
            } else {
              // Move 15% closer to target along vector
              return {
                ...unit,
                latitude: currLat + dLat * 0.15,
                longitude: currLng + dLng * 0.15,
                target_incident_title: selectedIncident.title
              };
            }
          }
          return unit;
        });
      });
    }, 2500);

    return () => clearInterval(moveInterval);
  }, [fieldUnitStates, selectedIncident]);

  return (
    <div className="flex h-screen bg-[#F5F7FA] text-slate-900 font-sans overflow-hidden">
      
      {/* Toast Notification Banner (Zero Native Browser Alerts) */}
      {toastMessage && (
        <div className={`fixed top-3 right-3 z-[2000] px-4 py-2.5 rounded-md font-bold text-xs shadow-lg flex items-center gap-2 border transition ${
          toastMessage.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
          toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-900 text-white border-slate-700'
        }`}>
          <span>ℹ {toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 font-black hover:opacity-75">&times;</button>
        </div>
      )}

      {/* Start Operation Modal */}
      {activeOperationModal && (
        <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-300 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="font-black text-sm uppercase text-[#0B4F8A] flex items-center gap-2">
                <span>📡</span> FIELD OPERATION IN PROGRESS: {activeOperationModal.name}
              </h3>
              <button onClick={() => setActiveOperationModal(null)} className="text-slate-400 hover:text-slate-700 font-bold text-sm">✕</button>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 p-3 rounded space-y-1.5 text-slate-800">
              <div><b>TARGET CASE:</b> <span className="font-bold text-[#0B4F8A]">{selectedIncident?.title || 'Dharwad Central Drainage Overflow'}</span></div>
              <div><b>LOCATION:</b> {selectedIncident?.district || 'Dharwad Central'}, {selectedIncident?.state || 'Karnataka'}</div>
              <div><b>STATUS:</b> <span className="font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">OPERATING</span></div>
              <div><b>ASSIGNED TEAM:</b> {activeOperationModal.name} ({activeOperationModal.unit_type})</div>
            </div>

            <div className="space-y-1.5">
              <div className="font-bold uppercase text-[10px] text-slate-500">CURRENT OPERATIONAL TASK</div>
              <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-700 font-medium">
                Inspect drainage outlet and clear roadway water accumulation. Collect visual field evidence and assess vehicle access safety.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="font-bold uppercase text-[10px] text-slate-500">FIELD REPORTS & EVIDENCE</div>
              <div className="bg-emerald-50 text-emerald-800 p-2 rounded border border-emerald-200 text-[11px]">
                ✓ Initial visual evidence verified by field unit. PWD Drainage equipment pre-positioned.
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
              <button
                onClick={() => {
                  handleUpdateUnitState(activeOperationModal.field_unit_id, 'COMPLETED');
                  setActiveOperationModal(null);
                }}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded text-xs shadow-sm"
              >
                COMPLETE OPERATION
              </button>
              <button
                onClick={() => setActiveOperationModal(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-2 rounded text-xs"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. LEFT SIDEBAR NAVIGATION APP SHELL                        */}
      {/* ============================================================ */}
      <aside className="w-64 bg-white border-r border-[#D9E0E8] flex flex-col justify-between shrink-0 z-30 shadow-sm">
        <div>
          {/* Header Branding */}
          <div className="p-4 border-b border-[#D9E0E8]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0B4F8A]"></span>
              <div>
                <h1 className="font-extrabold text-sm tracking-tight text-[#0B4F8A] leading-none uppercase">
                  AEGIS-COP
                </h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                  Tactical Edge Common Operating Picture
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 text-xs font-semibold">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              COMMAND PANELS
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition ${
                activeTab === 'overview' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>▣</span> OVERVIEW
            </button>

            <button
              onClick={() => setActiveTab('incidents')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition ${
                activeTab === 'incidents' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>🚨</span> INCIDENTS
              </div>
              {activeIncidentsCount > 0 && (
                <span className="text-[9px] bg-red-600 text-white font-black px-1.5 py-0.5 rounded-full">
                  {activeIncidentsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('field')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition ${
                activeTab === 'field' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>📡</span> FIELD OPERATIONS
              </div>
              <span className="text-[9px] text-blue-800 font-bold">
                {fieldUnits.length} Teams
              </span>
            </button>

            <button
              onClick={() => setActiveTab('weather')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition ${
                activeTab === 'weather' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>🌦️</span> WEATHER & PREPAREDNESS
              </div>
              <span className="text-[9px] bg-blue-100 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                LIVE
              </span>
            </button>

            <button
              onClick={() => setActiveTab('satellite')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition ${
                activeTab === 'satellite' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>🛰</span> SATELLITE
            </button>

            <button
              onClick={() => setActiveTab('national')}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition ${
                activeTab === 'national' ? 'bg-[#0B4F8A] text-white font-bold shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>🌐</span> NATIONAL FLOOD RISK
            </button>
          </nav>
        </div>

        {/* Bottom System Provenance */}
        <div className="p-3 border-t border-[#D9E0E8] bg-slate-50 text-[10px] text-slate-600 space-y-1">
          <div className="font-bold text-slate-800">HUBBALLI–DHARWAD EOC</div>
          <div className="text-emerald-700 font-bold">STATUS: ● OPERATIONAL</div>
          <div className="text-slate-500 font-mono">TIME: {lastUpdatedTime}</div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTENT AREA                                            */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Header Bar */}
        <header className="bg-white border-b border-[#D9E0E8] px-5 py-3 flex justify-between items-center z-20 shrink-0 shadow-sm">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-tight text-[#0B4F8A]">
              AEGIS-COP — TACTICAL EDGE COMMON OPERATING PICTURE
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Real-Time Flood Assessment, Route Intelligence & Resource Command
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('weather')}
              className="text-slate-700 hover:bg-slate-200 bg-slate-100 px-3 py-1.5 rounded border border-slate-200 flex items-center gap-2 cursor-pointer transition font-mono text-xs"
              title="Click to open Weather & Preparedness Dashboard"
            >
              <span>🌦️</span>
              <span>{weatherForecast?.current?.temperature_c ? `${weatherForecast.current.temperature_c}°C` : '25.0°C'}</span>
              <span className="text-slate-400">|</span>
              <span>Rain Prob 6h: <strong>{weatherForecast?.summary?.max_prob_6h || 0}%</strong></span>
              <span className="text-slate-400">|</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black text-white ${
                weatherForecast?.summary?.preparedness_badge === 'CRITICAL' ? 'bg-red-700' :
                weatherForecast?.summary?.preparedness_badge === 'HIGH' ? 'bg-amber-600' : 'bg-emerald-600'
              }`}>
                {weatherForecast?.summary?.preparedness_badge || 'NORMAL'}
              </span>
            </button>

            <div className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded border border-emerald-200">
              ● OPERATIONAL
            </div>

            {/* Run Flood Response Demo Button */}
            <button
              onClick={handleRunFloodResponseDemo}
              disabled={!!demoStep}
              className="bg-[#0B4F8A] hover:bg-[#083B68] text-white font-bold text-xs px-4 py-2 rounded shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>🌊</span>
              <span>
                {demoStep === 'ACTIVATING_SCENARIO' && 'ACTIVATING SCENARIO...'}
                {demoStep === 'REFRESHING_RISK' && 'REFRESHING RISK...'}
                {demoStep === 'ASSESSING_INCIDENTS' && 'ASSESSING INCIDENTS...'}
                {demoStep === 'PREPARING_RESPONSE' && 'PREPARING RESPONSE...'}
                {demoStep === 'DEMO_READY' && '✓ DEMO READY'}
                {!demoStep && (scenarioStatus?.active ? 'RESET FLOOD DEMO' : 'RUN FLOOD RESPONSE')}
              </span>
            </button>
          </div>
        </header>

        {/* Controlled Scenario Banner */}
        {scenarioStatus?.active && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-1.5 flex justify-between items-center text-xs font-bold shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="text-amber-700">⚠</span>
              <span>CONTROLLED DEMONSTRATION SCENARIO — NOT LIVE OBSERVATION</span>
            </div>
            <div className="text-[11px] font-mono text-amber-800">
              CONTROLLED PRECIPITATION: {scenarioStatus.config?.precipitation_mm || 80} mm — CONTROLLED SCENARIO | DRAINAGE BLOCKAGE: {scenarioStatus.config?.blockage_percent || 50}%
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: EOC OVERVIEW DASHBOARD                               */}
        {/* ============================================================ */}
        {activeTab === 'overview' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#F5F7FA] p-4 gap-3">
            
            {/* Dynamic KPI Strip derived from actual application state */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 shrink-0">
              <div className="bg-white border border-[#D9E0E8] rounded-md p-2.5 shadow-sm">
                <div className="text-[9px] font-bold uppercase text-slate-500">ACTIVE INCIDENTS</div>
                <div className="text-lg font-extrabold text-red-700 font-mono mt-0.5">{incidents.length}</div>
              </div>
              <div className="bg-white border border-[#D9E0E8] rounded-md p-2.5 shadow-sm">
                <div className="text-[9px] font-bold uppercase text-slate-500">CRITICAL AREAS</div>
                <div className="text-lg font-extrabold text-red-800 font-mono mt-0.5">
                  {incidents.filter(i => i.severity === 'CRITICAL').length} Sectors
                </div>
              </div>
              <div className="bg-white border border-[#D9E0E8] rounded-md p-2.5 shadow-sm">
                <div className="text-[9px] font-bold uppercase text-slate-500">DRAINAGE ISSUES</div>
                <div className="text-lg font-extrabold text-amber-700 font-mono mt-0.5">
                  {incidents.filter(i => i.hazard_type?.toLowerCase().includes('drain')).length} Locations
                </div>
              </div>
              <div className="bg-white border border-[#D9E0E8] rounded-md p-2.5 shadow-sm">
                <div className="text-[9px] font-bold uppercase text-slate-500">TEAMS EN ROUTE</div>
                <div className="text-lg font-extrabold text-[#0B4F8A] font-mono mt-0.5">
                  {fieldUnits.filter(u => (fieldUnitStates[u.field_unit_id] || u.status) === 'EN_ROUTE').length} Units
                </div>
              </div>
              <div className="bg-white border border-[#D9E0E8] rounded-md p-2.5 shadow-sm">
                <div className="text-[9px] font-bold uppercase text-slate-500">AT SCENE</div>
                <div className="text-lg font-extrabold text-purple-700 font-mono mt-0.5">
                  {fieldUnits.filter(u => ['AT_SCENE', 'OPERATING'].includes(fieldUnitStates[u.field_unit_id] || u.status)).length} Teams
                </div>
              </div>
              <div className="bg-white border border-[#D9E0E8] rounded-md p-2.5 shadow-sm">
                <div className="text-[9px] font-bold uppercase text-slate-500">COMPLETED</div>
                <div className="text-lg font-extrabold text-emerald-700 font-mono mt-0.5">
                  {fieldUnits.filter(u => (fieldUnitStates[u.field_unit_id] || u.status) === 'COMPLETED').length} Done
                </div>
              </div>
            </div>

            {/* Main Area: Priority Queue (left) | Map (center) | Active Response Teams & Route Monitoring (right) */}
            <div className="flex-1 flex gap-3 overflow-hidden">
              
              {/* Left COP Threat Intelligence Panel */}
              <div className="w-64 shrink-0 overflow-hidden">
                {copLoading ? (
                  <div className="p-4 bg-white border border-[#D9E0E8] rounded-md text-xs font-bold text-slate-500 italic">
                    Loading COP...
                  </div>
                ) : copError ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs font-bold text-red-700">
                    Unable to load COP data: {copError}
                  </div>
                ) : (
                  <ThreatPanel 
                    threats={copData?.threats || []} 
                    onSelectThreat={(t) => handleSelectIncident({
                      incident_id: t.id,
                      title: t.title,
                      severity: t.severity,
                      status: t.status,
                      latitude: t.latitude,
                      longitude: t.longitude,
                      hazard_type: t.category,
                      description: t.description
                    })} 
                    selectedThreatId={selectedIncident?.incident_id} 
                  />
                )}
              </div>

              {/* Center City-Wide Situation Map */}
              <div className="flex-1 bg-white border border-[#D9E0E8] rounded-md overflow-hidden relative shadow-sm">
                <MapComponent
                  onRouteCalculated={setRouteInfo}
                  floodOverlay={floodOverlay}
                  showIncidents={layers.incidents}
                  showRisk={layers.risk}
                  showResources={layers.resources}
                  showFieldUnits={layers.fieldUnits}
                  showSatellite={layers.satellite}
                  incidents={incidents}
                  resources={resources}
                  fieldUnits={fieldUnits}
                  copData={copData}
                  activeDispatch={selectedIncident ? {
                    unitLat: fieldUnits[0]?.latitude || 15.3750,
                    unitLng: fieldUnits[0]?.longitude || 75.1300,
                    incLat: selectedIncident.latitude,
                    incLng: selectedIncident.longitude
                  } : null}
                  replacementRoute={replacementRec?.candidate_route?.coordinates ? replacementRec.candidate_route.coordinates.map(c => [c[1], c[0]]) : null}
                  monitorStatus={monitorStatus}
                />
              </div>

              {/* Right Sidebar: Dispatched Live Vehicles & Route Monitoring (No approval buttons) */}
              <div className="w-80 bg-white border border-[#D9E0E8] rounded-md p-3 flex flex-col gap-3 shrink-0 overflow-y-auto shadow-sm text-xs">
                
                {/* Live Dispatched Response Teams Panel */}
                <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2">
                  <div className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider border-b border-slate-200 pb-1 flex justify-between items-center">
                    <span>LIVE DISPATCHED TEAMS</span>
                    <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                      {fieldUnits.filter(u => ['EN_ROUTE', 'AT_SCENE', 'OPERATING'].includes(fieldUnitStates[u.field_unit_id] || u.status)).length} ACTIVE
                    </span>
                  </div>

                  {fieldUnits.length === 0 ? (
                    <div className="text-slate-400 italic text-[11px]">No response teams dispatched.</div>
                  ) : (
                    <div className="space-y-2">
                      {fieldUnits.map(fu => {
                        const st = fieldUnitStates[fu.field_unit_id] || fu.status || 'ASSIGNED';
                        return (
                          <div key={fu.field_unit_id} className="bg-white p-2.5 rounded border border-slate-200 space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 flex items-center gap-1">
                                <span>{fu.unit_type?.includes('BOAT') ? '🛥️' : fu.unit_type?.includes('AMBULANCE') ? '🚑' : '🚒'}</span>
                                {fu.name}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                st === 'EN_ROUTE' ? 'bg-blue-100 text-blue-800' :
                                st === 'AT_SCENE' ? 'bg-amber-100 text-amber-800' :
                                st === 'OPERATING' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {st}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-600">
                              <b>Target Destination:</b> {selectedIncident?.title || fu.city || 'Hubballi Sector'}
                            </div>
                            {st === 'EN_ROUTE' && (
                              <div className="text-[10px] text-[#0B4F8A] font-mono font-bold flex justify-between">
                                <span>ETA: 6 mins</span>
                                <span>Distance: 2.1 km</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Route Monitoring & Reassessment Panel */}
                <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                    <span className="font-extrabold text-[10px] text-[#0B4F8A] uppercase tracking-wider">ROUTE MONITORING</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      monitorStatus === 'INVALIDATED' ? 'bg-red-100 text-red-800 border border-red-300' :
                      monitorStatus === 'REPLACED' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {monitorStatus || 'INACTIVE'}
                    </span>
                  </div>

                  {!monitoredRoute ? (
                    <button
                      onClick={handleStartRouteMonitoring}
                      className="w-full bg-[#0B4F8A] hover:bg-[#083B68] text-white font-bold py-1.5 rounded text-xs transition"
                    >
                      START ROUTE MONITORING
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-slate-700 text-[11px]">
                        <b>Corridor:</b> Dharwad ➔ Hubballi Center<br/>
                        <b>Risk Status:</b> {monitorStatus === 'INVALIDATED' ? 'CRITICAL (80/100)' : 'SAFE (0/100)'}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCheckRouteNow}
                          className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-1 rounded text-[10px]"
                        >
                          CHECK ROUTE
                        </button>
                        <button
                          onClick={handleTriggerRouteReassessment}
                          className="flex-1 bg-red-700 hover:bg-red-800 text-white font-bold py-1 rounded text-[10px]"
                        >
                          OBSTRUCTION
                        </button>
                      </div>

                      {/* Reassessment Workflow */}
                      {monitorStatus === 'INVALIDATED' && (
                        <div className="bg-red-50 border border-red-200 p-2 rounded text-red-900 text-[11px] space-y-1.5">
                          <div className="font-bold text-red-800">⚠ ROUTE INVALIDATED</div>
                          <div>Critical flood-risk segment detected on corridor.</div>
                          
                          {!replacementRec ? (
                            <button
                              onClick={handleFindReplacementRoute}
                              className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-1 rounded text-xs"
                            >
                              FIND REPLACEMENT ROUTE
                            </button>
                          ) : (
                            <div className="space-y-1 pt-1 border-t border-red-200">
                              <div className="font-bold text-emerald-800">PROPOSED LOWER-RISK ROUTE:</div>
                              <div>Risk: SAFE (0/100) | ETA: 22 mins</div>
                              <button
                                onClick={handleApproveReplacementRoute}
                                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 rounded text-xs"
                              >
                                APPROVE REPLACEMENT ROUTE
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Bottom Operational Timeline */}
            <div className="bg-white border border-[#D9E0E8] rounded-md p-3 shrink-0 text-xs shadow-sm">
              <div className="font-extrabold text-[10px] uppercase text-slate-500 mb-1">OPERATIONAL TIMELINE & EVENT FEED</div>
              <div className="flex gap-2 overflow-x-auto text-[10px]">
                {selectedIncidentDetail?.timeline ? selectedIncidentDetail.timeline.map((evt, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded shrink-0">
                    <span className="font-mono text-slate-500">{new Date(evt.timestamp).toLocaleTimeString()}</span> - <span className="font-bold text-[#0B4F8A]">{evt.event_type}</span>: <span className="text-slate-800">{evt.description}</span>
                  </div>
                )) : <div className="text-slate-400 italic">Select an incident to view timeline events.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: INCIDENT COMMAND DASHBOARD                            */}
        {/* ============================================================ */}
        {activeTab === 'incidents' && (
          <div className="flex-1 p-4 overflow-hidden bg-[#F5F7FA]">
            <IncidentCenter
              onClose={() => setActiveTab('overview')}
              sharedSelectedIncident={selectedIncident}
              onSelectIncident={inc => {
                setSelectedIncident(inc);
                fetchIncidentDetail(inc.incident_id);
              }}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: FIELD OPERATIONS DASHBOARD WITH COMPLETE AUDIT TRAIL  */}
        {/* ============================================================ */}
        {activeTab === 'field' && (
          <div className="flex-1 p-4 overflow-y-auto bg-[#F5F7FA] text-xs space-y-4">
            <div className="bg-white border border-[#D9E0E8] p-4 rounded-md flex justify-between items-center shadow-sm">
              <div>
                <h2 className="text-base font-extrabold text-[#0B4F8A] uppercase">FIELD OPERATIONS COMMAND & AUDIT DESK</h2>
                <div className="text-slate-600 font-bold text-xs mt-0.5">ACTIVE MISSIONS, COMPLETED WORK & CHRONOLOGICAL OPERATIONAL AUDIT LOG</div>
              </div>
              <button
                onClick={handleTriggerRouteReassessment}
                className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-3.5 py-2 rounded shadow-sm"
              >
                SUBMIT FIELD REPORT: ROAD OBSTRUCTED
              </button>
            </div>

            {/* Active Response Units Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {fieldUnits.map(fu => {
                const st = fieldUnitStates[fu.field_unit_id] || fu.status || 'ASSIGNED';
                return (
                  <div key={fu.field_unit_id} className="bg-white border border-[#D9E0E8] p-4 rounded-md space-y-2.5 shadow-sm">
                    <div className="flex justify-between items-center border-b border-[#D9E0E8] pb-2">
                      <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                        <span>{fu.unit_type?.includes('BOAT') ? '🛥️' : fu.unit_type?.includes('AMBULANCE') ? '🚑' : '🚒'}</span>
                        {fu.name}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 font-bold rounded border ${
                        st === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-blue-50 text-[#0B4F8A] border-blue-200'
                      }`}>
                        {st}
                      </span>
                    </div>
                    <div className="text-slate-700"><b>Type:</b> {fu.unit_type}</div>
                    <div className="text-slate-700"><b>Assigned Incident:</b> {selectedIncident?.title || 'Dharwad Central Drainage Overflow'}</div>
                    <div className="text-slate-700"><b>Current Location:</b> {fu.city || fu.district}</div>

                    {/* Unit State Machine Action Buttons */}
                    <div className="pt-2 border-t border-[#D9E0E8] grid grid-cols-2 gap-1.5">
                      <button onClick={() => handleUpdateUnitState(fu.field_unit_id, 'EN_ROUTE')} className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold p-1.5 rounded text-[10px] border border-slate-300">
                        START TRIP
                      </button>
                      <button onClick={() => handleUpdateUnitState(fu.field_unit_id, 'AT_SCENE')} className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold p-1.5 rounded text-[10px] border border-slate-300">
                        ARRIVED SCENE
                      </button>
                      <button
                        onClick={() => {
                          handleUpdateUnitState(fu.field_unit_id, 'OPERATING');
                          setActiveOperationModal(fu);
                        }}
                        className="bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold p-1.5 rounded text-[10px] border border-purple-300"
                      >
                        START OPERATION
                      </button>
                      <button onClick={() => handleUpdateUnitState(fu.field_unit_id, 'COMPLETED')} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold p-1.5 rounded text-[10px]">
                        COMPLETE
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Field Incident Audit Table (Detected, Acknowledged, Assessing, Escalated, Resolved) */}
            <div className="bg-white border border-[#D9E0E8] rounded-md p-4 space-y-3 shadow-sm">
              <div className="font-extrabold text-xs text-[#0B4F8A] uppercase tracking-wider border-b border-[#D9E0E8] pb-2 flex justify-between items-center">
                <span>FIELD INCIDENT AUDIT & STATUS TRACKING</span>
                <span className="text-[10px] text-slate-500 font-mono">TOTAL INCIDENTS: {incidents.length}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                      <th className="p-2">INCIDENT TITLE</th>
                      <th className="p-2">LOCATION</th>
                      <th className="p-2">HAZARD TYPE</th>
                      <th className="p-2">SEVERITY</th>
                      <th className="p-2">STATUS</th>
                      <th className="p-2">ASSIGNED TEAM</th>
                      <th className="p-2">FIELD REPORT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc, idx) => (
                      <tr key={inc.incident_id} className={`border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="p-2 font-bold text-slate-900">{inc.title}</td>
                        <td className="p-2 text-slate-700">{inc.district}, {inc.state}</td>
                        <td className="p-2 text-[#0B4F8A] font-medium">{inc.hazard_type}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black text-white ${
                            inc.severity === 'CRITICAL' ? 'bg-red-700' : 'bg-amber-600'
                          }`}>
                            {inc.severity}
                          </span>
                        </td>
                        <td className="p-2 font-bold text-slate-800">{inc.status}</td>
                        <td className="p-2 text-slate-700">{fieldUnits[idx % fieldUnits.length]?.name || 'Rescue Team Alpha'}</td>
                        <td className="p-2 font-mono text-[10px] text-emerald-700 font-bold">VERIFIED EVIDENCE</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Comprehensive Chronological Operational Audit Log */}
            <div className="bg-white border border-[#D9E0E8] rounded-md p-4 space-y-3 shadow-sm">
              <div className="font-extrabold text-xs text-[#0B4F8A] uppercase tracking-wider border-b border-[#D9E0E8] pb-2">
                CHRONOLOGICAL OPERATIONAL AUDIT LOG
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-[11px] pr-1">
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:42 IST</span> — <span className="font-bold text-red-700">INCIDENT_DETECTED</span>: Gokul Road Waterlogging risk score reached 88/100 (CRITICAL).
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:43 IST</span> — <span className="font-bold text-[#0B4F8A]">INCIDENT_ACKNOWLEDGED</span>: EOC Operator acknowledged incident Gokul Road.
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:44 IST</span> — <span className="font-bold text-[#0B4F8A]">RESPONSE_PLAN_CREATED</span>: Response plan PLAN-7F8A2D recommended.
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:45 IST</span> — <span className="font-bold text-emerald-700">RESPONSE_PLAN_APPROVED</span>: EOC Operator approved response plan and reserved Rescue Team Alpha.
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:46 IST</span> — <span className="font-bold text-blue-700">TEAM_ASSIGNED</span>: Rescue Team Alpha assigned to Gokul Road Waterlogging.
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:47 IST</span> — <span className="font-bold text-blue-700">SIMULATED_DISPATCH</span>: Simulated dispatch for Rescue Team Alpha (EN_ROUTE).
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:51 IST</span> — <span className="font-bold text-purple-700">FIELD_STATUS_CHANGED</span>: Rescue Team Alpha arrived at scene (AT_SCENE).
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:54 IST</span> — <span className="font-bold text-amber-700">FIELD_REPORT_SUBMITTED</span>: Road obstructed by culvert overflow reported by field unit.
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                  <span className="text-slate-500 font-bold">19:58 IST</span> — <span className="font-bold text-emerald-700">REPLACEMENT_ROUTE_APPROVED</span>: Lower-risk replacement route approved & activated.
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: WEATHER & PREPAREDNESS DASHBOARD                     */}
        {/* ============================================================ */}
        {activeTab === 'weather' && (
          <div className="flex-1 flex flex-col p-4 bg-[#F5F7FA] overflow-y-auto">
            <WeatherDashboard onSelectTab={setActiveTab} isScenarioActive={scenarioStatus?.active} />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: SATELLITE INTELLIGENCE DASHBOARD                      */}
        {/* ============================================================ */}
        {activeTab === 'satellite' && (
          <div className="flex-1 flex flex-col p-4 bg-[#F5F7FA] gap-3 overflow-hidden">
            <div className="bg-white border border-[#D9E0E8] p-3 rounded-md flex justify-between items-center shrink-0 shadow-sm">
              <div>
                <h2 className="text-base font-extrabold uppercase text-[#0B4F8A] flex items-center gap-2">
                  <span>🛰</span> SATELLITE INTELLIGENCE & EARTH OBSERVATION
                </h2>
                <p className="text-xs text-slate-600">NASA GIBS VIIRS SNPP Corrected Reflectance True Color Imagery — Centered on Hubballi-Dharwad Urban Sector</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="bg-blue-50 text-[#0B4F8A] border border-blue-200 px-3 py-1 rounded">
                  FRESHNESS: UNKNOWN (Latest Available GIBS Imagery)
                </span>
              </div>
            </div>

            <div className="flex-1 bg-white border border-[#D9E0E8] rounded-md overflow-hidden relative shadow-sm">
              <MapComponent
                showSatellite={true}
                satLayers={satLayers}
                incidents={incidents}
                fieldUnits={fieldUnits}
              />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: NATIONAL RISK DASHBOARD                              */}
        {/* ============================================================ */}
        {activeTab === 'national' && (
          <div className="flex-1 relative overflow-hidden bg-[#F5F7FA]">
            <NationalView />
          </div>
        )}

      </div>

    </div>
  );
}
