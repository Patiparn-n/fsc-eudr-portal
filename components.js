import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';

const html = htm.bind(h);

// Common plantation species in Thailand for FSC/EUDR context
const SPECIES_LIST = [
    'Eucalyptus camaldulensis',
    'Eucalyptus urophylla',
    'Eucalyptus hybrid (Clone)',
    'Tectona grandis (สักทอง)',
    'Acacia mangium (กระถินณรงค์)',
    'Acacia auriculiformis (กระถินออสเตรเลีย)',
    'Pinus kesiya (สนสามใบ)',
    'Hevea brasiliensis (ยางพารา)',
    'Casuarina junghuhniana (สนประดิพัทธ์)',
    'Dalbergia cochinchinensis (พะยูง)',
    'Dipterocarpus alatus (ยางนา)',
    'Shorea roxburghii (พลวง)',
];

// CSV export utility with Thai BOM for Excel compatibility
function exportToCsv(filename, headers, rows) {
    const bom = '﻿';
    const csvContent = [
        headers.join(','),
        ...rows.map(row =>
            row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        )
    ].join('\r\n');
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Helper component to render Lucide Icons dynamically
export function Icon({ name, className = "" }) {
    useEffect(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, [name]);
    return html`<i data-lucide=${name} class=${className} style="vertical-align: middle; display: inline-block;"></i>`;
}

// -------------------------------------------------------------
// Interactive Map Component using Leaflet (window.L)
// -------------------------------------------------------------
export function InteractiveMap({ mode = "view", type = "point", coordinates, onChange, allPlantations = [], selectedId = null }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerInstance = useRef(null);
    const polygonInstance = useRef(null);
    const otherLayersRef = useRef({});
    
    // Satellite and Dark Mode tile switcher state
    const [mapType, setMapType] = useState('dark'); // 'dark' | 'satellite'
    const tileLayerRef = useRef(null);

    useEffect(() => {
        // Initialize Map
        if (!mapInstance.current && mapRef.current) {
            // Default center: Central Thailand (near Nakhon Sawan / Bangkok grid)
            mapInstance.current = window.L.map(mapRef.current).setView([14.5, 100.5], 6);
            
            // Adjust Leaflet zoom controls styling slightly
            mapInstance.current.zoomControl.setPosition('topright');
        }

        const map = mapInstance.current;
        if (!map) return;

        // Manage Tile Layers
        if (tileLayerRef.current) {
            map.removeLayer(tileLayerRef.current);
        }

        if (mapType === 'dark') {
            tileLayerRef.current = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(map);
        } else {
            // Esri World Imagery (No API key needed)
            tileLayerRef.current = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                maxZoom: 19
            }).addTo(map);
        }

        // Clean up previous drawing layers for CURRENT edit plantation
        if (markerInstance.current) {
            map.removeLayer(markerInstance.current);
            markerInstance.current = null;
        }
        if (polygonInstance.current) {
            map.removeLayer(polygonInstance.current);
            polygonInstance.current = null;
        }

        // Clean up OTHER plantations layers
        Object.keys(otherLayersRef.current).forEach(id => {
            map.removeLayer(otherLayersRef.current[id]);
        });
        otherLayersRef.current = {};

        // 1. Plot OTHER plantations if in dashboard/view mode
        if (allPlantations.length > 0) {
            const bounds = [];
            allPlantations.forEach(p => {
                const isSelected = p.id === selectedId;
                const color = p.eudrCompliant 
                    ? (p.fscStatus === 'FSC 100%' ? '#10b981' : '#f59e0b') 
                    : '#ef4444'; // Red for non-compliant
                
                if (p.geoType === 'point' && p.coords && p.coords.lat) {
                    const latlng = [parseFloat(p.coords.lat), parseFloat(p.coords.lng)];
                    if (!isNaN(latlng[0]) && !isNaN(latlng[1])) {
                        const marker = window.L.circleMarker(latlng, {
                            radius: isSelected ? 10 : 7,
                            fillColor: color,
                            color: isSelected ? '#ffffff' : color,
                            weight: isSelected ? 3 : 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).addTo(map);

                        const popupHtml = `
                            <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; width: 180px;">
                                <h4 style="margin: 0 0 5px 0; font-size:14px; font-weight:bold;">${p.name}</h4>
                                <b>เจ้าของ:</b> ${p.owner}<br/>
                                <b>พื้นที่:</b> ${p.areaRai} ไร่ (${p.areaHectares} ฮก.)<br/>
                                <b>FSC:</b> ${p.fscStatus}<br/>
                                <b>EUDR:</b> <span style="color: ${p.eudrCompliant ? '#047857' : '#b91c1c'}; font-weight:bold;">${p.eudrCompliant ? 'ผ่าน' : 'ไม่ผ่าน'}</span>
                            </div>
                        `;
                        marker.bindPopup(popupHtml);
                        otherLayersRef.current[p.id] = marker;
                        bounds.push(latlng);
                    }
                } else if (p.geoType === 'polygon' && Array.isArray(p.coords) && p.coords.length > 2) {
                    const latlngs = p.coords.map(c => [parseFloat(c.lat), parseFloat(c.lng)]).filter(pt => !isNaN(pt[0]) && !isNaN(pt[1]));
                    if (latlngs.length > 2) {
                        const poly = window.L.polygon(latlngs, {
                            color: color,
                            fillColor: color,
                            fillOpacity: isSelected ? 0.5 : 0.3,
                            weight: isSelected ? 4 : 2
                        }).addTo(map);

                        const popupHtml = `
                            <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; width: 180px;">
                                <h4 style="margin: 0 0 5px 0; font-size:14px; font-weight:bold;">${p.name}</h4>
                                <b>เจ้าของ:</b> ${p.owner}<br/>
                                <b>พื้นที่:</b> ${p.areaRai} ไร่ (${p.areaHectares} ฮก.)<br/>
                                <b>FSC:</b> ${p.fscStatus}<br/>
                                <b>EUDR:</b> <span style="color: ${p.eudrCompliant ? '#047857' : '#b91c1c'}; font-weight:bold;">${p.eudrCompliant ? 'ผ่าน' : 'ไม่ผ่าน'}</span>
                            </div>
                        `;
                        poly.bindPopup(popupHtml);
                        otherLayersRef.current[p.id] = poly;
                        latlngs.forEach(pt => bounds.push(pt));
                    }
                }
            });

            // Zoom map to fit all points/polygons if bounds exist
            if (bounds.length > 0 && mode === 'view' && !selectedId) {
                map.fitBounds(bounds, { padding: [50, 50] });
            } else if (selectedId && otherLayersRef.current[selectedId]) {
                const targetLayer = otherLayersRef.current[selectedId];
                if (targetLayer.getBounds) {
                    map.fitBounds(targetLayer.getBounds(), { padding: [40, 40] });
                } else if (targetLayer.getLatLng) {
                    map.setView(targetLayer.getLatLng(), 13);
                }
            }
        }

        // 2. Edit mode mapping actions
        if (mode === 'edit') {
            // Function to handle clicks in edit mode
            const onMapClick = (e) => {
                const { lat, lng } = e.latlng;
                const formattedLat = parseFloat(lat.toFixed(6));
                const formattedLng = parseFloat(lng.toFixed(6));

                if (type === 'point') {
                    onChange({ lat: formattedLat, lng: formattedLng });
                } else if (type === 'polygon') {
                    const currentCoords = Array.isArray(coordinates) ? [...coordinates] : [];
                    onChange([...currentCoords, { lat: formattedLat, lng: formattedLng }]);
                }
            };

            map.on('click', onMapClick);

            // Draw current editing markers/polygons
            if (type === 'point' && coordinates && coordinates.lat) {
                const pos = [coordinates.lat, coordinates.lng];
                markerInstance.current = window.L.marker(pos, {
                    draggable: true
                }).addTo(map);

                markerInstance.current.on('dragend', (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    onChange({
                        lat: parseFloat(position.lat.toFixed(6)),
                        lng: parseFloat(position.lng.toFixed(6))
                    });
                });

                map.setView(pos, 14);
            } else if (type === 'polygon' && Array.isArray(coordinates) && coordinates.length > 0) {
                const latlngs = coordinates.map(c => [c.lat, c.lng]);
                
                // Draw vertices
                const markers = latlngs.map((pos, index) => {
                    const m = window.L.circleMarker(pos, {
                        radius: 5,
                        fillColor: '#3b82f6',
                        color: '#ffffff',
                        weight: 1,
                        fillOpacity: 1
                    }).addTo(map);
                    
                    m.dragging = true; // custom flag
                    return m;
                });

                markerInstance.current = window.L.featureGroup(markers).addTo(map);

                if (latlngs.length > 1) {
                    polygonInstance.current = window.L.polygon(latlngs, {
                        color: '#3b82f6',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.2
                    }).addTo(map);
                }

                // If adding first node, set map center
                if (coordinates.length === 1) {
                    map.setView(latlngs[0], 14);
                }
            }

            return () => {
                map.off('click', onMapClick);
            };
        }
    }, [mode, type, coordinates, allPlantations, selectedId, mapType]);

    // Handle clearing coordinates in edit mode
    const clearCoordinates = () => {
        if (type === 'point') {
            onChange(null);
        } else {
            onChange([]);
        }
    };

    // Undo last polygon point
    const undoLastPoint = () => {
        if (type === 'polygon' && Array.isArray(coordinates) && coordinates.length > 0) {
            onChange(coordinates.slice(0, -1));
        }
    };

    return html`
        <div style="position: relative; width: 100%;">
            <!-- Apply dark-theme filter class only when mapType is 'dark' -->
            <div ref=${mapRef} class=${"map-container " + (mapType === 'dark' ? 'dark-theme' : '')}></div>
            
            <!-- Map Layer Switcher Button Overlay -->
            <div style="position: absolute; top: 12px; left: 12px; z-index: 1000;">
                <button type="button" class="btn btn-outline" style="background-color: var(--bg-card); padding: 6px 12px; font-size: 0.75rem; border-color: var(--border-color); display: flex; align-items: center; gap: 6px;" onClick=${() => setMapType(mapType === 'dark' ? 'satellite' : 'dark')}>
                    <${Icon} name=${mapType === 'dark' ? 'image' : 'map'} className="icon-sm" />
                    ${mapType === 'dark' ? 'ภาพดาวเทียม' : 'แผนที่ปกติ'}
                </button>
            </div>
            
            ${mode === 'edit' && html`
                <div style="position: absolute; bottom: 12px; left: 12px; z-index: 1000; display: flex; gap: 8px;">
                    <button type="button" class="btn btn-outline" style="background-color: var(--bg-card); padding: 6px 12px; font-size: 0.8rem;" onClick=${clearCoordinates}>
                        <${Icon} name="trash-2" className="icon-sm" /> ล้างพิกัดทั้งหมด
                    </button>
                    ${type === 'polygon' && Array.isArray(coordinates) && coordinates.length > 0 && html`
                        <button type="button" class="btn btn-outline" style="background-color: var(--bg-card); padding: 6px 12px; font-size: 0.8rem;" onClick=${undoLastPoint}>
                            <${Icon} name="undo" className="icon-sm" /> ย้อนกลับ 1 จุด
                        </button>
                    `}
                </div>
            `}
        </div>
    `;
}

// -------------------------------------------------------------
// Component: Dashboard Overview
// -------------------------------------------------------------
export function Dashboard({ plantations, shipments, setTab, setSelectedPlantationId }) {
    const totalAreaRai = plantations.reduce((sum, p) => sum + parseFloat(p.areaRai || 0), 0);
    const totalAreaHec = (totalAreaRai / 6.25).toFixed(2);
    const totalVolume = shipments.reduce((sum, s) => sum + parseFloat(s.weight || 0), 0);
    
    // FSC statistics
    const fscCertifiedCount = plantations.filter(p => p.fscStatus === 'FSC 100%' && p.eudrCompliant).length;
    const fscCwCount = plantations.filter(p => p.fscStatus === 'FSC Controlled Wood' && p.eudrCompliant).length;
    const nonCompliantCount = plantations.filter(p => !p.eudrCompliant).length;

    // Recent shipments
    const recentShipments = shipments.slice(-4).reverse();

    // Compliance notifications/warnings
    const warnings = [];
    plantations.forEach(p => {
        if (!p.eudrCompliant) {
            warnings.push({
                type: 'danger',
                title: `พบข้อบกพร่องด้าน EUDR: แปลง ${p.name}`,
                msg: `ที่ดินไม่ผ่านข้อกำหนดเนื่องจาก: ${p.eudrWarning || 'ไม่ได้ระบุเหตุผล'}`
            });
        } else if (p.fscStatus === 'FSC Controlled Wood' && p.fscCWVerdict === 'Specified Risk') {
            warnings.push({
                type: 'warning',
                title: `ประเมินความเสี่ยง FSC CW สูง: แปลง ${p.name}`,
                msg: `มีการประเมินในหมวดหมู่ที่มีความเสี่ยงเฉพาะ (Specified Risk) ต้องควบคุมห่วงโซ่เพิ่มเติม`
            });
        }
    });

    if (warnings.length === 0) {
        warnings.push({
            type: 'success',
            title: 'การปฏิบัติตามกฎระเบียบครบถ้วน',
            msg: 'ขณะนี้ไม่พบความเสี่ยงด้าน EUDR หรือ FSC Controlled Wood ในระบบ'
        });
    }

    const selectPlantationOnMap = (id) => {
        setSelectedPlantationId(id);
    };

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>แผงควบคุมหลัก (Dashboard)</h1>
                    <p>ระบบติดตามตรวจสอบความสอดคล้องด้าน FSC Controlled Wood & กฎระเบียบ EUDR</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-secondary" onClick=${() => setTab('shipments')}>
                        <${Icon} name="truck" /> บันทึกการส่งมอบไม้
                    </button>
                    <button class="btn btn-primary" onClick=${() => setTab('plantations-new')}>
                        <${Icon} name="plus" /> เพิ่มแปลงปลูกใหม่
                    </button>
                </div>
            </div>

            <!-- KPI Cards Grid -->
            <div class="grid-stats">
                <div class="stat-card">
                    <div class="stat-icon primary">
                        <${Icon} name="leaf" />
                    </div>
                    <div class="stat-details">
                        <h3>${totalAreaRai.toLocaleString()} ไร่</h3>
                        <p>พื้นที่แปลงปลูกสะสม (${totalAreaHec} Hectares)</p>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon warning">
                        <${Icon} name="activity" />
                    </div>
                    <div class="stat-details">
                        <h3>${fscCertifiedCount + fscCwCount} แปลง</h3>
                        <p>แปลงที่ผ่านเกณฑ์ FSC / EUDR</p>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon secondary">
                        <${Icon} name="truck" />
                    </div>
                    <div class="stat-details">
                        <h3>${totalVolume.toLocaleString()} ตัน</h3>
                        <p>ปริมาณไม้ขนส่งสะสมใน CoC</p>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon danger">
                        <${Icon} name="alert-triangle" />
                    </div>
                    <div class="stat-details">
                        <h3>${nonCompliantCount} แปลง</h3>
                        <p>แปลงที่ไม่ผ่านเกณฑ์ EUDR/FSC</p>
                    </div>
                </div>
            </div>

            <!-- Dashboard Map & Alerts Grid -->
            <div class="dashboard-grid">
                <!-- Leaflet Mapping Overview -->
                <div class="dashboard-card">
                    <div class="card-header">
                        <h2><${Icon} name="map" /> แผนที่แสดงตำแหน่งแปลงปลูกทั้งหมด</h2>
                        <span class="badge badge-info">WGS 84 CRS</span>
                    </div>
                    <${InteractiveMap} mode="view" allPlantations=${plantations} />
                    <div style="display: flex; gap: 16px; margin-top: 15px; font-size: 0.8rem; justify-content: center; flex-wrap: wrap;">
                        <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 50%; background-color: #10b981; display: inline-block;"></span> FSC 100% (ผ่าน EUDR)</span>
                        <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 50%; background-color: #f59e0b; display: inline-block;"></span> FSC Controlled Wood (ผ่าน EUDR)</span>
                        <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 50%; background-color: #ef4444; display: inline-block;"></span> ไม่ผ่านเกณฑ์ / เฝ้าระวัง</span>
                    </div>
                </div>

                <!-- Notifications Widget -->
                <div class="dashboard-card">
                    <div class="card-header">
                        <h2><${Icon} name="bell" /> บันทึกการตรวจสอบความเสี่ยง</h2>
                    </div>
                    <div class="notification-list">
                        ${warnings.map((warn, index) => html`
                            <div key=${index} class="notification-item alert-${warn.type}">
                                <div class="notification-text">
                                    <h4>${warn.title}</h4>
                                    <p>${warn.msg}</p>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            </div>

            <!-- Recent Chain of Custody Ledger Section -->
            <div class="table-container">
                <div class="table-header-actions">
                    <h3 style="font-family: 'Plus Jakarta Sans'; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                        <${Icon} name="history" /> ประวัติการขนส่งและส่งมอบไม้ล่าสุด (CoC Traceability)
                    </h3>
                    <button class="btn btn-outline" style="padding: 6px 12px; font-size: 0.8rem;" onClick=${() => setTab('shipments')}>
                        ดูทั้งหมด <${Icon} name="chevron-right" className="icon-sm" />
                    </button>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>วันเวลา</th>
                            <th>แหล่งที่มา (แปลงปลูก)</th>
                            <th>ปลายทาง (โรงงาน)</th>
                            <th>น้ำหนัก (ตัน)</th>
                            <th>ทะเบียนรถ</th>
                            <th>FSC Claim</th>
                            <th>เลขที่ใบชั่งน้ำหนัก</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentShipments.length === 0 ? html`
                            <tr>
                                <td colspan="7" style="text-align: center; color: var(--text-muted);">ไม่พบข้อมูลธุรกรรมการส่งมอบไม้</td>
                            </tr>
                        ` : recentShipments.map(s => {
                            const p = plantations.find(x => x.id === s.plantationId) || { name: 'ไม่ทราบชื่อแปลง' };
                            return html`
                                <tr key=${s.id}>
                                    <td>${s.date}</td>
                                    <td>
                                        <a href="#" style="color: var(--primary); text-decoration: none;" onClick=${(e) => { e.preventDefault(); selectPlantationOnMap(s.plantationId); }}>
                                            ${p.name}
                                        </a>
                                    </td>
                                    <td>${s.millName}</td>
                                    <td style="font-weight: 600;">${s.weight}</td>
                                    <td>${s.truckPlate}</td>
                                    <td>
                                        <span class="badge ${s.fscClaim === 'FSC 100%' ? 'badge-success' : s.fscClaim === 'FSC Mix' ? 'badge-info' : 'badge-warning'}">
                                            ${s.fscClaim}
                                        </span>
                                    </td>
                                    <td><code>${s.weightTicket}</code></td>
                                </tr>
                            `;
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// Component: Plantation Form (Insert / Update)
// -------------------------------------------------------------
export function PlantationForm({ plantations, onSave, onCancel, editPlantationId }) {
    const editMode = !!editPlantationId;
    const defaultPlantation = editMode 
        ? plantations.find(p => p.id === editPlantationId) 
        : {
            id: 'PLT-' + Math.floor(1000 + Math.random() * 9000),
            name: '',
            owner: '',
            tel: '',
            subdistrict: '',
            district: '',
            province: '',
            areaRai: 0,
            areaHectares: 0,
            landDocType: 'Chanote',
            landDocNumber: '',
            landDocIssueDate: '',
            spcName: 'Eucalyptus camaldulensis',
            fmCertified: false,
            fmCertNumber: '',
            plantDate: '',
            harvestDate: '',
            estVolume: 0,
            geoType: 'point', // 'point' | 'polygon'
            coords: null,     // {lat, lng} or Array of {lat, lng}
            deforestationFreeCheck: true,
            forestProtectionZoneCheck: true,
            fscSTD1: true, // Legality
            fscSTD2: true, // Rights
            fscSTD3: true, // HCV
            fscSTD4: true, // Non-conversion
            fscSTD5: true, // GMO-free
            docAttachmentDeed: false,
            docAttachmentOwnerID: false
        };

    const [form, setForm] = useState({ ...defaultPlantation });

    // Handle standard inputs
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        
        let updatedForm = { ...form, [name]: val };
        
        // Auto calculate area in Hectares when Rai changes
        if (name === 'areaRai') {
            const rai = parseFloat(value) || 0;
            const hec = parseFloat((rai / 6.25).toFixed(2));
            updatedForm.areaHectares = hec;
            
            // Auto swap EUDR Geolocation type based on Hectares
            // EUDR rule: Plot <= 4 hectares -> Point, Plot > 4 hectares -> Polygon
            if (hec > 4 && form.geoType === 'point') {
                updatedForm.geoType = 'polygon';
                updatedForm.coords = [];
            } else if (hec <= 4 && form.geoType === 'polygon') {
                updatedForm.geoType = 'point';
                updatedForm.coords = null;
            }
        }

        setForm(updatedForm);
    };

    // Callback for Map coordinate edits
    const handleMapCoordsChange = (newCoords) => {
        setForm(prev => ({ ...prev, coords: newCoords }));
    };

    // Calculate dynamic values
    const treeAgeMonths = form.plantDate 
        ? Math.floor((new Date() - new Date(form.plantDate)) / (1000 * 60 * 60 * 24 * 30))
        : 0;

    // FSC Controlled Wood Risk Assessment Calculation
    // If all fscSTD inputs are true, CW Verdict is Low Risk. If any is false, it is Specified Risk.
    const isFscCwPass = form.fscSTD1 && form.fscSTD2 && form.fscSTD3 && form.fscSTD4 && form.fscSTD5;
    const fscCwVerdict = isFscCwPass ? 'Low Risk' : 'Specified Risk';

    // EUDR Overall Compliance Calculation
    // Plot must have geolocations, deforestationFreeCheck, forestProtectionZoneCheck
    const hasCoordinates = form.geoType === 'point' 
        ? (form.coords && form.coords.lat)
        : (Array.isArray(form.coords) && form.coords.length >= 3);
    
    const eudrCompliant = form.deforestationFreeCheck && form.forestProtectionZoneCheck && hasCoordinates;
    const eudrWarning = !hasCoordinates 
        ? 'ยังไม่ได้กำหนดค่าพิกัดแผนที่ที่ถูกต้องตามกฎเกณฑ์ (Point/Polygon)'
        : (!form.deforestationFreeCheck ? 'พบข้อมูลการถางป่าธรรมชาติหลังเส้นตายวันที่ 31 ธ.ค. 2020' : 
           (!form.forestProtectionZoneCheck ? 'แปลงที่ดินคาบเกี่ยวกับเขตพื้นที่ป่าสงวนธรรมชาติหรือป่าอนุรักษ์ตามกฎหมาย' : ''));

    // FSC status: FM Certificate = FSC 100%, else follow CW verdict
    const fscStatus = form.fmCertified
        ? 'FSC 100%'
        : (isFscCwPass ? 'FSC Controlled Wood' : 'FSC Excluded');

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!hasCoordinates) {
            alert(
                'กรุณาระบุพิกัดแปลงบนแผนที่ก่อนบันทึก\n' +
                (form.areaHectares > 4
                    ? 'แปลงขนาดใหญ่กว่า 4 เฮกตาร์ต้องวาด Polygon อย่างน้อย 3 จุด'
                    : 'คลิกบนแผนที่เพื่อระบุจุด Point ของแปลง')
            );
            return;
        }

        const finalData = {
            ...form,
            treeAge: treeAgeMonths,
            fscCWVerdict,
            eudrCompliant,
            eudrWarning,
            fscStatus
        };

        onSave(finalData);
    };

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>${editMode ? 'แก้ไขข้อมูลแปลงปลูก' : 'ลงทะเบียนแปลงปลูกใหม่'}</h1>
                    <p>กรอกข้อมูลรายละเอียดแปลงเพื่อตรวจสอบสิทธิตามมาตรฐาน FSC และ EUDR</p>
                </div>
                <button class="btn btn-outline" onClick=${onCancel}>
                    <${Icon} name="arrow-left" /> ย้อนกลับ
                </button>
            </div>

            <form onSubmit=${handleSubmit}>
                <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; align-items: start;">
                    
                    <!-- Form input fields -->
                    <div class="form-container" style="display: flex; flex-direction: column; gap: 16px;">
                        
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="info" /> 1. ข้อมูลทั่วไปแปลงที่ดิน
                            </div>

                            <div class="form-group">
                                <label>รหัสแปลงปลูก</label>
                                <input type="text" class="form-control" name="id" value=${form.id} disabled />
                            </div>

                            <div class="form-group">
                                <label>ชื่อแปลงปลูก</label>
                                <input type="text" class="form-control" name="name" value=${form.name} onChange=${handleChange} placeholder="เช่น แปลงลานสัก 1" required />
                            </div>

                            <div class="form-group">
                                <label>ชื่อผู้ถือครอง/เจ้าของสิทธิ์</label>
                                <input type="text" class="form-control" name="owner" value=${form.owner} onChange=${handleChange} placeholder="ชื่อ-นามสกุล" required />
                            </div>

                            <div class="form-group">
                                <label>เบอร์โทรศัพท์ติดต่อ</label>
                                <input type="text" class="form-control" name="tel" value=${form.tel} onChange=${handleChange} placeholder="08xxxxxxxx" required />
                            </div>

                            <div class="form-group">
                                <label>จังหวัด</label>
                                <input type="text" class="form-control" name="province" value=${form.province} onChange=${handleChange} placeholder="เช่น อุทัยธานี" required />
                            </div>

                            <div class="form-group">
                                <label>อำเภอ / เขต</label>
                                <input type="text" class="form-control" name="district" value=${form.district} onChange=${handleChange} placeholder="เช่น ลานสัก" required />
                            </div>

                            <div class="form-group">
                                <label>ตำบล / แขวง</label>
                                <input type="text" class="form-control" name="subdistrict" value=${form.subdistrict} onChange=${handleChange} placeholder="เช่น ลานสัก" required />
                            </div>

                            <div class="form-group">
                                <label>ประเภทเอกสารสิทธิ์ที่ดิน</label>
                                <select class="form-control" name="landDocType" value=${form.landDocType} onChange=${handleChange}>
                                    <option value="Chanote">โฉนดที่ดิน (น.ส.4)</option>
                                    <option value="NorSor3">น.ส. 3 / น.ส. 3 ก.</option>
                                    <option value="SorPorKor">ส.ป.ก. 4-01</option>
                                    <option value="Others">อื่น ๆ (แนบเอกสารสิทธิ์ตรวจสอบ)</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label>เลขที่เอกสารสิทธิ์ / เลขระวาง</label>
                                <input type="text" class="form-control" name="landDocNumber" value=${form.landDocNumber} onChange=${handleChange} placeholder="เช่น 24451" required />
                            </div>

                            <div class="form-group">
                                <label>วันที่ออกเอกสารสิทธิ์</label>
                                <input type="date" class="form-control" name="landDocIssueDate" value=${form.landDocIssueDate} onChange=${handleChange} required />
                            </div>

                            <div class="form-group">
                                <label>ขนาดพื้นที่แปลง (หน่วย: ไร่)</label>
                                <input type="number" class="form-control" name="areaRai" value=${form.areaRai} onChange=${handleChange} min="1" required />
                            </div>

                            <div class="form-group">
                                <label>ขนาดพื้นที่เป็นเฮกตาร์ (ฮก.)</label>
                                <input type="number" class="form-control" value=${form.areaHectares} disabled />
                            </div>
                        </div>

                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="tree-pine" /> 2. ข้อมูลการเพาะปลูกและผลผลิต
                            </div>

                            <div class="form-group full-width">
                                <label>ชนิดพันธุ์ไม้ (Scientific / Common Name)</label>
                                <input type="text" list="species-datalist" class="form-control" name="spcName" value=${form.spcName} onChange=${handleChange} placeholder="พิมพ์หรือเลือกชนิดไม้" required />
                                <datalist id="species-datalist">
                                    ${SPECIES_LIST.map(s => html`<option key=${s} value=${s} />`)}
                                </datalist>
                            </div>

                            <div class="form-group">
                                <label>วันที่เริ่มปลูก</label>
                                <input type="date" class="form-control" name="plantDate" value=${form.plantDate} onChange=${handleChange} required />
                            </div>

                            <div class="form-group">
                                <label>อายุไม้สะสม</label>
                                <input type="text" class="form-control" value="${treeAgeMonths} เดือน (${(treeAgeMonths/12).toFixed(1)} ปี)" disabled />
                            </div>

                            <div class="form-group">
                                <label>วันที่คาดว่าจะตัดฟัน (Harvest Date)</label>
                                <input type="date" class="form-control" name="harvestDate" value=${form.harvestDate} onChange=${handleChange} required />
                            </div>

                            <div class="form-group full-width">
                                <label>ประเมินปริมาณผลผลิตคาดว่าจะได้รับ (ตัน)</label>
                                <input type="number" class="form-control" name="estVolume" value=${form.estVolume} onChange=${handleChange} placeholder="ประเมินเป็นจำนวนตัน" required />
                            </div>
                        </div>

                        <!-- 2.5. FM Certificate -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="award" /> 2.5 ใบรับรองการจัดการป่าไม้ (FM Certificate)
                            </div>

                            <div class="form-group full-width">
                                <div class="checklist-item">
                                    <input type="checkbox" class="checklist-checkbox" name="fmCertified" checked=${form.fmCertified} onChange=${handleChange} id="fmCertCheck" />
                                    <div class="checklist-content">
                                        <label for="fmCertCheck" style="cursor:pointer; display:block;">
                                            <h5>แปลงนี้ได้รับใบรับรอง FSC Forest Management (FM) Certificate</h5>
                                        </label>
                                        <p>หากมีใบรับรอง FM Certificate ที่ออกโดยหน่วยงานรับรองที่ได้รับการรับรองจาก FSC สินค้าไม้จากแปลงนี้สามารถอ้างสิทธิ์เป็น <b>FSC 100%</b> ได้ทันที (แทนที่จะเป็น FSC Controlled Wood)</p>
                                    </div>
                                </div>
                            </div>

                            ${form.fmCertified && html`
                                <div class="form-group full-width">
                                    <label>หมายเลขใบรับรอง FM Certificate</label>
                                    <input type="text" class="form-control" name="fmCertNumber" value=${form.fmCertNumber} onChange=${handleChange} placeholder="เช่น FM/TH-012345" />
                                </div>
                            `}
                        </div>

                        <!-- 3. EUDR Compliance Status Checklist -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="shield-check" /> 3. การประเมินความสอดคล้องด้าน EUDR (EU Deforestation Regulation)
                            </div>
                            
                            <div class="form-group full-width">
                                <div class="checklist-item">
                                    <input type="checkbox" class="checklist-checkbox" name="deforestationFreeCheck" checked=${form.deforestationFreeCheck} onChange=${handleChange} id="defCheck" />
                                    <div class="checklist-content">
                                        <label for="defCheck" style="cursor:pointer; display:block;"><h5>ที่ดินไม่มีการแปรสภาพป่าธรรมชาติหลัง 31 ธ.ค. 2020</h5></label>
                                        <p>รับรองว่าไม่ได้รับไม้ที่มาจากแปลงที่ดินที่มีการถางทำลายป่าธรรมชาติเพื่อแปลงสภาพเป็นพื้นที่เกษตรกรรมหลังเส้นตายสิ้นปี 2020</p>
                                    </div>
                                </div>
                            </div>

                            <div class="form-group full-width">
                                <div class="checklist-item">
                                    <input type="checkbox" class="checklist-checkbox" name="forestProtectionZoneCheck" checked=${form.forestProtectionZoneCheck} onChange=${handleChange} id="forestCheck" />
                                    <div class="checklist-content">
                                        <label for="forestCheck" style="cursor:pointer; display:block;"><h5>อยู่นอกเขตพื้นที่ป่าสงวนและป่าอนุรักษ์ตามกฎหมาย</h5></label>
                                        <p>รับรองว่าที่ดินนี้มีสิทธิ์ครอบครองทำกินถูกต้องตามกฎหมายของประเทศไทย และไม่คุกคามป่าธรรมชาติที่มีความสำคัญในเชิงระบบนิเวศ</p>
                                    </div>
                                </div>
                            </div>

                            <!-- 3.1. Phitak Phrai change.forest.go.th Helper tool -->
                            <div class="form-group full-width" style="margin-top: -8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; background-color:rgba(59, 130, 246, 0.05); border: 1px dashed rgba(59,130,246,0.25); padding: 12px; border-radius: var(--radius-md); gap: 16px;">
                                    <div style="font-size:0.8rem; color:var(--text-muted); display:flex; flex-direction:column; gap:2px; flex: 1;">
                                        <span style="font-weight:600; color:var(--secondary); display:flex; align-items:center; gap:4px;"><${Icon} name="lightbulb" className="icon-sm" /> เครื่องมือช่วยตรวจสอบระบบพิทักษ์ไพร (change.forest.go.th):</span>
                                        <span>ตรวจสอบการเปลี่ยนแปลงสภาพป่าไม้ของแปลงนี้บนระบบตรวจสอบย้อนกลับของกรมป่าไม้โดยตรง</span>
                                    </div>
                                    <button type="button" class="btn btn-outline" style="padding: 6px 12px; font-size:0.75rem; border-color:rgba(59,130,246,0.3); color:var(--secondary); background:transparent; font-weight:600; flex-shrink: 0;" onClick=${() => {
                                        const coords = form.coords;
                                        let textToCopy = "";
                                        if (form.geoType === 'point' && coords && coords.lat) {
                                            textToCopy = `${coords.lat}, ${coords.lng}`;
                                        } else if (form.geoType === 'polygon' && Array.isArray(coords) && coords.length > 0) {
                                            textToCopy = `${coords[0].lat}, ${coords[0].lng}`;
                                        }
                                        if (textToCopy) {
                                            navigator.clipboard.writeText(textToCopy);
                                            alert(`คัดลอกพิกัดจุดแรก [${textToCopy}] ไปยังคลิปบอร์ดแล้ว! คุณสามารถนำไปวางในช่องค้นหาบนเว็บพิทักษ์ไพรได้ทันที`);
                                        } else {
                                            alert('กรุณาคลิกเลือกพิกัดแปลงบนแผนที่ฝั่งขวาก่อนทำการตรวจสอบ');
                                        }
                                        window.open('https://change.forest.go.th/', '_blank');
                                    }}>
                                        <${Icon} name="external-link" className="icon-sm" /> ตรวจพิกัดบนเว็บกรมป่าไม้
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 4. FSC Controlled Wood Evaluation -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="check-square" /> 4. การประเมินตนเองเกี่ยวกับความเสี่ยงไม้ควบคุม FSC Controlled Wood
                            </div>

                            <div class="form-group full-width">
                                <div class="checklist-container">
                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD1" checked=${form.fscSTD1} onChange=${handleChange} id="cw1" />
                                        <div class="checklist-content">
                                            <label for="cw1" style="cursor:pointer; display:block;"><h5>หมวดหมู่ 1: แหล่งไม้ถูกกฎหมาย (Legally Harvested)</h5></label>
                                            <p>ที่ดินมีสิทธิ์ครอบครองและมีใบอนุญาตหรือข้อกำหนดกฎหมายที่สอดคล้องกับการเพาะปลูกและขายไม้</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD2" checked=${form.fscSTD2} onChange=${handleChange} id="cw2" />
                                        <div class="checklist-content">
                                            <label for="cw2" style="cursor:pointer; display:block;"><h5>หมวดหมู่ 2: สิทธิของชนเผ่าพื้นเมืองและสิทธิมนุษยชน (Traditional/Human Rights)</h5></label>
                                            <p>การเพาะปลูกพืชนี้ไม่มีกรณีพิพาทเรื่องดินแดนกับชุมชนท้องถิ่นหรือละเมิดจารีตประเพณีสิทธิ์</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD3" checked=${form.fscSTD3} onChange=${handleChange} id="cw3" />
                                        <div class="checklist-content">
                                            <label for="cw3" style="cursor:pointer; display:block;"><h5>หมวดหมู่ 3: คุณค่าการอนุรักษ์สูง (High Conservation Values - HCV)</h5></label>
                                            <p>กระบวนการจัดการแปลงไม่คุกคามพื้นที่ป่าอนุรักษ์ธรรมชาติหรือแหล่งรักษาระบบนิเวศสำคัญ</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD4" checked=${form.fscSTD4} onChange=${handleChange} id="cw4" />
                                        <div class="checklist-content">
                                            <label for="cw4" style="cursor:pointer; display:block;"><h5>หมวดหมู่ 4: ไม่เป็นพื้นที่แปลงสภาพป่าธรรมชาติ (Non-conversion of Forests)</h5></label>
                                            <p>ที่ดินแปลงนี้ไม่ใช่ป่าธรรมชาติที่ถูกบุกรุกเพื่อทำเป็นสวนป่าไม้เศรษฐกิจหลังปี ค.ศ. 1994</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD5" checked=${form.fscSTD5} onChange=${handleChange} id="cw5" />
                                        <div class="checklist-content">
                                            <label for="cw5" style="cursor:pointer; display:block;"><h5>หมวดหมู่ 5: ไม่ใช้สิ่งมีชีวิตดัดแปลงพันธุกรรม (No GMO Trees)</h5></label>
                                            <p>ยืนยันว่ายูคาลิปตัสที่ปลูกไม่ได้มาจากสายพันธุ์จีเอ็มโอ (Genetically Modified Trees)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 5. Verification Document Attachment Uploads Mocks -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="paperclip" /> 5. แนบเอกสารสิทธิ์ประกอบระบบ DDS
                            </div>

                            <div class="form-group">
                                <label>สำเนาเอกสารสิทธิ์ที่ดิน (โฉนด/น.ส.3/ส.ป.ก.)</label>
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <input type="file" style="display:none;" id="fileDeed" onChange=${() => setForm(f => ({ ...f, docAttachmentDeed: true }))} />
                                    <label for="fileDeed" class="btn btn-outline" style="font-size:0.8rem; margin:0; flex-grow:1; text-align:center;">
                                        <${Icon} name="upload" className="icon-sm" /> ${form.docAttachmentDeed ? 'อัปโหลดเรียบร้อย' : 'เลือกไฟล์ภาพ/PDF'}
                                    </label>
                                    ${form.docAttachmentDeed && html`
                                        <span class="badge badge-success"><${Icon} name="check" /></span>
                                    `}
                                </div>
                            </div>

                            <div class="form-group">
                                <label>สำเนาบัตรประชาชนผู้ถือกรรมสิทธิ์ / สิทธิ์รับจ้าง</label>
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <input type="file" style="display:none;" id="fileID" onChange=${() => setForm(f => ({ ...f, docAttachmentOwnerID: true }))} />
                                    <label for="fileID" class="btn btn-outline" style="font-size:0.8rem; margin:0; flex-grow:1; text-align:center;">
                                        <${Icon} name="upload" className="icon-sm" /> ${form.docAttachmentOwnerID ? 'อัปโหลดเรียบร้อย' : 'เลือกไฟล์ภาพ/PDF'}
                                    </label>
                                    ${form.docAttachmentOwnerID && html`
                                        <span class="badge badge-success"><${Icon} name="check" /></span>
                                    `}
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Right Column: Interactive Map Widget -->
                    <div style="position: sticky; top: 20px; display: flex; flex-direction: column; gap: 20px;">
                        <div class="dashboard-card" style="padding: 24px;">
                            <div class="card-header" style="margin-bottom:12px;">
                                <h2>
                                    <${Icon} name="navigation" /> 
                                    พิกัดที่ดินสำหรับ EUDR 
                                    (${form.areaHectares > 4 ? 'โหมด Polygon' : 'โหมด Point'})
                                </h2>
                            </div>
                            
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                                <${Icon} name="info" className="icon-sm" /> 
                                ข้อกำหนด EUDR: หากที่ดินมีขนาดมากกว่า <b>4 เฮกตาร์ (25 ไร่)</b> ต้องบันทึกพิกัดแบบเส้นล้อมรอบ (Polygon)<br/>
                                กรุณาคลิกเลือกจุดบนแผนที่เพื่อระบุตำแหน่ง/วาดเส้นล้อมรอบแปลง
                            </p>

                            <!-- Leaflet Map Integration -->
                            <${InteractiveMap} 
                                mode="edit" 
                                type=${form.areaHectares > 4 ? 'polygon' : 'point'} 
                                coordinates=${form.coords} 
                                onChange=${handleMapCoordsChange}
                            />

                            <!-- Geolocation details preview -->
                            <div style="margin-top: 16px; padding: 12px; background-color: rgba(36,48,73,0.3); border-radius: var(--radius-md); font-size:0.85rem;">
                                <span style="font-weight:600; color: var(--primary); display:block; margin-bottom:6px;">ข้อมูลพิกัดภูมิศาสตร์ (WGS84):</span>
                                ${form.geoType === 'point' ? html`
                                    <div>
                                        <b>ละติจูด (Lat):</b> ${form.coords && form.coords.lat ? form.coords.lat : html`<span style="color:var(--danger)">ยังไม่ได้ระบุ</span>`}<br/>
                                        <b>ลองจิจูด (Lng):</b> ${form.coords && form.coords.lng ? form.coords.lng : html`<span style="color:var(--danger)">ยังไม่ได้ระบุ</span>`}
                                    </div>
                                ` : html`
                                    <div>
                                        <b>จำนวนขอบจุดของ Polygon:</b> ${Array.isArray(form.coords) ? form.coords.length : 0} จุด<br/>
                                        <div style="max-height: 80px; overflow-y: auto; font-family: monospace; font-size: 0.75rem; margin-top:4px;">
                                            ${Array.isArray(form.coords) && form.coords.length > 0 
                                                ? form.coords.map((c, i) => html`<div key=${i}>จุดที่ ${i+1}: [${c.lat}, ${c.lng}]</div>`)
                                                : html`<span style="color:var(--danger)">กรุณาคลิกบนแผนที่เพื่อวาดพิกัดอย่างน้อย 3 จุด</span>`
                                            }
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- Real-time Compliance Verdict Box -->
                        <div class="dashboard-card" style="padding: 24px;">
                            <div class="card-header" style="margin-bottom:12px;">
                                <h2><${Icon} name="activity" /> ผลประเมินความสอดคล้องเบื้องต้น</h2>
                            </div>

                            <div style="display:flex; flex-direction:column; gap:12px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background-color:rgba(11,15,25,0.4); border-radius:var(--radius-md);">
                                    <span style="font-size:0.85rem;">ความเสี่ยงไม้ควบคุม FSC (CW):</span>
                                    <span class="badge ${isFscCwPass ? 'badge-success' : 'badge-danger'}">${fscCwVerdict}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background-color:rgba(11,15,25,0.4); border-radius:var(--radius-md);">
                                    <span style="font-size:0.85rem;">มาตรฐานสินค้าผ่านเกณฑ์ EUDR:</span>
                                    <span class="badge ${eudrCompliant ? 'badge-success' : 'badge-danger'}">${eudrCompliant ? 'Compliant (ผ่าน)' : 'Non-compliant (ตก)'}</span>
                                </div>
                                
                                ${!eudrCompliant && html`
                                    <div style="padding: 12px; background-color: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); border-radius: var(--radius-md); font-size: 0.8rem; color: #fca5a5;">
                                        ⚠️ <b>หมายเหตุขัดข้อง:</b> ${eudrWarning}
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- Submit Buttons -->
                        <div style="display:flex; gap:12px;">
                            <button type="button" class="btn btn-outline" style="flex:1;" onClick=${onCancel}>ยกเลิก</button>
                            <button type="submit" class="btn btn-primary" style="flex:2;">บันทึกข้อมูลแปลงปลูก</button>
                        </div>
                    </div>

                </div>
            </form>
        </div>
    `;
}

// -------------------------------------------------------------
// Component: Plantation List
// -------------------------------------------------------------
const PLT_PAGE_SIZE = 10;

export function PlantationList({ plantations, onDelete, onEdit, setTab, setSelectedPlantationId }) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);

    const filtered = plantations.filter(p => {
        const q = search.toLowerCase();
        const matchText = !q ||
            p.name.toLowerCase().includes(q) ||
            p.owner.toLowerCase().includes(q) ||
            p.province.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q);
        const matchStatus =
            statusFilter === 'all' ? true :
            statusFilter === 'compliant' ? p.eudrCompliant :
            statusFilter === 'non-compliant' ? !p.eudrCompliant :
            statusFilter === 'fsc100' ? p.fscStatus === 'FSC 100%' :
            statusFilter === 'cw' ? p.fscStatus === 'FSC Controlled Wood' : true;
        return matchText && matchStatus;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PLT_PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PLT_PAGE_SIZE, page * PLT_PAGE_SIZE);

    const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };
    const handleFilter = (e) => { setStatusFilter(e.target.value); setPage(1); };

    const handleExportCsv = () => {
        exportToCsv(
            `plantations-${new Date().toISOString().slice(0, 10)}.csv`,
            ['รหัสแปลง', 'ชื่อแปลง', 'เจ้าของ', 'โทรศัพท์', 'จังหวัด', 'อำเภอ', 'ตำบล',
             'ประเภทเอกสาร', 'เลขที่เอกสาร', 'พื้นที่(ไร่)', 'พื้นที่(ฮก.)',
             'ชนิดไม้', 'FM Cert', 'วันปลูก', 'วันตัดฟัน', 'ปริมาณ(ตัน)',
             'FSC สถานะ', 'EUDR สถานะ', 'หมายเหตุ EUDR'],
            filtered.map(p => [
                p.id, p.name, p.owner, p.tel, p.province, p.district, p.subdistrict,
                p.landDocType, p.landDocNumber, p.areaRai, p.areaHectares,
                p.spcName, p.fmCertified ? (p.fmCertNumber || 'มี') : '-',
                p.plantDate, p.harvestDate, p.estVolume,
                p.fscStatus, p.eudrCompliant ? 'Compliant' : 'Non-Compliant',
                p.eudrWarning || ''
            ])
        );
    };

    const viewDds = (id) => { setSelectedPlantationId(id); setTab('dds-report'); };

    const docLabel = (t) => t === 'Chanote' ? 'โฉนด น.ส.4' : t === 'NorSor3' ? 'น.ส.3 / น.ส.3ก.' : t === 'SorPorKor' ? 'ส.ป.ก. 4-01' : 'อื่น ๆ';

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>ฐานข้อมูลแปลงปลูก</h1>
                    <p>ระบบจัดเก็บพิกัดภูมิศาสตร์และใบประเมินความสอดคล้องของห่วงโซ่อุปทาน</p>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn btn-outline" style="font-size:0.85rem;" onClick=${handleExportCsv}>
                        <${Icon} name="download" /> ส่งออก CSV
                    </button>
                    <button class="btn btn-primary" onClick=${() => setTab('plantations-new')}>
                        <${Icon} name="plus" /> เพิ่มแปลงปลูกใหม่
                    </button>
                </div>
            </div>

            <div class="table-container">
                <div class="table-header-actions" style="flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; gap:10px; flex-wrap:wrap; flex:1;">
                        <input
                            type="text"
                            class="search-input"
                            style="flex:1; min-width:200px;"
                            placeholder="ค้นหาชื่อแปลง, เจ้าของ, จังหวัด, รหัส..."
                            value=${search}
                            onInput=${handleSearch}
                        />
                        <select
                            class="form-control"
                            style="width:auto; padding:8px 12px; font-size:0.85rem; background:var(--bg-dark);"
                            value=${statusFilter}
                            onChange=${handleFilter}
                        >
                            <option value="all">ทุกสถานะ</option>
                            <option value="compliant">EUDR ผ่าน</option>
                            <option value="non-compliant">EUDR ไม่ผ่าน</option>
                            <option value="fsc100">FSC 100%</option>
                            <option value="cw">FSC Controlled Wood</option>
                        </select>
                    </div>
                    <span style="font-size:0.85rem; color:var(--text-muted); white-space:nowrap;">
                        พบ <b>${filtered.length}</b> แปลง
                    </span>
                </div>

                <div style="overflow-x:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>รหัสแปลง</th>
                                <th>ชื่อแปลง / เจ้าของ</th>
                                <th>ประเภทสิทธิ์</th>
                                <th>พื้นที่</th>
                                <th>พิกัด</th>
                                <th>FSC</th>
                                <th>EUDR</th>
                                <th style="text-align:right;">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${paginated.length === 0 ? html`
                                <tr>
                                    <td colspan="8" style="text-align:center; color:var(--text-muted); padding:32px;">
                                        ไม่พบข้อมูลแปลงปลูกที่ตรงกับเงื่อนไข
                                    </td>
                                </tr>
                            ` : paginated.map(p => html`
                                <tr key=${p.id}>
                                    <td><code>${p.id}</code></td>
                                    <td>
                                        <div style="font-weight:600; color:#fff;">${p.name}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${p.owner} | โทร. ${p.tel}</div>
                                    </td>
                                    <td><span style="font-weight:500;">${docLabel(p.landDocType)}</span></td>
                                    <td>
                                        <div><b>${p.areaRai}</b> ไร่</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${p.areaHectares} ฮก.</div>
                                    </td>
                                    <td>
                                        <span class="badge badge-info">
                                            <${Icon} name="map-pin" className="icon-sm" />
                                            ${p.geoType === 'point' ? 'Point' : `Poly(${p.coords ? p.coords.length : 0})`}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="badge ${p.fscStatus === 'FSC 100%' ? 'badge-success' : p.fscStatus === 'FSC Excluded' ? 'badge-danger' : 'badge-warning'}">
                                            ${p.fscStatus}
                                        </span>
                                        ${p.fmCertified && html`<div style="font-size:0.7rem; color:var(--primary); margin-top:2px;">FM: ${p.fmCertNumber || '-'}</div>`}
                                    </td>
                                    <td>
                                        <span class="badge ${p.eudrCompliant ? 'badge-success' : 'badge-danger'}">
                                            ${p.eudrCompliant ? 'Compliant' : 'Non-Compliant'}
                                        </span>
                                    </td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex; gap:6px;">
                                            <button class="action-btn btn-view" title="ดูรายงาน DDS" onClick=${() => viewDds(p.id)}>
                                                <${Icon} name="file-text" />
                                            </button>
                                            <button class="action-btn btn-edit" title="แก้ไข" onClick=${() => onEdit(p.id)}>
                                                <${Icon} name="edit" />
                                            </button>
                                            <button class="action-btn btn-delete" title="ลบ" onClick=${() => onDelete(p.id)}>
                                                <${Icon} name="trash-2" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>

                ${totalPages > 1 && html`
                    <div style="display:flex; justify-content:center; align-items:center; gap:10px; padding:16px; border-top:1px solid var(--border-color);">
                        <button class="btn btn-outline" style="padding:6px 14px; font-size:0.8rem;" onClick=${() => setPage(p => Math.max(1, p - 1))} disabled=${page === 1}>
                            <${Icon} name="chevron-left" className="icon-sm" /> ก่อนหน้า
                        </button>
                        <span style="font-size:0.85rem; color:var(--text-muted);">หน้า ${page} / ${totalPages}</span>
                        <button class="btn btn-outline" style="padding:6px 14px; font-size:0.8rem;" onClick=${() => setPage(p => Math.min(totalPages, p + 1))} disabled=${page === totalPages}>
                            ถัดไป <${Icon} name="chevron-right" className="icon-sm" />
                        </button>
                    </div>
                `}
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// Component: Chain of Custody (CoC) Ledger
// -------------------------------------------------------------
export function CocLedger({ shipments, plantations, onAddShipment, onDeleteShipment }) {
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({
        plantationId: '',
        date: new Date().toISOString().slice(0, 16),
        weight: '',
        truckPlate: '',
        truckProvince: '',
        driverName: '',
        driverLicense: '',
        weightTicket: 'WT-' + Math.floor(100000 + Math.random() * 900000),
        deliveryNote: 'DN-' + Math.floor(10000 + Math.random() * 90000),
        millName: '',
        fscClaim: 'FSC Controlled Wood'
    });

    const activePlantations = plantations.filter(p => p.eudrCompliant);

    const filteredShipments = search.trim()
        ? shipments.filter(s => {
            const p = plantations.find(x => x.id === s.plantationId);
            const q = search.toLowerCase();
            return s.id.toLowerCase().includes(q) ||
                s.millName.toLowerCase().includes(q) ||
                s.truckPlate.toLowerCase().includes(q) ||
                (p && p.name.toLowerCase().includes(q));
        })
        : shipments;

    const handleSelectPlantation = (e) => {
        const pId = e.target.value;
        const p = plantations.find(x => x.id === pId);
        setForm(f => ({ ...f, plantationId: pId, fscClaim: p ? p.fscStatus : 'FSC Controlled Wood' }));
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.plantationId) {
            alert('กรุณาเลือกแปลงที่เป็นแหล่งที่มาของไม้');
            return;
        }
        onAddShipment({ ...form, id: 'TX-' + Math.floor(100000 + Math.random() * 900000) });
        setForm({
            plantationId: '',
            date: new Date().toISOString().slice(0, 16),
            weight: '',
            truckPlate: '',
            truckProvince: '',
            driverName: '',
            driverLicense: '',
            weightTicket: 'WT-' + Math.floor(100000 + Math.random() * 900000),
            deliveryNote: 'DN-' + Math.floor(10000 + Math.random() * 90000),
            millName: '',
            fscClaim: 'FSC Controlled Wood'
        });
    };

    const handleExportCsv = () => {
        exportToCsv(
            `coc-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
            ['รหัส CoC', 'วันเวลา', 'แปลงต้นทาง', 'จังหวัดต้นทาง', 'โรงงานปลายทาง',
             'น้ำหนัก(ตัน)', 'ทะเบียนรถ', 'จังหวัดรถ', 'คนขับ', 'เลขใบอนุญาต',
             'ใบนำส่ง', 'ใบชั่งน้ำหนัก', 'FSC Claim'],
            filteredShipments.map(s => {
                const p = plantations.find(x => x.id === s.plantationId);
                return [
                    s.id, s.date.replace('T', ' '),
                    p ? p.name : s.plantationId, p ? p.province : '',
                    s.millName, s.weight,
                    s.truckPlate, s.truckProvince,
                    s.driverName, s.driverLicense,
                    s.deliveryNote, s.weightTicket, s.fscClaim
                ];
            })
        );
    };

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>ห่วงโซ่การครอบครองสินค้า (CoC Ledger)</h1>
                    <p>บันทึกรายการซื้อขายและติดตามเส้นทางการขนส่งไม้ซุงสู่โรงงานแปรรูป</p>
                </div>
            </div>

            <div class="coc-layout" style="display:grid; grid-template-columns: 1fr 1.5fr; gap:24px; align-items:start;">
                <!-- Shipment Entry Form -->
                <div class="form-container">
                    <div style="font-size:1.1rem; font-weight:700; color:var(--primary); padding-bottom:8px; border-bottom:1px solid var(--border-color); margin-bottom:16px; display:flex; align-items:center; gap:8px;">
                        <${Icon} name="plus-circle" /> บันทึกใบชั่งน้ำหนักส่งมอบไม้
                    </div>

                    <form onSubmit=${handleSubmit} style="display:flex; flex-direction:column; gap:12px;">
                        <div class="form-group">
                            <label>แปลงปลูกต้นทาง (เฉพาะที่ผ่านเกณฑ์ EUDR)</label>
                            <select class="form-control" name="plantationId" value=${form.plantationId} onChange=${handleSelectPlantation} required>
                                <option value="">-- เลือกแปลงต้นทาง --</option>
                                ${activePlantations.map(p => html`
                                    <option key=${p.id} value=${p.id}>${p.name} (${p.province})</option>
                                `)}
                            </select>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>FSC Claim (อ้างอิงจากแปลง)</label>
                                <input type="text" class="form-control" name="fscClaim" value=${form.fscClaim} disabled />
                            </div>
                            <div class="form-group">
                                <label>ปริมาณไม้ (ตัน)</label>
                                <input type="number" step="0.01" class="form-control" name="weight" value=${form.weight} onChange=${handleChange} placeholder="เช่น 15.5" required />
                            </div>
                        </div>

                        <div class="form-group">
                            <label>วันเวลาที่จัดส่ง</label>
                            <input type="datetime-local" class="form-control" name="date" value=${form.date} onChange=${handleChange} required />
                        </div>

                        <div class="form-group">
                            <label>โรงงานปลายทาง / ผู้รับซื้อ</label>
                            <input type="text" class="form-control" name="millName" value=${form.millName} onChange=${handleChange} placeholder="เช่น บจก. สยามเซลลูโลส / โรงงาน Double A" required />
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>เลขทะเบียนรถบรรทุก</label>
                                <input type="text" class="form-control" name="truckPlate" value=${form.truckPlate} onChange=${handleChange} placeholder="เช่น 82-4411" required />
                            </div>
                            <div class="form-group">
                                <label>จังหวัดทะเบียนรถ</label>
                                <input type="text" class="form-control" name="truckProvince" value=${form.truckProvince} onChange=${handleChange} placeholder="เช่น อุทัยธานี" required />
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>ชื่อคนขับรถบรรทุก</label>
                                <input type="text" class="form-control" name="driverName" value=${form.driverName} onChange=${handleChange} placeholder="ชื่อ-นามสกุล" required />
                            </div>
                            <div class="form-group">
                                <label>เลขที่ใบอนุญาตขับขี่</label>
                                <input type="text" class="form-control" name="driverLicense" value=${form.driverLicense} onChange=${handleChange} placeholder="เช่น DL-12345" required />
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label>ใบนำส่งไม้ (Delivery Note)</label>
                                <input type="text" class="form-control" value=${form.deliveryNote} disabled />
                            </div>
                            <div class="form-group">
                                <label>ใบชั่งน้ำหนัก (Weight Ticket)</label>
                                <input type="text" class="form-control" value=${form.weightTicket} disabled />
                            </div>
                        </div>

                        <button type="submit" class="btn btn-primary" style="margin-top:10px;">
                            <${Icon} name="save" /> บันทึกและออกรหัส CoC Transaction
                        </button>
                    </form>
                </div>

                <!-- Ledger History Table -->
                <div class="table-container">
                    <div class="table-header-actions" style="background:rgba(21,29,48,0.4); flex-wrap:wrap; gap:10px;">
                        <h3 style="font-family:'Plus Jakarta Sans'; font-size:1rem; display:flex; align-items:center; gap:8px;">
                            <${Icon} name="list" /> สมุด CoC (Supply Chain Ledger)
                        </h3>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <input
                                type="text"
                                class="search-input"
                                style="width:160px;"
                                placeholder="ค้นหา CoC / แปลง..."
                                value=${search}
                                onInput=${e => setSearch(e.target.value)}
                            />
                            <button class="btn btn-outline" style="padding:6px 12px; font-size:0.8rem;" onClick=${handleExportCsv} title="ส่งออกรายการขนส่งเป็น CSV">
                                <${Icon} name="download" className="icon-sm" /> CSV
                            </button>
                        </div>
                    </div>

                    <div style="overflow-x:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>รหัส CoC / วันเวลา</th>
                                    <th>แหล่งที่มา & ปลายทาง</th>
                                    <th>น้ำหนัก</th>
                                    <th>ยานพาหนะ & คนขับ</th>
                                    <th>FSC / ใบนำส่ง</th>
                                    <th style="text-align:right;">ลบ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredShipments.length === 0 ? html`
                                    <tr>
                                        <td colspan="6" style="text-align:center; color:var(--text-muted); padding:32px;">ไม่พบรายการขนส่งไม้</td>
                                    </tr>
                                ` : filteredShipments.map(s => {
                                    const p = plantations.find(x => x.id === s.plantationId) || { name: 'ไม่พบข้อมูลแปลง', province: '' };
                                    return html`
                                        <tr key=${s.id}>
                                            <td>
                                                <div style="font-family:monospace; font-weight:600; color:var(--primary);">${s.id}</div>
                                                <div style="font-size:0.75rem; color:var(--text-muted);">${s.date.replace('T', ' ')}</div>
                                            </td>
                                            <td>
                                                <div style="font-weight:500; color:#fff; font-size:0.85rem;">จาก: ${p.name}</div>
                                                <div style="font-size:0.75rem; color:var(--text-muted);">ถึง: ${s.millName}</div>
                                            </td>
                                            <td>
                                                <div style="font-weight:700; font-size:1rem;">${s.weight}
                                                    <span style="font-weight:400; font-size:0.75rem; color:var(--text-muted);"> ตัน</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style="font-size:0.85rem;">ทะเบียน: <b>${s.truckPlate}</b> (${s.truckProvince})</div>
                                                <div style="font-size:0.75rem; color:var(--text-muted);">${s.driverName}</div>
                                            </td>
                                            <td>
                                                <span class="badge ${s.fscClaim === 'FSC 100%' ? 'badge-success' : s.fscClaim === 'FSC Mix' ? 'badge-info' : 'badge-warning'}" style="margin-bottom:4px; display:inline-flex;">
                                                    ${s.fscClaim}
                                                </span>
                                                <div style="font-size:0.7rem; font-family:monospace; color:var(--text-muted);">DN: ${s.deliveryNote}</div>
                                            </td>
                                            <td style="text-align:right;">
                                                <button class="action-btn btn-delete" title="ลบรายการขนส่งนี้" onClick=${() => onDeleteShipment(s.id)}>
                                                    <${Icon} name="trash-2" />
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// Component: EUDR Due Diligence Statement (DDS) & Report Generator
// -------------------------------------------------------------
export function DdsReport({ plantations, selectedPlantationId, setTab }) {
    const p = plantations.find(x => x.id === selectedPlantationId);

    if (!p) {
        return html`
            <div style="padding: 40px; text-align: center; color: var(--text-muted);">
                <${Icon} name="folder-open" style="font-size:3rem; margin-bottom:15px; opacity:0.3;" />
                <h3>ยังไม่ได้เลือกแปลงปลูกเพื่อดูรายงาน Due Diligence</h3>
                <p style="margin-top:10px;">กรุณาคลิกเลือกปุ่มรายงานจากหน้ารายการฐานข้อมูลแปลงปลูก</p>
                <button class="btn btn-primary" style="margin-top: 15px;" onClick=${() => setTab('plantations')}>
                    ไปที่ฐานข้อมูลแปลงปลูก
                </button>
            </div>
        `;
    }

    // Format GeoJSON structure compliant with RFC 7946 and EU TRACES standard format
    const generateGeoJson = () => {
        let geometry = {};
        if (p.geoType === 'point' && p.coords && p.coords.lat) {
            geometry = {
                type: "Point",
                coordinates: [parseFloat(p.coords.lng), parseFloat(p.coords.lat)]
            };
        } else if (p.geoType === 'polygon' && Array.isArray(p.coords) && p.coords.length > 2) {
            // GeoJSON Polygon coordinates require double array nested: [[ [lng, lat], [lng, lat], ... ]]
            // and the polygon loop must close (first and last coordinate should match).
            const coordsList = p.coords.map(c => [parseFloat(c.lng), parseFloat(c.lat)]);
            if (coordsList.length > 0) {
                // Ensure loop is closed
                const first = coordsList[0];
                const last = coordsList[coordsList.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                    coordsList.push([first[0], first[1]]);
                }
            }
            geometry = {
                type: "Polygon",
                coordinates: [coordsList]
            };
        }

        const geoJsonPayload = {
            type: "Feature",
            properties: {
                plantationId: p.id,
                plantationName: p.name,
                ownerName: p.owner,
                landTitleDeed: p.landDocNumber,
                landDocType: p.landDocType,
                areaRai: p.areaRai,
                areaHectares: p.areaHectares,
                species: p.spcName,
                plantingDate: p.plantDate,
                harvestDate: p.harvestDate,
                deforestationFreeStatus: p.deforestationFreeCheck ? "Verified Deforestation-free after 2020-12-31" : "Failed",
                legalityStatus: p.eudrCompliant ? "Fully Compliant" : "Non-Compliant",
                fscStatus: p.fscStatus,
                fscCwVerdict: p.fscCWVerdict
            },
            geometry: geometry
        };

        return JSON.stringify(geoJsonPayload, null, 2);
    };

    const handlePrint = () => {
        window.print();
    };

    const downloadGeoJson = () => {
        const fileContent = generateGeoJson();
        const blob = new Blob([fileContent], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `EUDR-DDS-${p.id}.geojson`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>รายงานตรวจสอบข้อมูลวิเคราะห์ความเสี่ยง (Due Diligence / DDS)</h1>
                    <p>รหัสอ้างอิงเอกสาร: DDS-${p.id}-${new Date().getFullYear()}</p>
                </div>
                <div style="display:flex; gap:12px;">
                    <button class="btn btn-outline" onClick=${() => setTab('plantations')}>
                        <${Icon} name="arrow-left" /> กลับหน้ารายการ
                    </button>
                    <button class="btn btn-secondary" onClick=${downloadGeoJson}>
                        <${Icon} name="download" /> ดาวน์โหลด GeoJSON
                    </button>
                    <button class="btn btn-primary" onClick=${handlePrint}>
                        <${Icon} name="printer" /> พิมพ์เอกสาร DDS
                    </button>
                </div>
            </div>

            <div class="dds-layout">
                
                <!-- Left Column: Printable Report Document (A4 Styling) -->
                <div class="printable-report">
                    <div class="report-header">
                        <div class="report-logo">
                            <h2>THAILAND FORESTRY DDS PORTAL</h2>
                            <p>FSC-STD-40-005 V3-1 & EU REGULATION 2023/1115 (EUDR) COMPLIANCE</p>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge ${p.eudrCompliant ? 'badge-success' : 'badge-danger'}" style="font-size:0.9rem; padding: 6px 14px;">
                                ${p.eudrCompliant ? 'EUDR COMPLIANT' : 'NON-COMPLIANT'}
                            </span>
                        </div>
                    </div>

                    <div class="report-title">
                        <h3>เอกสารแสดงถิ่นกำเนิดและการประเมินความถูกต้องทางกฎหมายของสินค้าไม้</h3>
                        <p style="font-size:0.8rem; color:#64748b; margin-top:2px;">(Due Diligence Statement Summary for Timber Products)</p>
                    </div>

                    <div style="border-bottom: 2px solid #0f172a; padding-bottom:4px; font-weight:700; font-size:0.9rem; color:#0f172a;">
                        ข้อมูลแหล่งกำเนิดวัตถุดิบ (Source of Origin Information)
                    </div>
                    <div class="report-grid">
                        <div class="report-item">
                            <span>รหัสแปลงทะเบียนที่ดิน / รหัสควบคุม</span>
                            ${p.id}
                        </div>
                        <div class="report-item">
                            <span>ชื่อแปลงปลูกไม้</span>
                            ${p.name}
                        </div>
                        <div class="report-item">
                            <span>ชื่อเจ้าของแปลง / ผู้ทำประโยชน์</span>
                            ${p.owner}
                        </div>
                        <div class="report-item">
                            <span>ประเภทและเลขที่เอกสารสิทธิ์ที่ดิน</span>
                            ${p.landDocType === 'Chanote' ? 'โฉนดที่ดิน (น.ส. 4)' : p.landDocType === 'NorSor3' ? 'น.ส. 3 / น.ส. 3 ก.' : p.landDocType === 'SorPorKor' ? 'ส.ป.ก. 4-01' : 'อื่น ๆ'} เลขที่ ${p.landDocNumber}
                        </div>
                        <div class="report-item">
                            <span>ที่ตั้งแปลงภูมิภาค</span>
                            ตำบล${p.subdistrict} อำเภอ${p.district} จังหวัด${p.province} (ประเทศไทย)
                        </div>
                        <div class="report-item">
                            <span>ขนาดพื้นที่เพาะปลูกรวม</span>
                            ${p.areaRai} ไร่ (${p.areaHectares} เฮกตาร์ / Hectares)
                        </div>
                    </div>

                    <div style="border-bottom: 2px solid #0f172a; padding-bottom:4px; font-weight:700; font-size:0.9rem; color:#0f172a; margin-top:10px;">
                        รายละเอียดทางพฤกษศาสตร์และผลผลิต (Product & Forestry Metrics)
                    </div>
                    <div class="report-grid">
                        <div class="report-item">
                            <span>ชนิดพืช / ชนิดไม้ (Common Name / Scientific Name)</span>
                            ยูคาลิปตัส (${p.spcName})
                        </div>
                        <div class="report-item">
                            <span>วันที่ปลูก / อายุไม้</span>
                            เริ่มปลูกเมื่อวันที่ ${p.plantDate} (อายุ ${p.treeAge} เดือน)
                        </div>
                        <div class="report-item">
                            <span>วันที่ตัดฟัน / วันที่คาดว่าจะตัดฟัน</span>
                            ${p.harvestDate}
                        </div>
                        <div class="report-item">
                            <span>ปริมาณประเมินไม้ซุงซุงที่ได้</span>
                            ${p.estVolume} ตัน (Metric Tons)
                        </div>
                    </div>

                    <div style="border-bottom: 2px solid #0f172a; padding-bottom:4px; font-weight:700; font-size:0.9rem; color:#0f172a; margin-top:10px;">
                        รายงานการปฏิบัติตามเกณฑ์ EUDR & FSC Controlled Wood
                    </div>

                    <div class="report-status-block">
                        <div class="report-status-title" style="color: ${p.eudrCompliant ? '#047857' : '#b91c1c'}">
                            1. กฎระเบียบว่าด้วยการป้องกันการตัดไม้ทำลายป่าของสหภาพยุโรป (EUDR - Regulation 2023/1115):
                        </div>
                        <ul style="margin-left: 20px; display:flex; flex-direction:column; gap:6px;">
                            <li><b>พิกัดแผนที่ Geolocation:</b> บันทึกเป็นแบบ ${p.geoType === 'point' ? `จุดกึ่งกลาง (Point) [Lat: ${p.coords ? p.coords.lat : '-'}, Lng: ${p.coords ? p.coords.lng : '-'}] เนื่องจากแปลงมีขนาดไม่เกิน 4 เฮกตาร์` : `เส้นล้อมรอบ (Polygon) จำนวน ${p.coords ? p.coords.length : 0} มุมพิกัด เนื่องจากแปลงมีขนาดใหญ่กว่า 4 เฮกตาร์`} (ความละเอียดพิกัดทศนิยม 6 ตำแหน่ง ครบถ้วน)</li>
                            <li><b>ประวัติพื้นที่ถางป่าหลังเส้นตาย (Cut-off Date 31 Dec 2020):</b> ${p.deforestationFreeCheck ? '✅ ตรวจสอบภาพถ่ายดาวเทียมย้อนหลังแล้ว ไม่มีร่องรอยการถางป่าธรรมชาติหลังปี 2020 (ผ่านเกณฑ์)' : '❌ พบร่องรอยหรือประวัติแปลงสภาพพื้นที่ป่าธรรมชาติหลังปี 2020 (ขัดต่อหลักการ EUDR)'}</li>
                            <li><b>การครอบครองที่ถูกต้องตามกฎหมายท้องถิ่น:</b> ${p.forestProtectionZoneCheck ? '✅ ที่ดินอยู่นอกเขตป่าสงวนแห่งชาติและเขตป่าอนุรักษ์ มีสิทธิ์การเก็บเกี่ยวไม้ถูกต้องตามกฎหมายไทย (ผ่านเกณฑ์)' : '❌ ที่ดินอยู่ในพื้นที่พิพาท ทับซ้อนป่าไม้ หรือขัดแย้งเชิงกฎหมาย (ตกเกณฑ์)'}</li>
                        </ul>
                    </div>

                    <div class="report-status-block">
                        <div class="report-status-title" style="color: ${p.fscCWVerdict === 'Low Risk' ? '#047857' : '#b91c1c'}">
                            2. การตรวจสอบไม้ควบคุมตามเกณฑ์ FSC Controlled Wood (FSC-STD-40-005):
                        </div>
                        <ul style="margin-left: 20px; display:flex; flex-direction:column; gap:6px;">
                            <li><b>ระดับความเสี่ยงของวัตถุดิบ (Sourcing Risk Verdict):</b> ${p.fscCWVerdict === 'Low Risk' ? '✅ ความเสี่ยงต่ำ (Low Risk) - ผ่านการประเมินความสอดคล้องตามเอกสารภาคผนวกสมาคม FSC ประเทศไทย' : '❌ ความเสี่ยงเฉพาะเจาะจง (Specified Risk) - จำเป็นต้องดำเนินมาตรการลดความเสี่ยงก่อนทำการผลิต'}</li>
                            <li><b>หมวดหมู่ความถูกต้อง 5 มิติ:</b> 
                                [1.ถูกกฎหมาย: ${p.fscSTD1?'ผ่าน':'ไม่ผ่าน'}, 
                                2.สิทธิชุมชน: ${p.fscSTD2?'ผ่าน':'ไม่ผ่าน'}, 
                                3.แหล่งนิเวศ HCV: ${p.fscSTD3?'ผ่าน':'ไม่ผ่าน'}, 
                                4.ไม่แปลงสภาพป่า: ${p.fscSTD4?'ผ่าน':'ไม่ผ่าน'}, 
                                5.ปราศจาก GMO: ${p.fscSTD5?'ผ่าน':'ไม่ผ่าน'}]
                            </li>
                        </ul>
                    </div>

                    <div class="report-footer">
                        <div>
                            ออกโดยระบบ: <b>FSC & EUDR Smart Verification System</b><br/>
                            ข้อมูลสแกนสอดคล้องกับพิกัดระบบ TRACES (EU)
                        </div>
                        <div style="text-align: right;">
                            วันที่ลงนามตรวจสอบ: <b>${new Date().toLocaleDateString('th-TH')}</b><br/>
                            ลงชื่อ: ............................................................. (ผู้ตรวจสอบความสอดคล้อง)
                        </div>
                    </div>
                </div>

                <!-- Right Column: GeoJSON Code Output -->
                <div class="geojson-panel">
                    <div class="card-header">
                        <h2><${Icon} name="file-code" /> ไฟล์ GeoJSON ส่งออกสำหรับระบบ EU TRACES</h2>
                    </div>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:15px;">
                        คัดลอกรหัส GeoJSON นี้ไปอัปโหลดเข้าสู่พอร์ทัล TRACES ของสหภาพยุโรปเพื่อยื่นแบบ Due Diligence Statement (DDS)
                    </p>
                    <pre class="json-code"><code>${generateGeoJson()}</code></pre>
                </div>

            </div>
        </div>
    `;
}
