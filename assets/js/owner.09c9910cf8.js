// =====================================================================
//  منصة Weekend — كود صفحة المالك (owner.js) — نُقل حرفياً من owner.html [البند 19]
// =====================================================================
        const SUPABASE_URL = 'https://yeysruiowtjpwyicsukf.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_--ZBMiy0SK8D-IQ4_Ab0hw_XneXxcCJ';
        const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

        // جلسة المالك: رمز مؤقت يصدره السيرفر (لا يُحفظ رقم الهاتف أو الـ PIN في المتصفح)
        let ownerSession = null;
        let ownerFacilities = [];
        let ownerBookings = [];
        let ownerRequests = [];
        let editingPhotos = [];

        function escapeHtml(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        }
        function normalizePhone(p) { return String(p || '').trim().replace(/[\s\-()]/g, ''); }
        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 4000);
        }

        function compressImageToBlob(file, maxDim = 1200, quality = 0.8) {
            return new Promise((resolve, reject) => {
                if (!file || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
                    return reject(new Error('يرجى اختيار صورة JPEG أو PNG أو WebP فقط'));
                }
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
                reader.onload = ev => {
                    const img = new Image();
                    img.onerror = () => reject(new Error('ملف غير صالح'));
                    img.onload = () => {
                        let w = img.naturalWidth, h = img.naturalHeight;
                        if (w > maxDim || h > maxDim) {
                            if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
                            else { w = Math.round(w * maxDim / h); h = maxDim; }
                        }
                        const c = document.createElement('canvas');
                        c.width = w; c.height = h;
                        const ctx = c.getContext('2d');
                        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(img, 0, 0, w, h);
                        c.toBlob(blob => blob ? resolve(blob) : reject(new Error('فشل ضغط الصورة')), 'image/jpeg', quality);
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        function resetOwnerToLogin() {
            ownerSession = null;
            try { sessionStorage.removeItem('wknd_owner_token'); sessionStorage.removeItem('wknd_owner_session'); } catch (e) {}
            document.getElementById('owner-dashboard-section').style.display = 'none';
            document.getElementById('owner-login-section').style.display = 'block';
            document.getElementById('btn-owner-logout').style.display = 'none';
            document.getElementById('own-login-pin').value = '';
        }

        // التعامل الموحّد مع ردود دوال الملّاك: خطأ اتصال، أو ok=false، أو انتهاء الجلسة
        function handleOwnerRpcFailure(data, error) {
            if (data && data.session_expired) {
                resetOwnerToLogin();
                showToast('⌛ ' + (data.error || 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً.'));
                return true;
            }
            if (error || !data || data.ok === false) {
                showToast('❌ ' + (error?.message || data?.error || 'تعذر تنفيذ الطلب حالياً'));
                return true;
            }
            return false;
        }

        async function ownerLogin(phone, pin) {
            if (!db) return false;
            const { data, error } = await db.rpc('owner_login', { p_phone: phone, p_pin: pin });
            if (error || !data || !data.ok || !data.token) {
                showToast('❌ ' + (error?.message || data?.error || 'رقم الهاتف أو رمز الدخول غير صحيح'));
                return false;
            }
            ownerSession = { token: data.token, name: data.owner_name || 'صاحب المنشأة' };
            try {
                sessionStorage.removeItem('wknd_owner_session');
                sessionStorage.setItem('wknd_owner_token', data.token);
            } catch (e) {}
            const ok = await loadOwnerDashboard(false);
            if (ok && data.weak_pin) {
                showToast('⚠️ رمز دخولك قصير وأقل أماناً. يرجى طلب رمز جديد من 6 إلى 8 أرقام من إدارة المنصة.');
            }
            return ok;
        }

        async function loadOwnerDashboard(silent = false) {
            if (!db || !ownerSession) return false;
            const { data, error } = await db.rpc('owner_get_dashboard', { p_token: ownerSession.token });
            if (error || !data || !data.ok) {
                if (data && data.session_expired) {
                    resetOwnerToLogin();
                    if (!silent) showToast('⌛ ' + (data.error || 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً.'));
                } else if (!silent) {
                    showToast('❌ ' + (error?.message || data?.error || 'تعذر تحميل لوحة المالك'));
                }
                return false;
            }
            ownerSession.name = data.owner_name || ownerSession.name || 'صاحب المنشأة';
            ownerFacilities = Array.isArray(data.facilities) ? data.facilities : [];
            ownerBookings = Array.isArray(data.bookings) ? data.bookings : [];
            ownerRequests = Array.isArray(data.requests) ? data.requests : [];

            document.getElementById('owner-login-section').style.display = 'none';
            document.getElementById('owner-dashboard-section').style.display = 'block';
            document.getElementById('btn-owner-logout').style.display = 'inline-block';
            document.getElementById('owner-welcome-title').textContent = `مرحباً ${ownerSession.name} 👋`;
            renderOwnerUI();
            return true;
        }

        function renderOwnerUI() {
            const realConfirmed = ownerBookings.filter(b => b.status === 'confirmed' && !b.is_owner_block && !String(b.client_name || '').includes('قفل إداري'));
            const pendingList = ownerBookings.filter(b => b.status === 'pending');
            const totalSum = realConfirmed.reduce((s, b) => s + (Number(b.total) || 0), 0);

            document.getElementById('stat-own-facs').textContent = ownerFacilities.length;
            document.getElementById('stat-own-confirmed').textContent = realConfirmed.length;
            document.getElementById('stat-own-pending').textContent = pendingList.length;
            document.getElementById('stat-own-total').textContent = `${totalSum.toFixed(0)} JOD`;

            // Populate quick block facility dropdown
            const sel = document.getElementById('ob-facility');
            const prev = sel.value;
            sel.innerHTML = ownerFacilities.map(f => `<option value="${f.id}">${escapeHtml(f.name_ar)}</option>`).join('');
            if (prev && ownerFacilities.some(f => String(f.id) === prev)) sel.value = prev;
            const dateInp = document.getElementById('ob-date');
            // [البند 25] التاريخ الافتراضي بتوقيت الأردن (وليس UTC)
            if (dateInp && !dateInp.value) dateInp.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            syncOwnerBlockUI();

            // Render Bookings table
            const tbody = document.getElementById('owner-bookings-tbody');
            if (!ownerBookings.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem;">لا توجد حجوزات قادمة لمنشآتك حالياً</td></tr>';
            } else {
                tbody.innerHTML = ownerBookings.map(b => {
                    const isBlock = Boolean(b.is_owner_block) || String(b.client_name || '').includes('قفل');
                    const rem = Math.max(0, Number(b.total || 0) - Number(b.deposit || 0));
                    const badge = isBlock
                        ? '<span class="badge badge-lock">🔒 قفل خارجي</span>'
                        : (b.status === 'confirmed' ? '<span class="badge badge-ok">✅ مؤكد</span>' : '<span class="badge badge-pend">⏳ قيد المراجعة</span>');
                    const actionHtml = b.is_owner_block
                        ? `<button type="button" class="btn btn-danger" style="padding:0.35rem 0.7rem;font-size:0.78rem;margin-top:4px;" data-action="unblock" data-id="${b.id}">🔓 فتح الموعد</button>`
                        : '';
                    return `<tr>
                        <td><strong style="direction:ltr;display:inline-block;">#${escapeHtml(b.ticket_code || ('WKND-' + b.id))}</strong></td>
                        <td>${escapeHtml(b.item_name_ar)}</td>
                        <td><strong>${escapeHtml(b.client_name)}</strong><br><small style="direction:ltr;display:inline-block;">${isBlock ? '—' : escapeHtml(b.phone)}</small></td>
                        <td><small>${escapeHtml(b.details)}</small></td>
                        <td>${isBlock ? '—' : `الإجمالي: ${Number(b.total || 0).toFixed(2)} JOD<br><strong style="color:var(--ok);">المتبقي عندك: ${rem.toFixed(2)} JOD</strong>`}</td>
                        <td>${badge}<br>${actionHtml}</td>
                    </tr>`;
                }).join('');
            }


            const reqTbody = document.getElementById('owner-requests-tbody');
            if (reqTbody) {
                if (!ownerRequests.length) {
                    reqTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1.5rem;">لا توجد طلبات مرسلة حالياً</td></tr>';
                } else {
                    reqTbody.innerHTML = ownerRequests.map(r => {
                        const bdg = r.status === 'pending'
                            ? '<span class="badge badge-pend">⏳ بانتظار موافقة الإدارة</span>'
                            : (r.status === 'approved' ? '<span class="badge badge-ok">✅ تمت الموافقة والتطبيق</span>' : '<span class="badge" style="background:#FFEBEE;color:#D32F2F;">❌ مرفوض</span>');
                        return `<tr><td><strong>${escapeHtml(r.facility_name || '')}</strong></td><td><small>${escapeHtml(r.summary_ar || '')}</small></td><td>${bdg}</td><td><small>${escapeHtml(r.admin_note || '—')}</small></td></tr>`;
                    }).join('');
                }
            }

            // Render Facilities cards
            const grid = document.getElementById('owner-facilities-grid');
            grid.innerHTML = ownerFacilities.map(f => {
                const img = (Array.isArray(f.images) && f.images[0]) ? f.images[0] : 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80';
                const priceLine = f.category === 'field'
                    ? `${f.hourly_rate || 0} JOD / ساعة`
                    : (f.category === 'transport' ? `${f.price_per_km || 0} JOD/كم | ${f.price_per_person || 0} JOD/شخص` : `صباحي ${f.price_day || 0} | مسائي ${f.price_night || 0} | كامل ${f.price_full || 0} JOD`);
                return `<div class="fac-card">
                    <img src="${escapeHtml(img)}" alt="${escapeHtml(f.name_ar)}">
                    <div class="fac-card-body">
                        <div>
                            <h3 style="font-size:1rem;margin-bottom:4px;">${escapeHtml(f.name_ar)}</h3>
                            <div style="font-size:0.82rem;color:var(--muted);margin-bottom:6px;">📍 ${escapeHtml(f.location_ar)}</div>
                            <div style="font-size:0.84rem;font-weight:700;color:var(--dark);">${escapeHtml(priceLine)}</div>
                        </div>
                        <button type="button" class="btn btn-primary" data-action="edit-fac" data-id="${f.id}" style="width:100%;">✏️ تعديل الأسعار والصور</button>
                    </div>
                </div>`;
            }).join('');
        }

        function syncOwnerBlockUI() {
            const fac = ownerFacilities.find(f => String(f.id) === String(document.getElementById('ob-facility').value));
            const sh = document.getElementById('ob-shift-wrap');
            const pt = document.getElementById('ob-pitch-wrap');
            const hrs = document.getElementById('ob-hours');
            if (!fac || fac.category === 'farm') {
                sh.style.display = 'block'; pt.style.display = 'none';
            } else if (fac.category === 'field') {
                sh.style.display = 'none'; pt.style.display = 'block';
                hrs.style.display = document.getElementById('ob-start-hour').value === 'all' ? 'none' : 'block';
            } else {
                sh.style.display = 'none'; pt.style.display = 'none';
            }
        }

        function openOwnerEditFacility(facId) {
            const f = ownerFacilities.find(x => Number(x.id) === Number(facId));
            if (!f) return;
            document.getElementById('oef-id').value = f.id;
            document.getElementById('oef-category').value = f.category;
            document.getElementById('oef-title').textContent = `✏️ تعديل: ${f.name_ar}`;
            document.getElementById('oef-farm-prices').style.display = f.category === 'farm' ? 'grid' : 'none';
            document.getElementById('oef-field-prices').style.display = f.category === 'field' ? 'grid' : 'none';
            document.getElementById('oef-transport-prices').style.display = f.category === 'transport' ? 'grid' : 'none';

            document.getElementById('oef-price-day').value = f.price_day ?? '';
            document.getElementById('oef-price-night').value = f.price_night ?? '';
            document.getElementById('oef-price-full').value = f.price_full ?? '';
            document.getElementById('oef-hourly-rate').value = f.hourly_rate ?? '';
            document.getElementById('oef-price-km').value = f.price_per_km ?? '';
            document.getElementById('oef-price-person').value = f.price_per_person ?? '';
            document.getElementById('oef-security-deposit').value = f.security_deposit ?? 0;
            document.getElementById('oef-specs').value = f.specs_ar || '';
            document.getElementById('oef-cancel-policy').value = f.cancel_policy_ar || '';
            editingPhotos = Array.isArray(f.images) ? [...f.images] : [];
            renderEditingPhotos();
            const card = document.getElementById('owner-edit-fac-card');
            card.style.display = 'block';
            card.scrollIntoView({ behavior: 'smooth' });
        }

        function renderEditingPhotos() {
            const strip = document.getElementById('oef-photos-strip');
            strip.innerHTML = editingPhotos.map((u, i) => `
                <div class="photo-thumb">
                    <img src="${escapeHtml(u)}" alt="صورة ${i + 1}">
                    <button type="button" class="photo-del" data-action="del-photo" data-idx="${i}" title="حذف الصورة">&times;</button>
                </div>`).join('');
        }

        document.addEventListener('DOMContentLoaded', async () => {
            // استعادة الجلسة برمز الجلسة المؤقت فقط (وحذف أي بيانات دخول قديمة محفوظة بالمتصفح)
            try {
                sessionStorage.removeItem('wknd_owner_session');
                const savedToken = sessionStorage.getItem('wknd_owner_token');
                if (savedToken) {
                    ownerSession = { token: savedToken, name: 'صاحب المنشأة' };
                    const restored = await loadOwnerDashboard(true);
                    if (!restored) resetOwnerToLogin();
                }
            } catch (e) {}

            document.getElementById('owner-login-form').addEventListener('submit', async e => {
                e.preventDefault();
                const phone = normalizePhone(document.getElementById('own-login-phone').value);
                const pin = document.getElementById('own-login-pin').value.trim();
                const btn = document.getElementById('btn-own-login');
                btn.disabled = true;
                try { await ownerLogin(phone, pin); } finally { btn.disabled = false; }
            });

            document.getElementById('btn-owner-logout').addEventListener('click', async () => {
                const token = ownerSession ? ownerSession.token : null;
                resetOwnerToLogin();
                if (db && token) { try { await db.rpc('owner_logout', { p_token: token }); } catch (e) {} }
            });

            document.getElementById('btn-owner-refresh').addEventListener('click', async () => {
                if (ownerSession) {
                    const ok = await loadOwnerDashboard(false);
                    if (ok) showToast('✅ تم تحديث الحجوزات والمنشآت');
                }
            });

            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById(btn.dataset.tab).classList.add('active');
                });
            });

            document.getElementById('ob-facility').addEventListener('change', syncOwnerBlockUI);
            document.getElementById('ob-start-hour').addEventListener('change', syncOwnerBlockUI);

            document.getElementById('owner-block-form').addEventListener('submit', async e => {
                e.preventDefault();
                if (!ownerSession) return;
                const facId = Number(document.getElementById('ob-facility').value);
                const fac = ownerFacilities.find(f => Number(f.id) === facId);
                const dateVal = document.getElementById('ob-date').value;
                const note = document.getElementById('ob-note').value.trim();
                let shiftType = 'fullday', startHour = null, hours = null;
                if (fac?.category === 'farm') {
                    shiftType = document.getElementById('ob-shift').value;
                } else if (fac?.category === 'field') {
                    const stVal = document.getElementById('ob-start-hour').value;
                    if (stVal !== 'all') {
                        startHour = parseInt(stVal, 10);
                        hours = parseInt(document.getElementById('ob-hours').value, 10) || 2;
                    }
                }
                const btn = document.getElementById('btn-ob-submit');
                btn.disabled = true;
                try {
                    const { data, error } = await db.rpc('owner_block_slot', {
                        p_token: ownerSession.token,
                        p_facility_id: facId, p_booking_date: dateVal,
                        p_shift_type: shiftType, p_start_hour: startHour, p_hours: hours, p_note: note || null
                    });
                    if (error && error.code === '23P01') {
                        showToast('⛔ هذا الموعد محجوز مسبقاً');
                        return;
                    }
                    if (handleOwnerRpcFailure(data, error)) return;
                    document.getElementById('ob-note').value = '';
                    await loadOwnerDashboard(true);
                    showToast('⏳ تم إرسال طلب قفل الموعد للإدارة وبانتظار الموافقة!');
                } finally { btn.disabled = false; }
            });

            document.getElementById('oef-photo-upload').addEventListener('change', async function() {
                const files = Array.from(this.files || []);
                if (!files.length) return;
                const st = document.getElementById('oef-upload-status');
                st.textContent = `⏳ جاري ضغط ورفع ${files.length} صورة...`;
                for (const file of files) {
                    try {
                        const blob = await compressImageToBlob(file);
                        if (blob.size > 2 * 1024 * 1024) throw new Error('حجم الصورة يتجاوز 2MB بعد الضغط');
                        // [البند 6] تصريح رفع من السيرفر مرتبط بجلسة المالك (حد يومي 30 صورة)
                        const { data: grant, error: gErr } = await db.rpc('owner_request_upload', { p_token: ownerSession ? ownerSession.token : '' });
                        if (grant && grant.session_expired) { handleOwnerRpcFailure(grant, null); break; }
                        if (gErr || !grant || !grant.ok) throw new Error(gErr?.message || grant?.error || 'تعذر تجهيز رفع الصورة');
                        const { error } = await db.storage.from('weekend-media').upload(grant.path, blob, { contentType: 'image/jpeg', upsert: false });
                        if (error) throw new Error('تعذر رفع الصورة، حاول مجدداً');
                        editingPhotos.push(grant.public_url);
                        renderEditingPhotos();
                    } catch (err) {
                        showToast('⚠️ ' + (err.message || 'تعذر رفع صورة'));
                    }
                }
                this.value = '';
                st.textContent = '✅ تم تجهيز الصور؛ اضغط «حفظ التحديثات» لنشرها.';
            });

            document.getElementById('owner-edit-fac-form').addEventListener('submit', async e => {
                e.preventDefault();
                if (!ownerSession) return;
                const btn = document.getElementById('btn-oef-save');
                btn.disabled = true;
                try {
                    const { data, error } = await db.rpc('owner_update_facility', {
                        p_token: ownerSession.token,
                        p_facility_id: Number(document.getElementById('oef-id').value),
                        p_price_day: parseFloat(document.getElementById('oef-price-day').value) || null,
                        p_price_night: parseFloat(document.getElementById('oef-price-night').value) || null,
                        p_price_full: parseFloat(document.getElementById('oef-price-full').value) || null,
                        p_hourly_rate: parseFloat(document.getElementById('oef-hourly-rate').value) || null,
                        p_price_per_km: parseFloat(document.getElementById('oef-price-km').value) ?? null,
                        p_price_per_person: parseFloat(document.getElementById('oef-price-person').value) ?? null,
                        p_security_deposit: parseFloat(document.getElementById('oef-security-deposit').value) || 0,
                        p_specs_ar: document.getElementById('oef-specs').value.trim(),
                        p_cancel_policy_ar: document.getElementById('oef-cancel-policy').value.trim(),
                        p_images: editingPhotos
                    });
                    if (handleOwnerRpcFailure(data, error)) return;
                    document.getElementById('owner-edit-fac-card').style.display = 'none';
                    await loadOwnerDashboard(true);
                    showToast('⏳ تم إرسال طلب تعديل المنشأة للإدارة وبانتظار الموافقة!');
                } finally { btn.disabled = false; }
            });

            document.getElementById('btn-oef-cancel').addEventListener('click', () => {
                document.getElementById('owner-edit-fac-card').style.display = 'none';
            });

            document.addEventListener('click', async e => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const act = el.dataset.action;
                if (act === 'edit-fac') {
                    openOwnerEditFacility(el.dataset.id);
                } else if (act === 'del-photo') {
                    const idx = Number(el.dataset.idx);
                    if (editingPhotos.length <= 1) { showToast('⚠️ يجب الإبقاء على صورة واحدة على الأقل'); return; }
                    editingPhotos.splice(idx, 1);
                    renderEditingPhotos();
                } else if (act === 'unblock') {
                    if (!ownerSession || !confirm('هل تريد إلغاء القفل وفتح هذا الموعد للحجز على الموقع؟')) return;
                    const { data, error } = await db.rpc('owner_unblock_slot', {
                        p_token: ownerSession.token, p_booking_id: Number(el.dataset.id)
                    });
                    if (handleOwnerRpcFailure(data, error)) return;
                    await loadOwnerDashboard(true);
                    showToast('⏳ تم إرسال طلب فتح الموعد للإدارة وبانتظار الموافقة!');
                }
            });
        });
