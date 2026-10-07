import os
import networkx as nx
import osmnx as ox
from app.config.settings import settings

class RoutingService:
    def __init__(self):
        self.graph_path = settings.OSM_GRAPH_PATH
        self.G = None
        self.nodes_count = 0
        self.edges_count = 0

    def load_graph(self):
        if self.G is None:
            if not os.path.exists(self.graph_path):
                return False
            
            # Load graph and convert string node IDs back to integer if necessary
            # ox.load_graphml reads node IDs as strings by default in newer versions, 
            # but networkx shortest path expects consistent types.
            # actually ox.load_graphml handles types gracefully but we'll see.
            self.G = ox.load_graphml(self.graph_path)
            self.nodes_count = len(self.G.nodes)
            self.edges_count = len(self.G.edges)
            
            # Add edge speeds and travel times if they are missing
            # osmnx can add speeds and travel times
            self.G = ox.add_edge_speeds(self.G)
            self.G = ox.add_edge_travel_times(self.G)
        return True

    def get_status(self):
        is_loaded = self.load_graph()
        if not is_loaded:
            return {
                "status": "not_ready",
                "graph_available": False
            }
        return {
            "status": "ready",
            "graph_available": True,
            "source": "cached_openstreetmap",
            "region": "Hubballi-Dharwad",
            "nodes": self.nodes_count,
            "edges": self.edges_count
        }

    def calculate_route(self, origin_lat: float, origin_lon: float, destination_lat: float, destination_lon: float, hazard_aware: bool = False):
        if not self.load_graph():
            raise Exception("Graph is missing. Cannot calculate route.")
        
        # Find nearest nodes
        orig_node = ox.nearest_nodes(self.G, X=origin_lon, Y=origin_lat)
        dest_node = ox.nearest_nodes(self.G, X=destination_lon, Y=destination_lat)
        
        # Hazard-aware logic
        if hazard_aware:
            from .road_hazard_service import road_hazard_service
            
            # Fetch weather snapshot once
            weather_evidence = road_hazard_service._get_weather_evidence()
            
            # Cache for dynamic weights
            hazard_cache = {}
            hazard_details = {}
            
            def hazard_weight(u, v, edge_dict):
                # In NetworkX MultiDiGraph, if weight is a function, d (edge_dict) is a dict of all parallel edges: {key: {edge_data}}
                min_dynamic_cost = float('inf')
                
                for k, d in edge_dict.items():
                    cache_key = (u, v, k)
                    if cache_key in hazard_cache:
                        cost = hazard_cache[cache_key]
                    else:
                        base_cost = d.get('travel_time', 1.0)  # fallback to 1.0s to match NetworkX default
                        
                        # Assess segment
                        hazard_info = road_hazard_service.assess_road_segment(u, v, k)
                        
                        risk = hazard_info.get("risk", {})
                        score = risk.get("score", 0.0)
                        level = risk.get("level", "SAFE")
                        
                        if level == "CRITICAL":
                            dynamic_cost = float('inf')
                            penalty = 4.0
                        else:
                            hazard_normalized = score / 100.0
                            penalty = 4.0 * hazard_normalized
                            dynamic_cost = base_cost * (1.0 + penalty)
                        
                        hazard_cache[cache_key] = dynamic_cost
                        
                        hazard_details[cache_key] = {
                            "u": u,
                            "v": v,
                            "key": k,
                            "hazard_score": score,
                            "hazard_level": level,
                            "terrain_score": hazard_info.get("terrain", {}).get("segment_score", 0.0),
                            "weather_score": hazard_info.get("weather", {}).get("score", 0.0),
                            "hazard_penalty": penalty,
                            "dynamic_cost": dynamic_cost
                        }
                        cost = dynamic_cost
                        
                    if cost < min_dynamic_cost:
                        min_dynamic_cost = cost
                        
                return min_dynamic_cost

            try:
                route = nx.shortest_path(self.G, orig_node, dest_node, weight=hazard_weight)
            except nx.NetworkXNoPath:
                raise Exception("No route exists between the given locations.")
                
        else:
            try:
                # Shortest path using weight='travel_time'
                route = nx.shortest_path(self.G, orig_node, dest_node, weight='travel_time')
            except nx.NetworkXNoPath:
                raise Exception("No route exists between the given locations.")
        
        # Calculate distance and time by iterating over edges
        distance_m = 0
        estimated_time_s = 0
        segments = []
        overall_score = 0.0
        critical_segments = 0
        high_risk_segments = 0
        lowest_score = 100.0
        highest_score = 0.0
        
        for u, v in zip(route[:-1], route[1:]):
            if hazard_aware:
                # We need to find the edge that was picked
                # hazard_weight was evaluated on all parallel edges, pick the one with min dynamic_cost
                best_k = None
                min_cost = float('inf')
                for k in self.G[u][v]:
                    cost = hazard_cache.get((u, v, k), float('inf'))
                    if cost < min_cost:
                        min_cost = cost
                        best_k = k
                
                if best_k is None:
                    best_k = 0
                edge_data = self.G[u][v][best_k]
                
                # Retrieve hazard details
                h_detail = hazard_details.get((u, v, best_k), {})
                segments.append(h_detail)
                
                score = h_detail.get("hazard_score", 0.0)
                level = h_detail.get("hazard_level", "SAFE")
                overall_score = max(overall_score, score)
                lowest_score = min(lowest_score, score)
                highest_score = max(highest_score, score)
                if level == "CRITICAL":
                    critical_segments += 1
                elif level == "HIGH":
                    high_risk_segments += 1
            else:
                edge_data = min(self.G.get_edge_data(u, v).values(), key=lambda x: x.get('travel_time', 0))
                
            distance_m += edge_data.get('length', 0)
            estimated_time_s += edge_data.get('travel_time', 0)
        
        # Create GeoJSON LineString coordinates [lon, lat]
        coordinates = []
        for node in route:
            node_data = self.G.nodes[node]
            coordinates.append([node_data['x'], node_data['y']])
            
        result = {
            "source": "cached_openstreetmap",
            "origin": {"lat": origin_lat, "lon": origin_lon},
            "destination": {"lat": destination_lat, "lon": destination_lon},
            "distance_m": round(distance_m, 2),
            "estimated_time_s": round(estimated_time_s, 2),
            "route_nodes": route,
            "route": {
                "type": "LineString",
                "coordinates": coordinates
            }
        }
        
        if hazard_aware:
            result["route_mode"] = "HAZARD_AWARE"
            result["hazard_summary"] = {
                "overall_score": overall_score,
                "overall_level": "CRITICAL" if critical_segments > 0 else ("HIGH" if high_risk_segments > 0 else ("LOW" if overall_score >= 25 else "SAFE")),
                "critical_segments": critical_segments,
                "high_risk_segments": high_risk_segments,
                "lowest_segment_score": lowest_score if segments else 0.0,
                "highest_segment_score": highest_score
            }
            result["segments"] = segments
            
        return result

routing_service = RoutingService()
