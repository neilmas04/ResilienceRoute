import math
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

from app.repositories.threat_repository import threat_repository
from app.services.threat.models import ThreatEventCreate, ThreatEventUpdate, RouteExposureRequest

class ThreatService:
    """Business logic service for AEGIS-COP Threat Domain."""

    def create_threat(self, payload: ThreatEventCreate) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat() + "Z"
        threat_id = f"THREAT-{datetime.utcnow().year}-{str(uuid.uuid4())[:8].upper()}"
        
        data = {
            "incident_id": threat_id,
            "title": payload.title,
            "hazard_type": payload.category,
            "severity": payload.severity,
            "status": "DETECTED",
            "state": payload.state,
            "district": payload.district,
            "city": payload.city,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "radius_m": payload.radius_m,
            "risk_score": 80 if payload.severity == "CRITICAL" else (60 if payload.severity == "HIGH" else 40),
            "official_warning": "RED" if payload.severity == "CRITICAL" else "ORANGE",
            "confidence": payload.confidence,
            "source": payload.source,
            "first_seen": now,
            "last_seen": now,
            "created_at": now,
            "updated_at": now,
            "description": payload.description,
            "evidence_references": payload.evidence_references,
            "alerts": [],
            "escalations": [],
            "resource_requirements": [],
            "response_plans": [],
            "timeline": [{
                "incident_id": threat_id,
                "event_type": "THREAT_CREATED",
                "description": f"Threat event created: {payload.title}",
                "source": payload.source,
                "actor": "OPERATOR",
                "timestamp": now,
                "metadata": {}
            }]
        }
        
        return threat_repository.save(data)

    def get_threat(self, threat_id: str) -> Optional[Dict[str, Any]]:
        return threat_repository.get_by_id(threat_id)

    def list_threats(self, category: Optional[str] = None, status: Optional[str] = None, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        return threat_repository.list_threats(category=category, status=status, severity=severity)

    def update_threat(self, threat_id: str, update: ThreatEventUpdate) -> Optional[Dict[str, Any]]:
        existing = threat_repository.get_by_id(threat_id)
        if not existing:
            return None

        now = datetime.utcnow().isoformat() + "Z"
        update_dict = update.dict(exclude_unset=True)
        
        # Map schema fields to storage fields
        if "category" in update_dict:
            update_dict["hazard_type"] = update_dict.pop("category")

        for k, v in update_dict.items():
            if v is not None:
                existing[k] = v

        existing["updated_at"] = now
        existing["last_seen"] = now

        # Add timeline record
        timeline = existing.get("timeline") or []
        timeline.append({
            "incident_id": threat_id,
            "event_type": "THREAT_UPDATED",
            "description": "Threat event attributes updated",
            "source": "OPERATOR",
            "actor": "EOC_OPERATOR",
            "timestamp": now,
            "metadata": update_dict
        })
        existing["timeline"] = timeline

        return threat_repository.save(existing)

    def close_threat(self, threat_id: str, reason: str = None) -> Optional[Dict[str, Any]]:
        return threat_repository.close_threat(threat_id=threat_id, reason=reason)

    def get_threat_zone(self, threat_id: str) -> Optional[Dict[str, Any]]:
        threat = threat_repository.get_by_id(threat_id)
        if not threat or threat.get("status") == "CLOSED":
            return None

        lat = threat.get("latitude")
        lon = threat.get("longitude")
        radius_m = float(threat.get("radius_m") or 500.0)

        if lat is None or lon is None:
            return None

        # Approximate bounding box
        delta_lat = radius_m / 111320.0
        delta_lon = radius_m / (111320.0 * math.cos(math.radians(lat)))

        return {
            "zone_id": f"zone-{threat_id}",
            "threat_id": threat_id,
            "category": threat.get("hazard_type", "UNKNOWN"),
            "severity": threat.get("severity", "HIGH"),
            "status": threat.get("status", "ACTIVE"),
            "center": {"lat": lat, "lon": lon},
            "radius_m": radius_m,
            "bounding_box": {
                "min_lat": round(lat - delta_lat, 6),
                "max_lat": round(lat + delta_lat, 6),
                "min_lon": round(lon - delta_lon, 6),
                "max_lon": round(lon + delta_lon, 6)
            }
        }

    def assess_route_exposure(self, route_coords: List[List[float]], threat_ids: Optional[List[str]] = None, safety_buffer_m: float = 50.0) -> Dict[str, Any]:
        """Contract for evaluating route geometry against threat zones."""
        all_threats = threat_repository.get_all()
        active_threats = [t for t in all_threats if t.get("status") not in ["CLOSED", "RESOLVED"]]
        
        if threat_ids:
            active_threats = [t for t in active_threats if t.get("incident_id") in threat_ids or t.get("threat_id") in threat_ids]

        affected_threats = []
        intersected_zones = []
        details = []
        max_exposure_score = 0.0
        highest_severity = "SAFE"
        severity_rank = {"SAFE": 0, "LOW": 1, "MODERATE": 2, "HIGH": 3, "CRITICAL": 4}

        def haversine_m(lat1, lon1, lat2, lon2):
            R = 6371000.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return R * c

        for threat in active_threats:
            t_id = threat.get("incident_id") or threat.get("threat_id")
            t_lat = threat.get("latitude")
            t_lon = threat.get("longitude")
            t_radius = float(threat.get("radius_m") or 500.0)
            t_sev = threat.get("severity", "HIGH")
            
            if t_lat is None or t_lon is None:
                continue

            min_dist = float("inf")
            for coord in route_coords:
                # GeoJSON coordinates are [lon, lat]
                r_lon, r_lat = coord[0], coord[1]
                dist = haversine_m(r_lat, r_lon, t_lat, t_lon)
                if dist < min_dist:
                    min_dist = dist

            effective_threshold = t_radius + safety_buffer_m
            if min_dist <= effective_threshold:
                affected_threats.append(t_id)
                zone_info = self.get_threat_zone(t_id)
                if zone_info:
                    intersected_zones.append(zone_info)

                # Compute risk score for exposure
                overlap_penetration = max(0.0, effective_threshold - min_dist) / effective_threshold
                sev_multiplier = 1.0 if t_sev == "CRITICAL" else (0.8 if t_sev == "HIGH" else 0.5)
                score = round(min(100.0, overlap_penetration * 100.0 * sev_multiplier), 2)
                
                if score > max_exposure_score:
                    max_exposure_score = score

                if severity_rank.get(t_sev, 0) > severity_rank.get(highest_severity, 0):
                    highest_severity = t_sev

                details.append({
                    "threat_id": t_id,
                    "title": threat.get("title"),
                    "category": threat.get("hazard_type"),
                    "severity": t_sev,
                    "distance_to_center_m": round(min_dist, 2),
                    "effective_radius_m": effective_threshold,
                    "exposure_score": score
                })

        return {
            "exposed": len(affected_threats) > 0,
            "exposure_score": max_exposure_score,
            "highest_severity": highest_severity,
            "affected_threat_ids": affected_threats,
            "threat_zones_intersected": intersected_zones,
            "details": details
        }

threat_service = ThreatService()
