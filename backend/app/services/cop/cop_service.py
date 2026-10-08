from datetime import datetime
from typing import List, Dict, Any

from app.services.threat.threat_service import threat_service
from app.services.field_operations.field_service import field_service
from app.services.route_monitor_service import route_monitor_service
from app.services.field_operations.evidence_service import evidence_service
from app.services.routing_service import routing_service
from app.services.weather_adapter import weather_adapter

from app.services.cop.models import (
    SystemStatusModel,
    MapContextModel,
    COPThreatModel,
    COPFieldUnitModel,
    COPMonitoredRouteModel,
    COPEvidenceModel,
    COPSnapshotResponse,
    COPSummaryResponse,
)

class CopService:
    """Orchestration/read-model service that composes domain state into a COP snapshot."""

    def get_cop_snapshot(self) -> COPSnapshotResponse:
        now = datetime.utcnow().isoformat() + "Z"

        # 1. System & GIS Status Context
        gis_info = routing_service.get_status()
        gis_status_str = "READY" if gis_info.get("graph_available") else "UNAVAILABLE"
        weather_info = weather_adapter.get_weather_evidence()
        weather_mode_str = weather_info.get("source", "LIVE")

        system_status = SystemStatusModel(
            status="ONLINE",
            mode="LOCAL",
            backend_health="HEALTHY",
            gis_status=gis_status_str,
            weather_mode=weather_mode_str,
        )

        map_context = MapContextModel(
            center={"lat": 15.3647, "lon": 75.1240},
            default_zoom=13,
            region="Hubballi-Dharwad",
        )

        # 2. Normalize Threats
        raw_threats = threat_service.list_threats()
        normalized_threats: List[COPThreatModel] = []
        for t in raw_threats:
            t_id = t.get("incident_id") or t.get("threat_id") or "UNKNOWN"
            normalized_threats.append(
                COPThreatModel(
                    id=t_id,
                    category=t.get("category") or t.get("hazard_type") or "General Threat",
                    severity=t.get("severity") or "HIGH",
                    confidence=t.get("confidence") or "MEDIUM",
                    latitude=t.get("latitude"),
                    longitude=t.get("longitude"),
                    radius_m=float(t.get("radius_m") or 500.0),
                    status=t.get("status") or "DETECTED",
                    title=t.get("title") or "Threat Event",
                    description=t.get("description") or "",
                    first_seen=t.get("first_seen") or t.get("created_at"),
                    last_seen=t.get("last_seen") or t.get("updated_at"),
                )
            )

        # 3. Normalize Field Units
        raw_units = field_service.get_all()
        normalized_units: List[COPFieldUnitModel] = []
        for u in raw_units:
            u_id = u.get("field_unit_id") or "UNKNOWN"
            normalized_units.append(
                COPFieldUnitModel(
                    id=u_id,
                    name=u.get("name") or "Field Unit",
                    type=u.get("unit_type") or "RESCUE_TEAM",
                    status=u.get("status") or "ASSIGNED",
                    latitude=u.get("latitude"),
                    longitude=u.get("longitude"),
                    incident_id=u.get("incident_id"),
                    last_seen=u.get("last_seen"),
                )
            )

        # 4. Normalize Monitored Routes
        route_monitor_service._load_from_db()
        raw_routes = route_monitor_service._monitored_routes.values()
        normalized_routes: List[COPMonitoredRouteModel] = []
        for r in raw_routes:
            r_id = r.get("route_id") or "UNKNOWN"
            normalized_routes.append(
                COPMonitoredRouteModel(
                    id=r_id,
                    status=r.get("monitor_status") or "ACTIVE",
                    origin=r.get("origin"),
                    destination=r.get("destination"),
                    distance_m=float(r.get("distance_m") or 0.0),
                    estimated_time_s=float(r.get("estimated_time_s") or 0.0),
                    hazard_summary=r.get("current_hazard_summary") or r.get("initial_hazard_summary") or {},
                    created_at=r.get("created_at"),
                    last_checked_at=r.get("last_checked_at"),
                )
            )

        # 5. Normalize Evidence
        raw_evidence = list(evidence_service.evidence.values())
        normalized_evidence: List[COPEvidenceModel] = []
        for e in raw_evidence:
            e_dict = e.dict() if hasattr(e, "dict") else e
            e_id = e_dict.get("evidence_id") or "UNKNOWN"
            normalized_evidence.append(
                COPEvidenceModel(
                    id=e_id,
                    incident_id=e_dict.get("incident_id") or "",
                    type=e_dict.get("evidence_type") or "OBSERVATION",
                    timestamp=e_dict.get("uploaded_at") or e_dict.get("captured_at") or now,
                    latitude=e_dict.get("latitude"),
                    longitude=e_dict.get("longitude"),
                    confidence=e_dict.get("ai_confidence"),
                    provenance=e_dict.get("source") or "FIELD_APP",
                    description=e_dict.get("description") or "",
                    human_confirmation=e_dict.get("human_confirmation") or "UNREVIEWED",
                )
            )

        return COPSnapshotResponse(
            generated_at=now,
            system=system_status,
            map=map_context,
            threats=normalized_threats,
            field_units=normalized_units,
            monitored_routes=normalized_routes,
            evidence=normalized_evidence,
        )

    def get_cop_summary(self) -> COPSummaryResponse:
        now = datetime.utcnow().isoformat() + "Z"
        snapshot = self.get_cop_snapshot()

        active_threats = [t for t in snapshot.threats if t.status not in ["CLOSED", "RESOLVED"]]

        return COPSummaryResponse(
            generated_at=now,
            system_status=snapshot.system.status,
            active_threat_count=len(active_threats),
            active_unit_count=len(snapshot.field_units),
            monitored_route_count=len(snapshot.monitored_routes),
            total_evidence_count=len(snapshot.evidence),
        )

cop_service = CopService()
