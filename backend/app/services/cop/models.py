from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class SystemStatusModel(BaseModel):
    status: str = Field("ONLINE", description="Overall backend system status")
    mode: str = Field("LOCAL", description="Operational execution mode (LOCAL / EDGE)")
    backend_health: str = Field("HEALTHY", description="FastAPI health check status")
    gis_status: str = Field("READY", description="OSM / NetworkX GIS graph availability")
    weather_mode: str = Field("LIVE", description="Weather provider mode")

class MapContextModel(BaseModel):
    center: Dict[str, float] = Field(default_factory=lambda: {"lat": 15.3647, "lon": 75.1240})
    default_zoom: int = 13
    region: str = "Hubballi-Dharwad"

class COPThreatModel(BaseModel):
    id: str
    category: str
    severity: str
    confidence: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_m: float = 500.0
    status: str
    title: str
    description: str = ""
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None

class COPFieldUnitModel(BaseModel):
    id: str
    name: str
    type: str
    status: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    incident_id: Optional[str] = None
    last_seen: Optional[str] = None

class COPMonitoredRouteModel(BaseModel):
    id: str
    status: str
    origin: Optional[Dict[str, float]] = None
    destination: Optional[Dict[str, float]] = None
    distance_m: float = 0.0
    estimated_time_s: float = 0.0
    hazard_summary: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    last_checked_at: Optional[str] = None

class COPEvidenceModel(BaseModel):
    id: str
    incident_id: str
    type: str
    timestamp: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    confidence: Optional[int] = None
    provenance: str = "FIELD_APP"
    description: str = ""
    human_confirmation: str = "UNREVIEWED"

class COPSnapshotResponse(BaseModel):
    generated_at: str
    system: SystemStatusModel
    map: MapContextModel
    threats: List[COPThreatModel]
    field_units: List[COPFieldUnitModel]
    monitored_routes: List[COPMonitoredRouteModel]
    evidence: List[COPEvidenceModel]

class COPSummaryResponse(BaseModel):
    generated_at: str
    system_status: str
    active_threat_count: int
    active_unit_count: int
    monitored_route_count: int
    total_evidence_count: int
