import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import {
    Icon,
    LoginForm,
    Dashboard,
    PlantationForm,
    PlantationList,
    PlantationView,
    CocLedger,
    DdsReport,
    TimberDeliveryNote,
    VesselShipment,
    MonthlyReport,
    UserManagement,
    AuditLog
} from './components.js';
import { authLogin, authLogout, authValidateToken, getUsers, createUser, updateUser, logAction, getAuditLog } from './api.js';
import { DEMO_MODE } from './config.js';

const html = htm.bind(h);

// App data version — bump this to clear localStorage on schema changes
// v2.2: A2 Customer ID, B1 Eucalyptus species, B2 HCV 6-question, B3 targetMill, A7 DO user-entered
// v2.3: C1 Monthly Report, C2 Vessel Shipment, C3 Plot Reuse Lock (912-day lock + registeredAt)
// v2.4: Phase 2 Approval Workflow — plantation status: pending / approved / rejected
// v2.5: Phase 3 User Management — users stored in fsc_eudr_users (preserved across migrations)
const APP_VERSION = '2.5';

// Seed Data (new schema: id=FSC-xxxxxx, plotCode=3-digit string)
const SEED_PLANTATIONS = [
    {
        id: 'FSC-087115',
        plotCode: '001',
        owner: 'นายสมชาย ป่าไม้ดี',
        tel: '0812345678',
        subdistrict: 'ลานสัก',
        district: 'ลานสัก',
        province: 'อุทัยธานี',
        targetMill: 'โรงงาน Double A (มหาชน) สาขาท่าตูม',
        areaRai: 18,
        areaHectares: 2.88,
        landDocType: 'Chanote',
        landDocNumber: '44109/ระวาง 5038III',
        landDocIssueDate: '2018-05-15',
        spcName: 'Eucalyptus camaldulensis (ยูคาลิปตัสน้ำ)',
        fmCertified: true,
        fmCertNumber: 'FM/TH-006178',
        plantDate: '2021-06-15',
        harvestDate: '2026-06-15',
        estVolume: 75,
        geoType: 'point',
        coords: { lat: 15.421102, lng: 99.412345 },
        hcvQ1: false, hcvQ2: true, hcvQ3: false, hcvQ4: false, hcvQ5: false, hcvQ6: false,
        hcvQ3Note: '', hcvQ4Note: '', hcvQ5Note: '', hcvQ6Note: '',
        hcvNonCompliant: false, hcvSpecifiedRisk: false,
        deforestationFreeCheck: true,
        forestProtectionZoneCheck: true,
        fscSTD1: true, fscSTD2: true, fscSTD3: true, fscSTD4: true,
        fscSTD5: true, fscSTD6: true, fscSTD7: true,
        docAttachmentDeed: true,
        docAttachmentOwnerID: true,
        docAttachmentSaleContract: false,
        yieldEvidenceNote: '',
        treeAge: 59,
        fscCwVerdict: 'Low Risk',
        eudrCompliant: true,
        eudrWarning: '',
        fscStatus: 'FSC 100%',
        registeredAt: '2026-03-10T08:00:00.000Z',
        lastUsedDate: null,
        lockedByVesselId: null,
        lockExpiryDate: null,
        status: 'approved',
        statusNote: '',
        submittedBy: null,
        reviewedBy: null
    },
    {
        id: 'FSC-090222',
        plotCode: '002',
        owner: 'นางสาวสิรินทร์ รักษ์ป่า',
        tel: '0898765432',
        subdistrict: 'เกาะขนุน',
        district: 'พนมสารคาม',
        province: 'ฉะเชิงเทรา',
        targetMill: 'บริษัท สยามเซลลูโลส จำกัด สาขาบ้านค่าย',
        areaRai: 35,
        areaHectares: 5.60,
        landDocType: 'NorSor3',
        landDocNumber: '8812 ก.',
        landDocIssueDate: '2019-11-20',
        spcName: 'Eucalyptus camaldulensis (ยูคาลิปตัสน้ำ)',
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
        hcvQ1: false, hcvQ2: true, hcvQ3: false, hcvQ4: false, hcvQ5: false, hcvQ6: false,
        hcvQ3Note: '', hcvQ4Note: '', hcvQ5Note: '', hcvQ6Note: '',
        hcvNonCompliant: false, hcvSpecifiedRisk: false,
        deforestationFreeCheck: true,
        forestProtectionZoneCheck: true,
        fscSTD1: true, fscSTD2: true, fscSTD3: true, fscSTD4: true,
        fscSTD5: true, fscSTD6: true, fscSTD7: true,
        docAttachmentDeed: true,
        docAttachmentOwnerID: true,
        docAttachmentSaleContract: true,
        yieldEvidenceNote: '',
        treeAge: 48,
        fscCwVerdict: 'Low Risk',
        eudrCompliant: true,
        eudrWarning: '',
        fscStatus: 'FSC Controlled Wood',
        registeredAt: '2026-04-05T09:00:00.000Z',
        lastUsedDate: null,
        lockedByVesselId: null,
        lockExpiryDate: null,
        status: 'approved',
        statusNote: '',
        submittedBy: null,
        reviewedBy: null
    },
    {
        id: 'FSC-030441',
        plotCode: '003',
        owner: 'นายประวิทย์ บุกรุกเลี่ยง',
        tel: '0855551234',
        subdistrict: 'ลาดกระทิง',
        district: 'สนามชัยเขต',
        province: 'ฉะเชิงเทรา',
        targetMill: '',
        areaRai: 50,
        areaHectares: 8.00,
        landDocType: 'Others',
        landDocNumber: 'ภ.บ.ท. 5 เลขที่ 902',
        landDocIssueDate: '2021-01-20',
        spcName: 'Eucalyptus camaldulensis (ยูคาลิปตัสน้ำ)',
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
        hcvQ1: true,  hcvQ2: true, hcvQ3: false, hcvQ4: false, hcvQ5: false, hcvQ6: false,
        hcvQ3Note: '', hcvQ4Note: '', hcvQ5Note: '', hcvQ6Note: '',
        hcvNonCompliant: true, hcvSpecifiedRisk: false,
        deforestationFreeCheck: false,
        forestProtectionZoneCheck: false,
        fscSTD1: true, fscSTD2: true, fscSTD3: false, fscSTD4: true,
        fscSTD5: true, fscSTD6: true, fscSTD7: true,
        docAttachmentDeed: false,
        docAttachmentOwnerID: true,
        docAttachmentSaleContract: false,
        yieldEvidenceNote: '',
        treeAge: 40,
        fscCwVerdict: 'Specified Risk',
        eudrCompliant: false,
        eudrWarning: 'แปลงอยู่ในเขตป่าสงวนหรือพื้นที่คุ้มครองตามกฎหมาย (ข้อ 3.1)',
        fscStatus: 'FSC Controlled Wood',
        registeredAt: '2026-05-01T10:00:00.000Z',
        lastUsedDate: null,
        lockedByVesselId: null,
        lockExpiryDate: null,
        status: 'approved',
        statusNote: '',
        submittedBy: null,
        reviewedBy: null
    }
];

// Seed Vessel Shipments (empty by default — users create their own)
const SEED_VESSEL_SHIPMENTS = [];

const SEED_SHIPMENTS = [
    {
        id: 'TX-554109',
        plantationId: 'FSC-087115',
        date: '2026-05-20T10:30',
        weight: 15.5,
        truckPlate: '82-4411',
        truckProvince: 'อุทัยธานี',
        driverName: 'นายประสิทธิ์ เรืองแรง',
        driverLicense: 'DL-88921',
        weightTicket: 'WT-778219',
        deliveryNote: 'DO-55102',
        millName: 'โรงงาน Double A (มหาชน) สาขาท่าตูม',
        fscClaim: 'FSC 100%'
    },
    {
        id: 'TX-881290',
        plantationId: 'FSC-090222',
        date: '2026-05-24T14:15',
        weight: 24.2,
        truckPlate: '71-8899',
        truckProvince: 'ฉะเชิงเทรา',
        driverName: 'นายมานะ รักดี',
        driverLicense: 'DL-66710',
        weightTicket: 'WT-990123',
        deliveryNote: 'DO-77219',
        millName: 'บริษัท สยามเซลลูโลส จำกัด สาขาบ้านค่าย',
        fscClaim: 'FSC Controlled Wood'
    }
];

function App() {
    const [tab, setTab] = useState('dashboard');
    const [plantations, setPlantations] = useState([]);
    const [shipments, setShipments] = useState([]);
    const [vesselShipments, setVesselShipments] = useState([]); // C2
    const [editPlantationId, setEditPlantationId] = useState(null);
    const [viewPlantationId, setViewPlantationId] = useState(null);
    const [selectedPlantationId, setSelectedPlantationId] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // ─── Auth State (Phase 1) ──────────────────────────────────────────────────
    const [currentUser, setCurrentUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [loginLoading, setLoginLoading] = useState(false);
    const [authError, setAuthError] = useState('');

    // ─── User Management State (Phase 3) ──────────────────────────────────────
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);

    // ─── Audit Log State (Phase 4) ────────────────────────────────────────────
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);

    // Initial Load & Seeding (with version-based migration)
    useEffect(() => {
        const storedVersion = localStorage.getItem('fsc_eudr_version');
        if (storedVersion !== APP_VERSION) {
            // Clear old schema data and reseed
            localStorage.setItem('fsc_eudr_version', APP_VERSION);
            localStorage.setItem('fsc_eudr_plantations', JSON.stringify(SEED_PLANTATIONS));
            localStorage.setItem('fsc_eudr_shipments', JSON.stringify(SEED_SHIPMENTS));
            localStorage.setItem('fsc_eudr_vessel_shipments', JSON.stringify(SEED_VESSEL_SHIPMENTS));
            setPlantations(SEED_PLANTATIONS);
            setShipments(SEED_SHIPMENTS);
            setVesselShipments(SEED_VESSEL_SHIPMENTS);
        } else {
            const storedPlt = localStorage.getItem('fsc_eudr_plantations');
            const storedShip = localStorage.getItem('fsc_eudr_shipments');
            const storedVS = localStorage.getItem('fsc_eudr_vessel_shipments');
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
            if (storedVS) {
                setVesselShipments(JSON.parse(storedVS));
            } else {
                localStorage.setItem('fsc_eudr_vessel_shipments', JSON.stringify(SEED_VESSEL_SHIPMENTS));
                setVesselShipments(SEED_VESSEL_SHIPMENTS);
            }
        }
    }, []);

    useEffect(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, [tab, sidebarOpen, vesselShipments, plantations, users]);

    // Load users when user-management tab is first opened (admin only)
    useEffect(() => {
        if (tab === 'user-management' && users.length === 0) {
            loadUsers();
        }
    }, [tab]);

    // Load audit log when audit tab is opened (always refresh)
    useEffect(() => {
        if (tab === 'audit-log') {
            loadAuditLog();
        }
    }, [tab]);

    // ─── Session Validation on Mount (Phase 1) ────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        async function checkSession() {
            try {
                const sessionStr = localStorage.getItem('fsc_eudr_session');
                if (!sessionStr) { if (!cancelled) setAuthLoading(false); return; }
                const session = JSON.parse(sessionStr);
                // Fast local expiry check before hitting the API
                if (new Date() >= new Date(session.expiresAt)) {
                    localStorage.removeItem('fsc_eudr_session');
                    if (!cancelled) setAuthLoading(false);
                    return;
                }
                // Validate token with API (handles demo mode automatically)
                const result = await authValidateToken(session.token);
                if (cancelled) return;
                if (result.valid) {
                    setCurrentUser(result.user);
                } else {
                    localStorage.removeItem('fsc_eudr_session');
                }
            } catch {
                // Network error → trust cached session if not yet expired
                const sessionStr = localStorage.getItem('fsc_eudr_session');
                if (sessionStr && !cancelled) {
                    try {
                        const session = JSON.parse(sessionStr);
                        if (new Date() < new Date(session.expiresAt)) {
                            setCurrentUser(session.user);
                        } else {
                            localStorage.removeItem('fsc_eudr_session');
                        }
                    } catch {}
                }
            } finally {
                if (!cancelled) setAuthLoading(false);
            }
        }
        checkSession();
        return () => { cancelled = true; };
    }, []);

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
        logAction(currentUser, editPlantationId ? 'UPDATE_PLANTATION' : 'CREATE_PLANTATION', 'Plantations', data.id, data.editReason || '');
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
            logAction(currentUser, 'DELETE_PLANTATION', 'Plantations', id, '');
        }
    };

    // Edit Plantation Navigation
    const triggerEdit = (id) => {
        setEditPlantationId(id);
        setTab('plantations-edit');
    };

    // View Plantation Navigation (read-only — used by FSC Staff)
    const triggerView = (id) => {
        setViewPlantationId(id);
        setTab('plantations-view');
    };

    // Add Shipment Handler
    const addShipment = (data) => {
        const updated = [...shipments, data];
        localStorage.setItem('fsc_eudr_shipments', JSON.stringify(updated));
        setShipments(updated);
        logAction(currentUser, 'ADD_SHIPMENT', 'CoC', data.id, '');
        alert('บันทึกการส่งมอบไม้ในสมุดบัญชี CoC สำเร็จ!');
        setTab('dashboard');
    };

    // Delete Shipment
    const deleteShipment = (id) => {
        if (confirm('ยืนยันการลบรายการขนส่งนี้ออกจากสมุด CoC?')) {
            const updated = shipments.filter(s => s.id !== id);
            localStorage.setItem('fsc_eudr_shipments', JSON.stringify(updated));
            setShipments(updated);
            logAction(currentUser, 'DELETE_SHIPMENT', 'CoC', id, '');
        }
    };

    // C3: Lock selected plots when assigned to a vessel shipment
    const lockPlots = (plotIds, vesselId, createdDate) => {
        const lockExpiry = new Date(createdDate);
        lockExpiry.setDate(lockExpiry.getDate() + 912); // 2 years 6 months ≈ 912 days
        const updated = plantations.map(p => {
            if (plotIds.includes(p.id)) {
                return {
                    ...p,
                    lastUsedDate: createdDate,
                    lockedByVesselId: vesselId,
                    lockExpiryDate: lockExpiry.toISOString()
                };
            }
            return p;
        });
        localStorage.setItem('fsc_eudr_plantations', JSON.stringify(updated));
        setPlantations(updated);
    };

    // C3: Unlock plots when vessel shipment is deleted
    const unlockPlots = (plotIds) => {
        const updated = plantations.map(p => {
            if (plotIds.includes(p.id)) {
                return { ...p, lastUsedDate: null, lockedByVesselId: null, lockExpiryDate: null };
            }
            return p;
        });
        localStorage.setItem('fsc_eudr_plantations', JSON.stringify(updated));
        setPlantations(updated);
    };

    // C2: Add Vessel Shipment + trigger C3 plot lock
    const addVesselShipment = (data, plotIds) => {
        const updated = [...vesselShipments, data];
        localStorage.setItem('fsc_eudr_vessel_shipments', JSON.stringify(updated));
        setVesselShipments(updated);
        lockPlots(plotIds, data.id, data.createdDate);
        logAction(currentUser, 'ADD_VESSEL', 'VesselShipments', data.id, plotIds.length + ' แปลง');
        alert(`บันทึก Vessel DDS สำเร็จ! (${data.id})\n🔒 ล็อคแปลงที่เลือก ${plotIds.length} แปลง เป็นเวลา 912 วัน`);
    };

    // C2: Delete Vessel Shipment + unlock plots
    const deleteVesselShipment = (id, plotIds) => {
        if (confirm('ยืนยันการลบ Vessel DDS นี้?\n🔓 แปลงที่ผูกอยู่จะถูกปลดล็อคโดยอัตโนมัติ')) {
            const updated = vesselShipments.filter(vs => vs.id !== id);
            localStorage.setItem('fsc_eudr_vessel_shipments', JSON.stringify(updated));
            setVesselShipments(updated);
            if (plotIds && plotIds.length > 0) {
                unlockPlots(plotIds);
            }
            logAction(currentUser, 'DELETE_VESSEL', 'VesselShipments', id, '');
        }
    };

    // Export all data as JSON backup
    const exportAllData = () => {
        const data = {
            version: APP_VERSION,
            exportDate: new Date().toISOString(),
            plantations,
            shipments,
            vesselShipments
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
                    const vsCount = Array.isArray(data.vesselShipments) ? data.vesselShipments.length : 0;
                    if (confirm(`นำเข้าข้อมูล ${data.plantations.length} แปลงปลูก, ${data.shipments.length} รายการขนส่ง และ ${vsCount} รายการส่งออกเรือ?\n⚠️ ข้อมูลปัจจุบันในระบบจะถูกแทนที่ทั้งหมด`)) {
                        localStorage.setItem('fsc_eudr_plantations', JSON.stringify(data.plantations));
                        localStorage.setItem('fsc_eudr_shipments', JSON.stringify(data.shipments));
                        const vsData = Array.isArray(data.vesselShipments) ? data.vesselShipments : [];
                        localStorage.setItem('fsc_eudr_vessel_shipments', JSON.stringify(vsData));
                        localStorage.setItem('fsc_eudr_version', APP_VERSION);
                        setPlantations(data.plantations);
                        setShipments(data.shipments);
                        setVesselShipments(vsData);
                        logAction(currentUser, 'IMPORT_DATA', 'All', '', data.plantations.length + ' แปลง');
                        alert(`นำเข้าข้อมูลสำเร็จ! (${data.plantations.length} แปลง, ${data.shipments.length} รายการขนส่ง, ${vsCount} Vessel DDS)`);
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

    // ─── Login Handler (Phase 1) ───────────────────────────────────────────────
    const handleLogin = async (username, password) => {
        setLoginLoading(true);
        setAuthError('');
        try {
            const result = await authLogin(username, password);
            if (result.success) {
                const session = { token: result.token, user: result.user, expiresAt: result.expiresAt };
                localStorage.setItem('fsc_eudr_session', JSON.stringify(session));
                setCurrentUser(result.user);
            } else {
                setAuthError(result.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
            }
        } catch {
            setAuthError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเตอร์เน็ต');
        } finally {
            setLoginLoading(false);
        }
    };

    // ─── Logout Handler (Phase 1) ──────────────────────────────────────────────
    const handleLogout = async () => {
        if (!confirm('ยืนยันการออกจากระบบ?')) return;
        const sessionStr = localStorage.getItem('fsc_eudr_session');
        if (sessionStr) {
            try {
                const session = JSON.parse(sessionStr);
                await authLogout(session.token);
            } catch {}
        }
        logAction(currentUser, 'LOGOUT', 'Sessions', currentUser?.username, '');
        localStorage.removeItem('fsc_eudr_session');
        setCurrentUser(null);
        setTab('dashboard');
    };

    // ─── Phase 2: Approval Handlers ───────────────────────────────────────────
    const handleApprove = (id) => {
        const updated = plantations.map(p => {
            if (p.id !== id) return p;
            return {
                ...p,
                status: 'approved',
                statusNote: '',
                reviewedBy: {
                    userId: currentUser.id,
                    username: currentUser.username,
                    fullName: currentUser.fullName,
                    reviewedAt: new Date().toISOString()
                }
            };
        });
        localStorage.setItem('fsc_eudr_plantations', JSON.stringify(updated));
        setPlantations(updated);
        logAction(currentUser, 'APPROVE_PLANTATION', 'Plantations', id, '');
    };

    const handleReject = (id, reason) => {
        const updated = plantations.map(p => {
            if (p.id !== id) return p;
            return {
                ...p,
                status: 'rejected',
                statusNote: reason || 'ไม่ระบุเหตุผล',
                reviewedBy: {
                    userId: currentUser.id,
                    username: currentUser.username,
                    fullName: currentUser.fullName,
                    reviewedAt: new Date().toISOString()
                }
            };
        });
        localStorage.setItem('fsc_eudr_plantations', JSON.stringify(updated));
        setPlantations(updated);
        logAction(currentUser, 'REJECT_PLANTATION', 'Plantations', id, reason || 'ไม่ระบุเหตุผล');
    };

    // ─── Phase 3: User Management Handlers ───────────────────────────────────
    const getSessionToken = () => {
        try { return JSON.parse(localStorage.getItem('fsc_eudr_session') || '{}').token || null; } catch { return null; }
    };

    const loadUsers = async () => {
        setUsersLoading(true);
        try {
            const result = await getUsers(getSessionToken());
            if (result.success) setUsers(result.users);
        } finally { setUsersLoading(false); }
    };

    const handleCreateUser = async (userData) => {
        const result = await createUser(getSessionToken(), userData);
        if (result.success) {
            await loadUsers();
            logAction(currentUser, 'CREATE_USER', 'Users', result.userId, userData.username);
        }
        return result;
    };

    const handleUpdateUser = async (userId, changes) => {
        const result = await updateUser(getSessionToken(), userId, changes);
        if (result.success) {
            await loadUsers();
            const detail = changes.active !== undefined ? (changes.active ? 'เปิดใช้งาน' : 'ระงับบัญชี') : Object.keys(changes).join(', ');
            logAction(currentUser, 'UPDATE_USER', 'Users', userId, detail);
        }
        return result;
    };

    // ─── Phase 4: Audit Log ────────────────────────────────────────────────────
    const loadAuditLog = async () => {
        setAuditLoading(true);
        try {
            const result = await getAuditLog(getSessionToken());
            if (result.success) setAuditLogs(result.logs);
        } finally { setAuditLoading(false); }
    };

    // ─── Role & Display Labels ─────────────────────────────────────────────────
    // (computed after auth guards — currentUser guaranteed non-null here)
    const ROLE_LABELS = {
        admin:           { label: 'ผู้ดูแลระบบ',      color: '#ef4444', bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.3)'    },
        manager:         { label: 'ผู้จัดการ',          color: '#a855f7', bg: 'rgba(168,85,247,0.08)',   border: 'rgba(168,85,247,0.3)'   },
        fsc_staff:       { label: 'FSC Staff',           color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.3)'   },
        procurement_mgr: { label: 'จัดซื้อ (อาวุโส)',  color: '#10b981', bg: 'rgba(16,185,129,0.08)',   border: 'rgba(16,185,129,0.3)'   },
        procurement:     { label: 'จัดซื้อ',            color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',  border: 'rgba(148,163,184,0.3)'  },
    };
    const FALLBACK_ROLE = { label: 'ผู้ใช้งาน', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.3)' };

    // ─── Auth Guards ───────────────────────────────────────────────────────────
    if (authLoading) {
        return html`
            <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg-dark);">
                <div style="text-align:center;">
                    <div style="font-size:3.5rem;margin-bottom:18px;">🌳</div>
                    <div style="font-size:0.9rem;color:var(--text-muted);letter-spacing:0.02em;">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</div>
                </div>
            </div>
        `;
    }
    if (!currentUser) {
        return html`
            <${LoginForm}
                onLogin=${handleLogin}
                loading=${loginLoading}
                error=${authError}
                demoMode=${DEMO_MODE}
            />
        `;
    }

    // ── currentUser is guaranteed non-null from here ──
    const roleLevel = currentUser.roleLevel || 1;
    const roleInfo = ROLE_LABELS[currentUser.role] || FALLBACK_ROLE;

    // Phase 2: filtered plantation sets
    const approvedPlantations = plantations.filter(p => !p.status || p.status === 'approved');
    const pendingCount = plantations.filter(p => p.status === 'pending').length;

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
                        <a class="nav-item ${tab === 'timber-note' ? 'active' : ''}" onClick=${() => { setTab('timber-note'); closeNav(); }}>
                            <${Icon} name="file-check" /> ใบนำส่งไม้ (กรมป่าไม้)
                        </a>
                    </li>
                    <li>
                        <a class="nav-item ${tab === 'dds-report' ? 'active' : ''}" onClick=${() => { setTab('dds-report'); closeNav(); }}>
                            <${Icon} name="file-text" /> รายงาน Due Diligence
                        </a>
                    </li>
                    <li>
                        <a class="nav-item ${tab === 'vessel-shipment' ? 'active' : ''}" onClick=${() => { setTab('vessel-shipment'); closeNav(); }}>
                            <${Icon} name="ship" /> ส่งออกทางเรือ (Vessel DDS)
                        </a>
                    </li>
                    ${roleLevel >= 3 && html`
                    <li>
                        <a class="nav-item ${tab === 'monthly-report' ? 'active' : ''}" onClick=${() => { setTab('monthly-report'); closeNav(); }}>
                            <${Icon} name="bar-chart-2" /> รายงานรายเดือน
                        </a>
                    </li>
                    `}
                    ${roleLevel >= 5 && html`
                    <li>
                        <a class="nav-item ${tab === 'user-management' ? 'active' : ''}" onClick=${() => { setTab('user-management'); closeNav(); }}>
                            <${Icon} name="users" /> จัดการผู้ใช้งาน
                        </a>
                    </li>
                    `}
                    ${roleLevel >= 5 && html`
                    <li>
                        <a class="nav-item ${tab === 'audit-log' ? 'active' : ''}" onClick=${() => { setTab('audit-log'); closeNav(); }}>
                            <${Icon} name="clipboard-list" /> บันทึกการใช้งาน
                        </a>
                    </li>
                    `}
                </ul>

                <div class="sidebar-footer">
                    <!-- Phase 1: User info card + logout -->
                    <div style="background:${roleInfo.bg};border:1px solid ${roleInfo.border};border-radius:10px;padding:10px 12px;margin-bottom:14px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:33px;height:33px;border-radius:50%;background:${roleInfo.bg};border:1px solid ${roleInfo.border};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <${Icon} name="user" size="15" />
                            </div>
                            <div style="min-width:0;flex:1;overflow:hidden;">
                                <div style="font-size:0.82rem;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${currentUser.fullName}">${currentUser.fullName}</div>
                                <div style="font-size:0.7rem;font-weight:600;color:${roleInfo.color};margin-top:1px;">${roleInfo.label}</div>
                            </div>
                        </div>
                        <button
                            class="btn"
                            style="width:100%;margin-top:9px;padding:6px 8px;font-size:0.75rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.28);color:#ef4444;justify-content:center;gap:6px;border-radius:7px;"
                            onClick=${handleLogout}
                        >
                            <${Icon} name="log-out" size="13" /> ออกจากระบบ
                        </button>
                    </div>

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
                        pendingCount=${pendingCount}
                        roleLevel=${roleLevel}
                    />
                `}

                ${tab === 'plantations' && html`
                    <${PlantationList}
                        plantations=${plantations}
                        onDelete=${deletePlantation}
                        onEdit=${triggerEdit}
                        onView=${triggerView}
                        setTab=${setTab}
                        setSelectedPlantationId=${setSelectedPlantationId}
                        currentUser=${currentUser}
                        onApprove=${handleApprove}
                        onReject=${handleReject}
                    />
                `}

                ${(tab === 'plantations-new' || tab === 'plantations-edit') && html`
                    <${PlantationForm}
                        plantations=${plantations}
                        onSave=${savePlantation}
                        onCancel=${() => { setEditPlantationId(null); setTab('plantations'); }}
                        editPlantationId=${editPlantationId}
                        currentUser=${currentUser}
                    />
                `}

                ${tab === 'plantations-view' && html`
                    <${PlantationView}
                        plantations=${plantations}
                        viewPlantationId=${viewPlantationId}
                        onBack=${() => { setViewPlantationId(null); setTab('plantations'); }}
                        onApprove=${handleApprove}
                        onReject=${handleReject}
                        currentUser=${currentUser}
                    />
                `}

                ${tab === 'shipments' && html`
                    <${CocLedger}
                        shipments=${shipments}
                        plantations=${plantations}
                        onAddShipment=${addShipment}
                        onDeleteShipment=${deleteShipment}
                        setTab=${setTab}
                        setSelectedShipmentId=${(id) => { setTab('timber-note'); }}
                    />
                `}

                ${tab === 'timber-note' && html`
                    <${TimberDeliveryNote}
                        shipments=${shipments}
                        plantations=${plantations}
                    />
                `}

                ${tab === 'dds-report' && html`
                    <${DdsReport}
                        plantations=${plantations}
                        selectedPlantationId=${selectedPlantationId}
                        setTab=${setTab}
                    />
                `}

                ${tab === 'vessel-shipment' && html`
                    <${VesselShipment}
                        vesselShipments=${vesselShipments}
                        plantations=${plantations}
                        onAddVesselShipment=${addVesselShipment}
                        onDeleteVesselShipment=${deleteVesselShipment}
                    />
                `}

                ${tab === 'monthly-report' && roleLevel >= 3 && html`
                    <${MonthlyReport}
                        plantations=${plantations}
                        shipments=${shipments}
                        vesselShipments=${vesselShipments}
                    />
                `}

                ${tab === 'user-management' && roleLevel >= 5 && html`
                    <${UserManagement}
                        currentUser=${currentUser}
                        users=${users}
                        usersLoading=${usersLoading}
                        onCreateUser=${handleCreateUser}
                        onUpdateUser=${handleUpdateUser}
                        onRefresh=${loadUsers}
                    />
                `}

                ${tab === 'audit-log' && roleLevel >= 5 && html`
                    <${AuditLog} logs=${auditLogs} loading=${auditLoading} />
                `}
            </main>
        </div>
    `;
}

render(html`<${App} />`, document.getElementById('app'));
