/**
 * HeatMap – Leaflet map with heatmap overlay.
 * Uses npm leaflet + canvas-based heatmap (since leaflet.heat doesn't have ESM build).
 */
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon paths broken by Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Minimal heatmap renderer using Canvas (replaces leaflet.heat dependency)
function createCanvasHeatLayer(points) {
  return L.Layer.extend({
    onAdd(map) {
      this._map = map;
      const canvas = document.createElement('canvas');
      this._canvas = canvas;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '400';
      map.getPane('overlayPane').appendChild(canvas);
      map.on('moveend zoomend resize', this._redraw, this);
      this._redraw();
    },
    onRemove(map) {
      map.getPane('overlayPane').removeChild(this._canvas);
      map.off('moveend zoomend resize', this._redraw, this);
    },
    _redraw() {
      const map = this._map;
      const canvas = this._canvas;
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Reposition canvas
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const radius = 30;
      for (const { lat, lng, intensity } of this._points) {
        const pt = map.latLngToContainerPoint([lat, lng]);
        const alpha = Math.min(intensity / 100, 1);

        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
        // colour ramp: green → yellow → orange → red
        const col = intensity < 25 ? `34,197,94`
          : intensity < 50 ? `250,204,21`
          : intensity < 75 ? `251,146,60`
          : `239,68,68`;
        grad.addColorStop(0,   `rgba(${col},${alpha * 0.9})`);
        grad.addColorStop(0.5, `rgba(${col},${alpha * 0.5})`);
        grad.addColorStop(1,   `rgba(${col},0)`);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    },
  });
}

export default function HeatMap({ center = [20.5937, 78.9629], zoom = 5, points = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (mapInstanceRef.current) return;
    if (!mapRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark tile layer (tiles served by OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    const dot = L.circleMarker(center, {
      radius: 8, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.8, weight: 2,
    }).addTo(map).bindPopup('Your Location');
    map._userMarker = dot;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update heat layer when points change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    if (points.length > 0) {
      const HeatLayer = createCanvasHeatLayer(points);
      const layer = new HeatLayer();
      layer._points = points;
      layer.addTo(map);
      heatLayerRef.current = layer;
    }
  }, [points]);

  // Update center when GPS changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !center[0]) return;
    if (map._userMarker) map._userMarker.setLatLng(center);
    map.setView(center, map.getZoom(), { animate: true });
  }, [center]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '12px 16px 8px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid #334155' }}>
        🗺️ Pollution Heatmap
        {points.length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>
            {points.length} data points
          </span>
        )}
      </div>
      <div ref={mapRef} style={{ height: 300, width: '100%' }} />
      <div style={{ padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {['#22c55e', '#facc15', '#fb923c', '#ef4444'].map((c, i) => (
          <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: c, display: 'inline-block' }} />
            {['Low', 'Moderate', 'High', 'Hazardous'][i]}
          </span>
        ))}
      </div>
    </div>
  );
}
