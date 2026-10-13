import './style.css';
import L from 'leaflet';
import proj4 from 'proj4';
import { kml } from '@tmcw/togeojson';
import JSZip from 'jszip';

// ==========================================
// 1. Configuración de Sistemas de Coordenadas (Proj4)
// ==========================================
// WGS84 UTM Zona 19N
proj4.defs('EPSG:32619', '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs');

// NAD27 UTM Zona 19N con parámetros de transformación para República Dominicana / Caribe
proj4.defs('EPSG:26719', '+proj=utm +zone=19 +ellps=clrk66 +towgs84=-9,152,178,0,0,0,0 +units=m +no_defs');

// Fix Leaflet's default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ==========================================
// 2. Inicialización del Mapa y Capas Base
// ==========================================
// Centrado por defecto en República Dominicana (UTM Zona 19N)
const map = L.map('map', {
  center: [18.7357, -70.1627],
  zoom: 8,
});

// Capas Base
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; Esri, Maxar, Earthstar Geographics',
  maxZoom: 19,
});

const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenTopoMap contributors',
  maxZoom: 17,
});

// Capas de superposición
const createdPointsLayer = L.featureGroup().addTo(map);
const kmlLayersGroup = L.featureGroup().addTo(map);

// Control de Capas
L.control.layers(
  {
    '🗺️ Calles (OpenStreetMap)': osmLayer,
    '🛰️ Satélite (Esri World)': satelliteLayer,
    '⛰️ Topográfico (OpenTopo)': topoLayer,
  },
  {
    '📌 Puntos Creados': createdPointsLayer,
    '📁 Capas KML': kmlLayersGroup,
  },
  { position: 'topright' }
).addTo(map);

// ==========================================
// 3. Estado de la Aplicación
// ==========================================
const STORAGE_KEY = 'geovisor_pro_points_v1';
let createdPoints = loadSavedPoints();
let selectedColor = '#3b82f6';
let isMapPickMode = false;
let userMarker = null;

// ==========================================
// 4. Elementos del DOM
// ==========================================
// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const pointsCountBadge = document.getElementById('points-count-badge');
const gotoCreatePointBtn = document.getElementById('goto-create-point-btn');

// Formulario de Puntos
const pointForm = document.getElementById('create-point-form');
const coordSystemSelect = document.getElementById('coord-system-select');
const systemBadge = document.getElementById('system-badge');
const coordLabel1 = document.getElementById('coord-label-1');
const coordLabel2 = document.getElementById('coord-label-2');
const coordInput1 = document.getElementById('coord-input-1');
const coordInput2 = document.getElementById('coord-input-2');
const pointNameInput = document.getElementById('point-name');
const pointDescInput = document.getElementById('point-desc');
const colorButtons = document.querySelectorAll('.color-btn');
const pointFormError = document.getElementById('point-form-error');

// Conversión en Vivo
const convGeoVal = document.getElementById('conv-geo-val');
const convWgsVal = document.getElementById('conv-wgs-val');
const convNadVal = document.getElementById('conv-nad-val');

// Captura en Mapa
const mapPickBtn = document.getElementById('map-pick-btn');
const mapClickBanner = document.getElementById('map-click-banner');
const cancelPickBtn = document.getElementById('cancel-pick-btn');

// Lista de Puntos & Acciones
const pointsContainer = document.getElementById('points-container');
const exportKmlBtn = document.getElementById('export-kml-btn');
const exportGeojsonBtn = document.getElementById('export-geojson-btn');
const clearPointsBtn = document.getElementById('clear-points-btn');
const zoomPointsBtn = document.getElementById('zoom-points-btn');
const locateBtn = document.getElementById('locate-btn');

// Barra de Coordenadas del Cursor
const cursorGeoDisplay = document.getElementById('cursor-geo-display');
const cursorUtmDisplay = document.getElementById('cursor-utm-display');
const cursorNadDisplay = document.getElementById('cursor-nad-display');

// KML Elements
const uploadInput = document.getElementById('kml-upload');
const fileNameDisplay = document.getElementById('file-name');
const kmlDetailsContainer = document.getElementById('kml-details');

// ==========================================
// 5. Lógica de Transformación de Coordenadas
// ==========================================
/**
 * Convierte cualquier coordenada en un objeto con los 3 sistemas:
 * - WGS84 Geográfico (Lat / Lon)
 * - WGS84 UTM Zona 19N (X / Y)
 * - NAD27 UTM Zona 19N (X / Y)
 */
function calculateCoordinates(system, val1, val2) {
  let lng, lat;

  if (system === 'WGS84_GEO') {
    lat = Number(val1);
    lng = Number(val2);
  } else if (system === 'WGS84_UTM19N') {
    const x = Number(val1);
    const y = Number(val2);
    const [convertedLng, convertedLat] = proj4('EPSG:32619', 'EPSG:4326', [x, y]);
    lng = convertedLng;
    lat = convertedLat;
  } else if (system === 'NAD27_UTM19N') {
    const x = Number(val1);
    const y = Number(val2);
    const [convertedLng, convertedLat] = proj4('EPSG:26719', 'EPSG:4326', [x, y]);
    lng = convertedLng;
    lat = convertedLat;
  }

  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    return null;
  }

  // Validación de límites geográficos razonables
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  // Calcular valores en los 3 sistemas
  const [wgsX, wgsY] = proj4('EPSG:4326', 'EPSG:32619', [lng, lat]);
  const [nadX, nadY] = proj4('EPSG:4326', 'EPSG:26719', [lng, lat]);

  return {
    lat,
    lng,
    wgsUtm: { x: wgsX, y: wgsY },
    nadUtm: { x: nadX, y: nadY },
  };
}

// ==========================================
// 6. Configuración Dinámica de Inputs según Sistema
// ==========================================
function updateFormSystemUI() {
  const system = coordSystemSelect.value;

  if (system === 'WGS84_GEO') {
    systemBadge.textContent = 'EPSG:4326';
    coordLabel1.innerHTML = `<span class="axis-badge">Lat</span><span>Latitud [°]</span>`;
    coordLabel2.innerHTML = `<span class="axis-badge">Lon</span><span>Longitud [°]</span>`;
    coordInput1.placeholder = 'Ej: 18.486100';
    coordInput2.placeholder = 'Ej: -69.931200';
  } else if (system === 'WGS84_UTM19N') {
    systemBadge.textContent = 'EPSG:32619';
    coordLabel1.innerHTML = `<span class="axis-badge">X</span><span>Este (X) [m]</span>`;
    coordLabel2.innerHTML = `<span class="axis-badge">Y</span><span>Norte (Y) [m]</span>`;
    coordInput1.placeholder = 'Ej: 401690.88';
    coordInput2.placeholder = 'Ej: 2044220.44';
  } else if (system === 'NAD27_UTM19N') {
    systemBadge.textContent = 'EPSG:26719';
    coordLabel1.innerHTML = `<span class="axis-badge">X</span><span>Este (X) [m]</span>`;
    coordLabel2.innerHTML = `<span class="axis-badge">Y</span><span>Norte (Y) [m]</span>`;
    coordInput1.placeholder = 'Ej: 401645.37';
    coordInput2.placeholder = 'Ej: 2044025.47';
  }

  updateLiveConversion();
}

function updateLiveConversion() {
  const system = coordSystemSelect.value;
  const raw1 = coordInput1.value.trim().replace(',', '.');
  const raw2 = coordInput2.value.trim().replace(',', '.');

  if (!raw1 || !raw2) {
    convGeoVal.textContent = '—';
    convWgsVal.textContent = '—';
    convNadVal.textContent = '—';
    pointFormError.style.display = 'none';
    return;
  }

  const coords = calculateCoordinates(system, raw1, raw2);

  if (coords) {
    pointFormError.style.display = 'none';
    convGeoVal.textContent = `${coords.lat.toFixed(6)}°, ${coords.lng.toFixed(6)}°`;
    convWgsVal.textContent = `X: ${coords.wgsUtm.x.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m | Y: ${coords.wgsUtm.y.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
    convNadVal.textContent = `X: ${coords.nadUtm.x.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m | Y: ${coords.nadUtm.y.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
  } else {
    convGeoVal.textContent = 'Coordenadas no válidas';
    convWgsVal.textContent = '—';
    convNadVal.textContent = '—';
  }
}

coordSystemSelect.addEventListener('change', updateFormSystemUI);
coordInput1.addEventListener('input', updateLiveConversion);
coordInput2.addEventListener('input', updateLiveConversion);

// Selector de Color
colorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    colorButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedColor = btn.dataset.color;
  });
});

// ==========================================
// 7. Marcadores Personalizados y Popups
// ==========================================
function createCustomMarkerIcon(color = '#3b82f6') {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div class="pin-marker" style="--pin-color: ${color}">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="${color}">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

function buildPopupHTML(point) {
  const latStr = `${point.lat.toFixed(6)}°`;
  const lngStr = `${point.lng.toFixed(6)}°`;
  const wgsX = point.wgsUtm.x.toFixed(2);
  const wgsY = point.wgsUtm.y.toFixed(2);
  const nadX = point.nadUtm.x.toFixed(2);
  const nadY = point.nadUtm.y.toFixed(2);

  return `
    <div class="popup-container">
      <div class="popup-header">
        <span class="popup-badge" style="--p-color: ${point.color}"></span>
        <strong class="popup-title">${point.name}</strong>
      </div>
      ${point.description ? `<div class="popup-desc">${escapeHTML(point.description)}</div>` : ''}
      <div class="popup-table">
        <div class="popup-row">
          <span class="popup-row-lbl">🌐 Geográfico (WGS84):</span>
          <span class="popup-row-val">${latStr}, ${lngStr}</span>
        </div>
        <div class="popup-row">
          <span class="popup-row-lbl">🗺️ WGS84 UTM 19N:</span>
          <span class="popup-row-val">X: ${wgsX} m | Y: ${wgsY} m</span>
        </div>
        <div class="popup-row">
          <span class="popup-row-lbl">📐 NAD27 UTM 19N:</span>
          <span class="popup-row-val">X: ${nadX} m | Y: ${nadY} m</span>
        </div>
      </div>
      <div class="popup-actions">
        <button class="popup-btn" onclick="window.__geovisorCopyPointCoords('${point.id}')">
          📋 Copiar
        </button>
        <button class="popup-btn popup-btn-delete" onclick="window.__geovisorDeletePoint('${point.id}')">
          🗑️ Eliminar
        </button>
      </div>
    </div>
  `;
}

// ==========================================
// 8. Crear y Gestionar Puntos
// ==========================================
pointForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleCreatePoint();
});

document.getElementById('add-point-btn').addEventListener('click', handleCreatePoint);

function handleCreatePoint() {
  const system = coordSystemSelect.value;
  const raw1 = coordInput1.value.trim().replace(',', '.');
  const raw2 = coordInput2.value.trim().replace(',', '.');

  if (!raw1 || !raw2) {
    showFormError('Por favor ingresa ambas coordenadas.');
    return;
  }

  const coords = calculateCoordinates(system, raw1, raw2);
  if (!coords) {
    showFormError('Las coordenadas ingresadas no son válidas para el sistema seleccionado.');
    return;
  }

  pointFormError.style.display = 'none';

  const defaultName = `Punto ${createdPoints.length + 1}`;
  const pointName = pointNameInput.value.trim() || defaultName;
  const pointDesc = pointDescInput.value.trim();

  const newPoint = {
    id: 'pt_' + Date.now(),
    name: pointName,
    description: pointDesc,
    color: selectedColor,
    systemCreated: system,
    lat: coords.lat,
    lng: coords.lng,
    wgsUtm: coords.wgsUtm,
    nadUtm: coords.nadUtm,
    createdAt: new Date().toISOString(),
  };

  addPointToMap(newPoint);
  createdPoints.push(newPoint);
  savePoints(createdPoints);
  renderPointsList();

  // Limpiar formulario y centrar en el nuevo punto
  pointNameInput.value = '';
  pointDescInput.value = '';
  map.setView([newPoint.lat, newPoint.lng], 16, { animate: true });

  // Abrir el popup del punto recién creado
  if (newPoint._marker) {
    newPoint._marker.openPopup();
  }

  showToast(`¡Punto "${pointName}" creado exitosamente!`);
}

function addPointToMap(point) {
  const icon = createCustomMarkerIcon(point.color);
  const marker = L.marker([point.lat, point.lng], { icon });

  marker.bindPopup(buildPopupHTML(point), { className: 'custom-popup' });
  createdPointsLayer.addLayer(marker);
  point._marker = marker;
}

function showFormError(msg) {
  pointFormError.textContent = msg;
  pointFormError.style.display = 'block';
}

// ==========================================
// 9. Modo Captura de Clic en el Mapa
// ==========================================
mapPickBtn.addEventListener('click', toggleMapPickMode);
cancelPickBtn.addEventListener('click', deactivateMapPickMode);

function toggleMapPickMode() {
  if (isMapPickMode) {
    deactivateMapPickMode();
  } else {
    activateMapPickMode();
  }
}

function activateMapPickMode() {
  isMapPickMode = true;
  mapPickBtn.classList.add('active');
  mapPickBtn.querySelector('span').textContent = 'Modo clic activo...';
  mapClickBanner.style.display = 'block';
  map.getContainer().style.cursor = 'crosshair';
}

function deactivateMapPickMode() {
  isMapPickMode = false;
  mapPickBtn.classList.remove('active');
  mapPickBtn.querySelector('span').textContent = 'Capturar clic en el mapa';
  mapClickBanner.style.display = 'none';
  map.getContainer().style.cursor = '';
}

map.on('click', (e) => {
  if (!isMapPickMode) return;

  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  const system = coordSystemSelect.value;

  if (system === 'WGS84_GEO') {
    coordInput1.value = lat.toFixed(6);
    coordInput2.value = lng.toFixed(6);
  } else if (system === 'WGS84_UTM19N') {
    const [x, y] = proj4('EPSG:4326', 'EPSG:32619', [lng, lat]);
    coordInput1.value = x.toFixed(2);
    coordInput2.value = y.toFixed(2);
  } else if (system === 'NAD27_UTM19N') {
    const [x, y] = proj4('EPSG:4326', 'EPSG:26719', [lng, lat]);
    coordInput1.value = x.toFixed(2);
    coordInput2.value = y.toFixed(2);
  }

  // Asignar nombre sugerido si está vacío
  if (!pointNameInput.value) {
    pointNameInput.value = `Punto ${createdPoints.length + 1}`;
  }

  updateLiveConversion();
  deactivateMapPickMode();
  switchTab('tab-points');
  showToast('Coordenadas capturadas del mapa.');
});

// ==========================================
// 10. Coordenadas en Vivo en Barra Inferior del Mapa
// ==========================================
map.on('mousemove', (e) => {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  cursorGeoDisplay.textContent = `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;

  try {
    const [wgsX, wgsY] = proj4('EPSG:4326', 'EPSG:32619', [lng, lat]);
    const [nadX, nadY] = proj4('EPSG:4326', 'EPSG:26719', [lng, lat]);

    cursorUtmDisplay.textContent = `X: ${Math.round(wgsX)} m | Y: ${Math.round(wgsY)} m`;
    cursorNadDisplay.textContent = `X: ${Math.round(nadX)} m | Y: ${Math.round(nadY)} m`;
  } catch (err) {
    cursorUtmDisplay.textContent = '—';
    cursorNadDisplay.textContent = '—';
  }
});

// ==========================================
// 11. Renderizado de la Lista de Puntos Creados
// ==========================================
function renderPointsList() {
  pointsCountBadge.textContent = createdPoints.length;

  if (createdPoints.length === 0) {
    zoomPointsBtn.style.display = 'none';
    pointsContainer.innerHTML = `
      <div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 0.75rem auto; opacity: 0.5; display: block;"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        <p>Aún no has creado ningún punto.</p>
        <button type="button" class="btn-link" id="goto-create-point-btn">Crear mi primer punto</button>
      </div>
    `;
    const btn = document.getElementById('goto-create-point-btn');
    if (btn) btn.addEventListener('click', () => switchTab('tab-points'));
    return;
  }

  zoomPointsBtn.style.display = 'flex';

  let html = '';
  createdPoints.forEach((p) => {
    html += `
      <div class="point-card" id="card-${p.id}">
        <div class="point-card-header">
          <div class="point-title-group">
            <span class="point-marker-indicator" style="--pt-color: ${p.color}"></span>
            <span class="point-card-title">${escapeHTML(p.name)}</span>
          </div>
          <div class="point-card-actions">
            <button class="btn-icon" title="Centrar en el mapa" onclick="window.__geovisorZoomPoint('${p.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
            </button>
            <button class="btn-icon" title="Copiar coordenadas" onclick="window.__geovisorCopyPointCoords('${p.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn-icon btn-delete" title="Eliminar punto" onclick="window.__geovisorDeletePoint('${p.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        ${p.description ? `<div class="point-card-desc">${escapeHTML(p.description)}</div>` : ''}
        <div class="point-card-coords">
          <div class="coord-row">
            <span class="coord-row-lbl">WGS84 UTM 19N:</span>
            <span class="coord-row-val">${p.wgsUtm.x.toFixed(2)}, ${p.wgsUtm.y.toFixed(2)}</span>
          </div>
          <div class="coord-row">
            <span class="coord-row-lbl">NAD27 UTM 19N:</span>
            <span class="coord-row-val">${p.nadUtm.x.toFixed(2)}, ${p.nadUtm.y.toFixed(2)}</span>
          </div>
          <div class="coord-row">
            <span class="coord-row-lbl">Lat / Lon:</span>
            <span class="coord-row-val">${p.lat.toFixed(6)}°, ${p.lng.toFixed(6)}°</span>
          </div>
        </div>
      </div>
    `;
  });

  pointsContainer.innerHTML = html;
}

// Global window actions for inline popups and cards
window.__geovisorZoomPoint = (id) => {
  const pt = createdPoints.find((p) => p.id === id);
  if (!pt) return;
  map.setView([pt.lat, pt.lng], 16, { animate: true });
  if (pt._marker) pt._marker.openPopup();
};

window.__geovisorCopyPointCoords = (id) => {
  const pt = createdPoints.find((p) => p.id === id);
  if (!pt) return;
  const text = `Punto: ${pt.name}
Lat/Lon: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}
WGS84 UTM 19N: X=${pt.wgsUtm.x.toFixed(2)}, Y=${pt.wgsUtm.y.toFixed(2)}
NAD27 UTM 19N: X=${pt.nadUtm.x.toFixed(2)}, Y=${pt.nadUtm.y.toFixed(2)}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Coordenadas copiadas al portapapeles');
  });
};

window.__geovisorDeletePoint = (id) => {
  const index = createdPoints.findIndex((p) => p.id === id);
  if (index === -1) return;
  const [removed] = createdPoints.splice(index, 1);
  if (removed._marker) {
    createdPointsLayer.removeLayer(removed._marker);
  }
  savePoints(createdPoints);
  renderPointsList();
  showToast(`Punto eliminado`);
};

// Zoom to all created points
zoomPointsBtn.addEventListener('click', () => {
  if (createdPoints.length > 0) {
    const bounds = createdPointsLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }
});

// Limpiar todos los puntos
clearPointsBtn.addEventListener('click', () => {
  if (createdPoints.length === 0) return;
  if (confirm('¿Estás seguro de que deseas eliminar todos los puntos creados?')) {
    createdPointsLayer.clearLayers();
    createdPoints = [];
    savePoints(createdPoints);
    renderPointsList();
    showToast('Todos los puntos han sido eliminados');
  }
});

// ==========================================
// 12. Exportar a KML y GeoJSON
// ==========================================
exportKmlBtn.addEventListener('click', () => {
  if (createdPoints.length === 0) {
    alert('No hay puntos creados para exportar.');
    return;
  }

  let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Puntos Creados - GeoVisor Pro</name>
    <description>Generado con GeoVisor Pro (NAD27 &amp; WGS84 UTM 19N)</description>
`;

  createdPoints.forEach((p) => {
    const desc = `<![CDATA[
      <b>${escapeHTML(p.name)}</b><br/>
      ${p.description ? escapeHTML(p.description) + '<br/>' : ''}
      <hr/>
      <b>Lat/Lon:</b> ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}<br/>
      <b>WGS84 UTM 19N:</b> X=${p.wgsUtm.x.toFixed(2)}, Y=${p.wgsUtm.y.toFixed(2)}<br/>
      <b>NAD27 UTM 19N:</b> X=${p.nadUtm.x.toFixed(2)}, Y=${p.nadUtm.y.toFixed(2)}<br/>
    ]]>`;

    kmlContent += `    <Placemark>
      <name>${escapeHTML(p.name)}</name>
      <description>${desc}</description>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>
`;
  });

  kmlContent += `  </Document>
</kml>`;

  downloadFile(kmlContent, `puntos_geovisor_${Date.now()}.kml`, 'application/vnd.google-earth.kml+xml');
  showToast('Archivo KML descargado.');
});

exportGeojsonBtn.addEventListener('click', () => {
  if (createdPoints.length === 0) {
    alert('No hay puntos creados para exportar.');
    return;
  }

  const featureCollection = {
    type: 'FeatureCollection',
    name: 'Puntos Creados - GeoVisor Pro',
    features: createdPoints.map((p) => ({
      type: 'Feature',
      properties: {
        name: p.name,
        description: p.description,
        color: p.color,
        wgs84_utm_x: p.wgsUtm.x,
        wgs84_utm_y: p.wgsUtm.y,
        nad27_utm_x: p.nadUtm.x,
        nad27_utm_y: p.nadUtm.y,
        lat: p.lat,
        lng: p.lng,
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
    })),
  };

  downloadFile(JSON.stringify(featureCollection, null, 2), `puntos_geovisor_${Date.now()}.geojson`, 'application/json');
  showToast('Archivo GeoJSON descargado.');
});

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// 13. Persistencia (Local Storage)
// ==========================================
function savePoints(points) {
  try {
    const cleanPoints = points.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      systemCreated: p.systemCreated,
      lat: p.lat,
      lng: p.lng,
      wgsUtm: p.wgsUtm,
      nadUtm: p.nadUtm,
      createdAt: p.createdAt,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanPoints));
  } catch (err) {
    console.error('Error guardando puntos en localStorage:', err);
  }
}

function loadSavedPoints() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Error cargando puntos desde localStorage:', err);
    return [];
  }
}

// Re-crear marcadores en el mapa al inicio
createdPoints.forEach((p) => addPointToMap(p));
renderPointsList();

// ==========================================
// 14. Navegación entre Pestañas (Tabs)
// ==========================================
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    switchTab(targetTab);
  });
});

function switchTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
    btn.setAttribute('aria-selected', btn.dataset.tab === tabId);
  });
  tabContents.forEach((c) => {
    c.classList.toggle('active', c.id === tabId);
  });
}

// ==========================================
// 15. Carga de KML/KMZ (Archivos locales y Subida)
// ==========================================
async function loadLocalMaps() {
  const mapFiles = import.meta.glob('/public/mapas/*.{kml,kmz}', { query: '?url', import: 'default', eager: true });

  for (const path in mapFiles) {
    const url = mapFiles[path];
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      if (path.toLowerCase().endsWith('.kmz')) {
        const blob = await response.blob();
        await processKMZ(blob);
      } else {
        const text = await response.text();
        parseAndDisplayKML(text);
      }
    } catch (err) {
      console.error(`Error autoloading ${path}:`, err);
    }
  }
}

async function processKMZ(fileOrBlob) {
  try {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(fileOrBlob);

    let kmlFile = null;
    for (const relativePath in zipContent.files) {
      if (relativePath.toLowerCase().endsWith('.kml')) {
        kmlFile = zipContent.files[relativePath];
        break;
      }
    }

    if (!kmlFile) {
      throw new Error('No se encontró ningún archivo .kml dentro del KMZ');
    }

    const kmlText = await kmlFile.async('text');
    parseAndDisplayKML(kmlText);
  } catch (error) {
    console.error('Error al procesar KMZ:', error);
    if (kmlDetailsContainer) {
      kmlDetailsContainer.innerHTML = `<p class="empty-state" style="color: #ef4444;">Error al extraer el archivo KMZ.</p>`;
    }
  }
}

loadLocalMaps();

uploadInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (fileNameDisplay) {
    fileNameDisplay.textContent = file.name;
  }

  if (file.name.toLowerCase().endsWith('.kmz')) {
    await processKMZ(file);
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      const kmlText = e.target.result;
      parseAndDisplayKML(kmlText);
    };
    reader.readAsText(file);
  }
});

function parseAndDisplayKML(kmlText) {
  try {
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, 'text/xml');

    const parseError = kmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Error de parsing XML');
    }

    const geoJson = kml(kmlDoc);

    const newLayer = L.geoJSON(geoJson, {
      style: function (feature) {
        return {
          color: feature.properties.stroke || '#f59e0b',
          weight: 4,
          opacity: 0.9,
          fillOpacity: 0.15,
        };
      },
      onEachFeature: function (feature, layer) {
        let popupContent = '';
        const props = feature.properties;

        if (props.name) {
          popupContent += `<strong>${escapeHTML(props.name)}</strong><br/>`;
        }
        if (props.description) {
          popupContent += `${props.description}`;
        }

        if (popupContent) {
          layer.bindPopup(popupContent);
        }
      },
    }).addTo(kmlLayersGroup);

    if (newLayer.getBounds().isValid()) {
      map.fitBounds(newLayer.getBounds(), { padding: [50, 50] });
    }

    updateInfoPanel(geoJson.features);
    showToast('KML cargado en el mapa');
  } catch (error) {
    console.error('Error parseando KML:', error);
    kmlDetailsContainer.innerHTML = `<p class="empty-state" style="color: #ef4444;">Error al procesar el archivo KML. Verifica que el formato sea válido.</p>`;
  }
}

function updateInfoPanel(features) {
  if (!features || features.length === 0) {
    kmlDetailsContainer.innerHTML = '<p class="empty-state">No se encontraron elementos en el KML.</p>';
    return;
  }

  let html = '';
  features.forEach((feature, index) => {
    const name = feature.properties.name || `Elemento ${index + 1}`;
    const type = feature.geometry.type;

    html += `
      <div class="feature-item">
        <div class="feature-name">${escapeHTML(name)}</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">${type}</div>
      </div>
    `;
  });

  kmlDetailsContainer.innerHTML = html;
}

// ==========================================
// 16. Ubicación del Usuario (GPS)
// ==========================================
locateBtn.addEventListener('click', () => {
  locateBtn.classList.add('active');
  map.locate({ setView: true, maxZoom: 16 });
});

map.on('locationfound', (e) => {
  locateBtn.classList.remove('active');

  if (userMarker) {
    map.removeLayer(userMarker);
  }

  userMarker = L.marker(e.latlng).addTo(map).bindPopup('¡Estás aquí!').openPopup();

  L.circle(e.latlng, e.accuracy / 2, {
    weight: 2,
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.2,
  }).addTo(map);

  showToast('Ubicación detectada');
});

map.on('locationerror', () => {
  locateBtn.classList.remove('active');
  alert('No se pudo obtener tu ubicación. Verifica los permisos de geolocalización de tu navegador.');
});

// ==========================================
// 17. Utilidades de Notificación y Escape
// ==========================================
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  const existing = document.querySelector('.toast-notice');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notice';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}

// Iniciar formulario con el estado correcto
updateFormSystemUI();
