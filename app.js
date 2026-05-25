import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import {
    Icon,
    Dashboard,
    PlantationForm,
    PlantationList,
    CocLedger,
    DdsReport
} from './components.js';

const html = htm.bind(h);

// Seed Data for Demonstration
const SEED_PLANTATIONS = [
    {
        id: 'PLT-8711',
        name: 'แปลงลานสัก 1 (Lansak 1)',
        owner: 'นายสมชาย ป่าไม้ดี',
        tel: '0812345678',
        subdistrict: 'ลานสัก',
        district: 'ลานสัก',
        province: 'อุทัยธานี',
        areaRai: 18,
        areaHectares: 2.88,
        landDocType: 'Chanote',
        landDocNumber: '44109/ระวาง 5038III',
        landDocIssueDate: '2018-05-15',
        spcName: 'Eucalyptus camaldulensis',
        fmCertified: true,
        fmCertNumber: 'FM/TH-006178',
        plantDate: '2021-06-15',
        harvestDate: '2026-06-15',
        estVolume: 75,
        geoType: 'point',
        coords: { lat: 15.421102, lng: 99.412345 },
        deforestationFreeCheck: true,
        forestProtectionZoneCheck: true,
        fscSTD1: true,
        fscSTD2: true,
        fscSTD3: true,
        fscSTD4: true,
        fscSTD5: true,
        docAttachmentDeed: true,
        docAttachmentOwnerID: true,
        treeAge: 59,
        fscCWVerdict: 'Low Risk',
        eudrCompliant: true,
        eudrWarning: '',
        fscStatus: 'FSC 100%'
    },
    {
        id: 'PLT-9022',
        name: 'แปลงพนมสารคาม A (Phanomsarakham A)',
        owner: 'นางสาวสิรินทร์ รักษ์ป่า',
        tel: '0898765432',
        subdistrict: 'เกาะขนุน',
        district: 'พนมสารคาม',
        province: 'ฉะเชิงเทรา',
        areaRai: 35,
        areaHectares: 5.60,
        landDocType: 'NorSor3',
        landDocNumber: '8812 ก.',
        landDocIssueDate: '2019-11-20',
        spcName: 'Eucalyptus camaldulensis',
        fmCertified: false,
        fmCertNumber: '',
        plantDate: '2022-05-10',
        harvestDate: '2027-05-10',
        estVolume: 150,
        geoType: 'polygon',
        coords: [
            { lat: 13.691102, lng: 101.350123 },
            { lat: 13.693102, lng: 101.354123 },
            { lat: 13.690102, lng: 101.356123 },
            { lat: 13.687102, lng: 101.352123 }
        ],
        deforestationFreeCheck: true,
        forestProtectionZoneCheck: true,
        fscSTD1: true,
        fscSTD2: true,
        fscSTD3: true,
        fscSTD4: true,
        fscSTD5: true,
        docAttachmentDeed: true,
        docAttachmentOwnerID: true,
        treeAge: 48,
        fscCWVerdict: 'Low Risk',
        eudrCompliant: true,
        eudrWarning: '',
        fscStatus: 'FSC Controlled Wood'
    },
    {
        id: 'PLT-3044',
        name: 'แปลงสนามชัยเขต 2 (Sanamchaikhet 2)',
        owner: 'นายประวิทย์ บุกรุกเลี่ยง',
        tel: '0855551234',
        subdistrict: 'ลาดกระทิง',
        district: 'สนามชัยเขต',
        province: 'ฉะเชิงเทรา',
        areaRai: 50,
        areaHectares: 8.00,
        landDocType: 'Others',
        landDocNumber: 'ภ.บ.ท. 5 เลขที่ 902',
        landDocIssueDate: '2021-01-20',
        spcName: 'Eucalyptus camaldulensis',
        fmCertified: false,
        fmCertNumber: '',
        plantDate: '2023-01-20',
        harvestDate: '2028-01-20',
        estVolume: 220,
        geoType: 'polygon',
        coords: [
            { lat: 13.612102, lng: 101.440123 },
            { lat: 13.615102, lng: 101.445123 },
            { lat: 13.610102, lng: 101.447123 }
        ],
        deforestationFreeCheck: false,
        forestProtectionZoneCheck: false,
        fscSTD1: true,
        fscSTD2: true,
        fscSTD3: false,
        fscSTD4: true,
        fscSTD5: true,
        docAttachmentDeed: false,
        docAttachmentOwnerID: true,
        treeAge: 40,
        fscCWVerdict: 'Specified Risk',
        eudrCompliant: false,
        eudrWarning: 'พบข้อมูลการถางป่าธรรมชาติหลังเส้นตายวันที่ 31 ธ.ค. 2020 และทับซ้อนเขตป่าไม้ถาวรตามกฎหมาย',
        fscStatus: 'FSC Controlled Wood'
    }
];

const SEED_SHIPMENTS = [
    {
        id: 'TX-554109',
        plantationId: 'PLT-8711',
        date: '2026-05-20T10:30',
        weight: 15.5,
        truckPlate: '82-4411',
        truckProvince: 'อุทัยธานี',
        driverName: 'นายประสิทธิ์ เรืองแรง',
        driverLicense: 'DL-88921',
        weightTicket: 'WT-778219',
        deliveryNote: 'DN-55102',
        millName: 'โรงงาน Double A (มหาชน) สาขาท่าตูม',
        fscClaim: 'FSC 100%'
    },
    {
        id: 'TX-881290',
        plantationId: 'PLT-9022',
        date: '2026-05-24T14:15',
        weight: 24.2,
        truckPlate: '71-8899',
        truckProvince: 'ฉะเชิงเทรา',
        driverName: 'นายมานะ รักดี',
        driverLicense: 'DL-66710',
        weightTicket: 'WT-990123',
        deliveryNote: 'DN-77219',
        millName: 'บริษัท สยามเซลลูโลส จำกัด สาขาบ้านค่าย',
        fscClaim: 'FSC Controlled Wood'
    }
];

function App() {
    const [tab, setTab] = useState('dashboard');
    const [plantations, setPlantations] = useState([]);
    const [shipments, setShipments] = useState([]);
    const [editPlantationId, setEditPlantationId] = useState(null);
    const [selectedPlantationId, setSelectedPlantationId] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Initial Load & Seeding
    useEffect(() => {
        const storedPlt = localStorage.getItem('fsc_eudr_plantations');
        const storedShip = localStorage.getItem('fsc_eudr_shipments');

        if (storedPlt) {
            setPlantations(JSON.parse(storedPlt));
        } else {
            localStorage.setItem('fsc_eudr_plantations', JSON.stringify(SEED_PLANTATIONS));
            setPlantations(SEED_PLANTATIONS);
        }

        if (storedShip) {
            setShipments(JSON.parse(storedShip));
        } else {
            localStorage.setItem('fsc_eudr_shipments', JSON.stringify(SEED_SHIPMENTS));
            setShipments(SEED_SHIPMENTS);
        }
    }, []);

    useEffect(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, [tab, sidebarOpen]);

    // Save Plantation
    const savePlantation = (data) => {
        let updated = [];
        if (editPlantationId) {
            updated = plantations.map(p => p.id === editPlantationId ? data : p);
        } else {
            updated = [...plantations, data];
        }
        localStorage.setItem('fsc_eudr_plantations', JSON.stringify(updated));
        setPlantations(updated);
        setEditPlantationId(null);
        setTab('plantations');
    };

    // Delete Plantation (cascades to shipments)
    const deletePlantation = (id) => {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลแปลงปลูกนี้จากฐานข้อมูล?\n(รายการขนส่งที่เชื่อมกับแปลงนี้จะถูกลบด้วย)')) {
            const updated = plantations.filter(p => p.id !== id);
            localStorage.setItem('fsc_eudr_plantations', JSON.stringify(updated));
            setPlantations(updated);
            const updatedShip = shipments.filter(s => s.plantationId !== id);
            localStorage.setItem('fsc_eudr_shipments', JSON.stringify(updatedShip));
            setShipments(updatedShip);
        }
    };

    // Edit Plantation Navigation
    const triggerEdit = (id) => {
        setEditPlantationId(id);
        setTab('plantations-edit');
    };

    // Add Shipment Handler
    const addShipment = (data) => {
        const updated = [...shipments, data];
        localStorage.setItem('fsc_eudr_shipments', JSON.stringify(updated));
        setShipments(updated);
        alert('บันทึกการส่งมอบไม้ในสมุดบัญชี CoC สำเร็จ!');
        setTab('dashboard');
    };

    // Delete Shipment
    const deleteShipment = (id) => {
        if (confirm('ยืนยันการลบรายการขนส่งนี้ออกจากสมุด CoC?')) {
            const updated = shipments.filter(s => s.id !== id);
            localStorage.setItem('fsc_eudr_shipments', JSON.stringify(updated));
            setShipments(updated);
        }
    };

    // Export all data as JSON backup
    const exportAllData = () => {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            plantations,
            shipments
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FSC-EUDR-Backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Import data from JSON backup
    const importData = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (Array.isArray(data.plantations) && Array.isArray(data.shipments)) {
                    if (confirm(`นำเข้าข้อมูล ${data.plantations.length} แปลงปลูก และ ${data.shipments.length} รายการขนส่ง?\n⚠️ ข้อมูลปัจจุบันในระบบจะถูกแทนที่ทั้งหมด`)) {
                        localStorage.setItem('fsc_eudr_plantations', JSON.stringify(data.plantations));
                        localStorage.setItem('fsc_eudr_shipments', JSON.stringify(data.shipments));
                        setPlantations(data.plantations);
                        setShipments(data.shipments);
                        alert(`นำเข้าข้อมูลสำเร็จ! (${data.plantations.length} แปลง, ${data.shipments.length} รายการขนส่ง)`);
                    }
                } else {
                    alert('รูปแบบไฟล์ไม่ถูกต้อง กรุณาใช้ไฟล์สำรองข้อมูล (.json) จากระบบนี้เท่านั้น');
                }
            } catch {
                alert('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบว่าเป็นไฟล์ JSON ที่ถูกต้อง');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const closeNav = () => setSidebarOpen(false);

    return html`
        <div class="app-container">
            <!-- Mobile hamburger button -->
            <button class="hamburger-btn" onClick=${() => setSidebarOpen(!sidebarOpen)} title="เปิด/ปิดเมนู">
                <${Icon} name=${sidebarOpen ? 'x' : 'menu'} />
                <span>เมนู</span>
            </button>

            <!-- Mobile sidebar overlay -->
            ${sidebarOpen && html`
                <div
                    style="position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99;backdrop-filter:blur(2px);"
                    onClick=${closeNav}
                ></div>
            `}

            <!-- Sidebar Navigation -->
            <aside class=${"sidebar" + (sidebarOpen ? ' mobile-open' : '')}>
                <div class="logo-section">
                    <div class="logo-icon">🌳</div>
                    <div class="logo-text">
                        <h2>FSC & EUDR</h2>
                        <p>Compliance Portal</p>
                    </div>
                </div>

                <ul class="nav-links">
                    <li>
                        <a class="nav-item ${tab === 'dashboard' ? 'active' : ''}" onClick=${() => { setTab('dashboard'); closeNav(); }}>
                            <${Icon} name="layout-dashboard" /> แดชบอร์ด
                        </a>
                    </li>
                    <li>
                        <a class="nav-item ${tab === 'plantations' || tab.startsWith('plantations-') ? 'active' : ''}" onClick=${() => { setEditPlantationId(null); setTab('plantations'); closeNav(); }}>
                            <${Icon} name="database" /> ฐานข้อมูลแปลงปลูก
                        </a>
                    </li>
                    <li>
                        <a class="nav-item ${tab === 'shipments' ? 'active' : ''}" onClick=${() => { setTab('shipments'); closeNav(); }}>
                            <${Icon} name="truck" /> บันทึกการส่งไม้ (CoC)
                        </a>
                    </li>
                    <li>
                        <a class="nav-item ${tab === 'dds-report' ? 'active' : ''}" onClick=${() => { setTab('dds-report'); closeNav(); }}>
                            <${Icon} name="file-text" /> รายงาน Due Diligence
                        </a>
                    </li>
                </ul>

                <div class="sidebar-footer">
                    <div>มาตรฐาน: <b>FSC-STD-40-005 V3-1</b></div>
                    <div style="font-size:0.7rem; color:var(--primary); margin-top:4px;">● EUDR COMPLIANCE ACTIVE</div>

                    <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
                        <button
                            class="btn btn-outline"
                            style="font-size:0.75rem; padding:7px 10px; width:100%; justify-content:center;"
                            onClick=${exportAllData}
                            title="ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ JSON สำหรับสำรองข้อมูล"
                        >
                            <${Icon} name="download-cloud" /> สำรองข้อมูล (.json)
                        </button>
                        <label
                            class="btn btn-outline"
                            style="font-size:0.75rem; padding:7px 10px; cursor:pointer; display:flex; align-items:center; gap:8px; justify-content:center; margin:0;"
                            title="นำเข้าข้อมูลจากไฟล์สำรอง JSON"
                        >
                            <${Icon} name="upload-cloud" /> นำเข้าข้อมูล (.json)
                            <input type="file" accept=".json" style="display:none;" onChange=${importData} />
                        </label>
                    </div>
                </div>
            </aside>

            <!-- Main Panel Content -->
            <main class="main-content">
                ${tab === 'dashboard' && html`
                    <${Dashboard}
                        plantations=${plantations}
                        shipments=${shipments}
                        setTab=${setTab}
                        setSelectedPlantationId=${(id) => { setSelectedPlantationId(id); setTab('dds-report'); }}
                    />
                `}

                ${tab === 'plantations' && html`
                    <${PlantationList}
                        plantations=${plantations}
                        onDelete=${deletePlantation}
                        onEdit=${triggerEdit}
                        setTab=${setTab}
                        setSelectedPlantationId=${setSelectedPlantationId}
                    />
                `}

                ${(tab === 'plantations-new' || tab === 'plantations-edit') && html`
                    <${PlantationForm}
                        plantations=${plantations}
                        onSave=${savePlantation}
                        onCancel=${() => { setEditPlantationId(null); setTab('plantations'); }}
                        editPlantationId=${editPlantationId}
                    />
                `}

                ${tab === 'shipments' && html`
                    <${CocLedger}
                        shipments=${shipments}
                        plantations=${plantations}
                        onAddShipment=${addShipment}
                        onDeleteShipment=${deleteShipment}
                    />
                `}

                ${tab === 'dds-report' && html`
                    <${DdsReport}
                        plantations=${plantations}
                        selectedPlantationId=${selectedPlantationId}
                        setTab=${setTab}
                    />
                `}
            </main>
        </div>
    `;
}

render(html`<${App} />`, document.getElementById('app'));
