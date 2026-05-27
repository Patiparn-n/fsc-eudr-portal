import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';

const html = htm.bind(h);

// ─── Role reference table (used by UserManagement + role badges) ─────────────
const ROLE_OPTIONS = [
    { value: 'procurement',     label: 'จัดซื้อ',           level: 1 },
    { value: 'procurement_mgr', label: 'จัดซื้อ (อาวุโส)', level: 2 },
    { value: 'fsc_staff',       label: 'FSC Staff',          level: 3 },
    { value: 'manager',         label: 'ผู้จัดการ',          level: 4 },
    { value: 'admin',           label: 'ผู้ดูแลระบบ',       level: 5 },
];
const ROLE_BADGE_COLORS = {
    admin:           { text: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.35)'    },
    manager:         { text: '#a855f7', bg: 'rgba(168,85,247,0.1)',   border: 'rgba(168,85,247,0.35)'   },
    fsc_staff:       { text: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.35)'   },
    procurement_mgr: { text: '#10b981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.35)'   },
    procurement:     { text: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)'  },
};

// Password strength validation
function validatePassword(pw) {
    if (!pw || pw.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
    if (!/[A-Z]/.test(pw)) return 'ต้องมีตัวอักษรพิมพ์ใหญ่อย่างน้อย 1 ตัว (A-Z)';
    if (!/[a-z]/.test(pw)) return 'ต้องมีตัวอักษรพิมพ์เล็กอย่างน้อย 1 ตัว (a-z)';
    if (!/[0-9]/.test(pw)) return 'ต้องมีตัวเลขอย่างน้อย 1 ตัว (0-9)';
    return '';
}

// Species list — ยูคาลิปตัสตามคู่มือ CoC Manual ของบริษัท SAAA
const SPECIES_LIST = [
    'Eucalyptus camaldulensis (ยูคาลิปตัสน้ำ)',
    'Eucalyptus urophylla (ยูคาลิปตัสใบยาว)',
    'Eucalyptus grandis',
    'Eucalyptus deglupta',
    'Eucalyptus brassiana x Eucalyptus grandis (ลูกผสม BG)',
    'Eucalyptus camaldulensis x Eucalyptus brassiana (ลูกผสม CB)',
    'Eucalyptus camaldulensis x Eucalyptus deglupta (ลูกผสม CD)',
    'Eucalyptus camaldulensis x Eucalyptus grandis (ลูกผสม CG)',
    'Eucalyptus camaldulensis x Eucalyptus pellita (ลูกผสม CP)',
    'Eucalyptus spp. (ยูคาลิปตัสชนิดอื่น)',
];

// Helper: consistent display label for a plantation record
const getPlotLabel = (p) => `${p.id} — แปลง ${p.plotCode || ''}`;

// Calculate polygon area in hectares using spherical excess formula
function calcPolygonAreaHa(coords) {
    if (!coords || coords.length < 3) return 0;
    const toRad = d => d * Math.PI / 180;
    const R = 6371000; // Earth radius metres
    let area = 0;
    const n = coords.length;
    for (let i = 0; i < n; i++) {
        const p1 = coords[i];
        const p2 = coords[(i + 1) % n];
        area += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
    }
    return parseFloat((Math.abs(area * R * R / 2) / 10000).toFixed(4));
}

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

// C3: Helper — compute current lock status for a plantation plot
// Lock period: 2 years 6 months = 912 days
function getPlotLockStatus(p) {
    if (!p || !p.lockExpiryDate) return { locked: false, daysLeft: 0 };
    const now = new Date();
    const expiry = new Date(p.lockExpiryDate);
    if (now >= expiry) return { locked: false, daysLeft: 0 };
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return { locked: true, daysLeft };
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
                            <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; width: 190px;">
                                <h4 style="margin: 0 0 4px 0; font-size:13px; font-weight:bold;">${p.id}</h4>
                                <div style="font-size:11px; color:#475569; margin-bottom:4px;">แปลง ${p.plotCode || ''} | ${p.province}</div>
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
                            <div style="color: #0f172a; font-family: sans-serif; font-size: 12px; width: 190px;">
                                <h4 style="margin: 0 0 4px 0; font-size:13px; font-weight:bold;">${p.id}</h4>
                                <div style="font-size:11px; color:#475569; margin-bottom:4px;">แปลง ${p.plotCode || ''} | ${p.province}</div>
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
export function Dashboard({ plantations, shipments, setTab, setSelectedPlantationId, pendingCount, roleLevel }) {
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
        const label = getPlotLabel(p);
        if (!p.eudrCompliant) {
            warnings.push({
                type: 'danger',
                title: `พบข้อบกพร่องด้าน EUDR: ${label}`,
                msg: `ที่ดินไม่ผ่านข้อกำหนดเนื่องจาก: ${p.eudrWarning || 'ไม่ได้ระบุเหตุผล'}`
            });
        } else if (p.fscStatus === 'FSC Controlled Wood' && p.fscCwVerdict === 'Specified Risk') {
            warnings.push({
                type: 'warning',
                title: `ประเมินความเสี่ยง FSC CW สูง: ${label}`,
                msg: `มีการประเมินในหมวดหมู่ที่มีความเสี่ยงเฉพาะ (Specified Risk) ต้องควบคุมห่วงโซ่เพิ่มเติม`
            });
        }
    });

    if (pendingCount > 0 && roleLevel >= 3) {
        warnings.unshift({
            type: 'info',
            title: `มีแปลงรอการตรวจสอบ ${pendingCount} แปลง`,
            msg: `กรุณาไปที่ "ฐานข้อมูลแปลงปลูก" เพื่ออนุมัติหรือปฏิเสธแปลงที่รอตรวจสอบ`
        });
    }

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
                            const p = plantations.find(x => x.id === s.plantationId) || { id: s.plantationId, plotCode: '??' };
                            return html`
                                <tr key=${s.id}>
                                    <td>${s.date}</td>
                                    <td>
                                        <a href="#" style="color: var(--primary); text-decoration: none;" onClick=${(e) => { e.preventDefault(); selectPlantationOnMap(s.plantationId); }}>
                                            ${getPlotLabel(p)}
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
export function PlantationForm({ plantations, onSave, onCancel, editPlantationId, currentUser }) {
    const editMode = !!editPlantationId;
    const defaultPlantation = editMode
        ? plantations.find(p => p.id === editPlantationId)
        : {
            id: '',                         // A2: user-entered 6 digits; stored as FSC-xxxxxx
            plotCode: '',
            owner: '',
            tel: '',
            subdistrict: '',
            district: '',
            province: '',
            targetMill: '',                 // B3: โรงงานปลายทาง
            areaRai: 0,
            areaHectares: 0,
            landDocType: 'Chanote',
            landDocNumber: '',
            landDocIssueDate: '',
            spcName: 'Eucalyptus camaldulensis (ยูคาลิปตัสน้ำ)',
            fmCertified: false,
            fmCertNumber: '',
            plantDate: '',
            harvestDate: '',
            estVolume: 0,
            geoType: 'point', // 'point' | 'polygon'
            coords: null,     // {lat, lng} or Array of {lat, lng}
            // B2: HCV Risk Assessment (3.1–3.6)
            hcvQ1: false,    // 3.1 อยู่ในเขตป่าสงวน? ใช่=Non-compliant
            hcvQ2: true,     // 3.2 มีเอกสารสิทธิ์? ไม่ใช่=Non-compliant
            hcvQ3: false,    // 3.3 มีพื้นที่ HCV? ใช่=Specified Risk
            hcvQ4: false,    // 3.4 มีสัตว์ป่าคุ้มครอง? ใช่=Specified Risk
            hcvQ5: false,    // 3.5 มีข้อพิพาทชุมชน? ใช่=Specified Risk
            hcvQ6: false,    // 3.6 ใช้สารเคมีต้องห้าม? ใช่=Specified Risk
            hcvQ3Note: '',
            hcvQ4Note: '',
            hcvQ5Note: '',
            hcvQ6Note: '',
            deforestationFreeCheck: true,
            forestProtectionZoneCheck: true,
            fscSTD1: true, // Legality
            fscSTD2: true, // Rights
            fscSTD3: true, // HCV (overall checkbox, informed by hcvQ1-6)
            fscSTD4: true, // Non-conversion
            fscSTD5: true, // GMO-free
            fscSTD6: true, // Labour rights
            fscSTD7: true, // No conflict timber
            docAttachmentDeed: false,
            docAttachmentOwnerID: false,
            docAttachmentSaleContract: false,
            yieldEvidenceNote: '',
            // C3: Plot reuse lock fields
            registeredAt: new Date().toISOString(),
            lastUsedDate: null,
            lockedByVesselId: null,
            lockExpiryDate: null,
            // Phase 2: Approval Workflow
            status: 'pending',
            statusNote: '',
            submittedBy: null,
            reviewedBy: null
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

            // ── FIX: กำหนด geoType จากพื้นที่ที่กรอก แต่ไม่ล้าง coords
            //    หากยังไม่มี coords จะตั้งค่า geoType และ coords ตาม threshold
            //    หากวาดพิกัดไปแล้ว จะแสดง warning เท่านั้น (ไม่ล้าง)
            const alreadyDrawn = form.geoType === 'point'
                ? !!(form.coords && form.coords.lat)
                : (Array.isArray(form.coords) && form.coords.length > 0);

            if (!alreadyDrawn) {
                // ≥ 25 ไร่ (> 4 ฮก.) → Polygon,  < 25 ไร่ → Point
                updatedForm.geoType = hec > 4 ? 'polygon' : 'point';
                updatedForm.coords = hec > 4 ? [] : null;
            }
            // ถ้าวาดแล้ว ปล่อยให้ geoType และ coords คงเดิม
            // (แสดง mismatch warning ใน UI แทน)
        }

        setForm(updatedForm);
    };

    // Callback for Map coordinate edits — auto-calculate polygon area
    // ไม่เปลี่ยน geoType ใน callback นี้ เพื่อป้องกันการ re-init แผนที่
    const handleMapCoordsChange = (newCoords) => {
        setForm(prev => {
            const update = { ...prev, coords: newCoords };
            // คำนวณพื้นที่เฉพาะเมื่อเป็น polygon และมี ≥ 3 จุด
            if (prev.geoType === 'polygon' && Array.isArray(newCoords) && newCoords.length >= 3) {
                const calcHa = calcPolygonAreaHa(newCoords);
                update.areaHectares = calcHa;
                update.areaRai = parseFloat((calcHa * 6.25).toFixed(2));
                // ไม่แตะ geoType เพื่อป้องกัน InteractiveMap re-init
            }
            return update;
        });
    };

    // Calculate dynamic values
    const treeAgeMonths = form.plantDate
        ? Math.floor((new Date() - new Date(form.plantDate)) / (1000 * 60 * 60 * 24 * 30))
        : 0;

    // ── ระบบตรวจสอบปริมาณผลผลิตคาดการณ์ ──────────────────────────
    const yieldPerRai = form.areaRai > 0 ? (parseFloat(form.estVolume) / parseFloat(form.areaRai)) : 0;
    // กรณีอายุต่ำกว่า 4 ปี (48 เดือน) ผลผลิตสูงสุดไม่ควรเกิน 25 ตัน/ไร่
    const isYoungHighYield = treeAgeMonths > 0 && treeAgeMonths < 48 && yieldPerRai > 25;

    // A1: Geo-type mismatch detection
    const expectedGeoType = form.areaHectares > 4 ? 'polygon' : 'point';
    const alreadyDrawnCheck = form.geoType === 'point'
        ? !!(form.coords && form.coords.lat)
        : (Array.isArray(form.coords) && form.coords.length > 0);
    const geoMismatch = alreadyDrawnCheck && (form.geoType !== expectedGeoType);

    // C3: Lock status for edit mode
    const editLockStatus = editMode ? getPlotLockStatus(form) : { locked: false, daysLeft: 0 };

    // B2: HCV Risk Assessment compliance
    const hcvNonCompliant = form.hcvQ1 || !form.hcvQ2;
    const hcvSpecifiedRisk = form.hcvQ3 || form.hcvQ4 || form.hcvQ5 || form.hcvQ6;

    // FSC Controlled Wood Risk Assessment Calculation (7 categories + HCV)
    const isFscCwPass = form.fscSTD1 && form.fscSTD2 && form.fscSTD3 && form.fscSTD4 && form.fscSTD5 && form.fscSTD6 && form.fscSTD7;
    const fscCwVerdict = (isFscCwPass && !hcvSpecifiedRisk && !hcvNonCompliant) ? 'Low Risk' : 'Specified Risk';

    // EUDR Overall Compliance Calculation
    // Plot must have geolocations, deforestationFreeCheck, forestProtectionZoneCheck, and pass HCV
    const hasCoordinates = form.geoType === 'point'
        ? (form.coords && form.coords.lat)
        : (Array.isArray(form.coords) && form.coords.length >= 3);

    const eudrCompliant = form.deforestationFreeCheck && form.forestProtectionZoneCheck && hasCoordinates && !hcvNonCompliant;
    const eudrWarning = hcvNonCompliant
        ? (form.hcvQ1 ? 'แปลงอยู่ในเขตป่าสงวนหรือพื้นที่คุ้มครองตามกฎหมาย (ข้อ 3.1)' : 'ที่ดินไม่มีเอกสารสิทธิ์ถูกต้องตามกฎหมาย (ข้อ 3.2)')
        : !hasCoordinates
            ? 'ยังไม่ได้กำหนดค่าพิกัดแผนที่ที่ถูกต้องตามกฎเกณฑ์ (Point/Polygon)'
            : (!form.deforestationFreeCheck ? 'พบข้อมูลการถางป่าธรรมชาติหลังเส้นตายวันที่ 31 ธ.ค. 2020' :
               (!form.forestProtectionZoneCheck ? 'แปลงที่ดินคาบเกี่ยวกับเขตพื้นที่ป่าสงวนธรรมชาติหรือป่าอนุรักษ์ตามกฎหมาย' : ''));

    // FSC status: FM Certificate = FSC 100%, else follow CW verdict
    const fscStatus = form.fmCertified
        ? 'FSC 100%'
        : (isFscCwPass ? 'FSC Controlled Wood' : 'FSC Excluded');

    const handleSubmit = (e) => {
        e.preventDefault();

        // A2: Validate Customer ID format FSC-xxxxxx (6 digits)
        if (!form.id || !/^FSC-\d{6}$/.test(form.id)) {
            alert('กรุณากรอกรหัสลูกค้า (Customer ID) ให้ครบ 6 หลักตัวเลข รูปแบบ FSC-xxxxxx');
            return;
        }

        // A1: Block submit when geo type mismatches area size
        if (geoMismatch) {
            alert(
                'รูปแบบพิกัดไม่ตรงกับขนาดพื้นที่ที่กรอก\n' +
                'กรุณาคลิกปุ่ม "รีเซ็ตพิกัด" แล้ววาดพิกัดใหม่ให้ถูกต้องก่อนบันทึก'
            );
            return;
        }

        if (!hasCoordinates) {
            alert(
                'กรุณาระบุพิกัดแปลงบนแผนที่ก่อนบันทึก\n' +
                (form.geoType === 'polygon'
                    ? 'แปลงขนาดใหญ่กว่า 25 ไร่ ต้องวาด Polygon อย่างน้อย 3 จุด'
                    : 'คลิกบนแผนที่เพื่อระบุจุด Point ของแปลง')
            );
            return;
        }

        // B2: Require detail notes for HCV Specified Risk items
        const hcvSpecItems = [
            { key: 'hcvQ3', note: 'hcvQ3Note', label: 'ข้อ 3.3 (พื้นที่ HCV)' },
            { key: 'hcvQ4', note: 'hcvQ4Note', label: 'ข้อ 3.4 (สัตว์ป่าคุ้มครอง)' },
            { key: 'hcvQ5', note: 'hcvQ5Note', label: 'ข้อ 3.5 (ข้อพิพาทชุมชน)' },
            { key: 'hcvQ6', note: 'hcvQ6Note', label: 'ข้อ 3.6 (สารเคมีต้องห้าม)' },
        ];
        for (const item of hcvSpecItems) {
            if (form[item.key] && !form[item.note].trim()) {
                alert(`${item.label}: กรุณาระบุรายละเอียดและมาตรการลดความเสี่ยงก่อนบันทึก`);
                return;
            }
        }

        // ตรวจสอบกรณีอายุต่ำกว่า 4 ปี และผลผลิตเกิน 25 ตัน/ไร่ ต้องมีหลักฐาน
        if (isYoungHighYield && !form.yieldEvidenceNote.trim()) {
            alert(
                '⚠️ ปริมาณผลผลิตที่ประเมินสูงเกินปกติสำหรับไม้อายุต่ำกว่า 4 ปี\n' +
                `(${yieldPerRai.toFixed(1)} ตัน/ไร่ เกินเกณฑ์ 25 ตัน/ไร่)\n\n` +
                'กรุณากรอกรายละเอียดและหลักฐานสนับสนุนในช่อง "เหตุผลและหลักฐานประกอบ" ก่อนบันทึก'
            );
            return;
        }

        // Phase 2: Auto-set approval status based on submitter's role
        const isNewOrRejected = !editMode || form.status === 'rejected';
        const approvalFields = {};
        if (isNewOrRejected && currentUser) {
            const submittedBy = {
                userId: currentUser.id,
                username: currentUser.username,
                fullName: currentUser.fullName,
                submittedAt: new Date().toISOString()
            };
            if (currentUser.roleLevel >= 3) {
                // FSC Staff+ auto-approves their own submission
                approvalFields.status = 'approved';
                approvalFields.statusNote = '';
                approvalFields.submittedBy = submittedBy;
                approvalFields.reviewedBy = {
                    userId: currentUser.id,
                    username: currentUser.username,
                    fullName: currentUser.fullName,
                    reviewedAt: new Date().toISOString()
                };
            } else {
                // Procurement → pending, awaiting FSC Staff review
                approvalFields.status = 'pending';
                approvalFields.statusNote = '';
                approvalFields.submittedBy = submittedBy;
                approvalFields.reviewedBy = null;
            }
        }

        const finalData = {
            ...form,
            ...approvalFields,
            treeAge: treeAgeMonths,
            fscCwVerdict,
            hcvNonCompliant,
            hcvSpecifiedRisk,
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

            ${editLockStatus.locked && html`
                <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.4);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;gap:12px;align-items:center;">
                    <span style="font-size:1.8rem;">🔒</span>
                    <div>
                        <div style="font-weight:700;color:#ef4444;font-size:0.95rem;">แปลงนี้อยู่ในช่วงล็อคการใช้งาน (Plot Reuse Lock)</div>
                        <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">
                            ผูกกับ Vessel DDS: <b style="color:#f59e0b;">${form.lockedByVesselId}</b> —
                            เหลือเวลาล็อค <b style="color:#ef4444;">${editLockStatus.daysLeft}</b> วัน
                            (หมดอายุ: ${new Date(form.lockExpiryDate).toLocaleDateString('th-TH')})
                        </div>
                    </div>
                </div>
            `}

            <form onSubmit=${handleSubmit}>
                <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; align-items: start;">
                    
                    <!-- Form input fields -->
                    <div class="form-container" style="display: flex; flex-direction: column; gap: 16px;">
                        
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="info" /> 1. ข้อมูลทั่วไปแปลงที่ดิน
                            </div>

                            <div class="form-group full-width">
                                <label>รหัสลูกค้า (Customer ID) <span style="color:var(--danger);">*</span></label>
                                <div style="display:flex; align-items:stretch;">
                                    <span style="display:flex; align-items:center; padding:0 12px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); border-right:0; border-radius:var(--radius-md) 0 0 var(--radius-md); font-family:monospace; font-weight:700; color:var(--primary); white-space:nowrap; font-size:1rem;">FSC-</span>
                                    <input
                                        type="text"
                                        class="form-control"
                                        style="border-radius:0 var(--radius-md) var(--radius-md) 0; font-family:monospace; font-size:1.1rem; letter-spacing:3px;"
                                        value=${form.id.replace('FSC-', '')}
                                        onInput=${(e) => {
                                            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                                            e.target.value = digits;
                                            setForm(f => ({ ...f, id: digits ? 'FSC-' + digits : '' }));
                                        }}
                                        placeholder="000000"
                                        maxlength="6"
                                        pattern="[0-9]{6}"
                                        required
                                        title="กรอกรหัส 6 หลักจากระบบภายในของบริษัท"
                                    />
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
                                    กรอกเลข 6 หลักจากระบบภายในบริษัท — จะแสดงผลเป็น FSC-xxxxxx
                                </div>
                            </div>

                            <div class="form-group">
                                <label>รหัสแปลงปลูก <span style="font-size:0.75rem;color:var(--text-muted);">(เลข 3 หลัก 001–999)</span></label>
                                <input
                                    type="text"
                                    class="form-control"
                                    name="plotCode"
                                    value=${form.plotCode}
                                    onChange=${handleChange}
                                    placeholder="เช่น 001"
                                    pattern="[0-9]{1,3}"
                                    maxlength="3"
                                    required
                                    style="font-family:monospace; font-size:1.1rem; letter-spacing:2px;"
                                />
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

                            <div class="form-group full-width">
                                <label>โรงงานปลายทาง (Target Mill) <span style="font-size:0.75rem; color:var(--text-muted);">(ใช้เชื่อมกับ CoC Ledger)</span></label>
                                <input type="text" class="form-control" name="targetMill" value=${form.targetMill || ''} onChange=${handleChange} placeholder="เช่น โรงงาน Double A สาขาท่าตูม / บจก.สยามเซลลูโลส" />
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

                            <!-- Geo Type Indicator — full width, locked after area entry -->
                            <div class="form-group full-width">
                                <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:var(--radius-md); border:2px solid ${form.geoType === 'polygon' ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)'}; background:${form.geoType === 'polygon' ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)'};">
                                    <${Icon} name=${form.geoType === 'polygon' ? 'pentagon' : 'map-pin'} />
                                    <div style="flex:1; font-size:0.82rem;">
                                        <b style="color:${form.geoType === 'polygon' ? 'var(--warning)' : 'var(--primary)'};">
                                            รูปแบบพิกัด EUDR: ${form.geoType === 'polygon' ? 'Map Polygon (25 ไร่ขึ้นไป)' : 'Point Geolocation (น้อยกว่า 25 ไร่)'}
                                        </b>
                                        <div style="color:var(--text-muted); margin-top:2px;">
                                            ${form.geoType === 'polygon'
                                                ? 'แปลงขนาดนี้ต้องวาดเส้นล้อมรอบ (Polygon) อย่างน้อย 3 จุดบนแผนที่ตามข้อกำหนด EUDR'
                                                : 'แปลงขนาดนี้ใช้จุด (Point) เป็นพิกัดกึ่งกลางแปลงได้ตามข้อกำหนด EUDR'}
                                        </div>
                                    </div>
                                    <span class="badge ${form.geoType === 'polygon' ? 'badge-warning' : 'badge-success'}" style="white-space:nowrap;">
                                        ${form.geoType === 'polygon' ? 'Polygon' : 'Point'}
                                    </span>
                                </div>
                            </div>

                            <!-- A1: Geo mismatch warning — shows when area crosses 25 rai threshold after coords drawn -->
                            ${geoMismatch && html`
                                <div class="form-group full-width">
                                    <div style="display:flex; flex-direction:column; gap:10px; padding:14px 16px; background:rgba(245,158,11,0.1); border:2px solid rgba(245,158,11,0.45); border-radius:var(--radius-md);">
                                        <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:var(--warning); font-size:0.9rem;">
                                            <${Icon} name="alert-triangle" /> พิกัดที่วาดไว้ไม่ตรงกับขนาดพื้นที่ปัจจุบัน
                                        </div>
                                        <p style="font-size:0.82rem; color:#fcd34d; margin:0;">
                                            พื้นที่ <b>${form.areaRai} ไร่</b> (${form.areaHectares} ฮก.) ต้องใช้รูปแบบ
                                            <b>${expectedGeoType === 'polygon' ? 'Polygon (25 ไร่ขึ้นไป)' : 'Point (น้อยกว่า 25 ไร่)'}</b>
                                            แต่ปัจจุบันวาดเป็น <b>${form.geoType === 'polygon' ? 'Polygon' : 'Point'}</b>
                                        </p>
                                        <button
                                            type="button"
                                            class="btn btn-outline"
                                            style="align-self:flex-start; border-color:rgba(245,158,11,0.5); color:var(--warning); font-size:0.82rem; padding:6px 14px;"
                                            onClick=${() => setForm(f => ({ ...f, geoType: expectedGeoType, coords: expectedGeoType === 'polygon' ? [] : null }))}
                                        >
                                            <${Icon} name="refresh-cw" /> รีเซ็ตพิกัด — เปลี่ยนเป็นโหมด ${expectedGeoType === 'polygon' ? 'Polygon' : 'Point'}
                                        </button>
                                    </div>
                                </div>
                            `}
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
                                ${form.areaRai > 0 && form.estVolume > 0 && html`
                                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; display:flex; align-items:center; gap:6px;">
                                        <${Icon} name="calculator" className="icon-sm" />
                                        ปริมาณต่อไร่: <b style="color:${isYoungHighYield ? 'var(--danger)' : 'var(--primary)'};">${yieldPerRai.toFixed(1)} ตัน/ไร่</b>
                                        ${treeAgeMonths > 0 && treeAgeMonths < 48 ? html`<span style="color:var(--text-muted);">(อายุไม้ ${(treeAgeMonths/12).toFixed(1)} ปี — เกณฑ์สูงสุด 25 ตัน/ไร่)</span>` : ''}
                                    </div>
                                `}
                            </div>

                            <!-- Yield Anomaly Warning Block -->
                            ${isYoungHighYield && html`
                                <div class="form-group full-width">
                                    <div style="padding:14px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md);">
                                        <div style="display:flex; align-items:center; gap:8px; font-weight:700; color:#f87171; margin-bottom:8px; font-size:0.9rem;">
                                            <${Icon} name="alert-triangle" /> ⚠️ ตรวจพบปริมาณผลผลิตผิดปกติ
                                        </div>
                                        <p style="font-size:0.82rem; color:#fca5a5; margin-bottom:10px;">
                                            ไม้อายุ <b>${(treeAgeMonths/12).toFixed(1)} ปี</b> (ต่ำกว่า 4 ปี) แต่ประเมินผลผลิต <b>${yieldPerRai.toFixed(1)} ตัน/ไร่</b>
                                            ซึ่งสูงกว่าเกณฑ์ตรวจสอบ <b>25 ตัน/ไร่</b> สำหรับไม้อายุน้อยกว่า 4 ปี
                                            กรุณาระบุเหตุผลและหลักฐานสนับสนุนด้านล่าง มิฉะนั้นระบบจะไม่อนุญาตให้บันทึก
                                        </p>
                                        <label style="font-size:0.82rem; font-weight:600; color:#fca5a5; display:block; margin-bottom:4px;">
                                            เหตุผลและหลักฐานประกอบ <span style="color:#ef4444;">*</span>
                                        </label>
                                        <textarea
                                            class="form-control"
                                            name="yieldEvidenceNote"
                                            rows="3"
                                            style="background:rgba(15,23,42,0.6); border-color:rgba(239,68,68,0.4); font-size:0.85rem;"
                                            placeholder="เช่น: มีใบชั่งน้ำหนักจากโรงงานอ้างอิง / ผลผลิตมาจากหลายรอบการตัดฟัน / แปลงปลูกซ้อนทับกับแปลงเดิม ฯลฯ"
                                            value=${form.yieldEvidenceNote}
                                            onChange=${handleChange}
                                        ></textarea>
                                    </div>
                                </div>
                            `}
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

                        <!-- 3. HCV Risk Assessment — แบบประเมินความเสี่ยงพื้นที่แปลงไม้ -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="shield-alert" /> 3. แบบประเมินความเสี่ยงพื้นที่แปลงไม้ (HCV Risk Assessment)
                            </div>

                            <div class="form-group full-width" style="margin-bottom:-4px;">
                                <div style="font-size:0.78rem; color:var(--text-muted); background:rgba(245,158,11,0.05); border:1px dashed rgba(245,158,11,0.25); padding:10px 12px; border-radius:var(--radius-md);">
                                    ข้อ 3.1 ตอบ "ใช่" หรือข้อ 3.2 ตอบ "ไม่ใช่" → แปลง <b style="color:var(--danger);">ไม่ผ่านเกณฑ์ (Non-Compliant)</b> |
                                    ข้อ 3.3–3.6 ตอบ "ใช่" → ระดับความเสี่ยง <b style="color:var(--warning);">Specified Risk</b> และต้องระบุมาตรการลดความเสี่ยง
                                </div>
                            </div>

                            <div class="form-group full-width">
                                <div class="checklist-container">

                                    <!-- 3.1 -->
                                    <div class="checklist-item" style="${form.hcvQ1 ? 'border:1px solid rgba(239,68,68,0.4); border-radius:var(--radius-md); background:rgba(239,68,68,0.04);' : ''}">
                                        <div class="checklist-content" style="flex:1;">
                                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                                                <div style="flex:1;">
                                                    <h5 style="color:${form.hcvQ1 ? '#f87171' : 'inherit'};">3.1 แปลงตั้งอยู่ในเขตป่าสงวนแห่งชาติ เขตรักษาพันธุ์สัตว์ป่า อุทยานแห่งชาติ หรือพื้นที่คุ้มครองตามกฎหมาย?</h5>
                                                    <p style="color:${form.hcvQ1 ? '#fca5a5' : 'var(--text-muted)'}; font-size:0.78rem;">ตอบ "ใช่" → แปลงไม่ผ่านเกณฑ์ EUDR และ FSC (Non-Compliant)</p>
                                                </div>
                                                <div style="display:flex; gap:16px; flex-shrink:0; align-items:center; padding-top:4px;">
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${!form.hcvQ1 ? 'var(--primary)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ1r" checked=${!form.hcvQ1} onChange=${() => setForm(f => ({...f, hcvQ1: false}))} /> ไม่ใช่
                                                    </label>
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${form.hcvQ1 ? 'var(--danger)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ1r" checked=${form.hcvQ1} onChange=${() => setForm(f => ({...f, hcvQ1: true}))} /> ใช่
                                                    </label>
                                                </div>
                                            </div>
                                            ${form.hcvQ1 && html`
                                                <div style="margin-top:8px; padding:8px 12px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:6px; font-size:0.8rem; color:#f87171;">
                                                    ❌ แปลงนี้ไม่ผ่านเกณฑ์ — ต้องตรวจสอบและแก้ไขเอกสารสิทธิ์ก่อนดำเนินการ
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- 3.2 -->
                                    <div class="checklist-item" style="${!form.hcvQ2 ? 'border:1px solid rgba(239,68,68,0.4); border-radius:var(--radius-md); background:rgba(239,68,68,0.04);' : ''}">
                                        <div class="checklist-content" style="flex:1;">
                                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                                                <div style="flex:1;">
                                                    <h5 style="color:${!form.hcvQ2 ? '#f87171' : 'inherit'};">3.2 ที่ดินมีเอกสารสิทธิ์หรือสิทธิ์ครอบครองถูกต้องตามกฎหมายไทย?</h5>
                                                    <p style="color:${!form.hcvQ2 ? '#fca5a5' : 'var(--text-muted)'}; font-size:0.78rem;">ตอบ "ไม่ใช่" → แปลงไม่ผ่านเกณฑ์ (Non-Compliant) ต้องดำเนินการจัดทำเอกสารสิทธิ์ก่อน</p>
                                                </div>
                                                <div style="display:flex; gap:16px; flex-shrink:0; align-items:center; padding-top:4px;">
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${!form.hcvQ2 ? 'var(--danger)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ2r" checked=${!form.hcvQ2} onChange=${() => setForm(f => ({...f, hcvQ2: false}))} /> ไม่ใช่
                                                    </label>
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${form.hcvQ2 ? 'var(--primary)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ2r" checked=${form.hcvQ2} onChange=${() => setForm(f => ({...f, hcvQ2: true}))} /> ใช่
                                                    </label>
                                                </div>
                                            </div>
                                            ${!form.hcvQ2 && html`
                                                <div style="margin-top:8px; padding:8px 12px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:6px; font-size:0.8rem; color:#f87171;">
                                                    ❌ แปลงนี้ไม่ผ่านเกณฑ์ — ต้องมีเอกสารสิทธิ์ (โฉนด/น.ส.3/ส.ป.ก. หรือเทียบเท่า)
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- 3.3 -->
                                    <div class="checklist-item" style="${form.hcvQ3 ? 'border:1px solid rgba(245,158,11,0.4); border-radius:var(--radius-md); background:rgba(245,158,11,0.04);' : ''}">
                                        <div class="checklist-content" style="flex:1;">
                                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                                                <div style="flex:1;">
                                                    <h5 style="color:${form.hcvQ3 ? 'var(--warning)' : 'inherit'};">3.3 มีพื้นที่ที่มีคุณค่าการอนุรักษ์สูง (HCV) อยู่ภายในหรือติดกับแปลงปลูก?</h5>
                                                    <p style="color:var(--text-muted); font-size:0.78rem;">เช่น พื้นที่ชุ่มน้ำ ป่าริมน้ำ แหล่งที่อยู่อาศัยของสัตว์หายาก หรือพืชที่มีคุณค่าต่อระบบนิเวศ</p>
                                                </div>
                                                <div style="display:flex; gap:16px; flex-shrink:0; align-items:center; padding-top:4px;">
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${!form.hcvQ3 ? 'var(--primary)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ3r" checked=${!form.hcvQ3} onChange=${() => setForm(f => ({...f, hcvQ3: false, hcvQ3Note: ''}))} /> ไม่ใช่
                                                    </label>
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${form.hcvQ3 ? 'var(--warning)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ3r" checked=${form.hcvQ3} onChange=${() => setForm(f => ({...f, hcvQ3: true}))} /> ใช่
                                                    </label>
                                                </div>
                                            </div>
                                            ${form.hcvQ3 && html`
                                                <div style="margin-top:8px;">
                                                    <label style="font-size:0.8rem; font-weight:600; color:var(--warning); display:block; margin-bottom:4px;">มาตรการลดความเสี่ยงและรายละเอียด (Specified Risk) <span style="color:var(--danger);">*</span></label>
                                                    <textarea class="form-control" name="hcvQ3Note" rows="2" style="font-size:0.82rem;" placeholder="ระบุมาตรการที่ดำเนินการเพื่อปกป้องพื้นที่ HCV เช่น กันชนระยะ 50 ม. ไม่ใช้สารเคมีในพื้นที่ติดกัน ฯลฯ" value=${form.hcvQ3Note || ''} onChange=${handleChange}></textarea>
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- 3.4 -->
                                    <div class="checklist-item" style="${form.hcvQ4 ? 'border:1px solid rgba(245,158,11,0.4); border-radius:var(--radius-md); background:rgba(245,158,11,0.04);' : ''}">
                                        <div class="checklist-content" style="flex:1;">
                                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                                                <div style="flex:1;">
                                                    <h5 style="color:${form.hcvQ4 ? 'var(--warning)' : 'inherit'};">3.4 มีสัตว์ป่าคุ้มครองหรือพืชพรรณหายากตามบัญชี IUCN หรือกฎหมายไทยพบในพื้นที่?</h5>
                                                    <p style="color:var(--text-muted); font-size:0.78rem;">ตรวจสอบจากฐานข้อมูลกรมอุทยานแห่งชาติ สัตว์ป่าและพันธุ์พืช หรือผลสำรวจภาคสนาม</p>
                                                </div>
                                                <div style="display:flex; gap:16px; flex-shrink:0; align-items:center; padding-top:4px;">
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${!form.hcvQ4 ? 'var(--primary)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ4r" checked=${!form.hcvQ4} onChange=${() => setForm(f => ({...f, hcvQ4: false, hcvQ4Note: ''}))} /> ไม่ใช่
                                                    </label>
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${form.hcvQ4 ? 'var(--warning)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ4r" checked=${form.hcvQ4} onChange=${() => setForm(f => ({...f, hcvQ4: true}))} /> ใช่
                                                    </label>
                                                </div>
                                            </div>
                                            ${form.hcvQ4 && html`
                                                <div style="margin-top:8px;">
                                                    <label style="font-size:0.8rem; font-weight:600; color:var(--warning); display:block; margin-bottom:4px;">มาตรการลดความเสี่ยงและรายละเอียด <span style="color:var(--danger);">*</span></label>
                                                    <textarea class="form-control" name="hcvQ4Note" rows="2" style="font-size:0.82rem;" placeholder="ระบุชนิดสัตว์/พืช มาตรการอนุรักษ์ที่ดำเนินการ เช่น ไม่ล่าสัตว์ รักษาพื้นที่อยู่อาศัย ฯลฯ" value=${form.hcvQ4Note || ''} onChange=${handleChange}></textarea>
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- 3.5 -->
                                    <div class="checklist-item" style="${form.hcvQ5 ? 'border:1px solid rgba(245,158,11,0.4); border-radius:var(--radius-md); background:rgba(245,158,11,0.04);' : ''}">
                                        <div class="checklist-content" style="flex:1;">
                                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                                                <div style="flex:1;">
                                                    <h5 style="color:${form.hcvQ5 ? 'var(--warning)' : 'inherit'};">3.5 มีข้อพิพาทหรือร้องเรียนจากชุมชนท้องถิ่นหรือชนเผ่าพื้นเมืองเกี่ยวกับสิทธิ์ที่ดิน?</h5>
                                                    <p style="color:var(--text-muted); font-size:0.78rem;">รวมถึงการใช้ที่ดินตามสิทธิ์ดั้งเดิม วิถีชีวิต หรือแหล่งทรัพยากรที่ชุมชนพึ่งพา</p>
                                                </div>
                                                <div style="display:flex; gap:16px; flex-shrink:0; align-items:center; padding-top:4px;">
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${!form.hcvQ5 ? 'var(--primary)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ5r" checked=${!form.hcvQ5} onChange=${() => setForm(f => ({...f, hcvQ5: false, hcvQ5Note: ''}))} /> ไม่ใช่
                                                    </label>
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${form.hcvQ5 ? 'var(--warning)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ5r" checked=${form.hcvQ5} onChange=${() => setForm(f => ({...f, hcvQ5: true}))} /> ใช่
                                                    </label>
                                                </div>
                                            </div>
                                            ${form.hcvQ5 && html`
                                                <div style="margin-top:8px;">
                                                    <label style="font-size:0.8rem; font-weight:600; color:var(--warning); display:block; margin-bottom:4px;">รายละเอียดข้อพิพาทและมาตรการแก้ไข <span style="color:var(--danger);">*</span></label>
                                                    <textarea class="form-control" name="hcvQ5Note" rows="2" style="font-size:0.82rem;" placeholder="ระบุลักษณะข้อพิพาท มาตรการที่ดำเนินการ เช่น ทำบันทึกข้อตกลงชุมชน รับฟังความคิดเห็น ฯลฯ" value=${form.hcvQ5Note || ''} onChange=${handleChange}></textarea>
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- 3.6 -->
                                    <div class="checklist-item" style="${form.hcvQ6 ? 'border:1px solid rgba(245,158,11,0.4); border-radius:var(--radius-md); background:rgba(245,158,11,0.04);' : ''}">
                                        <div class="checklist-content" style="flex:1;">
                                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                                                <div style="flex:1;">
                                                    <h5 style="color:${form.hcvQ6 ? 'var(--warning)' : 'inherit'};">3.6 มีการใช้สารเคมีที่อยู่ในรายการต้องห้ามตาม FSC Pesticides Policy (FSC-POL-30-001) ในพื้นที่?</h5>
                                                    <p style="color:var(--text-muted); font-size:0.78rem;">ตรวจสอบรายการสารเคมีต้องห้ามจาก FSC Hazardous Pesticides List ก่อนตอบ</p>
                                                </div>
                                                <div style="display:flex; gap:16px; flex-shrink:0; align-items:center; padding-top:4px;">
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${!form.hcvQ6 ? 'var(--primary)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ6r" checked=${!form.hcvQ6} onChange=${() => setForm(f => ({...f, hcvQ6: false, hcvQ6Note: ''}))} /> ไม่ใช่
                                                    </label>
                                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85rem; color:${form.hcvQ6 ? 'var(--warning)' : 'var(--text-muted)'}; white-space:nowrap;">
                                                        <input type="radio" name="hcvQ6r" checked=${form.hcvQ6} onChange=${() => setForm(f => ({...f, hcvQ6: true}))} /> ใช่
                                                    </label>
                                                </div>
                                            </div>
                                            ${form.hcvQ6 && html`
                                                <div style="margin-top:8px;">
                                                    <label style="font-size:0.8rem; font-weight:600; color:var(--warning); display:block; margin-bottom:4px;">รายชื่อสารเคมีและมาตรการทดแทน <span style="color:var(--danger);">*</span></label>
                                                    <textarea class="form-control" name="hcvQ6Note" rows="2" style="font-size:0.82rem;" placeholder="ระบุชื่อสารเคมี เหตุผลที่ต้องใช้ และแผนการเปลี่ยนเป็นสารทดแทนที่ได้รับอนุญาต" value=${form.hcvQ6Note || ''} onChange=${handleChange}></textarea>
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                </div>

                                ${(hcvNonCompliant || hcvSpecifiedRisk) && html`
                                    <div style="margin-top:10px; padding:10px 14px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:var(--radius-md); font-size:0.8rem;">
                                        ${hcvNonCompliant && html`<div style="color:#f87171; font-weight:700; margin-bottom:4px;">❌ ผลการประเมิน HCV: ไม่ผ่านเกณฑ์ (Non-Compliant) — แปลงนี้ไม่สามารถนำเข้าสู่ห่วงโซ่ FSC/EUDR ได้ จนกว่าจะแก้ไขให้ผ่านเกณฑ์</div>`}
                                        ${!hcvNonCompliant && hcvSpecifiedRisk && html`<div style="color:#fcd34d; font-weight:700;">⚠️ ผลการประเมิน HCV: Specified Risk — ต้องมีมาตรการลดความเสี่ยงที่ชัดเจนก่อนออก FSC Claim</div>`}
                                    </div>
                                `}
                                ${!hcvNonCompliant && !hcvSpecifiedRisk && html`
                                    <div style="margin-top:10px; padding:8px 14px; background:rgba(16,185,129,0.07); border:1px solid rgba(16,185,129,0.25); border-radius:var(--radius-md); font-size:0.8rem; color:var(--primary);">
                                        ✅ ผลการประเมิน HCV: Low Risk — แปลงผ่านการประเมินความเสี่ยงพื้นที่ทุกข้อ
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 4. EUDR Compliance Status Checklist -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="shield-check" /> 4. การประเมินความสอดคล้องด้าน EUDR (EU Deforestation Regulation)
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

                        <!-- 5. FSC Controlled Wood Risk Self-Assessment (7 categories) -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="check-square" /> 5. การประเมินตนเองตามเอกสารประเมินความเสี่ยงแปลง (FSC-STD-40-005 V3-1)
                            </div>
                            <div class="form-group full-width" style="margin-bottom:-4px;">
                                <div style="font-size:0.78rem; color:var(--text-muted); background:rgba(59,130,246,0.05); border:1px dashed rgba(59,130,246,0.2); padding:10px 12px; border-radius:var(--radius-md);">
                                    ทำเครื่องหมาย ✓ ในทุกหมวดหมู่ที่ผ่านการประเมิน — หากไม่ผ่านแม้แต่หมวดหมู่เดียว ระดับความเสี่ยง FSC CW จะเป็น <b style="color:var(--warning);">Specified Risk</b> และต้องดำเนินมาตรการลดความเสี่ยงก่อนออก FSC Claim
                                </div>
                            </div>

                            <div class="form-group full-width">
                                <div class="checklist-container">
                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD1" checked=${form.fscSTD1} onChange=${handleChange} id="cw1" />
                                        <div class="checklist-content">
                                            <label for="cw1" style="cursor:pointer; display:block;">
                                                <h5>หมวดที่ 1 — ความถูกต้องตามกฎหมายในการตัดฟันและขายไม้</h5>
                                            </label>
                                            <p>เจ้าของแปลงมีเอกสารสิทธิ์ที่ดินถูกต้องตามกฎหมาย (โฉนด/น.ส.3/ส.ป.ก.) มีสิทธิ์ทำประโยชน์จากที่ดิน และมีใบอนุญาตหรือหนังสือแจ้งการตัดฟันถูกต้องตามพระราชบัญญัติป่าไม้ พ.ศ. 2484 (กรณีไม้ควบคุม)</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD2" checked=${form.fscSTD2} onChange=${handleChange} id="cw2" />
                                        <div class="checklist-content">
                                            <label for="cw2" style="cursor:pointer; display:block;">
                                                <h5>หมวดที่ 2 — สิทธิ์ชุมชน สิทธิ์ดั้งเดิม และสิทธิมนุษยชน</h5>
                                            </label>
                                            <p>ไม่มีข้อพิพาทเรื่องสิทธิ์ที่ดินกับชุมชนท้องถิ่นหรือชนเผ่าพื้นเมือง ไม่มีการบังคับยึดที่ดินโดยไม่ยินยอม และไม่มีการละเมิดสิทธิมนุษยชนในกระบวนการดูแลสวนป่า</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD3" checked=${form.fscSTD3} onChange=${handleChange} id="cw3" />
                                        <div class="checklist-content">
                                            <label for="cw3" style="cursor:pointer; display:block;">
                                                <h5>หมวดที่ 3 — ไม่คุกคามพื้นที่คุณค่าการอนุรักษ์สูง (High Conservation Value)</h5>
                                            </label>
                                            <p>แปลงปลูกไม่ตั้งอยู่ในหรือติดกับพื้นที่ป่าอนุรักษ์ เขตรักษาพันธุ์สัตว์ป่า อุทยานแห่งชาติ หรือแหล่งที่อยู่อาศัยของสัตว์ใกล้สูญพันธุ์ตามกฎหมาย IUCN</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD4" checked=${form.fscSTD4} onChange=${handleChange} id="cw4" />
                                        <div class="checklist-content">
                                            <label for="cw4" style="cursor:pointer; display:block;">
                                                <h5>หมวดที่ 4 — ไม่เป็นพื้นที่แปลงสภาพจากป่าธรรมชาติ (Non-Conversion)</h5>
                                            </label>
                                            <p>ที่ดินนี้ไม่ใช่พื้นที่ป่าธรรมชาติที่ถูกบุกรุกเพื่อเปลี่ยนเป็นสวนปลูกไม้หลังปี ค.ศ. 1994 ตรวจสอบจากภาพดาวเทียมและแผนที่ forest baseline ย้อนหลัง 30 ปีแล้ว</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD5" checked=${form.fscSTD5} onChange=${handleChange} id="cw5" />
                                        <div class="checklist-content">
                                            <label for="cw5" style="cursor:pointer; display:block;">
                                                <h5>หมวดที่ 5 — ปราศจากพันธุ์ไม้ดัดแปลงพันธุกรรม (No GMO Trees)</h5>
                                            </label>
                                            <p>ยืนยันว่าไม้ที่ปลูกในแปลงนี้ไม่ได้มาจากพันธุ์ที่ผ่านการดัดแปลงพันธุกรรม (Genetically Modified Organisms) ตามคำนิยาม FSC Policy on GMOs (FSC-POL-30-001)</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD6" checked=${form.fscSTD6} onChange=${handleChange} id="cw6" />
                                        <div class="checklist-content">
                                            <label for="cw6" style="cursor:pointer; display:block;">
                                                <h5>หมวดที่ 6 — มาตรฐานแรงงานและสิทธิมนุษยชนขั้นพื้นฐาน (Core Labour Standards)</h5>
                                            </label>
                                            <p>ไม่มีการใช้แรงงานเด็ก แรงงานบังคับ หรือแรงงานผิดกฎหมายในกระบวนการปลูก ดูแล หรือตัดฟันในแปลงนี้ แรงงานทุกคนได้รับค่าแรงขั้นต่ำตามกฎหมายและมีสัญญาจ้างงานถูกต้อง</p>
                                        </div>
                                    </div>

                                    <div class="checklist-item">
                                        <input type="checkbox" class="checklist-checkbox" name="fscSTD7" checked=${form.fscSTD7} onChange=${handleChange} id="cw7" />
                                        <div class="checklist-content">
                                            <label for="cw7" style="cursor:pointer; display:block;">
                                                <h5>หมวดที่ 7 — ไม่ใช่ไม้จากพื้นที่ขัดแย้งทางอาวุธ (No Conflict Timber)</h5>
                                            </label>
                                            <p>ไม้จากแปลงนี้ไม่ได้มาจากพื้นที่ที่มีความขัดแย้งทางอาวุธ ไม่ถูกนำไปใช้สนับสนุนกลุ่มติดอาวุธหรือฝ่ายที่ขัดต่อกฎหมายระหว่างประเทศตามนิยามของ FSC และ UN Security Council</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 6. Verification Document Attachment Uploads -->
                        <div class="form-grid">
                            <div class="form-section-title">
                                <${Icon} name="paperclip" /> 6. แนบเอกสารสิทธิ์ประกอบระบบ DDS
                            </div>

                            <div class="form-group">
                                <label>สำเนาเอกสารสิทธิ์ที่ดิน (โฉนด/น.ส.3/ส.ป.ก./อื่นๆ)</label>
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <input type="file" style="display:none;" id="fileDeed" onChange=${() => setForm(f => ({ ...f, docAttachmentDeed: true }))} />
                                    <label for="fileDeed" class="btn btn-outline" style="font-size:0.8rem; margin:0; flex-grow:1; text-align:center;">
                                        <${Icon} name="upload" className="icon-sm" /> ${form.docAttachmentDeed ? 'อัปโหลดเรียบร้อย ✓' : 'เลือกไฟล์ภาพ/PDF'}
                                    </label>
                                    ${form.docAttachmentDeed && html`
                                        <span class="badge badge-success"><${Icon} name="check" /></span>
                                    `}
                                </div>
                            </div>

                            <div class="form-group">
                                <label>สำเนาบัตรประชาชนผู้ถือกรรมสิทธิ์ / สัญญาซื้อขายไม้</label>
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <input type="file" style="display:none;" id="fileID" onChange=${() => setForm(f => ({ ...f, docAttachmentOwnerID: true }))} />
                                    <label for="fileID" class="btn btn-outline" style="font-size:0.8rem; margin:0; flex-grow:1; text-align:center;">
                                        <${Icon} name="upload" className="icon-sm" /> ${form.docAttachmentOwnerID ? 'อัปโหลดเรียบร้อย ✓' : 'เลือกไฟล์ภาพ/PDF'}
                                    </label>
                                    ${form.docAttachmentOwnerID && html`
                                        <span class="badge badge-success"><${Icon} name="check" /></span>
                                    `}
                                </div>
                            </div>

                            <div class="form-group">
                                <label>สัญญาซื้อขายไม้ (ถ้ามี)</label>
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <input type="file" style="display:none;" id="fileSaleContract" onChange=${() => setForm(f => ({ ...f, docAttachmentSaleContract: true }))} />
                                    <label for="fileSaleContract" class="btn btn-outline" style="font-size:0.8rem; margin:0; flex-grow:1; text-align:center;">
                                        <${Icon} name="upload" className="icon-sm" /> ${form.docAttachmentSaleContract ? 'อัปโหลดเรียบร้อย ✓' : 'เลือกไฟล์ภาพ/PDF'}
                                    </label>
                                    ${form.docAttachmentSaleContract && html`
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
                                    <span class="badge ${form.geoType === 'polygon' ? 'badge-warning' : 'badge-success'}" style="margin-left:8px; font-size:0.7rem;">
                                        ${form.geoType === 'polygon' ? '🔷 Polygon Mode' : '📍 Point Mode'}
                                    </span>
                                </h2>
                            </div>

                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                                <${Icon} name="info" className="icon-sm" />
                                ${form.geoType === 'polygon'
                                    ? html`แปลง <b>${form.areaRai} ไร่</b> ≥ 25 ไร่ → ต้องวาดเส้นล้อมรอบ <b>Polygon</b> อย่างน้อย 3 จุด (คลิกบนแผนที่เพื่อเพิ่มจุด ยิ่งมากจุด ยิ่งแม่นยำ)`
                                    : html`แปลง <b>${form.areaRai} ไร่</b> (น้อยกว่า 25 ไร่) → ใช้ <b>Point</b> คลิก 1 จุดที่กึ่งกลางแปลง`
                                }
                            </p>

                            <!-- Leaflet Map Integration — type ล็อกจาก geoType เพื่อป้องกัน re-init -->
                            <${InteractiveMap}
                                mode="edit"
                                type=${form.geoType}
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
                                        ${Array.isArray(form.coords) && form.coords.length >= 3 ? html`
                                            <div style="margin-top:6px; padding:6px 10px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:6px;">
                                                <${Icon} name="ruler" className="icon-sm" /> <b style="color:var(--primary)">พื้นที่คำนวณจาก Polygon:</b><br/>
                                                <span style="font-size:1rem; font-weight:700; color:#10b981;">
                                                    ${calcPolygonAreaHa(form.coords)} ฮก. = ${(calcPolygonAreaHa(form.coords) * 6.25).toFixed(2)} ไร่
                                                </span>
                                                <span style="font-size:0.7rem; color:var(--text-muted); display:block; margin-top:2px;">(อัพเดทช่องพื้นที่แปลงให้อัตโนมัติ)</span>
                                            </div>
                                        ` : ''}
                                        <div style="max-height: 80px; overflow-y: auto; font-family: monospace; font-size: 0.75rem; margin-top:6px;">
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

export function PlantationList({ plantations, onDelete, onEdit, setTab, setSelectedPlantationId, currentUser, onApprove, onReject }) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);

    const roleLevel = currentUser ? (currentUser.roleLevel || 1) : 1;

    const handleRejectPrompt = (id) => {
        const reason = window.prompt('ระบุเหตุผลในการปฏิเสธแปลงนี้:');
        if (reason !== null && onReject) {
            onReject(id, reason.trim() || 'ไม่ระบุเหตุผล');
        }
    };

    const filtered = plantations.filter(p => {
        const q = search.toLowerCase();
        const matchText = !q ||
            (p.plotCode || '').toLowerCase().includes(q) ||
            p.owner.toLowerCase().includes(q) ||
            p.province.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q);
        const matchStatus =
            statusFilter === 'all' ? true :
            statusFilter === 'compliant' ? p.eudrCompliant :
            statusFilter === 'non-compliant' ? !p.eudrCompliant :
            statusFilter === 'fsc100' ? p.fscStatus === 'FSC 100%' :
            statusFilter === 'cw' ? p.fscStatus === 'FSC Controlled Wood' :
            statusFilter === 'pending' ? p.status === 'pending' :
            statusFilter === 'approved-status' ? (!p.status || p.status === 'approved') :
            statusFilter === 'rejected' ? p.status === 'rejected' : true;
        return matchText && matchStatus;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PLT_PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PLT_PAGE_SIZE, page * PLT_PAGE_SIZE);

    // C3: Pre-compute lock status for displayed rows
    const lockStatuses = Object.fromEntries(paginated.map(p => [p.id, getPlotLockStatus(p)]));

    const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };
    const handleFilter = (e) => { setStatusFilter(e.target.value); setPage(1); };

    const handleExportCsv = () => {
        exportToCsv(
            `plantations-${new Date().toISOString().slice(0, 10)}.csv`,
            ['รหัสลูกค้า', 'รหัสแปลง', 'เจ้าของ', 'โทรศัพท์', 'จังหวัด', 'อำเภอ', 'ตำบล',
             'ประเภทเอกสาร', 'เลขที่เอกสาร', 'พื้นที่(ไร่)', 'พื้นที่(ฮก.)',
             'ชนิดไม้', 'FM Cert', 'วันปลูก', 'วันตัดฟัน', 'ปริมาณ(ตัน)',
             'FSC สถานะ', 'EUDR สถานะ', 'หมายเหตุ EUDR'],
            filtered.map(p => [
                p.id, p.plotCode || '', p.owner, p.tel, p.province, p.district, p.subdistrict,
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
                            placeholder="ค้นหารหัสลูกค้า, รหัสแปลง, เจ้าของ, จังหวัด..."
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
                            <option value="pending">⏳ รอตรวจสอบ</option>
                            <option value="approved-status">✅ อนุมัติแล้ว</option>
                            <option value="rejected">❌ ปฏิเสธ</option>
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
                                <th>รหัสลูกค้า / แปลง</th>
                                <th>เจ้าของ / จังหวัด</th>
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
                                    <td>
                                        <code style="font-size:0.8rem;">${p.id}</code>
                                        <div style="font-size:0.8rem; font-weight:700; color:var(--primary); margin-top:2px; font-family:monospace;">แปลง ${p.plotCode || '-'}</div>
                                    </td>
                                    <td>
                                        <div style="font-weight:600; color:#fff;">${p.owner}</div>
                                        <div style="font-size:0.75rem; color:var(--text-muted);">${p.province} | โทร. ${p.tel}</div>
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
                                        ${lockStatuses[p.id] && lockStatuses[p.id].locked && html`
                                            <div style="font-size:0.7rem;color:#ef4444;margin-top:3px;font-weight:600;">
                                                🔒 ล็อค ${lockStatuses[p.id].daysLeft} วัน
                                            </div>
                                        `}
                                        ${p.status === 'pending' && html`<div style="font-size:0.7rem;color:#f59e0b;margin-top:3px;font-weight:600;">⏳ รอตรวจสอบ</div>`}
                                        ${p.status === 'rejected' && html`<div style="font-size:0.7rem;color:#ef4444;margin-top:3px;font-weight:600;">❌ ปฏิเสธ${p.statusNote ? ': ' + p.statusNote : ''}</div>`}
                                    </td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                                            ${roleLevel >= 3 && p.status === 'pending' && html`
                                                <button class="action-btn" style="color:#10b981;border-color:rgba(16,185,129,0.4);" title="อนุมัติ" onClick=${() => onApprove(p.id)}>
                                                    <${Icon} name="check" />
                                                </button>
                                                <button class="action-btn" style="color:#ef4444;border-color:rgba(239,68,68,0.4);" title="ปฏิเสธ" onClick=${() => handleRejectPrompt(p.id)}>
                                                    <${Icon} name="x" />
                                                </button>
                                            `}
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
        deliveryNote: '',   // A7: user-entered DO number from internal system
        millName: '',
        fscClaim: 'FSC Controlled Wood'
    });

    const activePlantations = plantations.filter(p => p.eudrCompliant && (!p.status || p.status === 'approved'));

    const filteredShipments = search.trim()
        ? shipments.filter(s => {
            const p = plantations.find(x => x.id === s.plantationId);
            const q = search.toLowerCase();
            return s.id.toLowerCase().includes(q) ||
                s.millName.toLowerCase().includes(q) ||
                s.truckPlate.toLowerCase().includes(q) ||
                (p && (p.id.toLowerCase().includes(q) || (p.plotCode || '').toLowerCase().includes(q)));
        })
        : shipments;

    const handleSelectPlantation = (e) => {
        const pId = e.target.value;
        const p = plantations.find(x => x.id === pId);
        setForm(f => ({
            ...f,
            plantationId: pId,
            fscClaim: p ? p.fscStatus : 'FSC Controlled Wood',
            // B3: auto-fill Target Mill from plantation record
            millName: (p && p.targetMill) ? p.targetMill : f.millName
        }));
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
            deliveryNote: '',   // A7: reset to empty for next entry
            millName: '',
            fscClaim: 'FSC Controlled Wood'
        });
    };

    const handleExportCsv = () => {
        exportToCsv(
            `coc-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
            ['รหัส CoC', 'วันเวลา', 'รหัสลูกค้า', 'รหัสแปลง', 'จังหวัดต้นทาง', 'โรงงานปลายทาง',
             'น้ำหนัก(ตัน)', 'ทะเบียนรถ', 'จังหวัดรถ', 'คนขับ', 'เลขใบอนุญาต',
             'ใบนำส่ง', 'ใบชั่งน้ำหนัก', 'FSC Claim'],
            filteredShipments.map(s => {
                const p = plantations.find(x => x.id === s.plantationId);
                return [
                    s.id, s.date.replace('T', ' '),
                    p ? p.id : s.plantationId, p ? (p.plotCode || '') : '', p ? p.province : '',
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
                                    <option key=${p.id} value=${p.id}>${p.id} — แปลง ${p.plotCode || ''} (${p.province}) — ${p.owner}</option>
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
                                <label>หมายเลข DO <span style="font-size:0.75rem; color:var(--text-muted);">(จากระบบภายใน)</span></label>
                                <input
                                    type="text"
                                    class="form-control"
                                    name="deliveryNote"
                                    value=${form.deliveryNote}
                                    onChange=${handleChange}
                                    placeholder="เช่น DO-12345"
                                    style="font-family:monospace;"
                                    required
                                />
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
                                    const p = plantations.find(x => x.id === s.plantationId) || { id: s.plantationId, plotCode: '??', province: '' };
                                    return html`
                                        <tr key=${s.id}>
                                            <td>
                                                <div style="font-family:monospace; font-weight:600; color:var(--primary);">${s.id}</div>
                                                <div style="font-size:0.75rem; color:var(--text-muted);">${s.date.replace('T', ' ')}</div>
                                            </td>
                                            <td>
                                                <div style="font-weight:500; color:#fff; font-size:0.85rem;">จาก: ${getPlotLabel(p)}</div>
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
                                                <div style="font-size:0.7rem; font-family:monospace; color:var(--text-muted);">DO: ${s.deliveryNote || '-'}</div>
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
// Component: ใบนำส่งไม้ ตามข้อกำหนดกรมป่าไม้
// -------------------------------------------------------------
export function TimberDeliveryNote({ shipments, plantations }) {
    const [selectedShipmentId, setSelectedShipmentId] = useState(shipments.length > 0 ? shipments[shipments.length - 1].id : '');
    const [companyName, setCompanyName] = useState('บริษัท สยามอะโกรฟอเรสทรี จำกัด (SAAA)');
    const [companyAddress, setCompanyAddress] = useState('');
    const [officerName, setOfficerName] = useState('');

    const s = shipments.find(x => x.id === selectedShipmentId);
    const p = s ? plantations.find(x => x.id === s.plantationId) : null;

    const handlePrint = () => window.print();

    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const issueDate = s ? new Date(s.date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : today;

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>ใบนำส่งไม้ (กรมป่าไม้)</h1>
                    <p>สร้างและพิมพ์ใบนำส่งไม้ตามข้อกำหนดพระราชบัญญัติป่าไม้ พ.ศ. 2484 และมาตรฐาน FSC CoC</p>
                </div>
                <button class="btn btn-primary" onClick=${handlePrint}>
                    <${Icon} name="printer" /> พิมพ์ใบนำส่งไม้
                </button>
            </div>

            <div class="doc-print-layout" style="display:grid; grid-template-columns:320px 1fr; gap:24px; align-items:start;">

                <!-- Left: Selection & Company Info (print-hide: ซ่อนตอนพิมพ์) -->
                <div class="form-container print-hide" style="display:flex; flex-direction:column; gap:16px;">
                    <div style="font-size:1rem; font-weight:700; color:var(--primary); padding-bottom:8px; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:8px;">
                        <${Icon} name="settings" /> ตั้งค่าใบนำส่ง
                    </div>

                    <div class="form-group">
                        <label>เลือกรายการขนส่ง (CoC)</label>
                        <select class="form-control" value=${selectedShipmentId} onChange=${e => setSelectedShipmentId(e.target.value)}>
                            <option value="">-- เลือกรายการขนส่ง --</option>
                            ${shipments.slice().reverse().map(sv => {
                                const pv = plantations.find(x => x.id === sv.plantationId);
                                return html`
                                    <option key=${sv.id} value=${sv.id}>
                                        ${sv.id} | ${sv.date.slice(0,10)} | ${pv ? pv.id : sv.plantationId}
                                    </option>
                                `;
                            })}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>ชื่อบริษัท / องค์กรออกเอกสาร</label>
                        <input type="text" class="form-control" value=${companyName} onChange=${e => setCompanyName(e.target.value)} />
                    </div>

                    <div class="form-group">
                        <label>ที่อยู่บริษัท</label>
                        <input type="text" class="form-control" placeholder="เลขที่, ถนน, ตำบล, อำเภอ, จังหวัด" value=${companyAddress} onChange=${e => setCompanyAddress(e.target.value)} />
                    </div>

                    <div class="form-group">
                        <label>ชื่อเจ้าหน้าที่ผู้ออกเอกสาร</label>
                        <input type="text" class="form-control" placeholder="ชื่อ-นามสกุล" value=${officerName} onChange=${e => setOfficerName(e.target.value)} />
                    </div>

                    ${!s && html`
                        <div style="padding:16px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:var(--radius-md); font-size:0.85rem; color:#fca5a5;">
                            <${Icon} name="alert-circle" /> กรุณาเลือกรายการขนส่งจากเมนูด้านบนเพื่อสร้างใบนำส่ง
                        </div>
                    `}
                </div>

                <!-- Right: Printable Delivery Note -->
                <div class="printable-report" style="padding:28px; background:#fff; color:#0f172a; font-family:'Sarabun','TH Sarabun New',sans-serif; font-size:13px; line-height:1.55;">

                    <!-- Header -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:12px;">
                        <div>
                            <div style="font-size:1.5rem; font-weight:800; color:#0f172a;">ใบนำส่งไม้</div>
                            <div style="font-size:0.8rem; color:#475569;">TIMBER DELIVERY NOTE</div>
                            <div style="font-size:0.75rem; color:#64748b; margin-top:4px;">ตามพระราชบัญญัติป่าไม้ พ.ศ. 2484 | FSC-STD-40-004 V3-0</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.9rem; font-weight:700;">${companyName || '___________________________'}</div>
                            <div style="font-size:0.75rem; color:#64748b;">${companyAddress || ''}</div>
                            <div style="margin-top:8px; padding:6px 14px; border:2px solid #0f172a; display:inline-block; font-weight:700; font-size:0.8rem;">
                                หมายเลข DO: ${s ? (s.deliveryNote || '___________') : '___________'}
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:flex-end; margin-bottom:16px; font-size:0.85rem;">
                        <div>วันที่ออกเอกสาร: <b>${s ? issueDate : '________________'}</b></div>
                    </div>

                    <!-- Section A: Source -->
                    <div style="font-weight:700; font-size:0.9rem; background:#0f172a; color:#fff; padding:5px 10px; margin-bottom:0;">
                        ก. ข้อมูลผู้นำส่ง / แหล่งกำเนิดไม้
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:0.82rem; margin-bottom:12px;">
                        <tbody>
                            <tr style="border:1px solid #cbd5e1;">
                                <td style="padding:6px 10px; width:35%; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">ชื่อ-นามสกุลผู้นำส่ง / เจ้าของสวน</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-weight:700;">${p ? p.owner : '___________________________'}</td>
                                <td style="padding:6px 10px; width:25%; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">โทรศัพท์</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1;">${p ? p.tel : '_______________'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">รหัสลูกค้า FSC (Customer ID)</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-family:monospace; font-weight:700;">${p ? p.id : '_______________'}</td>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">รหัสแปลงปลูก</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-family:monospace; font-weight:700;">${p ? (p.plotCode || '-') : '___'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">ที่ตั้งแปลงปลูก</td>
                                <td colspan="3" style="padding:6px 10px; border:1px solid #cbd5e1;">${p ? `ตำบล${p.subdistrict} อำเภอ${p.district} จังหวัด${p.province}` : '_______________________________________________'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">ประเภทเอกสารสิทธิ์ที่ดิน</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1;">${p ? (p.landDocType === 'Chanote' ? 'โฉนดที่ดิน (น.ส.4)' : p.landDocType === 'NorSor3' ? 'น.ส.3/น.ส.3ก.' : p.landDocType === 'SorPorKor' ? 'ส.ป.ก. 4-01' : 'อื่น ๆ') : '_______________'}</td>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">เลขที่เอกสารสิทธิ์</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1;">${p ? p.landDocNumber : '_______________'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Section B: Timber Details -->
                    <div style="font-weight:700; font-size:0.9rem; background:#0f172a; color:#fff; padding:5px 10px; margin-bottom:0;">
                        ข. รายละเอียดไม้ที่นำส่ง
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:0.82rem; margin-bottom:12px;">
                        <tbody>
                            <tr>
                                <td style="padding:6px 10px; width:35%; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">ชนิดไม้ (Species)</td>
                                <td colspan="3" style="padding:6px 10px; border:1px solid #cbd5e1; font-weight:700;">${p ? p.spcName : '___________________________'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">ปริมาณ (น้ำหนัก)</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-size:1.1rem; font-weight:700;">${s ? s.weight : '_______'} <span style="font-size:0.8rem; font-weight:400;">ตัน (Metric Ton)</span></td>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">FSC Claim</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-weight:700; color:${s && s.fscClaim === 'FSC 100%' ? '#047857' : '#92400e'};">${s ? s.fscClaim : '_______________'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">เลขที่ CoC Transaction</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-family:monospace;">${s ? s.id : '_______________'}</td>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">เลขที่ใบชั่งน้ำหนัก</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-family:monospace;">${s ? s.weightTicket : '_______________'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Section C: Vehicle & Driver -->
                    <div style="font-weight:700; font-size:0.9rem; background:#0f172a; color:#fff; padding:5px 10px; margin-bottom:0;">
                        ค. ยานพาหนะและผู้ขับขี่
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:0.82rem; margin-bottom:12px;">
                        <tbody>
                            <tr>
                                <td style="padding:6px 10px; width:35%; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">เลขทะเบียนรถบรรทุก</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1; font-weight:700; font-family:monospace;">${s ? s.truckPlate : '_______________'}</td>
                                <td style="padding:6px 10px; width:25%; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">จังหวัดทะเบียน</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1;">${s ? s.truckProvince : '_______________'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">ชื่อผู้ขับขี่</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1;">${s ? s.driverName : '___________________________'}</td>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">เลขที่ใบขับขี่</td>
                                <td style="padding:6px 10px; border:1px solid #cbd5e1;">${s ? s.driverLicense : '_______________'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Section D: Destination -->
                    <div style="font-weight:700; font-size:0.9rem; background:#0f172a; color:#fff; padding:5px 10px; margin-bottom:0;">
                        ง. ผู้รับสินค้าปลายทาง
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:0.82rem; margin-bottom:16px;">
                        <tbody>
                            <tr>
                                <td style="padding:6px 10px; width:35%; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">ชื่อโรงงาน / ผู้รับซื้อ</td>
                                <td colspan="3" style="padding:6px 10px; border:1px solid #cbd5e1; font-weight:700;">${s ? s.millName : '___________________________'}</td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; background:#f8fafc; font-weight:600; border:1px solid #cbd5e1;">วันเวลาที่จัดส่ง</td>
                                <td colspan="3" style="padding:6px 10px; border:1px solid #cbd5e1;">${s ? s.date.replace('T', ' ') : '___________________________'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Signatures -->
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-top:20px; padding-top:16px; border-top:1px dashed #cbd5e1;">
                        <div style="text-align:center; font-size:0.8rem;">
                            <div style="border-bottom:1px solid #0f172a; height:40px; margin-bottom:6px;"></div>
                            <div style="font-weight:600;">ลายเซ็นผู้นำส่ง / เกษตรกร</div>
                            <div style="color:#64748b;">(${p ? p.owner : '________________'})</div>
                            <div style="color:#64748b; margin-top:4px;">วันที่ ____________</div>
                        </div>
                        <div style="text-align:center; font-size:0.8rem;">
                            <div style="border-bottom:1px solid #0f172a; height:40px; margin-bottom:6px;"></div>
                            <div style="font-weight:600;">ลายเซ็นผู้รับสินค้า</div>
                            <div style="color:#64748b;">(โรงงาน / ผู้รับซื้อ)</div>
                            <div style="color:#64748b; margin-top:4px;">วันที่ ____________</div>
                        </div>
                        <div style="text-align:center; font-size:0.8rem;">
                            <div style="border-bottom:1px solid #0f172a; height:40px; margin-bottom:6px;"></div>
                            <div style="font-weight:600;">ลายเซ็นเจ้าหน้าที่ออกเอกสาร</div>
                            <div style="color:#64748b;">(${officerName || '________________'})</div>
                            <div style="color:#64748b; margin-top:4px;">วันที่ ${today}</div>
                        </div>
                    </div>

                    <!-- Footer Note -->
                    <div style="margin-top:16px; padding:8px 12px; background:#f1f5f9; border-left:3px solid #0f172a; font-size:0.72rem; color:#475569;">
                        <b>หมายเหตุ:</b> เอกสารนี้ออกตามพระราชบัญญัติป่าไม้ พ.ศ. 2484 มาตรา 54 ว่าด้วยการนำไม้เคลื่อนที่
                        และมาตรฐาน FSC Chain of Custody (FSC-STD-40-004 V3-0) | ตรวจสอบสถานะ EUDR ผ่านระบบ EU TRACES
                        | สงวนลิขสิทธิ์ระบบ: FSC &amp; EUDR Compliance Portal (SAAA)
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
                customerId: p.id,
                plotCode: p.plotCode || '',
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
                fscCwVerdict: p.fscCwVerdict
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
                    <p>รหัสอ้างอิงเอกสาร: DDS-${p.id}-แปลง${p.plotCode || ''}-${new Date().getFullYear()}</p>
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
                <div class="printable-report" style="font-family:'Sarabun','TH Sarabun New',sans-serif; font-size:13px; line-height:1.55;">
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
                            <span>รหัสลูกค้า FSC (Customer ID)</span>
                            ${p.id}
                        </div>
                        <div class="report-item">
                            <span>รหัสแปลงปลูก (Plot Code)</span>
                            ${p.plotCode || '-'}
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
                            ${p.spcName}
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
                        <div class="report-status-title" style="color: ${p.fscCwVerdict === 'Low Risk' ? '#047857' : '#b91c1c'}">
                            2. การตรวจสอบไม้ควบคุมตามเกณฑ์ FSC Controlled Wood (FSC-STD-40-005):
                        </div>
                        <ul style="margin-left: 20px; display:flex; flex-direction:column; gap:6px;">
                            <li><b>ระดับความเสี่ยงของวัตถุดิบ (Sourcing Risk Verdict):</b> ${p.fscCwVerdict === 'Low Risk' ? '✅ ความเสี่ยงต่ำ (Low Risk) - ผ่านการประเมินความสอดคล้องตามเอกสารภาคผนวกสมาคม FSC ประเทศไทย' : '❌ ความเสี่ยงเฉพาะเจาะจง (Specified Risk) - จำเป็นต้องดำเนินมาตรการลดความเสี่ยงก่อนทำการผลิต'}</li>
                            <li><b>ผลการประเมิน 7 หมวดหมู่:</b>
                                [1.ถูกกฎหมาย: ${p.fscSTD1?'✅':'❌'},
                                2.สิทธิชุมชน: ${p.fscSTD2?'✅':'❌'},
                                3.HCV: ${p.fscSTD3?'✅':'❌'},
                                4.ไม่แปลงสภาพ: ${p.fscSTD4?'✅':'❌'},
                                5.No GMO: ${p.fscSTD5?'✅':'❌'},
                                6.แรงงาน: ${(p.fscSTD6!==false)?'✅':'❌'},
                                7.ไม่ขัดแย้ง: ${(p.fscSTD7!==false)?'✅':'❌'}]
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

// =============================================================
// C2: Vessel Shipment System — บันทึกการส่งออกเรือ (Vessel DDS)
// Lock period: 2 years 6 months = 912 days per plot used
// =============================================================
export function VesselShipment({ vesselShipments, plantations, onAddVesselShipment, onDeleteVesselShipment }) {
    const defaultForm = {
        vesselName: '',
        portLoading: 'ท่าเรือแหลมฉบัง',
        portDischarge: '',
        billOfLading: '',
        targetGT: '',
    };
    const [form, setForm] = useState({ ...defaultForm });
    const [selectedPltIds, setSelectedPltIds] = useState([]);
    const [showForm, setShowForm] = useState(false);

    // C2: Only EUDR-compliant plots that are NOT currently locked
    const eligiblePlots = plantations
        .filter(p => p.eudrCompliant && (!p.status || p.status === 'approved') && !getPlotLockStatus(p).locked)
        .sort((a, b) => parseFloat(b.estVolume) - parseFloat(a.estVolume));

    const actualWeight = selectedPltIds.reduce((sum, id) => {
        const p = plantations.find(pp => pp.id === id);
        return sum + (p ? parseFloat(p.estVolume) || 0 : 0);
    }, 0);

    const targetGTNum = parseFloat(form.targetGT) || 0;
    const pct = targetGTNum > 0 ? Math.min(100, Math.round(actualWeight / targetGTNum * 100)) : 0;
    const pctColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';

    const handleToggle = (id) => {
        setSelectedPltIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleReset = () => {
        setForm({ ...defaultForm });
        setSelectedPltIds([]);
        setShowForm(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.vesselName.trim()) { alert('กรุณากรอกชื่อเรือ'); return; }
        if (selectedPltIds.length === 0) { alert('กรุณาเลือกแปลงไม้อย่างน้อย 1 แปลง'); return; }

        const vsId = 'VS-' + Math.floor(100000 + Math.random() * 900000);
        const createdDate = new Date().toISOString();
        const vs = {
            id: vsId,
            vesselName: form.vesselName.trim(),
            portLoading: form.portLoading.trim(),
            portDischarge: form.portDischarge.trim(),
            billOfLading: form.billOfLading.trim(),
            targetGT: targetGTNum,
            actualWeight,
            selectedPlantationIds: [...selectedPltIds],
            createdDate,
            status: 'active'
        };
        onAddVesselShipment(vs, [...selectedPltIds]);
        handleReset();
    };

    const handleExportCsv = () => {
        exportToCsv(
            `vessel-shipments-${new Date().toISOString().slice(0, 10)}.csv`,
            ['รหัส DDS', 'ชื่อเรือ', 'B/L เลขที่', 'ท่าเรือต้นทาง', 'ท่าเรือปลายทาง', 'เป้าหมาย(ตัน)', 'น้ำหนักจริง(ตัน)', 'จำนวนแปลง', 'รหัสแปลง', 'วันที่สร้าง'],
            vesselShipments.map(vs => [
                vs.id, vs.vesselName, vs.billOfLading || '-', vs.portLoading, vs.portDischarge || '-',
                vs.targetGT, vs.actualWeight.toFixed(2),
                vs.selectedPlantationIds.length, vs.selectedPlantationIds.join('; '),
                new Date(vs.createdDate).toLocaleDateString('th-TH')
            ])
        );
    };

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>บันทึกการส่งออกทางเรือ (Vessel DDS)</h1>
                    <p>เชื่อมแปลงไม้กับการส่งออกผ่านเรือ — แปลงที่ใช้แล้วจะถูกล็อค 2 ปี 6 เดือน</p>
                </div>
                <div style="display:flex;gap:10px;">
                    ${vesselShipments.length > 0 && html`
                        <button class="btn btn-outline" style="font-size:0.85rem;" onClick=${handleExportCsv}>
                            <${Icon} name="download" /> ส่งออก CSV
                        </button>
                    `}
                    <button class="btn btn-primary" onClick=${() => setShowForm(!showForm)}>
                        <${Icon} name=${showForm ? 'x' : 'plus'} /> ${showForm ? 'ยกเลิก' : 'สร้าง Vessel DDS ใหม่'}
                    </button>
                </div>
            </div>

            ${showForm && html`
                <div class="form-container" style="margin-bottom:20px;">
                    <div class="form-section-title"><${Icon} name="ship" /> รายละเอียดการส่งออก</div>
                    <form onSubmit=${handleSubmit}>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>ชื่อเรือ <span style="color:var(--danger)">*</span></label>
                                <input class="form-control" type="text" value=${form.vesselName}
                                    onInput=${e => setForm(f => ({...f, vesselName: e.target.value}))}
                                    placeholder="เช่น MV Siam Forest I" />
                            </div>
                            <div class="form-group">
                                <label>B/L เลขที่ (Bill of Lading)</label>
                                <input class="form-control" type="text" value=${form.billOfLading}
                                    onInput=${e => setForm(f => ({...f, billOfLading: e.target.value}))}
                                    placeholder="เช่น BL-2026-0001" />
                            </div>
                            <div class="form-group">
                                <label>ท่าเรือต้นทาง</label>
                                <input class="form-control" type="text" value=${form.portLoading}
                                    onInput=${e => setForm(f => ({...f, portLoading: e.target.value}))} />
                            </div>
                            <div class="form-group">
                                <label>ท่าเรือปลายทาง</label>
                                <input class="form-control" type="text" value=${form.portDischarge}
                                    onInput=${e => setForm(f => ({...f, portDischarge: e.target.value}))}
                                    placeholder="เช่น Port of Hamburg, Germany" />
                            </div>
                            <div class="form-group">
                                <label>น้ำหนักเป้าหมาย (ตัน GT)</label>
                                <input class="form-control" type="number" min="0" step="0.1"
                                    value=${form.targetGT}
                                    onInput=${e => setForm(f => ({...f, targetGT: e.target.value}))} />
                            </div>
                            <div class="form-group">
                                <label>น้ำหนักรวมจากแปลงที่เลือก</label>
                                <div style="padding:10px 12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:8px;font-weight:700;font-size:1.05rem;color:var(--primary);">
                                    ${actualWeight.toFixed(1)} ตัน
                                    ${targetGTNum > 0 && html`
                                        <span style="font-size:0.82rem;color:${pctColor};margin-left:8px;">(${pct}% ของเป้าหมาย)</span>
                                    `}
                                </div>
                            </div>
                        </div>

                        <div class="form-section-title" style="margin-top:16px;">
                            <${Icon} name="map-pin" /> เลือกแปลงที่จะส่งออก
                            <span style="font-weight:400;font-size:0.82rem;color:var(--text-muted);margin-left:8px;">— แสดงเฉพาะแปลง EUDR Compliant ที่ไม่ถูกล็อค</span>
                        </div>

                        ${eligiblePlots.length === 0 ? html`
                            <div style="padding:20px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:8px;">
                                ⚠️ ไม่มีแปลงที่พร้อมใช้งาน — แปลงทั้งหมดอาจยังไม่ผ่าน EUDR หรืออยู่ในช่วงล็อค
                            </div>
                        ` : eligiblePlots.map(p => html`
                            <div key=${p.id} onClick=${() => handleToggle(p.id)}
                                style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:6px;border-radius:8px;cursor:pointer;border:1px solid ${selectedPltIds.includes(p.id) ? 'rgba(16,185,129,0.6)' : 'var(--border-color)'};background:${selectedPltIds.includes(p.id) ? 'rgba(16,185,129,0.07)' : 'transparent'};transition:all 0.15s;">
                                <input type="checkbox" checked=${selectedPltIds.includes(p.id)} style="pointer-events:none;width:16px;height:16px;" />
                                <div style="flex:1;">
                                    <div style="font-weight:600;">${p.id} — แปลง ${p.plotCode}</div>
                                    <div style="font-size:0.8rem;color:var(--text-muted);">${p.owner} | ${p.province} | พื้นที่: ${p.areaRai} ไร่ | ปริมาณ: <b>${p.estVolume}</b> ตัน</div>
                                </div>
                                <span class="badge ${p.fscStatus === 'FSC 100%' ? 'badge-success' : 'badge-warning'}" style="font-size:0.72rem;">${p.fscStatus}</span>
                            </div>
                        `)}

                        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">
                            <button type="button" class="btn btn-outline" onClick=${handleReset}>ยกเลิก</button>
                            <button type="submit" class="btn btn-primary">
                                <${Icon} name="ship" /> บันทึกและล็อคแปลง (${selectedPltIds.length} แปลง)
                            </button>
                        </div>
                    </form>
                </div>
            `}

            ${vesselShipments.length === 0 && !showForm ? html`
                <div class="form-container" style="text-align:center;padding:48px 20px;">
                    <div style="font-size:3rem;margin-bottom:12px;">🚢</div>
                    <div style="color:var(--text-muted);font-size:0.95rem;">ยังไม่มีรายการส่งออกเรือ<br/>คลิก "สร้าง Vessel DDS ใหม่" เพื่อเริ่มต้น</div>
                </div>
            ` : vesselShipments.length > 0 ? html`
                <div class="table-container">
                    <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);font-size:0.85rem;color:var(--text-muted);">
                        <b style="color:#fff;">${vesselShipments.length}</b> รายการส่งออกเรือ
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>รหัส DDS</th>
                                    <th>ชื่อเรือ / B/L</th>
                                    <th>ท่าเรือ</th>
                                    <th>น้ำหนัก (ตัน)</th>
                                    <th>แปลงที่ใช้</th>
                                    <th>วันที่</th>
                                    <th style="text-align:right;">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${vesselShipments.map(vs => html`
                                    <tr key=${vs.id}>
                                        <td><code style="font-size:0.8rem;color:var(--primary);">${vs.id}</code></td>
                                        <td>
                                            <div style="font-weight:600;">${vs.vesselName}</div>
                                            <div style="font-size:0.75rem;color:var(--text-muted);">B/L: ${vs.billOfLading || '-'}</div>
                                        </td>
                                        <td>
                                            <div style="font-size:0.82rem;">${vs.portLoading}</div>
                                            <div style="font-size:0.75rem;color:var(--text-muted);">→ ${vs.portDischarge || '-'}</div>
                                        </td>
                                        <td>
                                            <div><b>${vs.actualWeight.toFixed(1)}</b> ตัน</div>
                                            ${vs.targetGT > 0 && html`<div style="font-size:0.75rem;color:var(--text-muted);">เป้า: ${vs.targetGT} ตัน</div>`}
                                        </td>
                                        <td>
                                            <span class="badge badge-info">${vs.selectedPlantationIds.length} แปลง</span>
                                            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;max-width:180px;word-break:break-all;">${vs.selectedPlantationIds.join(', ')}</div>
                                        </td>
                                        <td style="white-space:nowrap;font-size:0.85rem;">${new Date(vs.createdDate).toLocaleDateString('th-TH')}</td>
                                        <td style="text-align:right;">
                                            <button class="action-btn btn-delete" title="ลบและปลดล็อคแปลง" onClick=${() => onDeleteVesselShipment(vs.id, vs.selectedPlantationIds)}>
                                                <${Icon} name="trash-2" />
                                            </button>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// =============================================================
// C1: Monthly Report — รายงานสรุปกิจกรรมรายเดือน
// Derived from plantations + shipments + vesselShipments (no new schema key)
// =============================================================
export function MonthlyReport({ plantations, shipments, vesselShipments }) {
    const vs = vesselShipments || [];

    // Helper: ISO dateStr → 'YYYY-MM' key
    const toMonthKey = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // Thai month label
    const thMonth = (key) => {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    };

    // Collect all active months
    const monthSet = new Set();
    plantations.forEach(p => { const k = toMonthKey(p.registeredAt || p.plantDate); if (k) monthSet.add(k); });
    shipments.forEach(s => { const k = toMonthKey(s.date); if (k) monthSet.add(k); });
    vs.forEach(v => { const k = toMonthKey(v.createdDate); if (k) monthSet.add(k); });

    const months = [...monthSet].sort().reverse(); // newest first

    const handleExportCsv = () => {
        exportToCsv(
            `monthly-report-${new Date().toISOString().slice(0, 10)}.csv`,
            ['เดือน', 'แปลงใหม่', 'EUDR Compliant', 'FSC 100%', 'Specified Risk', 'รายการขนส่ง(รถ)', 'น้ำหนักรถ(ตัน)', 'รายการส่งออก(เรือ)', 'น้ำหนักเรือ(ตัน)', 'น้ำหนักรวม(ตัน)'],
            months.map(mk => {
                const pInMonth = plantations.filter(p => toMonthKey(p.registeredAt || p.plantDate) === mk);
                const sInMonth = shipments.filter(s => toMonthKey(s.date) === mk);
                const vsInMonth = vs.filter(v => toMonthKey(v.createdDate) === mk);
                const truckWT = sInMonth.reduce((a, s) => a + (parseFloat(s.weight) || 0), 0);
                const vesselWT = vsInMonth.reduce((a, v) => a + (parseFloat(v.actualWeight) || 0), 0);
                return [
                    thMonth(mk),
                    pInMonth.length,
                    pInMonth.filter(p => p.eudrCompliant).length,
                    pInMonth.filter(p => p.fscStatus === 'FSC 100%').length,
                    pInMonth.filter(p => p.fscCwVerdict === 'Specified Risk').length,
                    sInMonth.length, truckWT.toFixed(2),
                    vsInMonth.length, vesselWT.toFixed(2),
                    (truckWT + vesselWT).toFixed(2)
                ];
            })
        );
    };

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>รายงานสรุปรายเดือน</h1>
                    <p>ภาพรวมกิจกรรมแปลงปลูก การขนส่งรถ และการส่งออกเรือ จัดกลุ่มตามเดือน</p>
                </div>
                ${months.length > 0 && html`
                    <button class="btn btn-outline" style="font-size:0.85rem;" onClick=${handleExportCsv}>
                        <${Icon} name="download" /> ส่งออก CSV
                    </button>
                `}
            </div>

            ${months.length === 0 ? html`
                <div class="form-container" style="text-align:center;padding:48px 20px;">
                    <div style="font-size:3rem;margin-bottom:12px;">📊</div>
                    <div style="color:var(--text-muted);font-size:0.95rem;">ยังไม่มีข้อมูลเพียงพอสำหรับรายงานรายเดือน</div>
                </div>
            ` : months.map(mk => {
                const pInMonth = plantations.filter(p => toMonthKey(p.registeredAt || p.plantDate) === mk);
                const sInMonth = shipments.filter(s => toMonthKey(s.date) === mk);
                const vsInMonth = vs.filter(v => toMonthKey(v.createdDate) === mk);
                const truckWT = sInMonth.reduce((a, s) => a + (parseFloat(s.weight) || 0), 0);
                const vesselWT = vsInMonth.reduce((a, v) => a + (parseFloat(v.actualWeight) || 0), 0);
                const eudrOk = pInMonth.filter(p => p.eudrCompliant).length;
                const fsc100 = pInMonth.filter(p => p.fscStatus === 'FSC 100%').length;
                const specRisk = pInMonth.filter(p => p.fscCwVerdict === 'Specified Risk').length;

                return html`
                    <div key=${mk} class="form-container" style="margin-bottom:16px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                            <h3 style="margin:0;font-size:1.05rem;color:var(--primary);">
                                <${Icon} name="calendar" /> ${thMonth(mk)}
                            </h3>
                            <span style="font-size:0.78rem;color:var(--text-muted);">${mk}</span>
                        </div>

                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px;">
                            <div class="stat-card" style="padding:14px;">
                                <div class="stat-label">แปลงที่ลงทะเบียน</div>
                                <div class="stat-value" style="font-size:1.8rem;">${pInMonth.length}</div>
                                <div class="stat-sub">EUDR ✅ ${eudrOk} | FSC 100% ${fsc100}${specRisk > 0 ? ` | ⚠️ ${specRisk}` : ''}</div>
                            </div>
                            <div class="stat-card" style="padding:14px;">
                                <div class="stat-label">การขนส่ง (รถ)</div>
                                <div class="stat-value" style="font-size:1.8rem;">${sInMonth.length}</div>
                                <div class="stat-sub">${truckWT.toFixed(1)} ตัน</div>
                            </div>
                            <div class="stat-card" style="padding:14px;">
                                <div class="stat-label">การส่งออก (เรือ)</div>
                                <div class="stat-value" style="font-size:1.8rem;">${vsInMonth.length}</div>
                                <div class="stat-sub">${vesselWT.toFixed(1)} ตัน</div>
                            </div>
                            <div class="stat-card" style="padding:14px;border-color:rgba(16,185,129,0.4);">
                                <div class="stat-label">น้ำหนักรวมทั้งเดือน</div>
                                <div class="stat-value" style="font-size:1.8rem;color:var(--primary);">${(truckWT + vesselWT).toFixed(1)}</div>
                                <div class="stat-sub">ตัน (รถ + เรือ)</div>
                            </div>
                        </div>

                        ${sInMonth.length > 0 && html`
                            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">
                                📦 รายการขนส่งรถ: ${sInMonth.map(s => s.id).join(', ')}
                            </div>
                        `}
                        ${vsInMonth.length > 0 && html`
                            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
                                🚢 รายการส่งออกเรือ: ${vsInMonth.map(v => v.id + ' (' + v.vesselName + ')').join(', ')}
                            </div>
                        `}
                    </div>
                `;
            })}
        </div>
    `;
}

// =============================================================
// Component: UserManagement (Phase 3 — Admin only, level 5)
// =============================================================
export function UserManagement({ currentUser, users, usersLoading, onCreateUser, onUpdateUser, onRefresh }) {
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editUserId, setEditUserId] = useState(null);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    const [saving, setSaving] = useState(false);

    const creatorLevel = currentUser ? (currentUser.roleLevel || 1) : 1;
    const availableRoles = ROLE_OPTIONS.filter(o => o.level < creatorLevel);

    const emptyForm = { username: '', fullName: '', department: '', role: 'procurement', roleLevel: 1, password: '', confirmPassword: '' };
    const [form, setForm] = useState(emptyForm);

    const filtered = users.filter(u => {
        const s = search.toLowerCase();
        return !s || u.username.toLowerCase().includes(s) || u.fullName.toLowerCase().includes(s) || (u.department || '').toLowerCase().includes(s);
    });

    const openNew = () => {
        setEditUserId(null); setForm(emptyForm);
        setFormError(''); setFormSuccess(''); setShowForm(true);
    };
    const openEdit = (u) => {
        setEditUserId(u.id);
        setForm({ username: u.username, fullName: u.fullName, department: u.department, role: u.role, roleLevel: u.roleLevel, password: '', confirmPassword: '' });
        setFormError(''); setFormSuccess(''); setShowForm(true);
    };
    const closeForm = () => { setShowForm(false); setEditUserId(null); setFormError(''); };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value }));
    };
    const handleRoleChange = (e) => {
        const val = e.target.value;
        const opt = ROLE_OPTIONS.find(o => o.value === val);
        setForm(f => ({ ...f, role: val, roleLevel: opt ? opt.level : 1 }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!form.fullName.trim()) { setFormError('กรุณากรอกชื่อ-นามสกุล'); return; }
        if (!form.department.trim()) { setFormError('กรุณากรอกแผนก'); return; }
        if (!editUserId && !form.username.trim()) { setFormError('กรุณากรอกชื่อผู้ใช้งาน'); return; }
        if (!editUserId && !form.password) { setFormError('กรุณากรอกรหัสผ่าน'); return; }
        if (form.password) {
            const pwErr = validatePassword(form.password);
            if (pwErr) { setFormError(pwErr); return; }
            if (form.password !== form.confirmPassword) { setFormError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน'); return; }
        }
        setSaving(true);
        try {
            let result;
            if (editUserId) {
                const changes = { fullName: form.fullName.trim(), department: form.department.trim(), role: form.role, roleLevel: form.roleLevel };
                if (form.password) changes.password = form.password;
                result = await onUpdateUser(editUserId, changes);
            } else {
                result = await onCreateUser({
                    username: form.username.trim(), password: form.password,
                    fullName: form.fullName.trim(), role: form.role, roleLevel: form.roleLevel,
                    department: form.department.trim(), createdBy: currentUser?.username || 'admin'
                });
            }
            if (result.success) {
                setFormSuccess(editUserId ? `อัปเดต "${form.username}" สำเร็จ` : `สร้างผู้ใช้ "${form.username.trim()}" สำเร็จ`);
                setShowForm(false); setEditUserId(null); onRefresh();
            } else {
                setFormError(result.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
            }
        } finally { setSaving(false); }
    };

    const handleToggleActive = async (u) => {
        if (u.id === currentUser?.id) { alert('ไม่สามารถระงับบัญชีของตนเองได้'); return; }
        const action = u.active ? 'ระงับ' : 'เปิดใช้งาน';
        if (!confirm(`${action}บัญชีผู้ใช้ "${u.username}" (${u.fullName})?`)) return;
        const result = await onUpdateUser(u.id, { active: !u.active });
        if (result.success) { setFormSuccess(`${action}บัญชี "${u.username}" สำเร็จ`); onRefresh(); }
        else { alert(result.message || 'เกิดข้อผิดพลาด'); }
    };

    return html`
        <div>
            <div class="header-actions">
                <div class="page-title">
                    <h1>จัดการผู้ใช้งาน</h1>
                    <p>สร้าง แก้ไข หรือระงับบัญชีผู้ใช้งานในระบบ (Admin only)</p>
                </div>
                ${!showForm && html`
                    <button class="btn btn-primary" onClick=${openNew}>
                        <${Icon} name="user-plus" /> เพิ่มผู้ใช้ใหม่
                    </button>
                `}
            </div>

            ${formSuccess && html`
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;border-radius:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);color:#10b981;font-size:0.875rem;">
                    <${Icon} name="check-circle" size="15" /> ${formSuccess}
                </div>
            `}

            ${showForm && html`
                <div class="card" style="margin-bottom:24px;">
                    <div class="card-header">
                        <h3 class="card-title">
                            <${Icon} name=${editUserId ? 'edit' : 'user-plus'} />
                            ${editUserId ? 'แก้ไขข้อมูลผู้ใช้' : 'เพิ่มผู้ใช้งานใหม่'}
                        </h3>
                    </div>
                    <form onSubmit=${handleSubmit}>
                        <div class="form-grid" style="padding:16px 16px 8px;">
                            <div class="form-group">
                                <label class="form-label">ชื่อผู้ใช้งาน (Username) *</label>
                                <input class="form-control" name="username" value=${form.username}
                                    onChange=${handleChange}
                                    placeholder="ตัวอักษร ตัวเลข _ เท่านั้น (ไม่สามารถแก้ไขได้ภายหลัง)"
                                    disabled=${!!editUserId} required />
                            </div>
                            <div class="form-group">
                                <label class="form-label">ชื่อ-นามสกุล *</label>
                                <input class="form-control" name="fullName" value=${form.fullName}
                                    onChange=${handleChange} placeholder="ชื่อ-นามสกุลภาษาไทย" required />
                            </div>
                            <div class="form-group">
                                <label class="form-label">แผนก *</label>
                                <input class="form-control" name="department" value=${form.department}
                                    onChange=${handleChange} placeholder="เช่น จัดซื้อ, IT, Management" required />
                            </div>
                            <div class="form-group">
                                <label class="form-label">บทบาท (Role) *</label>
                                <select class="form-control" value=${form.role} onChange=${handleRoleChange}
                                    disabled=${editUserId && editUserId === currentUser?.id}>
                                    ${availableRoles.map(o => html`
                                        <option key=${o.value} value=${o.value}>${o.label} — Level ${o.level}</option>
                                    `)}
                                </select>
                                ${editUserId === currentUser?.id && html`
                                    <div style="font-size:0.74rem;color:var(--text-muted);margin-top:4px;">⚠️ ไม่สามารถแก้ไข role ของตนเองได้</div>
                                `}
                            </div>
                            <div class="form-group">
                                <label class="form-label">${editUserId ? 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)' : 'รหัสผ่าน *'}</label>
                                <input class="form-control" type="password" name="password" value=${form.password}
                                    onChange=${handleChange}
                                    placeholder="อย่างน้อย 8 ตัว มี A-Z a-z 0-9" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">ยืนยันรหัสผ่าน${editUserId ? '' : ' *'}</label>
                                <input class="form-control" type="password" name="confirmPassword" value=${form.confirmPassword}
                                    onChange=${handleChange} placeholder="กรอกรหัสผ่านซ้ำ" />
                            </div>
                        </div>
                        ${formError && html`
                            <div style="display:flex;align-items:center;gap:8px;margin:0 16px 10px;padding:9px 13px;border-radius:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-size:0.85rem;">
                                <${Icon} name="alert-circle" size="14" /> ${formError}
                            </div>
                        `}
                        <div style="display:flex;gap:10px;padding:4px 16px 16px;">
                            <button class="btn btn-primary" type="submit" disabled=${saving}>
                                ${saving
                                    ? html`<${Icon} name="loader" style="animation:spin 1s linear infinite" /> กำลังบันทึก...`
                                    : html`<${Icon} name="save" /> บันทึก`}
                            </button>
                            <button class="btn btn-secondary" type="button" onClick=${closeForm}>
                                <${Icon} name="x" /> ยกเลิก
                            </button>
                        </div>
                    </form>
                </div>
            `}

            <div class="card">
                <div class="card-header" style="flex-wrap:wrap;gap:12px;">
                    <h3 class="card-title"><${Icon} name="users" /> รายชื่อผู้ใช้งานทั้งหมด</h3>
                    <input
                        class="search-input" type="text"
                        placeholder="ค้นหา username / ชื่อ / แผนก..."
                        value=${search} onInput=${e => setSearch(e.target.value)}
                        style="max-width:260px;"
                    />
                </div>

                ${usersLoading ? html`
                    <div style="padding:40px;text-align:center;color:var(--text-muted);">
                        <${Icon} name="loader" style="animation:spin 1s linear infinite;display:block;margin:0 auto 10px;" size="24" />
                        กำลังโหลดข้อมูลผู้ใช้...
                    </div>
                ` : html`
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Username</th>
                                    <th>ชื่อ-นามสกุล</th>
                                    <th>บทบาท</th>
                                    <th>แผนก</th>
                                    <th>สถานะ</th>
                                    <th style="text-align:right;">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.map((u, idx) => {
                                    const rc = ROLE_BADGE_COLORS[u.role] || ROLE_BADGE_COLORS.procurement;
                                    const roleLabel = (ROLE_OPTIONS.find(o => o.value === u.role) || {}).label || u.role;
                                    return html`
                                        <tr key=${u.id} style="${!u.active ? 'opacity:0.48;' : ''}">
                                            <td style="color:var(--text-muted);font-size:0.8rem;">${idx + 1}</td>
                                            <td>
                                                <span style="font-family:monospace;font-size:0.85rem;font-weight:600;">${u.username}</span>
                                                ${u.id === currentUser?.id && html`<span style="font-size:0.68rem;color:var(--primary);margin-left:6px;font-weight:600;">(คุณ)</span>`}
                                            </td>
                                            <td style="font-size:0.875rem;">${u.fullName}</td>
                                            <td>
                                                <span style="font-size:0.76rem;font-weight:600;color:${rc.text};background:${rc.bg};padding:2px 8px;border-radius:4px;border:1px solid ${rc.border};white-space:nowrap;">
                                                    ${roleLabel}
                                                </span>
                                            </td>
                                            <td style="font-size:0.85rem;color:var(--text-muted);">${u.department || '—'}</td>
                                            <td>
                                                <span class="badge ${u.active ? 'badge-success' : 'badge-danger'}" style="font-size:0.72rem;">
                                                    ${u.active ? '✅ ใช้งาน' : '🚫 ระงับ'}
                                                </span>
                                            </td>
                                            <td style="text-align:right;">
                                                <div style="display:inline-flex;gap:6px;">
                                                    <button class="action-btn btn-edit" title="แก้ไขข้อมูล" onClick=${() => openEdit(u)}>
                                                        <${Icon} name="edit" />
                                                    </button>
                                                    <button
                                                        class="action-btn"
                                                        style="${u.active ? 'color:#f59e0b;border-color:rgba(245,158,11,0.4);' : 'color:#10b981;border-color:rgba(16,185,129,0.4);'}"
                                                        title=${u.active ? 'ระงับบัญชี' : 'เปิดใช้งานบัญชี'}
                                                        onClick=${() => handleToggleActive(u)}
                                                        disabled=${u.id === currentUser?.id}
                                                    >
                                                        <${Icon} name=${u.active ? 'user-x' : 'user-check'} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                })}
                            </tbody>
                        </table>
                        ${filtered.length === 0 && html`
                            <div style="padding:32px;text-align:center;color:var(--text-muted);">
                                ไม่พบข้อมูลผู้ใช้งานที่ตรงกับการค้นหา
                            </div>
                        `}
                    </div>
                    <div style="padding:10px 16px;font-size:0.8rem;color:var(--text-muted);border-top:1px solid var(--border-color);display:flex;gap:16px;">
                        <span>ทั้งหมด <b>${filtered.length}</b> บัญชี</span>
                        <span>ใช้งาน <b>${filtered.filter(u => u.active).length}</b></span>
                        <span>ระงับ <b>${filtered.filter(u => !u.active).length}</b></span>
                    </div>
                `}
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: LoginForm
// Full-screen login page matching the app's dark theme.
// Props: onLogin(username, password), loading, error, demoMode
// ─────────────────────────────────────────────────────────────────────────────
export function LoginForm({ onLogin, loading, error, demoMode }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        const u = username.trim();
        if (u && password) onLogin(u, password);
    };

    return html`
        <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-dark);padding:24px;">

            ${demoMode && html`
                <div style="max-width:480px;width:100%;margin-bottom:14px;background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.35);border-radius:12px;padding:14px 16px;font-size:0.82rem;color:#fbbf24;">
                    <div style="text-align:center;margin-bottom:10px;">⚙️ <b>Demo Mode</b> — ยังไม่ได้เชื่อมต่อ Google Sheets</div>
                    <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                        <thead>
                            <tr style="color:rgba(251,191,36,0.7);border-bottom:1px solid rgba(234,179,8,0.25);">
                                <th style="text-align:left;padding:3px 8px;font-weight:600;">Username</th>
                                <th style="text-align:left;padding:3px 8px;font-weight:600;">Password</th>
                                <th style="text-align:left;padding:3px 8px;font-weight:600;">Role</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="padding:4px 8px;color:#fff;font-weight:700;">admin</td><td style="padding:4px 8px;color:#d1d5db;">Admin@1234</td><td style="padding:4px 8px;"><span style="color:#ef4444;font-weight:600;">ผู้ดูแลระบบ</span></td></tr>
                            <tr><td style="padding:4px 8px;color:#fff;font-weight:700;">manager</td><td style="padding:4px 8px;color:#d1d5db;">Manager@1234</td><td style="padding:4px 8px;"><span style="color:#a855f7;font-weight:600;">ผู้จัดการ</span></td></tr>
                            <tr><td style="padding:4px 8px;color:#fff;font-weight:700;">fsc_staff</td><td style="padding:4px 8px;color:#d1d5db;">FscStaff@1234</td><td style="padding:4px 8px;"><span style="color:#3b82f6;font-weight:600;">FSC Staff</span></td></tr>
                            <tr><td style="padding:4px 8px;color:#fff;font-weight:700;">proc_mgr</td><td style="padding:4px 8px;color:#d1d5db;">ProcMgr@1234</td><td style="padding:4px 8px;"><span style="color:#10b981;font-weight:600;">จัดซื้อ (อาวุโส)</span></td></tr>
                            <tr><td style="padding:4px 8px;color:#fff;font-weight:700;">procurement</td><td style="padding:4px 8px;color:#d1d5db;">Proc@1234</td><td style="padding:4px 8px;"><span style="color:#94a3b8;font-weight:600;">จัดซื้อ</span></td></tr>
                        </tbody>
                    </table>
                </div>
            `}

            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:40px 36px;max-width:420px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.45);">

                <!-- Logo & Title -->
                <div style="text-align:center;margin-bottom:32px;">
                    <div style="font-size:3.2rem;margin-bottom:8px;">🌳</div>
                    <h1 style="font-size:1.55rem;font-weight:800;color:var(--text-main);margin:0 0 5px;">FSC & EUDR</h1>
                    <p style="color:var(--text-muted);font-size:0.88rem;margin:0;">Compliance Portal — เข้าสู่ระบบ</p>
                </div>

                <form onSubmit=${handleSubmit}>

                    <!-- Username -->
                    <div style="margin-bottom:18px;">
                        <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">ชื่อผู้ใช้ (Username)</label>
                        <input
                            type="text"
                            class="form-input"
                            placeholder="กรอกชื่อผู้ใช้"
                            value=${username}
                            onInput=${e => setUsername(e.target.value)}
                            autocomplete="username"
                            disabled=${loading}
                            required
                            style="width:100%;box-sizing:border-box;"
                        />
                    </div>

                    <!-- Password -->
                    <div style="margin-bottom:24px;">
                        <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">รหัสผ่าน (Password)</label>
                        <div style="position:relative;">
                            <input
                                type=${showPw ? 'text' : 'password'}
                                class="form-input"
                                placeholder="กรอกรหัสผ่าน"
                                value=${password}
                                onInput=${e => setPassword(e.target.value)}
                                autocomplete="current-password"
                                disabled=${loading}
                                required
                                style="width:100%;box-sizing:border-box;padding-right:46px;"
                            />
                            <button
                                type="button"
                                onClick=${() => setShowPw(!showPw)}
                                style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;display:flex;align-items:center;line-height:1;"
                                title=${showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                            >
                                <${Icon} name=${showPw ? 'eye-off' : 'eye'} size="17" />
                            </button>
                        </div>
                    </div>

                    <!-- Error Message -->
                    ${error && html`
                        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:0.87rem;color:#ef4444;display:flex;align-items:center;gap:9px;">
                            <${Icon} name="alert-circle" size="16" />
                            ${error}
                        </div>
                    `}

                    <!-- Submit Button -->
                    <button
                        type="submit"
                        class="btn btn-primary"
                        style="width:100%;justify-content:center;padding:13px;font-size:1rem;font-weight:700;"
                        disabled=${loading || !username.trim() || !password}
                    >
                        ${loading ? html`
                            <span style="display:inline-flex;align-items:center;gap:9px;">
                                <span style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.75s linear infinite;display:inline-block;flex-shrink:0;"></span>
                                กำลังเข้าสู่ระบบ...
                            </span>
                        ` : html`
                            <${Icon} name="log-in" size="18" /> เข้าสู่ระบบ
                        `}
                    </button>

                </form>

                <div style="margin-top:24px;padding-top:18px;border-top:1px solid var(--border);text-align:center;font-size:0.75rem;color:var(--text-muted);line-height:1.6;">
                    FSC-STD-40-005 V3-1 · EUDR Regulation (EU) 2023/1115<br/>
                    <span style="color:var(--primary);font-weight:600;">● EUDR COMPLIANCE ACTIVE</span>
                </div>
            </div>
        </div>
    `;
}
