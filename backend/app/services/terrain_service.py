import os
import rasterio
from rasterio.windows import Window
import numpy as np
import functools
from app.config.settings import settings

class TerrainService:
    def __init__(self):
        self.dem_path = settings.DEM_PATH
        self.is_available = os.path.exists(self.dem_path)
        self.source = "ISRO/NRSC CartoDEM V3 R1 - D43D"
        import threading
        self._src = None
        self._lock = threading.Lock()

    def _get_dataset(self):
        if not self.is_available:
            return None
        if self._src is None:
            with self._lock:
                if self._src is None:
                    self._src = rasterio.open(self.dem_path)
        return self._src

    @functools.lru_cache(maxsize=100000)
    def get_terrain_susceptibility(self, lat: float, lon: float):
        if not self.is_available:
            return {
                "status": "unavailable",
                "source": "UNAVAILABLE",
                "error": "DEM file not found"
            }

        try:
            src = self._get_dataset()
            if src is None:
                raise Exception("Failed to open DEM")

            with self._lock:
                # 1. Check if point is within bounds
                if not (src.bounds.left <= lon <= src.bounds.right and src.bounds.bottom <= lat <= src.bounds.top):
                    return {
                        "status": "unavailable",
                        "source": self.source,
                        "error": "Coordinate is outside DEM bounds"
                    }

                # 2. Get the row/col index for the target point
                row, col = src.index(lon, lat)
                
                # 3. Read a local neighborhood window (e.g., 9x9 pixels roughly ~270m x 270m)
                window_size = 9
                offset = window_size // 2
                
                # Calculate safe window bounds ensuring we don't read outside the raster
                row_start = max(0, row - offset)
                row_end = min(src.height, row + offset + 1)
                col_start = max(0, col - offset)
                col_end = min(src.width, col + offset + 1)
                
                window = Window.from_slices((row_start, row_end), (col_start, col_end))
                
                data = src.read(1, window=window)
                mask = src.read_masks(1, window=window)
                
                # 4. Extract valid data using mask and handle nodata
                valid_data = data[mask != 0]
                
                if len(valid_data) == 0:
                    return {
                        "status": "unavailable",
                        "source": self.source,
                        "error": "No valid elevation data at this location"
                    }
                    
                # The target point's exact elevation is the one at the center of the window
                target_val_array = next(src.sample([(lon, lat)]))
                target_elevation = target_val_array[0]
                
                if mask[row - row_start, col - col_start] == 0:
                    return {
                        "status": "unavailable",
                        "source": self.source,
                        "error": "Target coordinate is NoData/masked"
                    }

                target_elevation = float(target_elevation)
                mean_neighborhood = float(valid_data.mean())
                local_relative_elevation = target_elevation - mean_neighborhood
                
                # 5. Calculate Susceptibility Score (0-100)
                if local_relative_elevation <= -5.0:
                    score = 100
                elif local_relative_elevation >= 2.0:
                    score = 0
                else:
                    normalized = (local_relative_elevation - (-5.0)) / 7.0
                    score = int(100 - (normalized * 100))
                    
                return {
                    "status": "success",
                    "source": self.source,
                    "elevation_m": target_elevation,
                    "local_relative_elevation_m": round(local_relative_elevation, 2),
                    "mean_neighborhood_m": round(mean_neighborhood, 2),
                    "susceptibility_score": score
                }

        except Exception as e:
            return {
                "status": "unavailable",
                "source": "UNAVAILABLE",
                "error": f"Failed to process DEM: {str(e)}"
            }

    def _sample_point_from_raster(self, src, lat, lon):
        """Sample a single point from an already-opened rasterio dataset.
        Internal helper for batch operations. Same logic as get_terrain_susceptibility
        but reuses an open rasterio handle."""
        try:
            if not (src.bounds.left <= lon <= src.bounds.right and src.bounds.bottom <= lat <= src.bounds.top):
                return {"status": "unavailable", "source": self.source, "error": "Outside DEM bounds"}

            row, col = src.index(lon, lat)
            window_size = 9
            offset = window_size // 2
            row_start = max(0, row - offset)
            row_end = min(src.height, row + offset + 1)
            col_start = max(0, col - offset)
            col_end = min(src.width, col + offset + 1)

            window = Window.from_slices((row_start, row_end), (col_start, col_end))
            data = src.read(1, window=window)
            mask = src.read_masks(1, window=window)
            valid_data = data[mask != 0]

            if len(valid_data) == 0:
                return {"status": "unavailable", "source": self.source, "error": "No valid data"}

            target_val_array = next(src.sample([(lon, lat)]))
            target_elevation = target_val_array[0]

            if mask[row - row_start, col - col_start] == 0:
                return {"status": "unavailable", "source": self.source, "error": "NoData"}

            target_elevation = float(target_elevation)
            mean_neighborhood = float(valid_data.mean())
            local_relative_elevation = target_elevation - mean_neighborhood

            if local_relative_elevation <= -5.0:
                score = 100
            elif local_relative_elevation >= 2.0:
                score = 0
            else:
                normalized = (local_relative_elevation - (-5.0)) / 7.0
                score = int(100 - (normalized * 100))

            return {
                "status": "success", "source": self.source,
                "elevation_m": target_elevation,
                "local_relative_elevation_m": round(local_relative_elevation, 2),
                "mean_neighborhood_m": round(mean_neighborhood, 2),
                "susceptibility_score": score
            }
        except Exception as e:
            return {"status": "unavailable", "source": self.source, "error": str(e)}

    def get_terrain_susceptibility_batch(self, coords_list):
        """Query terrain susceptibility for multiple (lat, lon) pairs.
        Opens the raster file ONCE for all points. coords_list is a list of (lat, lon) tuples."""
        if not self.is_available:
            return [{"status": "unavailable", "source": "UNAVAILABLE", "error": "DEM not found"} for _ in coords_list]
        try:
            results = []
            with rasterio.open(self.dem_path) as src:
                for lat, lon in coords_list:
                    results.append(self._sample_point_from_raster(src, lat, lon))
            return results
        except Exception as e:
            return [{"status": "unavailable", "source": "UNAVAILABLE", "error": str(e)} for _ in coords_list]

terrain_service = TerrainService()
