import './style.css'
import L from 'leaflet'
import { kml } from '@tmcw/togeojson'

import JSZip from 'jszip';

// Fix Leaflet's default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Initialize Map
const map = L.map('map').setView([0, 0], 2);

// Add OpenStreetMap base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

let currentGeoJsonLayer = null;

// DOM Elements
const uploadInput = document.getElementById('kml-upload');
const fileNameDisplay = document.getElementById('file-name');
const kmlDetailsContainer = document.getElementById('kml-details');

// Autoload maps from public/mapas/
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

// Extract KMZ processing to a function to reuse it
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
      throw new Error("No se encontró ningún archivo .kml dentro del KMZ");
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

// Call the autoload function
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
    // Normal KML
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
    
    // Check for parse errors
    const parseError = kmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Error de parsing XML');
    }

    const geoJson = kml(kmlDoc);

    // Removed the currentGeoJsonLayer overwrite logic so multiple files can be added
    const newLayer = L.geoJSON(geoJson, {
      style: function (feature) {
        return {
          color: feature.properties.stroke || '#f59e0b', // A nice thick orange by default
          weight: 6, // Thick lines
          opacity: 1,
          fillOpacity: 0 // Sin relleno
        };
      },
      onEachFeature: function (feature, layer) {
        let popupContent = '';
        const props = feature.properties;
        
        if (props.name) {
          popupContent += `<strong>${props.name}</strong><br/>`;
        }
        if (props.description) {
          popupContent += `${props.description}`;
        }
        
        if (popupContent) {
          layer.bindPopup(popupContent);
        }
      }
    }).addTo(map);

    // Zoom to fit the loaded KML
    if (newLayer.getBounds().isValid()) {
      map.fitBounds(newLayer.getBounds(), { padding: [50, 50] });
    }

    updateInfoPanel(geoJson.features);

  } catch (error) {
    console.error('Error parseando KML:', error);
    kmlDetailsContainer.innerHTML = `<p class="empty-state" style="color: #ef4444;">Error al procesar el archivo KML. Asegúrate de que tenga un formato válido.</p>`;
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
        <div class="feature-name">${name}</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">${type}</div>
      </div>
    `;
  });

  kmlDetailsContainer.innerHTML = html;
}

// Locate Me Logic
const locateBtn = document.getElementById('locate-btn');
let userMarker = null;

locateBtn.addEventListener('click', () => {
  locateBtn.classList.add('active');
  map.locate({setView: true, maxZoom: 16});
});

map.on('locationfound', (e) => {
  locateBtn.classList.remove('active');
  
  if (userMarker) {
    map.removeLayer(userMarker);
  }

  // Draw user location
  userMarker = L.marker(e.latlng).addTo(map)
    .bindPopup('¡Estás aquí!')
    .openPopup();
    
  L.circle(e.latlng, e.accuracy / 2, {
    weight: 2,
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.2
  }).addTo(map);
});

map.on('locationerror', (e) => {
  locateBtn.classList.remove('active');
  alert("No se pudo obtener tu ubicación. Asegúrate de haber dado los permisos.");
});
