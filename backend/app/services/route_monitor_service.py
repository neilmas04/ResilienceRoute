import datetime
import uuid
from typing import Dict, Any, List

from .road_hazard_service import road_hazard_service
from .weather_adapter import weather_adapter
from app.repositories.monitored_route_repository import monitored_route_repository

class RouteMonitorService:
    def __init__(self):
        self._load_from_db()

    def _load_from_db(self):
        self._monitored_routes: Dict[str, dict] = monitored_route_repository.get_all()

    def _persist_route(self, route_record: dict):
        monitored_route_repository.save(route_record)

    def _calculate_monitor_status(self, segments: List[dict]) -> tuple[str, dict]:
        critical = 0
        high = 0
        max_score = 0.0
        max_level = "SAFE"
        
        for seg in segments:
            risk = seg.get("hazard", {}).get("risk", {})
            score = risk.get("score", 0.0)
            level = risk.get("level", "SAFE")
            
            if score > max_score:
                max_score = score
            
            if level == "CRITICAL":
                critical += 1
            elif level == "HIGH":
                high += 1

        if max_score < 25:
            max_level = "SAFE"
        elif max_score < 50:
            max_level = "LOW"
        elif max_score < 75:
            max_level = "HIGH"
        else:
            max_level = "CRITICAL"
                    
        if critical > 0:
            status = "INVALIDATED"
        elif high > 0:
            status = "AT_RISK"
        else:
            status = "ACTIVE"
            
        summary = {
            "overall_score": max_score,
            "overall_level": max_level,
            "high_risk_segments": high,
            "critical_segments": critical,
            "highest_segment_score": max_score
        }
        return status, summary

    def register_route(self, route_payload: Dict[str, Any]) -> dict:
        route_id = str(uuid.uuid4())
        node_ids = route_payload.get("route_nodes", [])
        
        assessment = road_hazard_service.assess_route(node_ids)
        status, summary = self._calculate_monitor_status(assessment.get("segments", []))
        
        now = datetime.datetime.now().isoformat()
        
        route_record = {
            "route_id": route_id,
            "origin": route_payload.get("origin"),
            "destination": route_payload.get("destination"),
            "route_nodes": node_ids,
            "distance_m": route_payload.get("distance_m", 0),
            "estimated_time_s": route_payload.get("estimated_time_s", 0),
            "created_at": now,
            "last_checked_at": now,
            "initial_hazard_summary": summary,
            "current_hazard_summary": summary,
            "monitor_status": status,
            "transitions": []
        }
        
        self._monitored_routes[route_id] = route_record
        self._persist_route(route_record)
        
        return {
            "status": "success",
            "route_id": route_id,
            "monitor_status": status,
            "segment_count": assessment.get("segment_count", 0),
            "hazard_summary": summary
        }
        
    def get_route(self, route_id: str) -> dict:
        self._load_from_db()
        if route_id not in self._monitored_routes:
            return {"status": "not_found"}
            
        record = self._monitored_routes[route_id]
        
        # Pull environmental mode to display Provenance
        weather = weather_adapter.get_weather_evidence()
        mode_label = weather.get("source", "Unknown")
        warning = weather.get("warning")
            
        res = {
            "status": "success",
            "route_id": record["route_id"],
            "monitor_status": record["monitor_status"],
            "created_at": record["created_at"],
            "last_checked_at": record["last_checked_at"],
            "hazard_summary": record["current_hazard_summary"],
            "environmental_mode": mode_label
        }
        if warning:
            res["warning"] = warning
            
        return res
        
    def reassess_route(self, route_id: str) -> dict:
        self._load_from_db()
        if route_id not in self._monitored_routes:
            return {"status": "not_found"}
            
        record = self._monitored_routes[route_id]
        prev_status = record["monitor_status"]
        
        # Reassess with current environment
        assessment = road_hazard_service.assess_route(record["route_nodes"])
        curr_status, summary = self._calculate_monitor_status(assessment.get("segments", []))
        
        now = datetime.datetime.now().isoformat()
        record["last_checked_at"] = now
        record["current_hazard_summary"] = summary
        record["monitor_status"] = curr_status
        
        weather = weather_adapter.get_weather_evidence()
        mode_label = weather.get("source", "Unknown")
        
        changed = (prev_status != curr_status)
        reason = None
        
        if changed:
            if curr_status == "INVALIDATED":
                reason = "A monitored route segment reached CRITICAL hazard level."
            elif curr_status == "AT_RISK":
                reason = "A monitored route segment reached HIGH risk level."
            elif curr_status == "ACTIVE":
                reason = "Route hazards dropped to acceptable levels."
                
            record["transitions"].append({
                "timestamp": now,
                "previous_status": prev_status,
                "new_status": curr_status,
                "highest_segment_score": summary["highest_segment_score"],
                "environmental_mode": mode_label,
                "reason": reason
            })
            
        self._persist_route(record)

        res = {
            "status": "success",
            "route_id": route_id,
            "previous_status": prev_status,
            "current_status": curr_status,
            "changed": changed,
            "environmental_mode": mode_label
        }
        
        if reason:
            res["reason"] = reason
            
        if curr_status == "INVALIDATED":
            res["route_replacement_required"] = True
            
        if weather.get("warning"):
            res["warning"] = weather["warning"]
            
        return res

    def apply_replacement(self, route_id: str, candidate_route: dict, recommendation_id: str, actor: str = "EOC Operator"):
        self._load_from_db()
        if route_id not in self._monitored_routes:
            return
            
        record = self._monitored_routes[route_id]
        prev_status = record["monitor_status"]
        now = datetime.datetime.now().isoformat()
        
        # We need the candidate's summary which was pre-calculated or stored in candidate_route
        new_summary = candidate_route.get("hazard_summary", {})
        
        record["transitions"].append({
            "timestamp": now,
            "previous_status": prev_status,
            "new_status": "REPLACED",
            "highest_segment_score": new_summary.get("highest_segment_score", 0.0),
            "environmental_mode": weather_adapter.get_weather_evidence().get("source", "Unknown"),
            "reason": f"Route replaced by {actor}. Recommendation ID: {recommendation_id}"
        })
        
        # Keep old route for history
        record["previous_route_nodes"] = record["route_nodes"]
        
        # Update current stats
        record["route_nodes"] = candidate_route.get("route_nodes", [])
        record["distance_m"] = candidate_route.get("distance_m", 0)
        record["estimated_time_s"] = candidate_route.get("estimated_time_s", 0)
        record["current_hazard_summary"] = new_summary
        record["monitor_status"] = "REPLACED"
        record["last_checked_at"] = now
        
        self._persist_route(record)

route_monitor_service = RouteMonitorService()
