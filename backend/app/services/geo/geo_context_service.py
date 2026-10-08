import math
import osmnx as ox
from typing import Dict, Any, List, Optional
from app.services.routing_service import routing_service
from app.services.terrain_service import terrain_service
from .models import GeoPointContext, GeoSnapResult, GeoRouteContext, GeoGISStatus

def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points on Earth."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)

class GeoContextService:
    def __init__(self):
        self.routing_service = routing_service
        self.terrain_service = terrain_service

    def get_gis_status(self) -> GeoGISStatus:
        route_status = self.routing_service.get_status()
        dem_available = self.terrain_service.is_available
        
        return GeoGISStatus(
            status="ready" if (route_status.get("graph_available") and dem_available) else "degraded",
            graph_available=route_status.get("graph_available", False),
            dem_available=dem_available,
            dem_source=self.terrain_service.source if dem_available else "UNAVAILABLE",
            region=route_status.get("region", "Hubballi-Dharwad"),
            nodes_count=route_status.get("nodes", 0),
            edges_count=route_status.get("edges", 0)
        )

    def snap_coordinate(self, lat: float, lon: float) -> GeoSnapResult:
        if not self.routing_service.load_graph():
            raise Exception("OSM Road graph is unavailable for coordinate snapping.")
            
        node_id = ox.nearest_nodes(self.routing_service.G, X=lon, Y=lat)
        node_data = self.routing_service.G.nodes[node_id]
        snapped_lat = float(node_data['y'])
        snapped_lon = float(node_data['x'])
        dist_m = haversine_distance_m(lat, lon, snapped_lat, snapped_lon)
        
        return GeoSnapResult(
            input_lat=lat,
            input_lon=lon,
            snapped_node_id=int(node_id),
            snapped_lat=snapped_lat,
            snapped_lon=snapped_lon,
            distance_m=dist_m
        )

    def get_point_context(self, lat: float, lon: float) -> GeoPointContext:
        terrain_res = self.terrain_service.get_terrain_susceptibility(lat, lon)
        
        snap_res = None
        try:
            snap_res = self.snap_coordinate(lat, lon)
        except Exception:
            pass
            
        return GeoPointContext(
            latitude=lat,
            longitude=lon,
            elevation_m=terrain_res.get("elevation_m"),
            susceptibility_score=terrain_res.get("susceptibility_score"),
            local_relative_elevation_m=terrain_res.get("local_relative_elevation_m"),
            nearest_node_id=snap_res.snapped_node_id if snap_res else None,
            nearest_node_lat=snap_res.snapped_lat if snap_res else None,
            nearest_node_lon=snap_res.snapped_lon if snap_res else None,
            distance_to_nearest_node_m=snap_res.distance_m if snap_res else None,
            terrain_status=terrain_res.get("status", "unavailable"),
            source=terrain_res.get("source", self.terrain_service.source)
        )

    def get_route_context(
        self,
        origin_lat: float,
        origin_lon: float,
        destination_lat: float,
        destination_lon: float,
        hazard_aware: bool = False,
        include_elevation_profile: bool = True
    ) -> GeoRouteContext:
        route_data = self.routing_service.calculate_route(
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            destination_lat=destination_lat,
            destination_lon=destination_lon,
            hazard_aware=hazard_aware
        )
        
        coordinates = route_data.get("route", {}).get("coordinates", [])
        
        elevation_profile = None
        min_elev = None
        max_elev = None
        
        if include_elevation_profile and coordinates and self.terrain_service.is_available:
            # Batch query elevation along route coordinates (lat, lon)
            coords_lat_lon = [(pt[1], pt[0]) for pt in coordinates]
            samples = self.terrain_service.get_terrain_susceptibility_batch(coords_lat_lon)
            
            profile = []
            elevations = []
            for (lon, lat), s in zip(coordinates, samples):
                elev = s.get("elevation_m")
                profile.append({
                    "lat": lat,
                    "lon": lon,
                    "elevation_m": elev,
                    "susceptibility_score": s.get("susceptibility_score")
                })
                if elev is not None:
                    elevations.append(elev)
                    
            if elevations:
                elevation_profile = profile
                min_elev = min(elevations)
                max_elev = max(elevations)
                
        return GeoRouteContext(
            origin=route_data["origin"],
            destination=route_data["destination"],
            distance_m=route_data["distance_m"],
            estimated_time_s=route_data["estimated_time_s"],
            route_mode=route_data.get("route_mode", "STANDARD"),
            route_nodes=route_data.get("route_nodes", []),
            route_geometry=route_data["route"],
            elevation_profile=elevation_profile,
            min_elevation_m=min_elev,
            max_elevation_m=max_elev,
            hazard_summary=route_data.get("hazard_summary"),
            source=route_data.get("source", "cached_openstreetmap")
        )

geo_context_service = GeoContextService()
