/**
 * HeatMap – Leaflet map with canvas-based heatmap overlay.
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

// Canvas-based heatmap layer (replaces leaflet.heat dependency)
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
      if (this._canvas.parentNode) {
        map.getPane('overlayPane').removeChild(this._canvas);
      }
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

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const radius = 35;
      for (const { lat, lng, intensity } of this._points) {
        const pt = map.latLngToContainerPoint([lat, lng]);
        const alpha = Math.min((intensity / 100) * 0.9 + 0.1, 1);

        const col = intensity < 25 ? '34,197,94'
          : intensity < 50 ? '250,204,21'
          : intensity < 75 ? '251,146,60'
          : '239,68,68';

        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
        grad.addColorStop(0,   `rgba(${col},${alpha})`);
        grad.addColorStop(0.4, `rgba(${col},${alpha * 0.6})`);
        grad.addColorStop(1,   `rgba(${col},0)`);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    },
  });
}

export default function HeatMap({ center = [20.5937, 78.9629], zoom = 5, points = [], userLat, userLng }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const heatLayerRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Initialise map once
  useEffect(() => {
    if (mapInstanceRef.current) return;
    if (!mapRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

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
      heatLayerRef.current = null;
    }

    const renderPoints = points.length > 0 ? points : null;
    if (renderPoints) {
      const HeatLayer = createCanvasHeatLayer(renderPoints);
      const layer = new HeatLayer();
      layer._points = renderPoints;
      layer.addTo(map);
      heatLayerRef.current = layer;
    }
  }, [points]);

  // Update user marker when GPS changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLat && userLng) {
      const pos = [userLat, userLng];
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(pos);
      } else {
        userMarkerRef.current = L.circleMarker(pos, {
          radius: 8, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.9, weight: 2,
        }).addTo(map).bindPopup('Your Location');
      }
      map.setView(pos, map.getZoom(), { animate: true });
    }
  }, [userLat, userLng]);

  const hasPoints = points.length > 0;
  const hasGPS = !!(userLat && userLng);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '12px 16px 8px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid #334155' }}>
        🗺️ Pollution Heatmap
        {hasPoints && (
          <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>
            {points.length} data point{points.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!hasGPS && !hasPoints && (
        <div style={{
          background: '#162032',
          padding: '10px 14px',
          fontSize: 12,
          color: '#94a3b8',
          borderBottom: '1px solid #1e3a5f',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          📍 Enable GPS and start monitoring to plot pollution data on the map.
        </div>
      )}

      <div ref={mapRef} style={{ height: 320, width: '100%' }} />

      <div style={{ padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { color: '#22c55e', label: 'Low (<25)' },
          { color: '#facc15', label: 'Moderate (25–50)' },
          { color: '#fb923c', label: 'High (50–75)' },
          { color: '#ef4444', label: 'Hazardous (>75)' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
