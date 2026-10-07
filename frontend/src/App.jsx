import { useState, useEffect } from 'react';
import EocDashboard from './components/EocDashboard';
import NationalView from './components/NationalView';
import CitizenSafety from './components/CitizenSafety';
import { API_BASE_URL } from './config';

function App() {
  const [viewMode, setViewMode] = useState('city'); // 'city', 'national', 'citizen'
  
  const [healthStatus, setHealthStatus] = useState(null);
  const [gisStatus, setGisStatus] = useState(null);
  const [weatherStatus, setWeatherStatus] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);

  // ROUTE MONITORING STATE
  const [monitoredRoute, setMonitoredRoute] = useState(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  // SCENARIO STATE
  const [scenarioStatus, setScenarioStatus] = useState(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  useEffect(() => {
    checkHealth();
    checkGisStatus();
    checkWeather();
    checkSystemStatus();
    fetchScenarioStatus();
  }, []);

  const fetchScenarioStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/scenario/status`);
      if (res.ok) setScenarioStatus(await res.json());
    } catch {}
  };

  const toggleScenario = async () => {
    if (!scenarioStatus) return;
    setScenarioLoading(true);
    const endpoint = scenarioStatus.active ? '/scenario/deactivate' : '/scenario/activate';
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST' });
      if (res.ok) {
        setScenarioStatus(await res.json());
        checkWeather();
        checkSystemStatus();
      }
    } catch {}
    setScenarioLoading(false);
  };

  const handleRunFloodDemo = async () => {
    setScenarioLoading(true);
    try {
      if (scenarioStatus?.active) {
        // Reset scenario
        await fetch(`${API_BASE_URL}/scenario/deactivate`, { method: 'POST' });
      } else {
        // Activate controlled flood scenario
        await fetch(`${API_BASE_URL}/scenario/activate`, { method: 'POST' });
        await fetch(`${API_BASE_URL}/national/incidents/recommend`, { method: 'POST' }).catch(() => {});
        await fetch(`${API_BASE_URL}/flood/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rainfall_mm_hr: 80, blockage_percent: 50, forecast_minutes: 180 })
        }).catch(() => {});
      }
      fetchScenarioStatus();
      checkWeather();
      checkSystemStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setScenarioLoading(false);
    }
  };

  const checkSystemStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/system/status`);
      if (res.ok) {
        setSystemStatus(await res.json());
      }
    } catch {}
  };

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (res.ok) {
        setHealthStatus('connected');
      } else {
        setHealthStatus('offline');
      }
    } catch {
      setHealthStatus('offline');
    }
  };

  const checkGisStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/gis/status`);
      const data = await res.json();
      setGisStatus(data);
    } catch {
      setGisStatus({ status: 'offline', graph_available: false });
    }
  };

  const checkWeather = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/weather`);
      const data = await res.json();
      setWeatherStatus(data);
    } catch (e) {
      setWeatherStatus({ status: 'unavailable', error: 'Failed to connect to backend' });
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950">
      {viewMode === 'national' ? (
        <div className="h-full w-full relative">
          <button
            onClick={() => setViewMode('city')}
            className="absolute top-4 left-4 z-[1000] bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded text-xs shadow-lg"
          >
            &larr; Return to Hubballi EOC
          </button>
          <NationalView />
        </div>
      ) : viewMode === 'citizen' ? (
        <div className="h-full w-full bg-slate-900 flex items-center justify-center p-4 relative">
          <button
            onClick={() => setViewMode('city')}
            className="absolute top-4 left-4 z-[1000] bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded text-xs shadow-lg"
          >
            &larr; Return to Hubballi EOC
          </button>
          <CitizenSafety citizenId="CIT-001" incidentId="INC-001" />
        </div>
      ) : (
        <EocDashboard
          viewMode={viewMode}
          setViewMode={setViewMode}
          weatherStatus={weatherStatus}
          systemStatus={systemStatus}
          scenarioStatus={scenarioStatus}
          toggleScenario={toggleScenario}
          onRunFloodDemo={handleRunFloodDemo}
          onOpenCitizenApp={() => setViewMode('citizen')}
        />
      )}
    </div>
  );
}

export default App;
