import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Sprout, Loader2, Sparkles, Navigation, Globe, Sun, CloudRain, Plus, Minus } from 'lucide-react';

interface CropRecommendationMapProps {
  onBack?: () => void;
  language?: string;
  coords?: { lat: number; lon: number };
  onCoordsChange?: (newCoords: { lat: number; lon: number }) => void;
  showResultsOnly?: boolean;
}

export interface YieldResult {
  status: string;
  latitude: number;
  longitude: number;
  predicted_yield_tons_per_acre: number;
  temperature: number;
  rainfall_mm: number;
  soil: { clay_percentage: number; sand_percentage: number };
  advice_tamil: string;
}

export const CropRecommendationMap: React.FC<CropRecommendationMapProps> = ({
  language = 'ta',
  coords: propCoords,
  onCoordsChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [localCoords, setLocalCoords] = useState<{ lat: number; lon: number }>(
    propCoords || { lat: 13.0827, lon: 80.2707 }
  );
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  const currentCoords = propCoords || localCoords;

  useEffect(() => {
    if (propCoords) {
      setLocalCoords(propCoords);
      if (mapInstanceRef.current && markerRef.current) {
        mapInstanceRef.current.setView([propCoords.lat, propCoords.lon], 13);
        markerRef.current.setLatLng([propCoords.lat, propCoords.lon]);
      }
    }
  }, [propCoords]);

  // Dynamically load Leaflet library and render Esri World Imagery satellite map
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const loadLeafletScript = () => {
      if ((window as any).L) {
        initMap();
        return;
      }
      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => initMap();
        document.head.appendChild(script);
      } else {
        const checkL = setInterval(() => {
          if ((window as any).L) {
            clearInterval(checkL);
            initMap();
          }
        }, 100);
      }
    };

    const initMap = () => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      const L = (window as any).L;
      if (!L) return;

      const map = L.map(mapContainerRef.current, {
        center: [currentCoords.lat, currentCoords.lon],
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri Satellite',
          maxZoom: 18,
        }
      ).addTo(map);

      const customIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `<div style="background-color:#dc2626; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; border:3px solid white; box-shadow:0 4px 12px rgba(0,0,0,0.5); font-size:18px;">📍</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([currentCoords.lat, currentCoords.lon], { icon: customIcon, draggable: true }).addTo(map);
      markerRef.current = marker;

      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        const newLat = parseFloat(lat.toFixed(4));
        const newLon = parseFloat(lng.toFixed(4));
        setLocalCoords({ lat: newLat, lon: newLon });
        marker.setLatLng([newLat, newLon]);
        if (onCoordsChange) onCoordsChange({ lat: newLat, lon: newLon });
      });

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        const newLat = parseFloat(position.lat.toFixed(4));
        const newLon = parseFloat(position.lng.toFixed(4));
        setLocalCoords({ lat: newLat, lon: newLon });
        if (onCoordsChange) onCoordsChange({ lat: newLat, lon: newLon });
      });

      mapInstanceRef.current = map;
      setMapLoaded(true);
    };

    loadLeafletScript();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  return (
    <div className="relative w-full h-full min-h-[280px]">
      {/* Map Element */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0 z-0 bg-slate-900" />
      
      {!mapLoaded && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center text-white gap-2 z-10">
          <Loader2 className="w-5 h-5 animate-spin text-green-400" />
          <span className="text-xs font-semibold">Loading Live Satellite Map...</span>
        </div>
      )}

      {/* Top Badge: LIVE SATELLITE VIEW */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="bg-black/85 text-white font-[900] text-[11px] uppercase tracking-wider px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg border border-white/10 backdrop-blur-sm">
          <span className="text-amber-400 text-xs">★</span>
          <span>LIVE SATELLITE VIEW</span>
        </div>
      </div>

      {/* Stacked Zoom Controls (+ and -) */}
      <div className="absolute bottom-10 right-3 z-10 flex flex-col gap-1">
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-7 h-7 bg-white text-gray-800 font-bold text-base rounded flex items-center justify-center shadow-md active:bg-gray-100"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-7 h-7 bg-white text-gray-800 font-bold text-base rounded flex items-center justify-center shadow-md active:bg-gray-100"
        >
          <Minus size={16} />
        </button>
      </div>

      {/* Bottom Right Badge: Latitude & Longitude */}
      <div className="absolute bottom-10 left-3 z-10 pointer-events-none">
        <div className="bg-black/80 text-white font-mono font-bold text-[10px] px-3 py-1 rounded-full shadow-md backdrop-blur-sm border border-white/10">
          Lat: {currentCoords.lat.toFixed(4)} | Lon: {currentCoords.lon.toFixed(4)}
        </div>
      </div>

      {/* Bottom Google Map Attribution Footer */}
      <div className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-sm px-3 py-1 text-[9px] text-gray-600 flex items-center justify-between z-10 border-t border-gray-200 pointer-events-none">
        <span className="font-bold text-gray-800">Google</span>
        <div className="flex gap-2 font-medium">
          <span>Keyboard shortcuts</span>
          <span>Map Data</span>
          <span>Terms</span>
          <span>Report a map error</span>
        </div>
      </div>
    </div>
  );
};

export default CropRecommendationMap;
