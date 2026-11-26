// =====================================================================
//  منصة Weekend — كود لوحة الأدمن فقط (admin.js)
// =====================================================================

        // =====================================================
        //  SUPABASE CONNECTION
        // =====================================================
                        
        // التحميل الذكي للمكتبات الثقيلة عند الطلب فقط (توفير 1.4 ميجابايت على باقة الموبايل)
                
                        // [البند 13] قراءة JSON آمنة من localStorage: أي قيمة تالفة تُحذف ويُستخدم الافتراضي بدل انهيار الصفحة
        
                
        // ─── تنظيف شامل لأي نص قبل عرضه في HTML لمنع ثغرات DOM XSS ───
        
        const STORAGE_BUCKET = 'weekend-media';

        // فحص روابط الصور لتسمح فقط بـ https:// أو data:image/ الآمنة
        
        // فحص وتطبيع رابط الفيديو (يدعم ملفات الفيديو المرفوعة في weekend-media وروابط يوتيوب)
        
        
        // تنظيف رقم الهاتف ليقبل المسافات والشرطات والأقواس من المستخدم ثم يوحّده
                
        // تحويل رقم الهاتف الأردني المحلي (079... / 078... / 077...) إلى صيغة دولية لروابط واتساب (9627...)
        

        
        function inferRegionCoords(locationText) {
            const loc = String(locationText || '').toLowerCase();
            if (loc.includes('الميت') || loc.includes('dead sea')) return { lat: 31.7190, lng: 35.5870 };
            if (loc.includes('جرش') || loc.includes('jerash')) return { lat: 32.2746, lng: 35.8914 };
            if (loc.includes('عجلون') || loc.includes('ajloun')) return { lat: 32.3327, lng: 35.7518 };
            if (loc.includes('الأغوار') || loc.includes('الاغوار') || loc.includes('غور') || loc.includes('الشونة')) return { lat: 31.9020, lng: 35.5780 };
            if (loc.includes('السلط') || loc.includes('سلط') || loc.includes('salt')) return { lat: 32.0392, lng: 35.7272 };
            if (loc.includes('مادبا') || loc.includes('مأدبا') || loc.includes('madaba')) return { lat: 31.7160, lng: 35.7930 };
            if (loc.includes('المطار') || loc.includes('مطار') || loc.includes('airport')) return { lat: 31.8350, lng: 35.8900 };
            return { lat: 31.9539, lng: 35.9106 };
        }

        
        // ─── ضغط وتحويل الصور بالمتصفح إلى JPEG (أقل من 300KB) مع التحقق أنها صورة حقيقية ───
        
        // ─── رفع الصور إلى مجلد التخزين المستقل (weekend-media) لتخفيف ملف الموقع وقاعدة البيانات ───
        async function uploadImageToSeparateStorage(file, folder = 'facilities/images', maxDim = 1200, quality = 0.80) {
            const compressedDataUrl = await compressImageFileToJpeg(file, maxDim, quality);
            const sizeKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);
            if (db && db.storage) {
                try {
                    const blob = dataUrlToBlob(compressedDataUrl);
                    if (folder === 'cliq-receipts' && blob.size > 2 * 1024 * 1024) {
                        throw new Error('حجم صورة الوصل يتجاوز الحد المسموح (2MB).');
                    }
                    const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.jpg`;
                    const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(filePath, blob, {
                        contentType: 'image/jpeg',
                        cacheControl: '3600',
                        upsert: false
                    });
                    if (!upErr) {
                        const { data: pub } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
                        if (pub && pub.publicUrl) {
                            return { url: pub.publicUrl, sizeKb, storedSeparately: true };
                        }
                    }
                } catch (e) {
                    console.warn('Fallback to compressed image data');
                }
            }
            return { url: compressedDataUrl, sizeKb, storedSeparately: false };
        }

        // ─── رفع فيديو المنشأة إلى مجلد الفيديوهات المستقل (weekend-media/facilities/videos) ───
        async function uploadVideoToSeparateStorage(file, folder = 'facilities/videos') {
            if (!file || !file.type || !/^video\/(mp4|webm|quicktime)$/i.test(file.type)) {
                throw new Error('يرجى اختيار ملف فيديو صالح بصيغة MP4 أو WebM أو MOV.');
            }
            if (file.size > 50 * 1024 * 1024) {
                throw new Error('حجم الفيديو يتجاوز الحد المسموح (50 ميجابايت).');
            }
            if (!db || !db.storage) {
                throw new Error('الاتصال بخدمة التخزين غير متاح حالياً.');
            }
            const extMap = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
            const ext = extMap[file.type.toLowerCase()] || 'mp4';
            const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
            const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(filePath, file, {
                contentType: file.type,
                cacheControl: '3600',
                upsert: false
            });
            if (upErr) {
                throw new Error('تعذر رفع الفيديو: تأكد من تشغيل ملف SQL في Supabase لتفعيل مجلد weekend-media.');
            }
            const { data: pub } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
            if (!pub || !pub.publicUrl) {
                throw new Error('تعذر استخراج رابط الفيديو بعد الرفع.');
            }
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            return { url: pub.publicUrl, sizeMb };
        }

        // الحصول على التاريخ والساعة الحالية بتوقيت الأردن (Asia/Amman)
        
        // ─── تحويل بين صفوف قاعدة البيانات والأوبجكت في المتصفح مع حماية كاملة من القيم الفارغة (null) ───
        
        function itemToRow(it) {
            const cleanAm = Array.isArray(it.amenities) ? it.amenities.filter(a => typeof a === 'string' && !a.startsWith('mapurl:')) : [];
            const mapUrlClean = String(it.mapUrl || '').trim();
            if (mapUrlClean && /^https:\/\//i.test(mapUrlClean)) {
                cleanAm.push('mapurl:' + mapUrlClean);
            }
            const row = {
                category: it.category,
                name_ar: String(it.nameAr || '').trim(),
                name_en: String(it.nameEn || '').trim() || null,
                location_ar: String(it.locationAr || '').trim(),
                location_en: String(it.locationEn || '').trim() || null,
                price_day: it.category === 'farm' ? (Number(it.priceDay) || null) : null,
                price_night: it.category === 'farm' ? (Number(it.priceNight) || null) : null,
                price_full: it.category === 'farm' ? (Number(it.priceFull) || null) : null,
                hourly_rate: it.category === 'field' ? (Number(it.hourlyRate) || null) : null,
                price_per_km: it.category === 'transport' ? (Number(it.pricePerKm) ?? null) : null,
                price_per_person: it.category === 'transport' ? (Number(it.pricePerPerson) ?? null) : null,
                capacity: it.category === 'transport' ? (parseInt(it.capacity, 10) || 23) : null,
                security_deposit: Number(it.securityDeposit) || 0,
                is_verified: it.isVerified !== false,
                specs_ar: String(it.specsAr || '').trim(),
                specs_en: String(it.specsEn || '').trim() || null,
                images: Array.isArray(it.images) ? it.images.map(sanitizeImageUrl) : [],
                video_url: sanitizeVideoUrl(it.videoUrl) || null,
                lat: (it.lat !== null && it.lat !== '' && Number.isFinite(Number(it.lat))) ? Number(it.lat) : null,
                lng: (it.lng !== null && it.lng !== '' && Number.isFinite(Number(it.lng))) ? Number(it.lng) : null,
                cancel_policy_ar: String(it.cancelPolicyAr || '').trim() || null,
                cancel_policy_en: String(it.cancelPolicyEn || '').trim() || null,
                amenities: cleanAm,
                seasons: Array.isArray(it.seasons) && it.seasons.length ? it.seasons : ['summer', 'winter'],
                rating: Number(it.rating) || 5.0,
                active: Boolean(it.active)
            };
            if (it.id) row.id = it.id;
            return row;
        }

        function rowToBooking(r) {
            return {
                id: Number(r.id),
                clientName: String(r.client_name || 'عميل'),
                phone: String(r.phone || ''),
                itemId: r.facility_id ? Number(r.facility_id) : null,
                itemNameAr: String(r.item_name_ar || 'منشأة'),
                itemNameEn: String(r.item_name_en || r.item_name_ar || 'Facility'),
                bookingDate: r.booking_date || null,
                hourFrom: r.hour_from !== null && r.hour_from !== undefined ? Number(r.hour_from) : null,
                hourTo: r.hour_to !== null && r.hour_to !== undefined ? Number(r.hour_to) : null,
                shiftType: r.shift_type || null,
                passengers: r.passengers ? Number(r.passengers) : null,
                distanceKm: r.distance_km ? Number(r.distance_km) : null,
                isRoundTrip: Boolean(r.is_round_trip),
                details: String(r.details || ''),
                total: Number.isFinite(Number(r.total)) ? Number(r.total) : 0,
                deposit: Number.isFinite(Number(r.deposit)) ? Number(r.deposit) : 0,
                ticketCode: String(r.ticket_code || ('WKND-' + r.id)),
                // [البند 18] الوصل لا يُحمَّل مع القائمة: مرجع المجلد الخاص، أو legacy:رقم الحجز للوصولات القديمة (تُجلب عند الطلب)
                receiptRaw: r.receipt_ref ? String(r.receipt_ref) : (r.receipt_legacy ? 'legacy:' + Number(r.id) : ''),
                receiptData: r.receipt_ref ? String(r.receipt_ref) : (r.receipt_legacy ? 'legacy:' + Number(r.id) : sanitizeImageUrl('')),
                changeRequestType: r.change_request_type || null,
                changeRequestNote: r.change_request_note || null,
                changeRequestStatus: r.change_request_status || null,
                pickupLocation: r.pickup_location || null,
                dropoffLocation: r.dropoff_location || null,
                promoCode: r.promo_code || null,
                discountAmount: Number.isFinite(Number(r.discount_amount)) ? Number(r.discount_amount) : 0,
                status: r.status || 'pending',
                createdAt: r.created_at || null
            };
        }

        
        function promoToRow(p) {
            const row = {
                code: String(p.code || '').toUpperCase().trim(),
                title_ar: String(p.titleAr || '').trim(),
                discount_type: p.discountType === 'fixed' ? 'fixed' : 'percent',
                discount_value: Number(p.discountValue) || 10,
                allowed_days: Array.isArray(p.allowedDays) ? p.allowedDays.map(Number) : [0,1,2,3,4,5,6],
                valid_from: p.validFrom || null,
                valid_until: p.validUntil || null,
                excluded_dates: Array.isArray(p.excludedDates) ? p.excludedDates.filter(Boolean) : [],
                excluded_facility_ids: Array.isArray(p.excludedFacilityIds) ? p.excludedFacilityIds.map(Number) : [],
                auto_apply: Boolean(p.autoApply),
                active: Boolean(p.active)
            };
            if (p.id) row.id = Number(p.id);
            return row;
        }


                        let lockTimerInterval = null;
        let editingItemId = null;
        let editingPreviousActive = true;

                                                        // [البند 11] توكن تيليجرام لا يصل للمتصفح ولا يُحفظ فيه: نعرض الحالة فقط من السيرفر
        let telegramStatus = { configured: false, enabled: false, chat_id: '', token_masked: '' };
                        


        // جميع الفترات المحجوزة أو قيد المراجعة من الـ View العام:
        // [{ facilityId, date, hourFrom, hourTo, shiftType, status }]
                        const tempHolds = new Map();
        let activeTempHoldKey = null;

        
        // فحص ما إذا كان مدى ساعات [hFrom, hTo) متقاطعاً مع أي حجز مؤكد أو معلق
        


        function releaseTempHold() {
            if (activeTempHoldKey) { tempHolds.delete(activeTempHoldKey); activeTempHoldKey = null; }
        }

        
        // [البند 18] أرشيف الحجوزات: 200 في كل صفحة مع زر "عرض المزيد"
        const ADMIN_ARCHIVE_PAGE_SIZE = 200;
        let archivedHasMore = false;
        const ADMIN_FACILITY_COLUMNS = 'id,category,name_ar,name_en,location_ar,location_en,price_day,price_night,price_full,hourly_rate,price_per_km,price_per_person,capacity,security_deposit,is_verified,specs_ar,specs_en,images,video_url,lat,lng,cancel_policy_ar,cancel_policy_en,amenities,seasons,rating,active,created_at';
        const ADMIN_PROMO_COLUMNS = 'id,code,title_ar,discount_type,discount_value,allowed_days,valid_from,valid_until,excluded_dates,excluded_facility_ids,auto_apply,active,created_at';

        async function loadMoreArchivedBookings(btn) {
            if (!db || !isAdminLoggedIn) return;
            if (btn) btn.disabled = true;
            try {
                const { data: res, error } = await db.rpc('admin_list_bookings', { p_archived_limit: ADMIN_ARCHIVE_PAGE_SIZE, p_archived_offset: archivedBookings.length, p_facility_id: null });
                if (error || !res) { showToast('❌ تعذر تحميل المزيد من الأرشيف'); return; }
                const known = new Set(archivedBookings.map(b => b.id));
                (res.archived || []).map(rowToBooking).forEach(b => { if (!known.has(b.id)) archivedBookings.push(b); });
                archivedHasMore = Boolean(res.archived_has_more);
                renderAdminPanel();
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function refreshBookingsForItem(itemId) {
            await loadPublicConfirmedSlots(itemId);
            if (!isAdminLoggedIn || !db) return;
            try {
                const { data: res, error } = await db.rpc('admin_list_bookings', { p_archived_limit: ADMIN_ARCHIVE_PAGE_SIZE, p_archived_offset: 0, p_facility_id: itemId });
                if (!error && res && Array.isArray(res.active)) {
                    pendingBookings = pendingBookings.filter(b => b.itemId !== itemId);
                    confirmedBookings = confirmedBookings.filter(b => b.itemId !== itemId);
                    archivedBookings = archivedBookings.filter(b => b.itemId !== itemId);
                    [...res.active, ...(res.archived || [])].forEach(r => {
                        const b = rowToBooking(r);
                        if (b.status === 'pending') pendingBookings.push(b);
                        else if (b.status === 'confirmed') confirmedBookings.push(b);
                        else archivedBookings.push(b);
                    });
                    archivedBookings.sort((a, b) => b.id - a.id);
                }
            } catch (err) {
                console.error('تعذر تحديث بيانات الحجوزات:', err?.message || '');
            }
        }

        async function checkAdminSession() {
            if (!db) return false;
            try {
                const { data: { session } } = await db.auth.getSession();
                if (!session) {
                    isAdminLoggedIn = false;
                    document.getElementById('btn-admin').style.display = 'none';
                    return false;
                }
                const { data: isAdm, error } = await db.rpc('is_admin');
                if (!error && isAdm === true) {
                    isAdminLoggedIn = true;
                    document.getElementById('btn-admin').style.display = 'inline-block';
                    return true;
                }
                isAdminLoggedIn = false;
                document.getElementById('btn-admin').style.display = 'none';
                return false;
            } catch (e) {
                return false;
            }
        }

        async function loadFromDatabase() {
            if (!db) return;
            try {
                // جلب جميع البيانات الأساسية بالتوازي (Parallel Fetch) مع إخفاء إعدادات الأدمن السرية عن الزوار
                const [facRes, revRes, , favRpcRes, admBookRes, promoRes] = await Promise.all([
                    db.from('facilities').select(ADMIN_FACILITY_COLUMNS).order('id'),
                    db.from('reviews').select('id,facility_id,user_name,rating,comment,status,created_at').order('id', { ascending: false }),
                    loadPublicConfirmedSlots(),
                    db.rpc('get_my_favorites', { p_device_id: DEVICE_ID }),
                    isAdminLoggedIn ? (async () => {
                        try { await db.rpc('clean_expired_bookings'); } catch(e) {}
                        // [البند 18] الحجوزات بدون بيانات الوصل الثقيلة (تُجلب عند الطلب) + أرشيف مقسّم لصفحات
                        return await db.rpc('admin_list_bookings', { p_archived_limit: ADMIN_ARCHIVE_PAGE_SIZE, p_archived_offset: 0, p_facility_id: null });
                    })() : Promise.resolve({ data: null, error: null }),
                    db.from('promo_codes').select(ADMIN_PROMO_COLUMNS).order('id', { ascending: false })
                ]);

                if (!promoRes.error && Array.isArray(promoRes.data)) {
                    promoCodes = promoRes.data
                        .filter(r => String(r.code || '').toUpperCase() !== '__TG_CFG__')
                        .map(rowToPromo);
                    safeSetStorage('wknd_promos_fallback', JSON.stringify(promoCodes));
                }

                // [البند 11] حالة تيليجرام فقط (التوكن مخفي) عبر دالة السيرفر
                if (isAdminLoggedIn) {
                    try {
                        const { data: tgStat } = await db.rpc('admin_get_telegram_status');
                        if (tgStat) telegramStatus = tgStat;
                    } catch (e) {}
                } else {
                    telegramStatus = { configured: false, enabled: false, chat_id: '', token_masked: '' };
                }

                if (facRes.error) throw facRes.error;
                const facilityRows = facRes.data;
                allReviews = Array.isArray(revRes.data) ? revRes.data : [];

                if (Array.isArray(facilityRows)) {
                    items = facilityRows.map(r => {
                        const it = rowToItem(r);
                        it.reviews = allReviews
                            .filter(rv => Number(rv.facility_id) === it.id && (rv.status === 'approved' || !rv.status))
                            .map(rv => ({ id: rv.id, user: rv.user_name, rating: Number(rv.rating) || 5, comment: rv.comment }));
                        return it;
                    });
                    safeSetStorage('wknd_facilities_cache', JSON.stringify(items.filter(i => i.active)));
                // جلب أرقام أصحاب المنشآت والحراس (محمية للأدمن فقط في جدول facility_contacts)
                if (isAdminLoggedIn && Array.isArray(items) && items.length > 0) {
                    try {
                        const { data: contactsData } = await db.from('facility_contacts').select('facility_id,owner_phone,guard_phone');
                        if (Array.isArray(contactsData)) {
                            const cMap = new Map(contactsData.map(c => [Number(c.facility_id), c]));
                            items.forEach(it => {
                                const c = cMap.get(it.id);
                                it.ownerPhone = c ? String(c.owner_phone || '') : '';
                                it.guardPhone = c ? String(c.guard_phone || '') : '';
                            });
                        }
                    } catch (e) {}
                }

                }

                if (isAdminLoggedIn) { await loadAdminOwnersData(); }
                if (isAdminLoggedIn && !admBookRes.error && admBookRes.data && Array.isArray(admBookRes.data.active)) {
                    const activeRows = admBookRes.data.active;
                    pendingBookings = activeRows.filter(b => b.status === 'pending').map(rowToBooking);
                    confirmedBookings = activeRows.filter(b => b.status === 'confirmed').map(rowToBooking);
                    archivedBookings = (admBookRes.data.archived || []).filter(b => b.status === 'rejected' || b.status === 'expired').map(rowToBooking);
                    archivedHasMore = Boolean(admBookRes.data.archived_has_more);
                } else if (!isAdminLoggedIn) {
                    pendingBookings = [];
                    confirmedBookings = [];
                    archivedBookings = [];
                }

                if (!favRpcRes.error && Array.isArray(favRpcRes.data)) {
                    favorites = new Set(favRpcRes.data.map(id => Number(id)));
                    saveFavorites();
                } else {
                    try {
                        const { data: fallbackFavs } = await db.from('favorites').select('facility_id').eq('device_id', DEVICE_ID);
                        if (Array.isArray(fallbackFavs)) {
                            favorites = new Set(fallbackFavs.map(f => Number(f.facility_id)));
                            saveFavorites();
                        }
                    } catch (e) {}
                }
            } catch (err) {
                console.error('تعذر تحميل البيانات من قاعدة البيانات:', err?.message || '');
            }
        }


        


        function switchView(viewId) {
            if (viewId === 'admin-view' && !isAdminLoggedIn) {
                promptAdminLogin();
                return;
            }
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
            const target = document.getElementById(viewId);
            if (target) target.classList.add('active');
            const chatWidget = document.getElementById('main-chat-widget');
            const mainFooter = document.getElementById('main-footer');
            if (viewId === 'admin-view') {
                if (chatWidget) chatWidget.style.display = 'none';
                if (mainFooter) mainFooter.style.display = 'none';
                document.getElementById('btn-admin')?.classList.add('active');
                renderAdminPanel();
            } else {
                chatWidget.style.display = 'block';
                mainFooter.style.display = 'block';
                
            }
        }


        async function promptAdminLogin() {
            // إجبار طلب البريد وكلمة المرور دائماً وعدم الدخول التلقائي أبداً
            if (isAdminLoggedIn) {
                isAdminLoggedIn = false;
                document.getElementById('btn-admin').style.display = 'none';
                if (db) { try { await db.auth.signOut(); } catch (e) {} }
            }
            document.getElementById('admin-email-input').value = '';
            document.getElementById('admin-pass-input').value = '';
            openModalSafely('admin-login-modal');
            setTimeout(() => document.getElementById('admin-email-input').focus(), 100);
        }

        async function handleAdminLoginSubmit(e) {
            e.preventDefault();
            if (!db) return;
            const email = document.getElementById('admin-email-input').value.trim();
            const pass = document.getElementById('admin-pass-input').value;
            const btn = document.getElementById('admin-login-submit-btn');
            if (!email || !pass) return;
            btn.disabled = true;
            try {
                const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
                if (error || !data?.session) {
                    showToast('❌ البريد الإلكتروني أو كلمة المرور غير صحيحة');
                    btn.disabled = false;
                    return;
                }
                const isAdm = await checkAdminSession();
                if (!isAdm) {
                    await db.auth.signOut();
                    showToast('⛔ هذا الحساب لا يملك صلاحيات الإدارة');
                    btn.disabled = false;
                    return;
                }
                closeModal('admin-login-modal');
                showToast('⏳ تم التحقق من الهوية، جاري تحميل لوحة التحكم...');
                await loadFromDatabase();
                switchView('admin-view');
                showToast('✅ تم تسجيل الدخول بنجاح');
            } catch (err) {
                showToast('❌ حدث خطأ أثناء تسجيل الدخول');
            } finally {
                btn.disabled = false;
            }
        }

        async function logoutAdmin() {
            isAdminLoggedIn = false;
            telegramStatus = { configured: false, enabled: false, chat_id: '', token_masked: '' };
            try { localStorage.removeItem('wknd_tg_config'); } catch (e) {}
            if (db) await db.auth.signOut();
            pendingBookings = [];
            confirmedBookings = [];
            archivedBookings = [];
            document.getElementById('btn-admin').style.display = 'none';
            window.location.href = '/';
            await loadFromDatabase();
            
            showToast('تم تسجيل الخروج بنجاح');
        }

        function switchAdminTab(tabId, element) {
            document.querySelectorAll('.admin-tab-page').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
            const page = document.getElementById(tabId);
            if (page) page.classList.add('active');
            if (element) element.classList.add('active');
            renderAdminPanel();
        }

        function toggleVenueTypePricing() {
            const type = document.getElementById('adm-v-type').value;
            const shiftsSection = document.getElementById('adm-v-shifts-section');
            const hourlySection = document.getElementById('adm-v-hourly-section');
            const priceDay   = document.getElementById('adm-v-price-day');
            const priceNight = document.getElementById('adm-v-price-night');
            const priceFull  = document.getElementById('adm-v-price-full');
            const hourlyRate = document.getElementById('adm-v-hourly-rate');

            if (type === 'field') {
                shiftsSection.style.display = 'none';
                hourlySection.style.display = 'block';
                priceDay.required   = false;
                priceNight.required = false;
                priceFull.required  = false;
                hourlyRate.required = true;
            } else {
                shiftsSection.style.display = 'block';
                hourlySection.style.display = 'none';
                priceDay.required   = true;
                priceNight.required = true;
                priceFull.required  = true;
                hourlyRate.required = false;
            }
        }

        // =====================================================
        //  SEARCH, FILTERS & RENDER ITEMS
        // =====================================================
        


        // =====================================================
        //  FAVORITES
        // =====================================================
                

        

        // =====================================================
        //  STAR RATINGS & CARD BUILDER (100% XSS SAFE)
        // =====================================================
        


        // =====================================================
        //  BOOKING MODAL & SERVER-VERIFIED RPC SUBMISSION
        // =====================================================
        const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];


        
        function closeModal(modalId) {
            const modalEl = document.getElementById(modalId);
            if (modalEl) modalEl.classList.remove('active');
            if (modalId === 'booking-modal') {
                clearInterval(lockTimerInterval);
                releaseTempHold();
            } else if (modalId === 'details-modal') {
                const vp = document.getElementById('det-video-player');
                if (vp) { try { vp.pause(); } catch (e) {} }
                const vf = document.getElementById('det-video-iframe');
                if (vf) vf.src = '';
            }
            // استعادة التمرير فقط إذا أُغلقت جميع النوافذ المنبثقة
            if (!document.querySelector('.modal.active')) {
                document.body.style.overflow = '';
            }
        }


        // =====================================================
        //  ADMIN PANEL & LISTING MANAGEMENT
        // =====================================================
        function switchAdminForm(type) {
            document.getElementById('tab-venue-btn').classList.toggle('active', type === 'venue');
            document.getElementById('tab-trans-btn').classList.toggle('active', type === 'transport');
            document.getElementById('add-venue-form').style.display    = type === 'venue' ? 'block' : 'none';
            document.getElementById('add-transport-form').style.display = type === 'transport' ? 'block' : 'none';
        }

        let venueExtraUploadedImages = [];
        let transportExtraUploadedImages = [];
        let adminMediaUploadingCount = 0;

        function renderAdminMediaPreviews(formType) {
            const isVenue = formType === 'venue';
            const mainStoreId = isVenue ? 'venue-img-store' : 'transport-img-store';
            const videoStoreId = isVenue ? 'venue-video-store' : 'transport-video-store';
            const previewStripId = isVenue ? 'adm-v-media-previews' : 'adm-t-media-previews';
            const videoBoxId = isVenue ? 'adm-v-video-preview-box' : 'adm-t-video-preview-box';
            const videoLabelId = isVenue ? 'adm-v-video-label' : 'adm-t-video-label';
            const extraArr = isVenue ? venueExtraUploadedImages : transportExtraUploadedImages;

            const mainImg = document.getElementById(mainStoreId)?.value?.trim() || '';
            const strip = document.getElementById(previewStripId);
            if (strip) {
                let html = '';
                if (mainImg) {
                    html += `
                        <div class="media-thumb-card main-thumb">
                            <img src="${escapeHtml(sanitizeImageUrl(mainImg))}" alt="الصورة الرئيسية">
                            <span class="media-thumb-badge">الرئيسية ⭐</span>
                            <button type="button" class="media-thumb-remove" data-action="remove-main-img" data-form="${formType}" title="حذف الصورة الرئيسية">&times;</button>
                        </div>`;
                }
                extraArr.forEach((src, idx) => {
                    html += `
                        <div class="media-thumb-card">
                            <img src="${escapeHtml(sanitizeImageUrl(src))}" alt="صورة إضافية ${idx + 1}">
                            <span class="media-thumb-badge">إضافية ${idx + 1}</span>
                            <button type="button" class="media-thumb-remove" data-action="remove-extra-img" data-form="${formType}" data-idx="${idx}" title="حذف الصورة">&times;</button>
                        </div>`;
                });
                strip.innerHTML = html;
            }

            const videoUrl = document.getElementById(videoStoreId)?.value?.trim() || '';
            const videoBox = document.getElementById(videoBoxId);
            const videoLabel = document.getElementById(videoLabelId);
            if (videoBox) {
                if (videoUrl) {
                    videoBox.style.display = 'flex';
                    if (videoLabel) {
                        videoLabel.innerHTML = `🎬 تم إرفاق الفيديو بنجاح <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-hover);margin-right:6px;text-decoration:underline;">(معاينة الفيديو)</a>`;
                    }
                } else {
                    videoBox.style.display = 'none';
                }
            }
        }

        async function handleAdminImageUpload(input, formType) {
            if (!input.files || !input.files[0]) return;
            const isVenue = formType === 'venue';
            const targetStoreId = isVenue ? 'venue-img-store' : 'transport-img-store';
            const statusEl = document.getElementById(isVenue ? 'adm-v-media-status' : 'adm-t-media-status');
            if (statusEl) {
                statusEl.style.color = 'var(--text-muted)';
                statusEl.textContent = '⏳ جاري ضغط وحفظ الصورة الرئيسية في ملف الصور المستقل...';
            }
            adminMediaUploadingCount++;
            try {
                const uploaded = await uploadImageToSeparateStorage(input.files[0], 'facilities/images', 1200, 0.80);
                document.getElementById(targetStoreId).value = uploaded.url;
                renderAdminMediaPreviews(formType);
                if (statusEl) {
                    statusEl.style.color = 'var(--success)';
                    statusEl.textContent = uploaded.storedSeparately
                        ? `✅ تم حفظ الصورة الرئيسية في ملف الصور المستقل (${uploaded.sizeKb} KB)`
                        : `✅ تم تجهيز وضغط الصورة الرئيسية (${uploaded.sizeKb} KB)`;
                }
                showToast('✅ تم رفع الصورة الرئيسية بنجاح');
            } catch (err) {
                input.value = '';
                if (statusEl) {
                    statusEl.style.color = 'var(--danger)';
                    statusEl.textContent = '❌ ' + (err.message || 'ملف الصورة غير صالح');
                }
                showToast('⚠️ ' + (err.message || 'ملف الصورة غير صالح'));
            } finally {
                adminMediaUploadingCount = Math.max(0, adminMediaUploadingCount - 1);
            }
        }

        async function handleAdminExtraImagesUpload(input, formType) {
            const files = Array.from(input.files || []);
            if (!files.length) return;
            const isVenue = formType === 'venue';
            const statusEl = document.getElementById(isVenue ? 'adm-v-media-status' : 'adm-t-media-status');
            const targetArr = isVenue ? venueExtraUploadedImages : transportExtraUploadedImages;

            if (statusEl) {
                statusEl.style.color = 'var(--text-muted)';
                statusEl.textContent = `⏳ جاري ضغط وحفظ ${files.length} صورة إضافية في ملف الصور المستقل...`;
            }
            adminMediaUploadingCount++;
            let addedCount = 0;
            try {
            for (const file of files) {
                try {
                    const uploaded = await uploadImageToSeparateStorage(file, 'facilities/images', 1200, 0.80);
                    targetArr.push(uploaded.url);
                    addedCount++;
                    renderAdminMediaPreviews(formType);
                } catch (err) {
                    showToast('⚠️ تعذر رفع إحدى الصور: ' + (err.message || ''));
                }
            }
            input.value = '';
            if (addedCount > 0) {
                if (statusEl) {
                    statusEl.style.color = 'var(--success)';
                    statusEl.textContent = `✅ تم حفظ ${addedCount} صورة إضافية في ألبوم المنشأة (الإجمالي: ${targetArr.length} صور إضافية)`;
                }
                showToast(`✅ تم إضافة ${addedCount} صورة إضافية للألبوم`);
            }
            } finally {
                adminMediaUploadingCount = Math.max(0, adminMediaUploadingCount - 1);
            }
        }

        async function handleAdminVideoUpload(input, formType) {
            if (!input.files || !input.files[0]) return;
            const isVenue = formType === 'venue';
            const videoStoreId = isVenue ? 'venue-video-store' : 'transport-video-store';
            const statusEl = document.getElementById(isVenue ? 'adm-v-media-status' : 'adm-t-media-status');
            if (statusEl) {
                statusEl.style.color = 'var(--text-muted)';
                statusEl.textContent = '⏳ جاري رفع الفيديو إلى ملف الفيديوهات المستقل... يرجى الانتظار';
            }
            adminMediaUploadingCount++;
            try {
                const uploaded = await uploadVideoToSeparateStorage(input.files[0], 'facilities/videos');
                document.getElementById(videoStoreId).value = uploaded.url;
                renderAdminMediaPreviews(formType);
                if (statusEl) {
                    statusEl.style.color = 'var(--success)';
                    statusEl.textContent = `✅ تم حفظ الفيديو في ملف الفيديوهات المستقل بنجاح (${uploaded.sizeMb} MB)`;
                }
                showToast('✅ تم رفع فيديو المنشأة بنجاح');
            } catch (err) {
                input.value = '';
                if (statusEl) {
                    statusEl.style.color = 'var(--danger)';
                    statusEl.textContent = '❌ ' + (err.message || 'تعذر رفع الفيديو');
                }
                showToast('⚠️ ' + (err.message || 'تعذر رفع الفيديو'));
            } finally {
                adminMediaUploadingCount = Math.max(0, adminMediaUploadingCount - 1);
            }
        }

        async function tryDeleteStorageFile(url) {
            if (!db || !db.storage || !url) return;
            const s = String(url).trim();
            const prefix = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
            if (s.startsWith(prefix)) {
                const filePath = s.slice(prefix.length).split('?')[0];
                try { await db.storage.from(STORAGE_BUCKET).remove([filePath]); } catch(e) {}
            }
        }

        function removeAdminMainImage(formType) {
            const isVenue = formType === 'venue';
            const storeEl = document.getElementById(isVenue ? 'venue-img-store' : 'transport-img-store');
            if (storeEl && storeEl.value) tryDeleteStorageFile(storeEl.value);
            storeEl.value = '';
            const fileInput = document.getElementById(isVenue ? 'adm-v-img-file' : 'adm-t-img-file');
            if (fileInput) fileInput.value = '';
            renderAdminMediaPreviews(formType);
        }

        function removeAdminExtraImage(formType, idx) {
            const arr = formType === 'venue' ? venueExtraUploadedImages : transportExtraUploadedImages;
            if (idx >= 0 && idx < arr.length) {
                const removedUrl = arr.splice(idx, 1)[0];
                tryDeleteStorageFile(removedUrl);
                renderAdminMediaPreviews(formType);
            }
        }

        function removeAdminVideo(formType) {
            const isVenue = formType === 'venue';
            const storeEl = document.getElementById(isVenue ? 'venue-video-store' : 'transport-video-store');
            if (storeEl && storeEl.value) tryDeleteStorageFile(storeEl.value);
            storeEl.value = '';
            const vidInput = document.getElementById(isVenue ? 'adm-v-video-file' : 'adm-t-video-file');
            if (vidInput) vidInput.value = '';
            const urlInput = document.getElementById(isVenue ? 'adm-v-video-url' : 'adm-t-video-url');
            if (urlInput) urlInput.value = '';
            renderAdminMediaPreviews(formType);
        }

        async function addListing(e, formType) {
            e.preventDefault();
            if (!db || !isAdminLoggedIn) return;
            if (adminMediaUploadingCount > 0) {
                showToast('⏳ يرجى الانتظار ثواني حتى يكتمل رفع الصور أو الفيديو أولاً');
                return;
            }
            let category, nameAr, nameEn, locationAr, locationEn, specsAr, specsEn, imgStore, imgUrl, extraImgs, videoStore, videoUrlInput, mapUrlInput, lat, lng, cancelAr, cancelEn, amenities, seasons = ['summer', 'winter'];
            let priceDay = null, priceNight = null, priceFull = null, pricePerKm = null, pricePerPerson = null, hourlyRate = null, capacity = null;

            if (formType === 'venue') {
                category   = document.getElementById('adm-v-type').value;
                seasons    = [
                    document.getElementById('adm-v-season-winter').checked ? 'winter' : null,
                    document.getElementById('adm-v-season-summer').checked ? 'summer' : null
                ].filter(Boolean);
                if (!seasons.length) {
                    showToast('⚠️ اختر موسماً واحداً على الأقل');
                    return;
                }
                nameAr     = document.getElementById('adm-v-name').value.trim();
                nameEn     = document.getElementById('adm-v-name-en').value.trim();
                locationAr = document.getElementById('adm-v-location').value.trim();
                locationEn = document.getElementById('adm-v-location-en').value.trim();
                if (category === 'field') {
                    hourlyRate = parseFloat(document.getElementById('adm-v-hourly-rate').value) || 0;
                    if (hourlyRate <= 0) { showToast('⚠️ يرجى إدخال سعر ساعة صحيح'); return; }
                } else {
                    priceDay   = parseFloat(document.getElementById('adm-v-price-day').value) || 0;
                    priceNight = parseFloat(document.getElementById('adm-v-price-night').value) || 0;
                    priceFull  = parseFloat(document.getElementById('adm-v-price-full').value) || 0;
                    if (priceDay <= 0 || priceNight <= 0 || priceFull <= 0) {
                        showToast('⚠️ يرجى إدخال أسعار الشفتات الثلاثة بشكل صحيح');
                        return;
                    }
                }
                specsAr       = document.getElementById('adm-v-specs').value.trim();
                specsEn       = document.getElementById('adm-v-specs-en').value.trim();
                imgStore      = document.getElementById('venue-img-store').value.trim();
                imgUrl        = document.getElementById('adm-v-img-url').value.trim();
                extraImgs     = document.getElementById('adm-v-extra-imgs').value;
                videoStore    = document.getElementById('venue-video-store').value.trim();
                videoUrlInput = document.getElementById('adm-v-video-url').value.trim();
                mapUrlInput   = (document.getElementById('adm-v-map-url')?.value || '').trim();
                lat           = document.getElementById('adm-v-lat').value.trim();
                lng           = document.getElementById('adm-v-lng').value.trim();
                cancelAr      = document.getElementById('adm-v-cancel').value.trim();
                cancelEn      = document.getElementById('adm-v-cancel-en').value.trim();
                var secDepVal = parseFloat(document.getElementById('adm-v-security-deposit')?.value) || 0;
                var isVerVal  = document.getElementById('adm-v-verified')?.checked !== false;
                var ownerPhoneVal = normalizePhone(document.getElementById('adm-v-owner-phone')?.value || '');
                var guardPhoneVal = normalizePhone(document.getElementById('adm-v-guard-phone')?.value || '');
                var ownerPinVal   = (document.getElementById('adm-v-owner-pin')?.value || '').trim();
                if (!isValidPhone(ownerPhoneVal) || !isValidPhone(guardPhoneVal)) { showToast('⚠️ يرجى إدخال رقم صاحب المنشأة ورقم الحارس بشكل صحيح (إجباري)'); return; }
                if (ownerPinVal && !/^[0-9]{6,8}$/.test(ownerPinVal)) { showToast('⚠️ رمز دخول بوابة الملّاك يجب أن يكون من 6 إلى 8 أرقام (أو اتركه فارغاً)'); return; }
                amenities     = ['featured','private_screened','families_only','youth_allowed','events_allowed','pool','bbq','wifi','heating','outdoor'].filter(a => document.getElementById(`adm-v-am-${a}`)?.checked);
            } else {
                category       = 'transport';
                nameAr         = document.getElementById('adm-t-name').value.trim();
                nameEn         = document.getElementById('adm-t-name-en').value.trim();
                locationAr     = document.getElementById('adm-t-location').value.trim();
                locationEn     = document.getElementById('adm-t-location-en').value.trim();
                pricePerKm     = parseFloat(document.getElementById('adm-t-price-km').value) || 0;
                pricePerPerson = parseFloat(document.getElementById('adm-t-price-person').value) || 0;
                capacity       = parseInt(document.getElementById('adm-t-capacity').value, 10) || 23;
                if (capacity < 1 || capacity > 200) {
                    showToast('⚠️ سعة الحافلة يجب أن تكون بين 1 و200 راكب');
                    return;
                }
                specsAr       = document.getElementById('adm-t-specs').value.trim();
                specsEn       = document.getElementById('adm-t-specs-en').value.trim();
                imgStore      = document.getElementById('transport-img-store').value.trim();
                imgUrl        = document.getElementById('adm-t-img-url').value.trim();
                extraImgs     = document.getElementById('adm-t-extra-imgs').value;
                videoStore    = document.getElementById('transport-video-store').value.trim();
                videoUrlInput = document.getElementById('adm-t-video-url').value.trim();
                mapUrlInput   = (document.getElementById('adm-t-map-url')?.value || '').trim();
                lat           = document.getElementById('adm-t-lat').value.trim();
                lng           = document.getElementById('adm-t-lng').value.trim();
                cancelAr      = document.getElementById('adm-t-cancel').value.trim();
                cancelEn      = document.getElementById('adm-t-cancel-en').value.trim();
                var ownerPhoneVal = normalizePhone(document.getElementById('adm-t-owner-phone')?.value || '');
                var guardPhoneVal = normalizePhone(document.getElementById('adm-t-guard-phone')?.value || '');
                var ownerPinVal   = (document.getElementById('adm-t-owner-pin')?.value || '').trim();
                if (!isValidPhone(ownerPhoneVal) || !isValidPhone(guardPhoneVal)) { showToast('⚠️ يرجى إدخال رقم صاحب المركبة ورقم السائق بشكل صحيح (إجباري)'); return; }
                if (ownerPinVal && !/^[0-9]{6,8}$/.test(ownerPinVal)) { showToast('⚠️ رمز دخول بوابة الملّاك يجب أن يكون من 6 إلى 8 أرقام (أو اتركه فارغاً)'); return; }
                amenities     = ['featured','wifi','heating','outdoor'].filter(a => document.getElementById(`adm-t-am-${a}`)?.checked);
            }

            const uploadedExtras = formType === 'venue' ? venueExtraUploadedImages : transportExtraUploadedImages;
            const manualExtraList = (extraImgs || '').split('\n').map(s => s.trim()).filter(Boolean).map(sanitizeImageUrl);
            const primaryCandidate = imgStore || imgUrl || uploadedExtras[0] || manualExtraList[0] || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80';
            const mainImg = sanitizeImageUrl(primaryCandidate);
            const remainingExtras = (!imgStore && !imgUrl && uploadedExtras.length > 0) ? uploadedExtras.slice(1) : uploadedExtras;
            const allImages = [mainImg, ...remainingExtras.map(sanitizeImageUrl), ...manualExtraList];
            const finalVideoUrl = sanitizeVideoUrl(videoStore || videoUrlInput) || null;

            const editingId = formType === 'venue'
                ? parseInt(document.getElementById('adm-v-editing-id').value, 10)
                : parseInt(document.getElementById('adm-t-editing-id').value, 10);

            let parsedLat = lat !== '' ? parseFloat(lat) : null;
            let parsedLng = lng !== '' ? parseFloat(lng) : null;
            let finalMapUrl = '';
            if (mapUrlInput) {
                const coordsFromLink = parseCoordsFromGoogleMapsInput(mapUrlInput);
                if (coordsFromLink && (parsedLat === null || parsedLng === null || !Number.isFinite(parsedLat) || !Number.isFinite(parsedLng))) {
                    parsedLat = coordsFromLink.lat;
                    parsedLng = coordsFromLink.lng;
                }
                if (/^https:\/\//i.test(mapUrlInput)) {
                    finalMapUrl = mapUrlInput;
                } else if (parsedLat !== null && parsedLng !== null) {
                    finalMapUrl = `https://www.google.com/maps?q=${parsedLat},${parsedLng}`;
                }
                // إذا كان الرابط مختصراً (مثل maps.app.goo.gl) ولم تُحدد الإحداثيات يدوياً، نضع إحداثيات المنطقة لتعمل الخريطة التفاعلية دائماً
                if ((parsedLat === null || parsedLng === null) && finalMapUrl) {
                    const regCoords = inferRegionCoords(locationAr);
                    parsedLat = regCoords.lat;
                    parsedLng = regCoords.lng;
                }
            } else if (parsedLat !== null && parsedLng !== null && Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
                finalMapUrl = `https://www.google.com/maps?q=${parsedLat},${parsedLng}`;
            }

            const payloadObj = {
                category,
                nameAr, nameEn,
                locationAr, locationEn,
                priceDay, priceNight, priceFull,
                hourlyRate,
                pricePerKm, pricePerPerson, capacity,
                securityDeposit: formType === 'venue' ? (typeof secDepVal !== 'undefined' ? secDepVal : 0) : 0,
                isVerified: formType === 'venue' ? (typeof isVerVal !== 'undefined' ? isVerVal : true) : true,
                specsAr, specsEn,
                images: allImages,
                videoUrl: finalVideoUrl,
                lat: parsedLat,
                lng: parsedLng,
                mapUrl: finalMapUrl,
                cancelPolicyAr: cancelAr,
                cancelPolicyEn: cancelEn,
                amenities: amenities || [],
                seasons,
                active: true
            };

            if (editingId) {
                const idx = items.findIndex(i => i.id === editingId);
                payloadObj.id = editingId;
                payloadObj.rating = idx !== -1 ? items[idx].rating : 5.0;
                const dbRow = itemToRow(payloadObj);
                delete dbRow.id;
                const { data, error } = await db.from('facilities').update(dbRow).eq('id', editingId).select(ADMIN_FACILITY_COLUMNS).single();
                if (error) {
                    showToast('❌ تعذر حفظ التعديلات: ' + (error.message || ''));
                    return;
                }
                if (idx !== -1 && data) {
                    await db.from('facility_contacts').upsert({ facility_id: editingId, owner_phone: ownerPhoneVal, guard_phone: guardPhoneVal, updated_at: new Date().toISOString() });
                    if (typeof ownerPinVal !== 'undefined' && /^[0-9]{6,8}$/.test(ownerPinVal)) { await db.rpc('admin_set_owner_access', { p_facility_id: editingId, p_owner_phone: ownerPhoneVal, p_owner_name: nameAr, p_pin: ownerPinVal }); }
                    const updated = rowToItem(data);
                    updated.reviews = items[idx].reviews || [];
                    updated.ownerPhone = ownerPhoneVal;
                    updated.guardPhone = guardPhoneVal;
                    items[idx] = updated;
                }
                editingItemId = null;
                await cancelEditMode(formType, true);
                showToast('✅ تم حفظ التعديلات وإعادة نشر المنشأة');
            } else {
                const dbRow = itemToRow(payloadObj);
                delete dbRow.id;
                const { data, error } = await db.from('facilities').insert(dbRow).select(ADMIN_FACILITY_COLUMNS).single();
                if (error) {
                    showToast('❌ تعذر إضافة المنشأة: ' + (error.message || ''));
                    return;
                }
                if (data) {
                    await db.from('facility_contacts').upsert({ facility_id: Number(data.id), owner_phone: ownerPhoneVal, guard_phone: guardPhoneVal, updated_at: new Date().toISOString() });
                    if (typeof ownerPinVal !== 'undefined' && /^[0-9]{6,8}$/.test(ownerPinVal)) { await db.rpc('admin_set_owner_access', { p_facility_id: Number(data.id), p_owner_phone: ownerPhoneVal, p_owner_name: nameAr, p_pin: ownerPinVal }); }
                    const createdIt = rowToItem(data);
                    createdIt.ownerPhone = ownerPhoneVal;
                    createdIt.guardPhone = guardPhoneVal;
                    items.push(createdIt);
                }
                showToast('✅ تم إضافة المنشأة بنجاح');
                if (formType === 'venue') {
                    document.getElementById('add-venue-form').reset();
                    document.getElementById('venue-img-store').value = '';
                    document.getElementById('venue-video-store').value = '';
                    document.getElementById('adm-v-media-status').textContent = '';
                    venueExtraUploadedImages = [];
                    renderAdminMediaPreviews('venue');
                } else {
                    document.getElementById('add-transport-form').reset();
                    document.getElementById('transport-img-store').value = '';
                    document.getElementById('transport-video-store').value = '';
                    document.getElementById('adm-t-media-status').textContent = '';
                    transportExtraUploadedImages = [];
                    renderAdminMediaPreviews('transport');
                }
                toggleVenueTypePricing();
            }

            renderAdminPanel();
            
        }

        async function editListing(id) {
            const item = items.find(i => i.id === Number(id));
            if (!item || !db) return;

            editingItemId = item.id;
            editingPreviousActive = Boolean(item.active);
            item._editing = true;

            switchAdminTab('dash-listings', document.querySelectorAll('.sidebar-item')[1]);

            const firstImg = (item.images && item.images[0]) || '';
            const extraImgsArr = (item.images && item.images.length > 1) ? [...item.images.slice(1)] : [];

            if (item.category === 'transport') {
                switchAdminForm('transport');
                document.getElementById('adm-t-editing-id').value   = item.id;
                document.getElementById('adm-t-name').value         = item.nameAr || '';
                document.getElementById('adm-t-name-en').value      = item.nameEn || '';
                document.getElementById('adm-t-location').value     = item.locationAr || '';
                document.getElementById('adm-t-location-en').value  = item.locationEn || '';
                document.getElementById('adm-t-price-km').value     = item.pricePerKm ?? '';
                document.getElementById('adm-t-price-person').value = item.pricePerPerson ?? '';
                document.getElementById('adm-t-capacity').value     = item.capacity || 23;
                document.getElementById('adm-t-specs').value        = item.specsAr || '';
                document.getElementById('adm-t-specs-en').value     = item.specsEn || '';
                document.getElementById('transport-img-store').value   = firstImg;
                document.getElementById('adm-t-img-url').value         = '';
                document.getElementById('adm-t-extra-imgs').value      = '';
                document.getElementById('transport-video-store').value = item.videoUrl || '';
                document.getElementById('adm-t-video-url').value       = '';
                transportExtraUploadedImages = extraImgsArr;
                renderAdminMediaPreviews('transport');
                document.getElementById('adm-t-lat').value          = item.lat ?? '';
                document.getElementById('adm-t-lng').value          = item.lng ?? '';
                if (document.getElementById('adm-t-map-url')) {
                    document.getElementById('adm-t-map-url').value = item.mapUrl || ((item.lat !== null && item.lng !== null) ? `https://www.google.com/maps?q=${item.lat},${item.lng}` : '');
                }
                if (document.getElementById('adm-t-owner-phone')) document.getElementById('adm-t-owner-phone').value = item.ownerPhone || '';
                if (document.getElementById('adm-t-guard-phone')) document.getElementById('adm-t-guard-phone').value = item.guardPhone || '';
                document.getElementById('adm-t-cancel').value       = item.cancelPolicyAr || '';
                document.getElementById('adm-t-cancel-en').value    = item.cancelPolicyEn || '';
                ['featured','wifi','heating','outdoor'].forEach(a => {
                    const el = document.getElementById(`adm-t-am-${a}`);
                    if (el) el.checked = (item.amenities || []).includes(a);
                });
                document.getElementById('adm-t-submit-btn').textContent        = '💾 حفظ التعديلات وإعادة النشر';
                document.getElementById('adm-t-cancel-edit-btn').style.display = 'block';
            } else {
                switchAdminForm('venue');
                document.getElementById('adm-v-editing-id').value   = item.id;
                document.getElementById('adm-v-name').value         = item.nameAr || '';
                document.getElementById('adm-v-name-en').value      = item.nameEn || '';
                document.getElementById('adm-v-type').value         = item.category;
                document.getElementById('adm-v-location').value     = item.locationAr || '';
                document.getElementById('adm-v-location-en').value  = item.locationEn || '';
                document.getElementById('adm-v-season-winter').checked = (item.seasons || ['summer', 'winter']).includes('winter');
                document.getElementById('adm-v-season-summer').checked = (item.seasons || ['summer', 'winter']).includes('summer');

                toggleVenueTypePricing();
                if (item.category === 'field') {
                    document.getElementById('adm-v-hourly-rate').value = item.hourlyRate || '';
                } else {
                    document.getElementById('adm-v-price-day').value   = item.priceDay || '';
                    document.getElementById('adm-v-price-night').value = item.priceNight || '';
                    document.getElementById('adm-v-price-full').value  = item.priceFull || '';
                }

                document.getElementById('adm-v-specs').value        = item.specsAr || '';
                document.getElementById('adm-v-specs-en').value     = item.specsEn || '';
                document.getElementById('venue-img-store').value    = firstImg;
                document.getElementById('adm-v-img-url').value      = '';
                document.getElementById('adm-v-extra-imgs').value   = '';
                document.getElementById('venue-video-store').value  = item.videoUrl || '';
                document.getElementById('adm-v-video-url').value    = '';
                venueExtraUploadedImages = extraImgsArr;
                renderAdminMediaPreviews('venue');
                document.getElementById('adm-v-lat').value          = item.lat ?? '';
                document.getElementById('adm-v-lng').value          = item.lng ?? '';
                if (document.getElementById('adm-v-map-url')) {
                    document.getElementById('adm-v-map-url').value = item.mapUrl || ((item.lat !== null && item.lng !== null) ? `https://www.google.com/maps?q=${item.lat},${item.lng}` : '');
                }
                setTimeout(() => initOrUpdateAdminMapPicker(), 120);
                if (document.getElementById('adm-v-owner-phone')) document.getElementById('adm-v-owner-phone').value = item.ownerPhone || '';
                if (document.getElementById('adm-v-guard-phone')) document.getElementById('adm-v-guard-phone').value = item.guardPhone || '';
                if (document.getElementById('adm-v-security-deposit')) document.getElementById('adm-v-security-deposit').value = item.securityDeposit ?? 0;
                if (document.getElementById('adm-v-verified')) document.getElementById('adm-v-verified').checked = item.isVerified !== false;
                document.getElementById('adm-v-cancel').value       = item.cancelPolicyAr || '';
                document.getElementById('adm-v-cancel-en').value    = item.cancelPolicyEn || '';
                ['featured','private_screened','families_only','youth_allowed','events_allowed','pool','bbq','wifi','heating','outdoor'].forEach(a => {
                    const el = document.getElementById(`adm-v-am-${a}`);
                    if (el) el.checked = (item.amenities || []).includes(a);
                });
                document.getElementById('adm-v-submit-btn').textContent        = '💾 حفظ التعديلات وإعادة النشر';
                document.getElementById('adm-v-cancel-edit-btn').style.display = 'block';
            }

            document.getElementById('add-form-title').textContent = '✏️ تعديل المنشأة';
            document.getElementById('edit-mode-banner').style.display = 'block';

            const scrollTarget = item.category === 'transport' ? 'add-transport-form' : 'add-venue-form';
            document.getElementById(scrollTarget).scrollIntoView({ behavior: 'smooth', block: 'start' });

            renderAdminPanel();
            
            showToast('✏️ تم فتح بيانات المنشأة للتعديل');
        }

        async function cancelEditMode(formType, skipDbRestore = false) {
            if (editingItemId) {
                const idx = items.findIndex(i => i.id === editingItemId);
                if (idx !== -1) {
                    items[idx]._editing = false;
                }
            }
            editingItemId = null;
            document.getElementById('add-form-title').textContent = 'إضافة منشأة أو وسيلة نقل جديدة';
            document.getElementById('edit-mode-banner').style.display = 'none';

            if (formType === 'venue') {
                document.getElementById('adm-v-editing-id').value          = '';
                document.getElementById('venue-img-store').value           = '';
                document.getElementById('venue-video-store').value         = '';
                document.getElementById('adm-v-media-status').textContent  = '';
                venueExtraUploadedImages = [];
                renderAdminMediaPreviews('venue');
                document.getElementById('adm-v-submit-btn').textContent    = 'نشر المنشأة';
                document.getElementById('adm-v-cancel-edit-btn').style.display = 'none';
                document.getElementById('add-venue-form').reset();
                toggleVenueTypePricing();
            } else {
                document.getElementById('adm-t-editing-id').value          = '';
                document.getElementById('transport-img-store').value       = '';
                document.getElementById('transport-video-store').value     = '';
                document.getElementById('adm-t-media-status').textContent  = '';
                transportExtraUploadedImages = [];
                renderAdminMediaPreviews('transport');
                document.getElementById('adm-t-submit-btn').textContent    = 'نشر وسيلة النقل';
                document.getElementById('adm-t-cancel-edit-btn').style.display = 'none';
                document.getElementById('add-transport-form').reset();
            }
            renderAdminPanel();
            
        }

        function bookingSortKey(b) {
            const d = b.bookingDate || '9999-99-99';
            const h = String(b.hourFrom ?? 0).padStart(2, '0');
            return `${d}-${h}`;
        }

        function bookingsOverlap(a, b) {
            if (!a.itemId || !b.itemId || a.itemId !== b.itemId) return false;
            if (!a.bookingDate || !b.bookingDate || a.bookingDate !== b.bookingDate) return false;
            const aFrom = Number(a.hourFrom ?? 0), aTo = Number(a.hourTo ?? 24);
            const bFrom = Number(b.hourFrom ?? 0), bTo = Number(b.hourTo ?? 24);
            return aFrom < bTo && bFrom < aTo;
        }

        function isAdminBlockedBooking(b) {
            if (!b) return false;
            return String(b.clientName || '').includes('قفل إداري') || String(b.details || '').includes('[قفل إداري');
        }

        function hasPendingConflict(b) {
            return pendingBookings.some(other => other.id !== b.id && bookingsOverlap(b, other));
        }

        function buildLocationBoxHtml(b) {
            if (!b.pickupLocation && !b.dropoffLocation) return '';
            const pickHref = b.pickupLocation ? escapeHtml(buildSafeMapsHref(b.pickupLocation)) : '';
            const dropHref = b.dropoffLocation ? escapeHtml(buildSafeMapsHref(b.dropoffLocation)) : '';
            return `
                <div class="location-link-box" style="margin-top:6px;font-size:0.82rem;">
                    <strong>📍 مواقع الرحلة:</strong>
                    ${b.pickupLocation ? `<div>📌 <strong>الانطلاق:</strong> <a href="${pickHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.pickupLocation)}</a></div>` : ''}
                    ${b.dropoffLocation ? `<div>🏁 <strong>الوصول:</strong> <a href="${dropHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.dropoffLocation)}</a></div>` : ''}
                </div>`;
        }

        function renderAdminPanel() {
            if (!isAdminLoggedIn) return;

            // ── 1) Pending bookings table (All 7 columns properly rendered!) ──
            const tbodyPending = document.getElementById('admin-pending-bookings');
            tbodyPending.innerHTML = '';
            const sortedPending = [...pendingBookings].sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));
            if (sortedPending.length === 0) {
                tbodyPending.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد طلبات معلقة حالياً</td></tr>`;
            } else {
                sortedPending.forEach((b) => {
                    const itemName = currentLang === 'ar' ? (b.itemNameAr || 'منشأة') : (b.itemNameEn || b.itemNameAr || 'Facility');
                    const totalNum = Number(b.total || 0);
                    const depNum   = Number(b.deposit || 0);
                    const waPhone  = toWhatsAppPhone(b.phone);
                    const waMsg    = encodeURIComponent(`مرحباً ${b.clientName || ''}، تم استلام طلبك لحجز (${itemName}). التفاصيل: ${b.details || ''}. العربون: ${depNum.toFixed(2)} JOD.`);
                    const waUrl    = `https://wa.me/${waPhone}?text=${waMsg}`;
                    const conflictBadge = hasPendingConflict(b)
                        ? `<div style="margin-top:6px;background:#ffe0e0;color:#c0392b;border-radius:6px;padding:3px 8px;font-size:0.78rem;font-weight:700;display:inline-block;">⚠️ يوجد طلب آخر لنفس الموعد</div>`
                        : '';

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(b.clientName)}</strong></td>
                        <td style="direction:ltr;text-align:right;">${escapeHtml(b.phone)}</td>
                        <td>${escapeHtml(itemName)}</td>
                        <td><div style="font-size:0.76rem;color:var(--text-muted);font-weight:700;direction:ltr;display:inline-block;">#${escapeHtml(b.ticketCode)}</div><br><small>${escapeHtml(b.details)}</small>${buildLocationBoxHtml(b)}${buildChangeRequestBadgeHtml(b)}${conflictBadge}</td>
                        <td>الإجمالي: ${totalNum.toFixed(2)} JOD<br><strong style="color:#B27517;">العربون: ${depNum.toFixed(2)} JOD</strong></td>
                        <td>${b.receiptRaw ? `<button type="button" class="copy-chip-btn" data-action="preview-receipt" data-receipt="${escapeHtml(b.receiptRaw)}">🔐 عرض الوصل</button>` : `<img src="${escapeHtml(b.receiptData)}" class="receipt-thumb" alt="وصل" data-action="preview-receipt" data-receipt="${escapeHtml(b.receiptData)}">`}</td>
                        <td>
                            <div class="action-menu-inline">
                                <button type="button" class="icon-btn approve" title="تأكيد الحجز" aria-label="تأكيد الحجز" data-action="approve-booking" data-id="${b.id}">✓</button>
                                <button type="button" class="icon-btn edit-btn" title="تعديل بيانات وموعد الحجز" aria-label="تعديل بيانات وموعد الحجز" data-action="edit-booking" data-id="${b.id}">✏️</button>
                                <button type="button" class="icon-btn edit-btn" title="عرض تذكرة الحجز" aria-label="عرض تذكرة الحجز" data-action="open-admin-ticket" data-id="${b.id}">🎫</button>
                                <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="icon-btn whatsapp" title="واتساب">💬</a>
                                <button type="button" class="icon-btn danger" title="رفض الطلب (حفظ بالسجل)" aria-label="رفض الطلب (حفظ بالسجل)" data-action="reject-booking" data-id="${b.id}">✕</button>
                                <button type="button" class="icon-btn danger" title="حذف الحجز وإلغاء تذكرة العميل نهائياً" aria-label="حذف الحجز وإلغاء تذكرة العميل نهائياً" data-action="delete-booking" data-id="${b.id}">🗑️</button>
                            </div>
                        </td>`;
                    tbodyPending.appendChild(tr);
                });
            }

            // ── 2) Confirmed bookings table ──
            const tbodyConfirmed = document.getElementById('admin-confirmed-bookings');
            tbodyConfirmed.innerHTML = '';
            const sortedConfirmed = [...confirmedBookings].sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));
            if (sortedConfirmed.length === 0) {
                tbodyConfirmed.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد حجوزات مؤكدة</td></tr>`;
            } else {
                sortedConfirmed.forEach((b) => {
                    const itemName = currentLang === 'ar' ? (b.itemNameAr || 'منشأة') : (b.itemNameEn || b.itemNameAr || 'Facility');
                    const isBlocked = isAdminBlockedBooking(b);
                    const totalNum = isBlocked ? 0 : Number(b.total || 0);
                    const depNum   = isBlocked ? 0 : Number(b.deposit || 0);
                    const waPhone  = toWhatsAppPhone(b.phone);
                    const waMsg    = encodeURIComponent(`تهانينا ${b.clientName || ''}، تم تأكيد حجزك لـ (${itemName})! التفاصيل: ${b.details || ''}.`);
                    const waUrl    = `https://wa.me/${waPhone}?text=${waMsg}`;

                    const amountHtml = isBlocked
                        ? `<span class="badge-status editing">🔒 قفل إداري / خارجي</span><br><small style="color:var(--text-muted);">عربون المنصة: 0.00 JOD</small>`
                        : `الإجمالي: ${totalNum.toFixed(2)} JOD<br><strong style="color:var(--success);">العربون: ${depNum.toFixed(2)} JOD</strong>`;
                    const receiptHtml = isBlocked
                        ? `<span style="font-size:0.78rem;color:var(--text-muted);font-weight:700;">🔒 بدون وصل</span>`
                        : (b.receiptRaw ? `<button type="button" class="copy-chip-btn" data-action="preview-receipt" data-receipt="${escapeHtml(b.receiptRaw)}">🔐 عرض الوصل</button>` : `<img src="${escapeHtml(b.receiptData)}" class="receipt-thumb" alt="وصل" data-action="preview-receipt" data-receipt="${escapeHtml(b.receiptData)}">`);
                    const actionsHtml = isBlocked
                        ? `<div class="action-menu-inline">
                                <button type="button" class="icon-btn danger" title="إلغاء القفل وفتح الموعد في التقويم فوراً" aria-label="إلغاء القفل وفتح الموعد في التقويم فوراً" data-action="delete-booking" data-id="${b.id}">🔓</button>
                           </div>`
                        : `<div class="action-menu-inline">
                                <button type="button" class="icon-btn edit-btn" title="تعديل بيانات وموعد الحجز" aria-label="تعديل بيانات وموعد الحجز" data-action="edit-booking" data-id="${b.id}">✏️</button>
                                <button type="button" class="icon-btn edit-btn" title="عرض تذكرة الحجز" aria-label="عرض تذكرة الحجز" data-action="open-admin-ticket" data-id="${b.id}">🎫</button>
                                <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="icon-btn whatsapp" title="واتساب">💬</a>
                                <button type="button" class="icon-btn danger" title="إلغاء الحجز وتحرير الموعد" aria-label="إلغاء الحجز وتحرير الموعد" data-action="reject-booking" data-id="${b.id}">✕</button>
                                <button type="button" class="icon-btn danger" title="حذف الحجز وإلغاء تذكرة العميل نهائياً" aria-label="حذف الحجز وإلغاء تذكرة العميل نهائياً" data-action="delete-booking" data-id="${b.id}">🗑️</button>
                           </div>`;

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(b.clientName)}</strong></td>
                        <td style="direction:ltr;text-align:right;">${isBlocked ? '—' : escapeHtml(b.phone)}</td>
                        <td>${escapeHtml(itemName)}</td>
                        <td><div style="font-size:0.76rem;color:var(--text-muted);font-weight:700;direction:ltr;display:inline-block;">#${escapeHtml(b.ticketCode)}</div><br><small>${escapeHtml(b.details)}</small>${buildLocationBoxHtml(b)}${buildChangeRequestBadgeHtml(b)}</td>
                        <td>${amountHtml}</td>
                        <td>${receiptHtml}</td>
                        <td>${actionsHtml}</td>`;
                    tbodyConfirmed.appendChild(tr);
                });
            }

            // ── 3) Archived (Rejected / Expired) bookings table ──
            const tbodyArchived = document.getElementById('admin-archived-bookings');
            if (tbodyArchived) {
                tbodyArchived.innerHTML = '';
                if (archivedBookings.length === 0) {
                    tbodyArchived.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:1.5rem;">لا توجد طلبات مرفوضة أو منتهية</td></tr>`;
                } else {
                    archivedBookings.forEach((b) => {
                        const itemName = currentLang === 'ar' ? (b.itemNameAr || 'منشأة') : (b.itemNameEn || b.itemNameAr || 'Facility');
                        const totalNum = Number(b.total || 0);
                        const depNum   = Number(b.deposit || 0);
                        const statusBadge = b.status === 'rejected'
                            ? '<span class="badge-status inactive">مرفوض</span>'
                            : '<span class="badge-status editing">منتهي المهلة</span>';
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><strong>${escapeHtml(b.clientName)}</strong></td>
                            <td style="direction:ltr;text-align:right;">${escapeHtml(b.phone)}</td>
                            <td>${escapeHtml(itemName)}</td>
                            <td><small>${escapeHtml(b.details)}</small></td>
                            <td>${totalNum.toFixed(2)} / ${depNum.toFixed(2)} JOD</td>
                            <td>${statusBadge}</td>
                            <td>
                                <div class="action-menu-inline">
                                    <button type="button" class="icon-btn danger" title="حذف نهائي من السجل" aria-label="حذف نهائي من السجل" data-action="delete-booking" data-id="${b.id}">🗑️</button>
                                </div>
                            </td>`;
                        tbodyArchived.appendChild(tr);
                    });
                    if (archivedHasMore) {
                        const moreTr = document.createElement('tr');
                        moreTr.innerHTML = `<td colspan="7" style="text-align:center;padding:0.8rem;"><button type="button" class="btn-details" data-action="load-more-archived" style="margin:0;">عرض المزيد</button></td>`;
                        tbodyArchived.appendChild(moreTr);
                    }
                }
            }

            // ── 4) Listings table (non-pitch items) ──
            const tbodyListings = document.getElementById('admin-listings-table');
            tbodyListings.innerHTML = '';
            const nonPitchItems = items.filter(i => i.category !== 'field');
            if (nonPitchItems.length === 0) {
                tbodyListings.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد منشآت مضافة</td></tr>`;
            } else {
                nonPitchItems.forEach(item => {
                    const itemName = localizedItemText(item, 'name');
                    const itemLoc  = localizedItemText(item, 'location');
                    let statusHtml;
                    if (item._editing) statusHtml = `<span class="badge-status editing">⏸️ قيد التعديل</span>`;
                    else if (item.active) statusHtml = `<span class="badge-status active">نشط</span>`;
                    else statusHtml = `<span class="badge-status inactive">موقوف</span>`;
                    const typeLabel = item.category === 'transport' ? `🚌 نقل (${item.capacity || 23} راكب)` : '🏡 مزرعة/شاليه';
                    const isFeat = (item.amenities || []).includes('featured');
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(itemName)}</strong> ${isFeat ? '<span style="background:#FFF3CD;color:#B27517;padding:2px 7px;border-radius:10px;font-size:0.72rem;font-weight:700;">⭐ مميز</span>' : ''}</td>
                        <td>${escapeHtml(typeLabel)}</td>
                        <td>${escapeHtml(itemLoc)}</td>
                        <td>${statusHtml}</td>
                        <td>
                            <div class="action-menu-inline">
                                <button type="button" class="icon-btn" title="قفل تاريخ سريع لهذه المنشأة" aria-label="قفل تاريخ سريع لهذه المنشأة" data-action="quick-block-goto" data-id="${item.id}">🔒</button>
                                <button type="button" class="icon-btn ${isFeat ? 'featured-on' : ''}" title="تثبيت / إلغاء تثبيت كمنشأة مميزة في المقدمة" aria-label="تثبيت / إلغاء تثبيت كمنشأة مميزة في المقدمة" data-action="toggle-featured" data-id="${item.id}">${isFeat ? '⭐' : '☆'}</button>
                                <button type="button" class="icon-btn edit-btn" title="تعديل" aria-label="تعديل" data-action="edit-listing" data-id="${item.id}">✏️</button>
                                <button type="button" class="icon-btn" title="تفعيل / إيقاف" aria-label="تفعيل / إيقاف" data-action="toggle-active" data-id="${item.id}">🔄</button>
                                <button type="button" class="icon-btn danger" title="حذف" aria-label="حذف" data-action="delete-listing" data-id="${item.id}">🗑️</button>
                            </div>
                        </td>`;
                    tbodyListings.appendChild(tr);
                });
            }

            // ── 5) Pitches tab: pitch items ──
            const tbodyPitches = document.getElementById('admin-pitches-table');
            if (tbodyPitches) {
                tbodyPitches.innerHTML = '';
                const pitchItems = items.filter(i => i.category === 'field');
                if (pitchItems.length === 0) {
                    tbodyPitches.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد ملاعب مضافة حتى الآن</td></tr>`;
                } else {
                    pitchItems.forEach(item => {
                        const itemName = localizedItemText(item, 'name');
                        const itemLoc  = localizedItemText(item, 'location');
                        let statusHtml;
                        if (item._editing) statusHtml = `<span class="badge-status editing">⏸️ قيد التعديل</span>`;
                        else if (item.active) statusHtml = `<span class="badge-status active">نشط</span>`;
                        else statusHtml = `<span class="badge-status inactive">موقوف</span>`;
                        const isFeat = (item.amenities || []).includes('featured');
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><strong>${escapeHtml(itemName)}</strong> ${isFeat ? '<span style="background:#FFF3CD;color:#B27517;padding:2px 7px;border-radius:10px;font-size:0.72rem;font-weight:700;">⭐ مميز</span>' : ''}</td>
                            <td>${escapeHtml(itemLoc)}</td>
                            <td><strong style="color:var(--primary-dark);">${Number(item.hourlyRate || 0).toFixed(1)} JOD/ساعة</strong></td>
                            <td>${statusHtml}</td>
                            <td>
                                <div class="action-menu-inline">
                                    <button type="button" class="icon-btn" title="قفل تاريخ أو ساعات سريعة لهذا الملعب" aria-label="قفل تاريخ أو ساعات سريعة لهذا الملعب" data-action="quick-block-goto" data-id="${item.id}">🔒</button>
                                    <button type="button" class="icon-btn ${isFeat ? 'featured-on' : ''}" title="تثبيت / إلغاء تثبيت كملعب مميز في المقدمة" aria-label="تثبيت / إلغاء تثبيت كملعب مميز في المقدمة" data-action="toggle-featured" data-id="${item.id}">${isFeat ? '⭐' : '☆'}</button>
                                    <button type="button" class="icon-btn edit-btn" title="تعديل" aria-label="تعديل" data-action="edit-listing" data-id="${item.id}">✏️</button>
                                    <button type="button" class="icon-btn" title="تفعيل / إيقاف" aria-label="تفعيل / إيقاف" data-action="toggle-active" data-id="${item.id}">🔄</button>
                                    <button type="button" class="icon-btn danger" title="حذف" aria-label="حذف" data-action="delete-listing" data-id="${item.id}">🗑️</button>
                                </div>
                            </td>`;
                        tbodyPitches.appendChild(tr);
                    });
                }
            }

            // ── 6) Pitches tab: pitch bookings (With Action Buttons!) ──
            const tbodyPitchesBookings = document.getElementById('admin-pitches-bookings-table');
            if (tbodyPitchesBookings) {
                tbodyPitchesBookings.innerHTML = '';
                const pitchItemIds = new Set(items.filter(i => i.category === 'field').map(i => i.id));
                const allPitchBookings = [...pendingBookings, ...confirmedBookings].filter(b => pitchItemIds.has(b.itemId));
                if (allPitchBookings.length === 0) {
                    tbodyPitchesBookings.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد حجوزات ملاعب حتى الآن</td></tr>`;
                } else {
                    allPitchBookings.forEach(b => {
                        const isConfirmed = b.status === 'confirmed';
                        const totalNum = Number(b.total || 0);
                        const depNum   = Number(b.deposit || 0);
                        const waPhone  = toWhatsAppPhone(b.phone);
                        const waUrl    = `https://wa.me/${waPhone}`;
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><strong>${escapeHtml(b.clientName)}</strong></td>
                            <td style="direction:ltr;text-align:right;">${escapeHtml(b.phone)}</td>
                            <td>${escapeHtml(currentLang === 'ar' ? b.itemNameAr : b.itemNameEn)}</td>
                            <td><small>${escapeHtml(b.details)}</small></td>
                            <td>الإجمالي: ${totalNum.toFixed(2)} JOD<br><strong style="color:#C28222;">العربون: ${depNum.toFixed(2)} JOD</strong></td>
                            <td>${b.receiptRaw ? `<button type="button" class="copy-chip-btn" data-action="preview-receipt" data-receipt="${escapeHtml(b.receiptRaw)}">🔐 عرض الوصل</button>` : `<img src="${escapeHtml(b.receiptData)}" class="receipt-thumb" alt="وصل" data-action="preview-receipt" data-receipt="${escapeHtml(b.receiptData)}">`}</td>
                            <td>
                                <div class="action-menu-inline" style="align-items:center;">
                                    ${isConfirmed ? '<span class="badge-status active">✅ مؤكد</span>' : `<button type="button" class="icon-btn approve" title="تأكيد" aria-label="تأكيد" data-action="approve-booking" data-id="${b.id}">✓</button>`}
                                    <button type="button" class="icon-btn edit-btn" title="تعديل بيانات وموعد الحجز" aria-label="تعديل بيانات وموعد الحجز" data-action="edit-booking" data-id="${b.id}">✏️</button>
                                    <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="icon-btn whatsapp" title="واتساب">💬</a>
                                    <button type="button" class="icon-btn danger" title="رفض / إلغاء" aria-label="رفض / إلغاء" data-action="reject-booking" data-id="${b.id}">✕</button>
                                    <button type="button" class="icon-btn danger" title="حذف نهائي" aria-label="حذف نهائي" data-action="delete-booking" data-id="${b.id}">🗑️</button>
                                </div>
                            </td>`;
                        tbodyPitchesBookings.appendChild(tr);
                    });
                }
            }

            // ── 7) Reviews Moderation Table ──
            const tbodyReviews = document.getElementById('admin-reviews-table');
            if (tbodyReviews) {
                tbodyReviews.innerHTML = '';
                if (!allReviews || allReviews.length === 0) {
                    tbodyReviews.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد تقييمات مرسلة حالياً</td></tr>`;
                } else {
                    allReviews.forEach(rv => {
                        const fac = items.find(i => i.id === Number(rv.facility_id));
                        const facName = fac ? localizedItemText(fac, 'name') : `#${rv.facility_id}`;
                        const isApproved = rv.status === 'approved';
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><strong>${escapeHtml(facName)}</strong></td>
                            <td>${escapeHtml(rv.user_name)}</td>
                            <td>${renderStars(rv.rating)} (${Number(rv.rating || 5).toFixed(1)})</td>
                            <td><small>${escapeHtml(rv.comment)}</small></td>
                            <td>${isApproved ? '<span class="badge-status active">معتمد</span>' : '<span class="badge-status editing">قيد المراجعة</span>'}</td>
                            <td>
                                <div class="action-menu-inline">
                                    ${!isApproved ? `<button type="button" class="icon-btn approve" title="اعتماد ونشر التقييم" aria-label="اعتماد ونشر التقييم" data-action="approve-review" data-id="${rv.id}">✓</button>` : ''}
                                    <button type="button" class="icon-btn danger" title="حذف التقييم" aria-label="حذف التقييم" data-action="delete-review" data-id="${rv.id}">🗑️</button>
                                </div>
                            </td>`;
                        tbodyReviews.appendChild(tr);
                    });
                }
            }

            // Stats (تجاهل الأقفال الإدارية الخارجية حتى لا تضيف مبالغ وهمية لأرباح العربون)
            const realConfirmed = confirmedBookings.filter(b => !isAdminBlockedBooking(b));
            document.getElementById('stat-pending-count').textContent  = pendingBookings.length;
            document.getElementById('stat-approved-count').textContent = realConfirmed.length;
            const totalRev = realConfirmed.reduce((s, b) => s + (Number(b.deposit) || 0), 0);
            document.getElementById('stat-total-revenue').textContent  = `${totalRev.toFixed(2)} JOD`;
            renderAdminPromosSection();
            renderAdminOwnersTab();
            populateQuickBlockFacilitiesDropdown();
            renderTelegramSettingsUI();
            if (document.getElementById('dash-listings')?.classList.contains('active')) {
                setTimeout(() => initOrUpdateAdminMapPicker(), 120);
            }
        }

        // ─── إجراءات الأدمن تنتظر استجابة قاعدة البيانات أولاً قبل تعديل الواجهة ───
        function updateLocalMyBookingStatus(bookingId, newStatus) {
            try {
                const list = safeGetJSON('wknd_my_bookings', '[]');
                let changed = false;
                list.forEach(item => {
                    if (Number(item.id) === Number(bookingId)) {
                        item.status = newStatus;
                        changed = true;
                    }
                });
                if (changed) safeSetStorage('wknd_my_bookings', JSON.stringify(list));
            } catch (e) {}
        }

        async function approveBooking(bookingId) {
            if (!db || !isAdminLoggedIn) return;
            const numId = Number(bookingId);
            const { error } = await db.from('bookings').update({ status: 'confirmed' }).eq('id', numId);
            if (error) {
                if (error.code === '23P01') {
                    showToast('⛔ لا يمكن تأكيد هذا الحجز لوجود حجز مؤكد آخر بنفس الموعد');
                } else {
                    showToast('❌ تعذر تأكيد الحجز في القاعدة: ' + (error.message || ''));
                }
                return;
            }
            updateLocalMyBookingStatus(numId, 'confirmed');
            await loadFromDatabase();
            renderAdminPanel();
            showToast('✅ تم تأكيد الحجز وتحديث حالة تذكرة العميل رسمياً');
        }

        
        async function rejectBooking(bookingId) {
            if (!db || !isAdminLoggedIn) return;
            const numId = Number(bookingId);
            const { error } = await db.from('bookings').update({ status: 'rejected' }).eq('id', numId);
            if (error) {
                showToast('❌ تعذر رفض/إلغاء الحجز: ' + (error.message || ''));
                return;
            }
            removeLocalMyBooking(numId);
            await loadFromDatabase();
            renderAdminPanel();
            showToast('تم إلغاء الحجز وإبطال تذكرة العميل وتحرير الموعد');
        }

        async function deleteBooking(bookingId) {
            if (!db || !isAdminLoggedIn) return;
            const numId = Number(bookingId);
            if (!confirm(`هل أنت متأكد من حذف الحجز #${numId} نهائياً وإلغاء تذكرة العميل؟`)) return;
            const { error } = await db.from('bookings').delete().eq('id', numId);
            if (error) {
                showToast('❌ تعذر حذف السجل: ' + (error.message || ''));
                return;
            }
            removeLocalMyBooking(numId);
            await loadFromDatabase();
            renderAdminPanel();
            showToast('🗑️ تم حذف الحجز نهائياً وإلغاء تذكرة العميل');
        }

        async function toggleItemFeatured(id) {
            if (!db || !isAdminLoggedIn) return;
            const item = items.find(i => i.id === Number(id));
            if (!item) return;
            const currentAm = Array.isArray(item.amenities) ? [...item.amenities] : [];
            const isFeat = currentAm.includes('featured');
            const nextAm = isFeat ? currentAm.filter(a => a !== 'featured') : ['featured', ...currentAm];
            const { error } = await db.from('facilities').update({ amenities: nextAm }).eq('id', item.id);
            if (error) {
                showToast('❌ تعذر تحديث حالة تمييز المنشأة');
                return;
            }
            item.amenities = nextAm;
            renderAdminPanel();
            
            showToast(!isFeat ? '⭐ تم تثبيت المنشأة كمميزة في مقدمة العرض' : 'تم إلغاء تثبيت المنشأة كمميزة');
        }

        async function approveReview(reviewId) {
            if (!db || !isAdminLoggedIn) return;
            const { error } = await db.from('reviews').update({ status: 'approved' }).eq('id', Number(reviewId));
            if (error) {
                showToast('❌ تعذر اعتماد التقييم: ' + (error.message || ''));
                return;
            }
            await loadFromDatabase();
            renderAdminPanel();
            
            showToast('✅ تم اعتماد التقييم وتحديث متوسط المنشأة تلقائياً');
        }

        async function deleteReview(reviewId) {
            if (!db || !isAdminLoggedIn) return;
            if (!confirm('هل أنت متأكد من حذف هذا التقييم؟')) return;
            const { error } = await db.from('reviews').delete().eq('id', Number(reviewId));
            if (error) {
                showToast('❌ تعذر حذف التقييم: ' + (error.message || ''));
                return;
            }
            await loadFromDatabase();
            renderAdminPanel();
            
            showToast('تم حذف التقييم');
        }

        async function toggleItemActive(id) {
            if (!db || !isAdminLoggedIn) return;
            const item = items.find(i => i.id === Number(id));
            if (!item) return;
            const nextState = !item.active;
            const { error } = await db.from('facilities').update({ active: nextState }).eq('id', item.id);
            if (error) {
                showToast('❌ تعذر تحديث حالة المنشأة في القاعدة');
                return;
            }
            item.active = nextState;
            item._editing = false;
            renderAdminPanel();
            
            showToast(nextState ? '✅ تم تفعيل عرض المنشأة' : '⏸️ تم إيقاف عرض المنشأة للزوار');
        }

        async function deleteListing(id) {
            if (!db || !isAdminLoggedIn) return;
            const numId = Number(id);
            const item = items.find(i => i.id === numId);
            const name = item ? item.nameAr : `منشأة #${numId}`;
            if (!confirm(`هل أنت متأكد من حذف (${name}) نهائياً؟`)) return;
            const { error } = await db.from('facilities').delete().eq('id', numId);
            if (error) {
                // إذا كانت المنشأة مرتبطة بحجوزات سابقة (قيد RESTRICT 23503)، نقوم بتعطيلها بدلاً من حذفها
                if (error.code === '23503') {
                    const { error: deactErr } = await db.from('facilities').update({ active: false }).eq('id', numId);
                    if (!deactErr) {
                        const it = items.find(i => i.id === numId);
                        if (it) { it.active = false; it._editing = false; }
                        renderAdminPanel();
                        
                        showToast('ℹ️ المنشأة مرتبطة بحجوزات سابقة؛ تم إيقاف عرضها (تعطيلها) حفاظاً على السجل المالي.');
                        return;
                    }
                }
                showToast('❌ تعذر حذف المنشأة: ' + (error.message || ''));
                return;
            }
            items = items.filter(i => i.id !== numId);
            renderAdminPanel();
            
            showToast('تم حذف المنشأة نهائياً');
        }

        
        // [البند 29] تنظيف الوصولات اليتيمة: القائمة من السيرفر (admin_list_orphan_receipts) والحذف عبر Storage API الرسمي
        async function cleanOrphanReceipts(btn) {
            if (!db || !isAdminLoggedIn) return;
            if (btn) btn.disabled = true;
            try {
                const { data, error } = await db.rpc('admin_list_orphan_receipts', { p_limit: 1000 });
                if (error) { showToast('❌ تعذر جلب قائمة الوصولات اليتيمة'); return; }
                const names = (Array.isArray(data) ? data : [])
                    .map(r => String((r && r.name) || ''))
                    .filter(n => n && !n.includes('..'));
                if (!names.length) { showToast('✅ لا توجد وصولات يتيمة أقدم من 24 ساعة'); return; }
                const totalMb = ((Array.isArray(data) ? data : []).reduce((sum, r) => sum + Number((r && r.size_bytes) || 0), 0) / 1048576).toFixed(2);
                if (!confirm(`تم العثور على ${names.length} وصل غير مرتبط بأي حجز (أقدم من 24 ساعة) بحجم ${totalMb} MB.\nهل تريد حذفها نهائياً من التخزين؟`)) return;
                let deleted = 0, failed = 0;
                for (let i = 0; i < names.length; i += 100) {
                    const chunk = names.slice(i, i + 100);
                    const { data: removed, error: remErr } = await db.storage.from('cliq-receipts').remove(chunk);
                    if (remErr) { failed += chunk.length; continue; }
                    const n = Array.isArray(removed) ? removed.length : 0;
                    deleted += n;
                    failed += chunk.length - n;
                }
                const more = names.length >= 1000 ? ' — اضغط مرة أخرى لمتابعة الباقي' : '';
                showToast(failed ? `⚠️ تم حذف ${deleted} وتعذر حذف ${failed}${more}` : `🧹 تم حذف ${deleted} وصل يتيم بنجاح${more}`);
            } catch (e) {
                showToast('❌ حدث خطأ أثناء تنظيف الوصولات');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function openPrivateReceiptModal(rawReceipt) {
            const raw = String(rawReceipt || '').trim();
            if (!raw) { showToast('⚠️ لا توجد صورة وصل لهذا الحجز'); return; }
            // [البند 18] الوصولات القديمة تُجلب من السيرفر عند الطلب فقط
            if (raw.startsWith('legacy:') && db) {
                const { data: legacyReceipt, error: lrErr } = await db.rpc('admin_get_booking_receipt', { p_booking_id: Number(raw.slice(7)) });
                if (lrErr || !legacyReceipt) { showToast('❌ تعذر تحميل صورة الوصل'); return; }
                if (String(legacyReceipt).startsWith('cliq-receipts/')) return openPrivateReceiptModal(legacyReceipt);
                openImageModal(legacyReceipt, 'صورة وصل تحويل CliQ', { receipt: true });
                return;
            }
            if (raw.startsWith('cliq-receipts/') && db && db.storage) {
                const fileName = raw.slice('cliq-receipts/'.length);
                showToast('🔐 جاري فتح الوصل المشفّر...');
                const { data, error } = await db.storage.from('cliq-receipts').createSignedUrl(fileName, 120);
                if (!error && data && data.signedUrl) {
                    openImageModal(data.signedUrl, '🔐 صورة وصل تحويل CliQ (رابط مؤقت آمن)', { receipt: true });
                    return;
                }
                showToast('❌ تعذر فتح الوصل الخاص؛ تأكد من تسجيل الدخول كأدمن');
                return;
            }
            openImageModal(raw, 'صورة وصل تحويل CliQ', { receipt: true });
        }

        
        
        let adminOwnerAccounts = [];
        let adminOwnerRequests = [];

        async function loadAdminOwnersData() {
            if (!db || !isAdminLoggedIn) return;
            try {
                const [accRes, reqRes] = await Promise.all([
                    db.from('facility_owners').select('id,facility_id,owner_phone,owner_name,active,created_at,updated_at').order('id', { ascending: false }),
                    db.from('owner_change_requests').select('id,facility_id,owner_phone,owner_name,request_type,payload_json,summary_ar,status,admin_note,created_at,resolved_at').order('id', { ascending: false }).limit(60)
                ]);
                adminOwnerAccounts = (!accRes.error && Array.isArray(accRes.data)) ? accRes.data : [];
                adminOwnerRequests = (!reqRes.error && Array.isArray(reqRes.data)) ? reqRes.data : [];
            } catch (e) {}
        }

        function renderAdminOwnersTab() {
            const facSel = document.getElementById('ao-facility');
            if (facSel) {
                const prev = facSel.value;
                facSel.innerHTML = items.map(it => `<option value="${it.id}">${escapeHtml(it.nameAr)}</option>`).join('') || '<option value="">لا توجد منشآت</option>';
                if (prev && items.some(i => String(i.id) === prev)) facSel.value = prev;
            }

            // Requests Table
            const reqTbody = document.getElementById('admin-owner-requests-table');
            if (reqTbody) {
                if (!adminOwnerRequests.length) {
                    reqTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">لا توجد طلبات تعديل من الملّاك حالياً</td></tr>';
                } else {
                    reqTbody.innerHTML = adminOwnerRequests.map(r => {
                        const fac = items.find(i => i.id === Number(r.facility_id));
                        const facName = fac ? fac.nameAr : ('#' + r.facility_id);
                        const stBadge = r.status === 'pending'
                            ? '<span class="badge-status editing">⏳ بانتظار موافقتك</span>'
                            : (r.status === 'approved' ? '<span class="badge-status active">✅ تمت الموافقة والتطبيق</span>' : '<span class="badge-status inactive">❌ مرفوض</span>');
                        const actions = r.status === 'pending'
                            ? `<div class="action-menu-inline">
                                <button type="button" class="icon-btn approve" title="موافقة وتطبيق التعديل فوراً" aria-label="موافقة وتطبيق التعديل فوراً" data-action="resolve-owner-req" data-decision="approved" data-id="${r.id}">✓</button>
                                <button type="button" class="icon-btn danger" title="رفض الطلب" aria-label="رفض الطلب" data-action="resolve-owner-req" data-decision="rejected" data-id="${r.id}">✕</button>
                               </div>`
                            : '<small style="color:var(--text-muted);">مُعالَج</small>';
                        // [البند 16] معاينة فعلية لصور طلب التعديل قبل الموافقة (مع تمييز الصور الجديدة)
                        const reqImgs = (r.request_type === 'update_facility' && r.payload_json && Array.isArray(r.payload_json.images)) ? r.payload_json.images : [];
                        const curImgs = fac && Array.isArray(fac.images) ? fac.images : [];
                        const imgsHtml = reqImgs.length
                            ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${reqImgs.map(u => {
                                    const safeU = escapeHtml(sanitizeImageUrl(u));
                                    const isNew = !curImgs.includes(u);
                                    return `<span style="position:relative;display:inline-block;"><img src="${safeU}" alt="صورة الطلب" loading="lazy" data-action="preview-receipt" data-receipt="${safeU}" style="width:52px;height:52px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ${isNew ? 'var(--accent-gold)' : '#E0E0E0'};">${isNew ? '<span style="position:absolute;top:-6px;left:-4px;background:var(--accent-gold);color:var(--primary-dark);font-size:0.6rem;font-weight:700;padding:1px 4px;border-radius:6px;">جديدة</span>' : ''}</span>`;
                                }).join('')}</div>`
                            : '';
                        return `<tr>
                            <td><strong>${escapeHtml(facName)}</strong></td>
                            <td>${escapeHtml(r.owner_name || '')}<br><small style="direction:ltr;display:inline-block;">${escapeHtml(r.owner_phone || '')}</small></td>
                            <td><small>${escapeHtml(r.summary_ar || '')}</small>${imgsHtml}</td>
                            <td>${stBadge}</td>
                            <td>${actions}</td>
                        </tr>`;
                    }).join('');
                }
            }

            // Accounts Table
            const accTbody = document.getElementById('admin-owners-accounts-table');
            if (accTbody) {
                if (!adminOwnerAccounts.length) {
                    accTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">لم تقم بإنشاء حسابات ملّاك بعد — استخدم النموذج أعلاه لإنشاء أول حساب</td></tr>';
                } else {
                    accTbody.innerHTML = adminOwnerAccounts.map(a => {
                        const fac = items.find(i => i.id === Number(a.facility_id));
                        const facName = fac ? fac.nameAr : ('#' + a.facility_id);
                        return `<tr>
                            <td><strong>${escapeHtml(facName)}</strong></td>
                            <td>${escapeHtml(a.owner_name || '')}</td>
                            <td style="direction:ltr;text-align:right;">${escapeHtml(a.owner_phone || '')}</td>
                            <td>${a.active ? '<span class="badge-status active">نشط ✅</span>' : '<span class="badge-status inactive">موقوف ⏸️</span>'}</td>
                            <td>
                                <div class="action-menu-inline">
                                    <button type="button" class="icon-btn" title="تفعيل / إيقاف الحساب" aria-label="تفعيل / إيقاف الحساب" data-action="toggle-owner-acc" data-id="${a.id}">${a.active ? '⏸️' : '▶️'}</button>
                                    <button type="button" class="icon-btn danger" title="حذف الحساب" aria-label="حذف الحساب" data-action="delete-owner-acc" data-id="${a.id}">🗑️</button>
                                </div>
                            </td>
                        </tr>`;
                    }).join('');
                }
            }
        }

        async function handleAdminCreateOwnerSubmit(e) {
            e.preventDefault();
            if (!db || !isAdminLoggedIn) return;
            const facId = Number(document.getElementById('ao-facility').value);
            const name  = document.getElementById('ao-name').value.trim();
            const phone = normalizePhone(document.getElementById('ao-phone').value);
            const pin   = document.getElementById('ao-pin').value.trim();
            const fac   = items.find(i => i.id === facId);

            if (!facId || !isValidPhone(phone) || !/^[0-9]{6,8}$/.test(pin)) {
                showToast('⚠️ يرجى التحقق من المنشأة ورقم الهاتف ورمز الدخول (من 6 إلى 8 أرقام)');
                return;
            }
            const btn = document.getElementById('btn-ao-submit');
            if (btn) btn.disabled = true;
            try {
                const { error } = await db.rpc('admin_set_owner_access', {
                    p_facility_id: facId, p_owner_phone: phone, p_owner_name: name, p_pin: pin
                });
                if (error) { showToast('❌ ' + error.message); return; }

                const ownerUrl = `${window.location.origin}/owner`;
                const shareMsg = `مرحباً ${name} 👋\nتم تفعيل حسابك في بوابة ملّاك منصة Weekend لمنشأة (${fac ? fac.nameAr : ''}):\n🔗 الرابط: ${ownerUrl}\n📞 رقم الهاتف: ${phone}\n🔐 رمز الدخول (PIN): ${pin}\n\nيمكنك من خلالها متابعة حجوزاتك وإرسال طلبات قفل المواعيد وتعديل الأسعار لتعتمدها الإدارة فوراً.`;
                document.getElementById('ao-share-text').textContent = shareMsg;
                document.getElementById('btn-ao-wa-creds').href = `https://wa.me/${toWhatsAppPhone(phone)}?text=${encodeURIComponent(shareMsg)}`;
                document.getElementById('ao-share-box').style.display = 'block';

                await loadAdminOwnersData();
                renderAdminOwnersTab();
                showToast('✅ تم إنشاء/تحديث حساب المالك بنجاح!');
            } finally { if (btn) btn.disabled = false; }
        }

        async function resolveAdminOwnerRequest(reqId, decision) {
            if (!db || !isAdminLoggedIn) return;
            let note = '';
            if (decision === 'rejected') {
                note = prompt('سبب الرفض (اختياري — سيظهر للمالك):', '') || '';
            } else if (!confirm('هل توافق على تطبيق هذا التعديل على الموقع فوراً؟')) {
                return;
            }
            const { error } = await db.rpc('admin_resolve_owner_request', {
                p_request_id: Number(reqId), p_decision: decision, p_admin_note: note
            });
            if (error) {
                showToast(error.code === '23P01' ? '⛔ تعذر القفل لوجود حجز متعارض في نفس الموعد' : '❌ ' + error.message);
                return;
            }
            await loadFromDatabase();
            await loadAdminOwnersData();
            renderAdminPanel();
            showToast(decision === 'approved' ? '✅ تمت الموافقة وتطبيق التعديل على الموقع فوراً!' : 'تم رفض طلب المالك');
        }

        async function toggleAdminOwnerAccount(accId) {
            const acc = adminOwnerAccounts.find(x => Number(x.id) === Number(accId));
            if (!acc || !db) return;
            const { error } = await db.from('facility_owners').update({ active: !acc.active }).eq('id', acc.id);
            if (error) { showToast('❌ تعذر تحديث الحالة'); return; }
            await loadAdminOwnersData();
            renderAdminOwnersTab();
            showToast(!acc.active ? '▶️ تم تفعيل حساب المالك' : '⏸️ تم إيقاف حساب المالك');
        }

        async function deleteAdminOwnerAccount(accId) {
            if (!db || !confirm('هل أنت متأكد من حذف حساب دخول هذا المالك؟')) return;
            const { error } = await db.from('facility_owners').delete().eq('id', Number(accId));
            if (error) { showToast('❌ تعذر الحذف'); return; }
            await loadAdminOwnersData();
            renderAdminOwnersTab();
            showToast('🗑️ تم حذف حساب المالك');
        }

        function openEditBookingModal(bookingId) {
            const numId = Number(bookingId);
            const b = [...pendingBookings, ...confirmedBookings, ...archivedBookings].find(x => x.id === numId);
            if (!b) { showToast('⚠️ لم يتم العثور على الحجز'); return; }
            const fac = items.find(i => i.id === Number(b.itemId));
            const cat = fac ? fac.category : (b.shiftType ? 'farm' : (b.hourFrom > 0 || b.hourTo < 24 ? 'field' : 'transport'));

            document.getElementById('edit-b-id').value = b.id;
            document.getElementById('edit-b-category').value = cat;
            document.getElementById('edit-b-subtitle').textContent = `التذكرة #${b.ticketCode || ('WKND-' + b.id)} — ${b.itemNameAr || 'منشأة'}`;
            document.getElementById('edit-b-name').value = b.clientName || '';
            document.getElementById('edit-b-phone').value = b.phone || '';
            document.getElementById('edit-b-date').value = b.bookingDate || '';
            document.getElementById('edit-b-total').value = Number(b.total || 1).toFixed(2);
            document.getElementById('edit-b-deposit').value = Number(b.deposit || 1).toFixed(2);
            document.getElementById('edit-b-status').value = ['pending', 'confirmed', 'rejected'].includes(b.status) ? b.status : 'pending';
            document.getElementById('edit-b-details').value = b.details || '';

            const shiftGrp = document.getElementById('edit-b-shift-group');
            const hoursGrp = document.getElementById('edit-b-hours-group');
            if (cat === 'farm') {
                shiftGrp.style.display = 'block';
                hoursGrp.style.display = 'none';
                document.getElementById('edit-b-shift').value = b.shiftType || (b.hourFrom === 12 ? 'evening' : (b.hourTo === 12 ? 'morning' : 'fullday'));
            } else if (cat === 'field') {
                shiftGrp.style.display = 'none';
                hoursGrp.style.display = 'flex';
                document.getElementById('edit-b-hour-from').value = b.hourFrom ?? 18;
                document.getElementById('edit-b-hour-to').value = b.hourTo ?? 20;
            } else {
                shiftGrp.style.display = 'none';
                hoursGrp.style.display = 'none';
            }

            const reqWrap = document.getElementById('edit-b-resolve-req-wrap');
            if (reqWrap) {
                reqWrap.style.display = b.changeRequestStatus === 'pending' ? 'block' : 'none';
                const cb = document.getElementById('edit-b-resolve-req');
                if (cb) cb.checked = true;
            }
            openModalSafely('edit-booking-modal');
        }

        function syncEditBookingDetailsPreview() {
            const cat = document.getElementById('edit-b-category')?.value || 'farm';
            const dt  = document.getElementById('edit-b-date')?.value || '';
            const detInp = document.getElementById('edit-b-details');
            if (!dt || !detInp) return;
            if (cat === 'farm') {
                const sh = document.getElementById('edit-b-shift')?.value || 'fullday';
                detInp.value = `${dt} (${sh})`;
            } else if (cat === 'field') {
                const hf = parseInt(document.getElementById('edit-b-hour-from')?.value, 10) || 18;
                const ht = parseInt(document.getElementById('edit-b-hour-to')?.value, 10) || (hf + 2);
                const hrs = Math.max(1, ht - hf);
                const lbl = hf < 12 ? `${hf}:00ص` : (hf === 12 ? '12:00ظ' : `${hf - 12}:00م`);
                detInp.value = `${dt} — ${hrs} ساعة بدءاً من ${lbl}`;
            } else {
                // Replace leading YYYY-MM-DD in transport details while keeping passengers/km
                const cur = detInp.value || '';
                if (/^\d{4}-\d{2}-\d{2}/.test(cur)) {
                    detInp.value = cur.replace(/^\d{4}-\d{2}-\d{2}/, dt);
                } else {
                    detInp.value = `${dt} — ${cur}`;
                }
            }
        }

        async function saveAdminBookingEdit(e) {
            e.preventDefault();
            if (!db || !isAdminLoggedIn) return;
            const numId = Number(document.getElementById('edit-b-id').value);
            const cat   = document.getElementById('edit-b-category').value;
            const name  = document.getElementById('edit-b-name').value.trim();
            const phone = normalizePhone(document.getElementById('edit-b-phone').value);
            const bDate = document.getElementById('edit-b-date').value;
            const total = parseFloat(document.getElementById('edit-b-total').value);
            const dep   = parseFloat(document.getElementById('edit-b-deposit').value);
            const status = document.getElementById('edit-b-status').value;
            const details = document.getElementById('edit-b-details').value.trim();

            if (name.length < 2 || !isValidPhone(phone) || !bDate || !details) {
                showToast('⚠️ يرجى التأكد من صحة الاسم والهاتف والتاريخ والتفاصيل');
                return;
            }
            if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(dep) || dep <= 0 || dep > total) {
                showToast('⚠️ يرجى التأكد أن العربون أكبر من 0 ولا يتجاوز المبلغ الإجمالي');
                return;
            }

            let hourFrom = 0, hourTo = 24, shiftType = null;
            if (cat === 'farm') {
                shiftType = document.getElementById('edit-b-shift').value || 'fullday';
                hourFrom = shiftType === 'evening' ? 12 : 0;
                hourTo   = shiftType === 'morning' ? 12 : 24;
            } else if (cat === 'field') {
                hourFrom = parseInt(document.getElementById('edit-b-hour-from').value, 10);
                hourTo   = parseInt(document.getElementById('edit-b-hour-to').value, 10);
                if (!Number.isFinite(hourFrom) || !Number.isFinite(hourTo) || hourFrom < 0 || hourFrom >= 24 || hourTo <= hourFrom || hourTo > 24) {
                    showToast('⚠️ ساعات الملعب غير صحيحة (ساعة الانتهاء يجب أن تكون بعد ساعة البدء وحتى 24)');
                    return;
                }
            }

            const payload = {
                client_name: name,
                phone: phone,
                booking_date: bDate,
                hour_from: hourFrom,
                hour_to: hourTo,
                shift_type: shiftType,
                total: Number(total.toFixed(2)),
                deposit: Number(dep.toFixed(2)),
                status: status,
                details: details
            };

            const reqWrap = document.getElementById('edit-b-resolve-req-wrap');
            if (reqWrap && reqWrap.style.display !== 'none' && document.getElementById('edit-b-resolve-req')?.checked) {
                payload.change_request_status = 'approved';
            }

            const btn = document.getElementById('edit-b-submit-btn');
            if (btn) btn.disabled = true;
            try {
                const { error } = await db.from('bookings').update(payload).eq('id', numId);
                if (error) {
                    if (error.code === '23P01') {
                        showToast('⛔ الموعد الجديد متعارض مع حجز آخر مؤكد أو قيد المراجعة في نفس التوقيت');
                    } else {
                        showToast('❌ تعذر حفظ التعديلات: ' + (error.message || ''));
                    }
                    return;
                }
                closeModal('edit-booking-modal');
                await loadFromDatabase();
                renderAdminPanel();
                showToast('✅ تم تعديل بيانات وموعد الحجز وتحديث التذكرة بنجاح');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function resolveChangeRequest(bookingId, decision) {
            if (!db || !isAdminLoggedIn) return;
            const numId = Number(bookingId);
            const updates = { change_request_status: decision };
            if (decision === 'approved') {
                const target = [...pendingBookings, ...confirmedBookings].find(x => x.id === numId);
                if (target && target.changeRequestType === 'cancel') {
                    updates.status = 'rejected';
                }
            }
            const { error } = await db.from('bookings').update(updates).eq('id', numId);
            if (error) {
                showToast('❌ تعذر تحديث حالة الطلب: ' + (error.message || ''));
                return;
            }
            await loadFromDatabase();
            renderAdminPanel();
            showToast(decision === 'approved' ? '✅ تم اعتماد طلب العميل وتحديث الحجز' : 'تم رفض طلب التعديل/الإلغاء');
        }

        function buildChangeRequestBadgeHtml(b) {
            if (!b || !b.changeRequestType) return '';
            const label = b.changeRequestType === 'cancel' ? '❌ طلب إلغاء ذاتي' : '📅 طلب تغيير موعد';
            const st = b.changeRequestStatus === 'pending' ? 'قيد المراجعة' : (b.changeRequestStatus === 'approved' ? 'معتمد' : 'مرفوض');
            const bg = b.changeRequestStatus === 'pending' ? '#FFF3E0' : '#F5F5F5';
            const border = b.changeRequestStatus === 'pending' ? '#FF9800' : '#DDD';
            const actions = b.changeRequestStatus === 'pending'
                ? `<div style="margin-top:5px;display:flex;gap:6px;"><button type="button" class="copy-chip-btn" style="background:#E3F2FD;border-color:#1565C0;color:#0D47A1;" data-action="edit-booking" data-id="${b.id}">✏️ تعديل الحجز</button><button type="button" class="copy-chip-btn" style="background:#E8F5E9;border-color:#2E7D32;color:#1B5E20;" data-action="resolve-change-req" data-decision="approved" data-id="${b.id}">✓ اعتماد</button><button type="button" class="copy-chip-btn" style="background:#FFEBEE;border-color:#D32F2F;color:#B71C1C;" data-action="resolve-change-req" data-decision="rejected" data-id="${b.id}">✕ رفض</button></div>`
                : '';
            return `<div style="margin-top:6px;background:${bg};border:1px solid ${border};border-radius:8px;padding:6px 8px;font-size:0.78rem;"><strong>${label} (${st})</strong>${b.changeRequestNote ? `<div>📝 ${escapeHtml(b.changeRequestNote)}</div>` : ''}${actions}</div>`;
        }

        
        // =====================================================
        //  CHAT / FAQ & TOAST (XSS SAFE)
        // =====================================================
                
        
        // =====================================================
        //  AVAILABILITY CALENDAR (Supports Farms, Pitches & Transport!)
        // =====================================================
        


        // =====================================================
        //  FEATURE 3: ELECTRONIC BOOKING TICKET (VOUCHER + QR + PDF)
        // =====================================================
        
        // التحقق مما إذا كان موعد الحجز قد انتهى زمنياً بتوقيت الأردن (اليوم مضى أو ساعة انتهاء الحجز مضت)
        
        function openBookingTicketModal(b) {
            if (!b) return;
            const status = resolveLiveBookingStatus(b);
            b.status = status;

            // إذا انتهى وقت الحجز أو قام الأدمن بحذفه/رفضه من الموقع، تنتهي التذكرة فوراً ولا تفتح كحجز فعال
            if ((status === 'expired' || status === 'deleted' || status === 'rejected') && !isAdminLoggedIn) {
                removeLocalMyBooking(b.id);
                closeModal('ticket-modal');
                showToast('⌛ انتهت صلاحية هذه التذكرة لانتهاء موعد الحجز أو إلغائه من الإدارة');
                return;
            }

            currentTicketBooking = b;
            const fac = items.find(i => i.id === Number(b.facilityId || b.itemId));
            const ticketCode = `WKND-${b.id}`;
            const venueName = (currentLang === 'ar' ? b.itemNameAr : b.itemNameEn) || (fac ? localizedItemText(fac, 'name') : 'منشأة Weekend');
            const venueLoc  = b.locationAr || (fac ? localizedItemText(fac, 'location') : 'الأردن');
            const lat = b.lat ?? (fac ? fac.lat : null);
            const lng = b.lng ?? (fac ? fac.lng : null);
            const savedMapUrl = String(b.mapUrl || (fac ? fac.mapUrl : '') || '').trim();
            const mapsHref = (savedMapUrl && /^https:\/\//i.test(savedMapUrl))
                ? savedMapUrl
                : ((lat !== null && lng !== null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)))
                    ? `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`
                    : buildSafeMapsHref(venueLoc));

            const total = Number(b.total || 0);
            const deposit = Number(b.deposit || 0);
            const discount = Number(b.discountAmount || 0);
            const remaining = Math.max(0, Number((total - deposit).toFixed(2)));
            let statusBadgeHtml = '<span style="background:#FFF3CD;color:#8A5E00;padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:700;">⏳ بانتظار تأكيد الإدارة</span>';
            if (status === 'confirmed') {
                statusBadgeHtml = '<span style="background:#E8F5E9;color:#2E7D32;padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:700;">✅ حجز مؤكد رسمياً</span>';
            } else if (status === 'rejected' || status === 'expired' || status === 'deleted') {
                statusBadgeHtml = '<span style="background:#FFEBEE;color:#D32F2F;padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:700;">❌ منتهية الصلاحية / ملغاة</span>';
            }

            const qrSvg = buildQrSvg(`${ticketCode}|${b.phone}|${total}`);
            const area = document.getElementById('ticket-printable-area');
            area.innerHTML = `
                <div class="ticket-card" id="ticket-card-node">
                    <div class="ticket-header">
                        <div>
                            <div style="font-size:1.25rem;font-weight:700;color:var(--accent-gold);">🌴 منصة Weekend الأردن</div>
                            <div style="font-size:0.82rem;color:#D1DDD5;margin-top:2px;">تذكرة حجز إلكترونية رسمية</div>
                        </div>
                        <div style="text-align:left;">
                            <div style="font-size:0.95rem;font-weight:700;color:#fff;margin-bottom:4px;direction:ltr;">#${escapeHtml(ticketCode)}</div>
                            ${statusBadgeHtml}
                        </div>
                    </div>
                    <div class="ticket-body">
                        <div class="ticket-info-grid">
                            <div class="ticket-info-item"><strong>👤 اسم العميل</strong><span>${escapeHtml(b.clientName || '')}</span></div>
                            <div class="ticket-info-item"><strong>📞 رقم الهاتف</strong><span style="direction:ltr;display:inline-block;">${escapeHtml(b.phone || '')}</span></div>
                            <div class="ticket-info-item"><strong>🏡 المنشأة / الخدمة</strong><span>${escapeHtml(venueName)}</span></div>
                            <div class="ticket-info-item"><strong>📍 الموقع</strong><span>${escapeHtml(venueLoc)}</span></div>
                            <div class="ticket-info-item" style="grid-column:1/-1;background:#EFF8FF;padding:8px 10px;border-radius:10px;border:1px solid #90CAF9;">
                                <strong style="color:#0D47A1;">🗺️ رابط اللوكيشن على الخريطة (Google Maps)</strong>
                                <a href="${escapeHtml(mapsHref)}" target="_blank" rel="noopener noreferrer" style="color:#1565C0;font-weight:700;text-decoration:underline;word-break:break-all;font-size:0.84rem;display:inline-block;margin-top:2px;">📍 اضغط هنا لفتح موقع المنشأة على Google Maps</a>
                            </div>
                            <div class="ticket-info-item" style="grid-column:1/-1;"><strong>📅 تفاصيل الموعد والحجز</strong><span>${escapeHtml(b.details || b.bookingDate || '')}</span></div>
                            ${discount > 0 ? `<div class="ticket-info-item" style="grid-column:1/-1;"><strong>🎁 الخصم المطبق (${escapeHtml(b.promoCode || 'عرض')})</strong><span style="color:var(--success);">-${discount.toFixed(2)} JOD</span></div>` : ''}
                            <div class="ticket-info-item"><strong>💰 المبلغ الإجمالي</strong><span>${total.toFixed(2)} JOD</span></div>
                            <div class="ticket-info-item"><strong>💳 العربون (CliQ)</strong><span style="color:#B27517;">${deposit.toFixed(2)} JOD</span></div>
                            <div class="ticket-info-item" style="grid-column:1/-1;background:#E8F5E9;padding:8px 10px;border-radius:10px;">
                                <strong style="color:#1B5E20;">💵 المبلغ المتبقي للدفع عند الوصول</strong>
                                <span style="color:#1B5E20;font-size:1rem;">${remaining.toFixed(2)} JOD</span>
                            </div>
                        </div>
                        <div class="ticket-qr-box">
                            ${qrSvg}
                            <div style="font-size:0.68rem;font-weight:700;color:var(--primary-dark);margin-top:4px;direction:ltr;">#${escapeHtml(ticketCode)}</div>
                        </div>
                    </div>
                    <div class="ticket-footer">
                        <span>📌 تنتهي صلاحية هذه التذكرة تلقائياً بانتهاء موعد الحجز</span>
                        <a href="${escapeHtml(mapsHref)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-dark);font-weight:700;text-decoration:underline;">🗺️ فتح الموقع على Google Maps</a>
                    </div>
                </div>`;

            const waText = encodeURIComponent(
                `🎫 *تذكرة حجز إلكترونية - منصة Weekend*
` +
                `رقم التذكرة: #${ticketCode}
` +
                `الحالة: ${status === 'confirmed' ? 'مؤكد رسمياً ✅' : 'قيد المراجعة ⏳'}
` +
                `العميل: ${b.clientName || ''}
` +
                `المنشأة: ${venueName}
` +
                `التفاصيل: ${b.details || ''}
` +
                `الإجمالي: ${total.toFixed(2)} JOD | العربون: ${deposit.toFixed(2)} JOD
` +
                `المتبقي عند الوصول: ${remaining.toFixed(2)} JOD
` +
                `📍 رابط اللوكيشن على الخريطة:
${mapsHref}`
            );
            const waBtn = document.getElementById('btn-share-ticket-wa');
            if (waBtn) waBtn.href = `https://wa.me/?text=${waText}`;

            renderRandomBusUpsellInTicket(b, fac, venueName, venueLoc);
            openModalSafely('ticket-modal');
        }

        
        
        
        async function bookUpsellBusFromTicket(busId) {
            // لوحة الأدمن لا تحتوي نموذج حجز العملاء: نفتح صفحة الباص في الموقع العام (نموذج الحجز الحالي الكامل)
            window.open('/?venue=' + encodeURIComponent(Number(busId)), '_blank', 'noopener');
        }

        

        
        // =====================================================
        //  FEATURE 4: TRACK MY BOOKING (AUTO-EXPIRY ON BOOKING END OR ADMIN DELETION)
        // =====================================================
        function resolveLiveBookingStatus(b) {
            if (!b) return 'expired';

            // 1) إذا انتهى وقت الحجز زمنياً بتوقيت الأردن، تنتهي التذكرة فوراً
            if (isTicketExpiredByTime(b)) {
                return 'expired';
            }

            const numId = Number(b.id);
            const facId = Number(b.facilityId || b.itemId || b.facility_id);
            const bDate = String(b.bookingDate || b.booking_date || '').trim() ||
                          ((String(b.details || '').match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '');
            const bDetails = String(b.details || '').trim();

            // 2) إذا كان الأدمن مسجلاً الدخول على نفس المتصفح، نتحقق مباشرةً من قوائم الأدمن
            if (isAdminLoggedIn) {
                if (confirmedBookings.some(x => Number(x.id) === numId || (facId && Number(x.itemId) === facId && x.bookingDate === bDate && x.details === bDetails))) {
                    return 'confirmed';
                }
                if (pendingBookings.some(x => Number(x.id) === numId || (facId && Number(x.itemId) === facId && x.bookingDate === bDate && x.details === bDetails))) {
                    return 'pending';
                }
                const archMatch = archivedBookings.find(x => Number(x.id) === numId);
                if (archMatch) return archMatch.status || 'rejected';
                // إذا لم يكن في المؤكدة ولا المعلقة ولا الأرشيف، فهذا يعني أن الأدمن حذفه نهائياً
                return 'deleted';
            }

            // 3) للزبون العام: التحقق الدقيق بمطابقة رقم المنشأة والتاريخ ونفس الساعات/الشفت (منع تداخل شفتين بنفس اليوم)
            if (facId && bDate && busyIntervalsLoaded) {
                let bFrom = (b.hourFrom !== null && b.hourFrom !== undefined) ? Number(b.hourFrom) : null;
                let bTo   = (b.hourTo !== null && b.hourTo !== undefined) ? Number(b.hourTo) : null;
                if (bFrom === null || bTo === null) {
                    const st = b.shiftType || (String(b.details || '').includes('evening') ? 'evening' : (String(b.details || '').includes('morning') ? 'morning' : 'fullday'));
                    bFrom = st === 'evening' ? 12 : 0;
                    bTo   = st === 'morning' ? 12 : 24;
                }
                const slotMatches = busyIntervals.filter(s =>
                    Number(s.facilityId) === facId &&
                    String(s.date) === bDate &&
                    s.hourFrom < bTo && bFrom < s.hourTo
                );
                if (slotMatches.some(s => s.status === 'confirmed')) {
                    return 'confirmed';
                }
                if (slotMatches.some(s => s.status === 'pending')) {
                    return 'pending';
                }
                // إذا تم تحميل المواعيد من السيرفر ولم يعد هذا الموعد بالذات موجوداً، فهذا يعني أن الأدمن حذفه أو ألغاه
                const createdMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (slotMatches.length === 0 && (!createdMs || (Date.now() - createdMs > 10000))) {
                    return 'deleted';
                }
            }

            return b.status || 'pending';
        }

        async function syncLocalBookingsWithDatabase(phoneFilter = '', idFilter = null) {
            if (!busyIntervalsLoaded) await loadPublicConfirmedSlots();
            const savedList = safeGetJSON('wknd_my_bookings', '[]');
            const targetPhone = normalizePhone(phoneFilter || (savedList[0] ? savedList[0].phone : ''));
            const targetBookingId = idFilter ? Number(idFilter) : (savedList[0] && savedList[0].id ? Number(savedList[0].id) : null);

            let serverResults = null;
            if (db && targetPhone && isValidPhone(targetPhone) && targetBookingId) {
                try {
                    const { data, error } = await db.rpc('track_my_bookings', {
                        p_phone: targetPhone,
                        p_booking_id: targetBookingId
                    });
                    if (!error && Array.isArray(data)) {
                        serverResults = data.map(r => ({
                            id: Number(r.id),
                            facilityId: Number(r.facility_id),
                            itemNameAr: r.item_name_ar,
                            itemNameEn: r.item_name_en || r.item_name_ar,
                            locationAr: r.location_ar,
                            lat: r.lat,
                            lng: r.lng,
                            clientName: r.client_name,
                            phone: r.phone,
                            bookingDate: r.booking_date,
                            hourFrom: r.hour_from !== null && r.hour_from !== undefined ? Number(r.hour_from) : 0,
                            hourTo: r.hour_to !== null && r.hour_to !== undefined ? Number(r.hour_to) : 24,
                            shiftType: r.shift_type || null,
                            details: r.details,
                            promoCode: r.promo_code,
                            discountAmount: Number(r.discount_amount || 0),
                            total: Number(r.total || 0),
                            deposit: Number(r.deposit || 0),
                            status: r.status || 'pending'
                        })).filter(item => !isTicketExpiredByTime(item) && (item.status === 'pending' || item.status === 'confirmed'));
                    }
                } catch (e) {}
            }

            // تنظيف الذاكرة المحلية: حذف أي تذكرة انتهى وقت حجزها أو تم حذفها/إلغاؤها من الموقع
            const activeLocalList = [];
            savedList.forEach(localItem => {
                if (serverResults !== null && (!targetPhone || normalizePhone(localItem.phone).slice(-9) === targetPhone.slice(-9))) {
                    const srv = serverResults.find(s => Number(s.id) === Number(localItem.id));
                    if (srv) {
                        localItem.status = srv.status;
                        activeLocalList.push(localItem);
                    }
                    // إذا لم يعد موجوداً في نتائج السيرفر لنفس الرقم، فهذا يعني أنه حُذف أو انتهى فلا نبقيه
                } else {
                    const liveSt = resolveLiveBookingStatus(localItem);
                    if (liveSt === 'confirmed' || liveSt === 'pending') {
                        localItem.status = liveSt;
                        activeLocalList.push(localItem);
                    }
                }
            });
            safeSetStorage('wknd_my_bookings', JSON.stringify(activeLocalList));

            if (serverResults !== null && serverResults.length > 0) return serverResults;

            return activeLocalList.filter(b => {
                const pMatch = !targetPhone || normalizePhone(b.phone).slice(-9) === targetPhone.slice(-9);
                const idMatch = !idFilter || Number(b.id) === Number(idFilter);
                return pMatch && idMatch;
            });
        }


        // =====================================================
        //  FEATURE 5: ADMIN PROMO CODES & DAY DISCOUNTS MANAGEMENT
        // =====================================================
        function renderAdminPromosSection() {
            const facListEl = document.getElementById('adm-p-excluded-facilities-list');
            if (facListEl) {
                const currentChecked = new Set(
                    Array.from(facListEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => Number(cb.value))
                );
                facListEl.innerHTML = items.map(it => `
                    <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;cursor:pointer;">
                        <input type="checkbox" class="adm-p-ex-fac-cb" value="${it.id}" ${currentChecked.has(it.id) ? 'checked' : ''}>
                        <span>${escapeHtml(it.nameAr)}</span>
                    </label>
                `).join('') || '<span style="font-size:0.8rem;color:#888;">لا توجد منشآت مضافة</span>';
            }

            const tbody = document.getElementById('admin-promos-table');
            if (!tbody) return;
            tbody.innerHTML = '';
            if (!promoCodes || promoCodes.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">لا توجد كوبونات أو عروض خصم مضافة حالياً</td></tr>`;
                return;
            }

            promoCodes.forEach(p => {
                const valText = p.discountType === 'percent' ? `${p.discountValue}%` : `${Number(p.discountValue).toFixed(2)} JOD`;
                const daysArr = Array.isArray(p.allowedDays) ? p.allowedDays.map(Number) : [0,1,2,3,4,5,6];
                const daysText = daysArr.length === 7 ? 'كل الأيام' : daysArr.map(d => DAY_NAMES_AR[d]).join('، ');
                const rangeText = (p.validFrom || p.validUntil)
                    ? `<br><small style="color:var(--text-muted);">${escapeHtml(p.validFrom || '...')} → ${escapeHtml(p.validUntil || '...')}</small>`
                    : '';
                const exDatesCount = (p.excludedDates || []).length;
                const exFacsCount = (p.excludedFacilityIds || []).length;
                const exSummary = (exDatesCount || exFacsCount)
                    ? `<small>${exDatesCount ? `🚫 ${exDatesCount} تاريخ مستثنى<br>` : ''}${exFacsCount ? `🏡 ${exFacsCount} منشأة مستثناة` : ''}</small>`
                    : '<small style="color:#888;">لا يوجد</small>';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong style="color:var(--primary-dark);font-size:0.95rem;">${escapeHtml(p.code)}</strong><br>
                        <small style="color:${p.autoApply ? '#1B5E20' : '#B27517'};font-weight:600;">${p.autoApply ? '✨ تلقائي باليوم' : '🔑 كود يدخله الزبون'}</small>
                    </td>
                    <td>${escapeHtml(p.titleAr)}</td>
                    <td><strong style="color:var(--success);font-size:0.95rem;">${escapeHtml(valText)}</strong></td>
                    <td><small style="font-weight:600;">${escapeHtml(daysText)}</small>${rangeText}</td>
                    <td>${exSummary}</td>
                    <td>${p.active ? '<span class="badge-status active">نشط ✅</span>' : '<span class="badge-status inactive">موقوف ⏸️</span>'}</td>
                    <td>
                        <div class="action-menu-inline">
                            <button type="button" class="icon-btn edit-btn" title="تعديل العرض" aria-label="تعديل العرض" data-action="edit-promo" data-id="${p.id}">✏️</button>
                            <button type="button" class="icon-btn" title="إيقاف / تفعيل العرض" aria-label="إيقاف / تفعيل العرض" data-action="toggle-promo" data-id="${p.id}">${p.active ? '⏸️' : '▶️'}</button>
                            <button type="button" class="icon-btn danger" title="حذف العرض" aria-label="حذف العرض" data-action="delete-promo" data-id="${p.id}">🗑️</button>
                        </div>
                    </td>`;
                tbody.appendChild(tr);
            });
        }

        function setPromoDaysPreset(preset) {
            document.querySelectorAll('.adm-p-day-cb').forEach(cb => {
                const d = Number(cb.value);
                if (preset === 'all') cb.checked = true;
                else if (preset === 'weekdays') cb.checked = (d >= 0 && d <= 3);
                else if (preset === 'weekend') cb.checked = (d >= 4 && d <= 6);
            });
        }

        function addExcludedDateToInput() {
            const picker = document.getElementById('adm-p-ex-date-picker');
            const inp = document.getElementById('adm-p-excluded-dates');
            if (!picker || !picker.value || !inp) return;
            const existing = inp.value.split(',').map(s => s.trim()).filter(Boolean);
            if (!existing.includes(picker.value)) {
                existing.push(picker.value);
                inp.value = existing.join(', ');
            }
            picker.value = '';
        }

        async function savePromoCode(e) {
            e.preventDefault();
            if (!isAdminLoggedIn) return;
            const editingId = parseInt(document.getElementById('adm-p-editing-id').value, 10) || null;
            const code = document.getElementById('adm-p-code').value.toUpperCase().trim().replace(/\s+/g, '');
            const titleAr = document.getElementById('adm-p-title').value.trim();
            const discountType = document.getElementById('adm-p-type').value;
            const discountValue = parseFloat(document.getElementById('adm-p-value').value) || 0;
            const autoApply = document.getElementById('adm-p-auto').value === 'true';
            const allowedDays = Array.from(document.querySelectorAll('.adm-p-day-cb:checked')).map(cb => Number(cb.value));
            const validFrom = document.getElementById('adm-p-from').value || null;
            const validUntil = document.getElementById('adm-p-until').value || null;
            const excludedDates = document.getElementById('adm-p-excluded-dates').value
                .split(',')
                .map(s => s.trim())
                .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
            const excludedFacilityIds = Array.from(document.querySelectorAll('.adm-p-ex-fac-cb:checked')).map(cb => Number(cb.value));

            if (!code || !titleAr) {
                showToast('⚠️ يرجى إدخال كود الخصم وعنوان العرض');
                return;
            }
            if (discountValue <= 0 || (discountType === 'percent' && discountValue > 90)) {
                showToast('⚠️ نسبة الخصم يجب أن تكون بين 1% و 90%');
                return;
            }
            if (allowedDays.length === 0) {
                showToast('⚠️ يرجى اختيار يوم واحد على الأقل ليعمل فيه الخصم');
                return;
            }

            const promoObj = {
                id: editingId || Date.now(),
                code,
                titleAr,
                discountType,
                discountValue,
                allowedDays,
                validFrom,
                validUntil,
                excludedDates,
                excludedFacilityIds,
                autoApply,
                active: true
            };

            if (db) {
                const dbRow = promoToRow(promoObj);
                if (!editingId) delete dbRow.id;
                const query = editingId
                    ? db.from('promo_codes').update(dbRow).eq('id', editingId).select(ADMIN_PROMO_COLUMNS).single()
                    : db.from('promo_codes').insert(dbRow).select(ADMIN_PROMO_COLUMNS).single();
                const { data, error } = await query;
                if (!error && data) {
                    const saved = rowToPromo(data);
                    if (editingId) {
                        const idx = promoCodes.findIndex(p => p.id === editingId);
                        if (idx !== -1) promoCodes[idx] = saved;
                    } else {
                        promoCodes.unshift(saved);
                    }
                } else {
                    // توافق محلي فوري
                    if (editingId) {
                        const idx = promoCodes.findIndex(p => p.id === editingId);
                        if (idx !== -1) promoCodes[idx] = promoObj;
                    } else {
                        promoCodes.unshift(promoObj);
                    }
                }
            }
            safeSetStorage('wknd_promos_fallback', JSON.stringify(promoCodes));
            cancelPromoEdit();
            renderAdminPromosSection();
            renderAdminOwnersTab();
            
            showToast(editingId ? '✅ تم تحديث العرض / الكود بنجاح' : '✅ تم إضافة وتفعيل كود الخصم بنجاح');
        }

        function editPromoCode(id) {
            const p = promoCodes.find(x => x.id === Number(id));
            if (!p) return;
            document.getElementById('adm-p-editing-id').value = p.id;
            document.getElementById('adm-p-code').value = p.code;
            document.getElementById('adm-p-title').value = p.titleAr;
            document.getElementById('adm-p-type').value = p.discountType;
            document.getElementById('adm-p-value').value = p.discountValue;
            document.getElementById('adm-p-auto').value = p.autoApply ? 'true' : 'false';
            document.getElementById('adm-p-from').value = p.validFrom || '';
            document.getElementById('adm-p-until').value = p.validUntil || '';
            document.getElementById('adm-p-excluded-dates').value = (p.excludedDates || []).join(', ');
            const daysSet = new Set((p.allowedDays || []).map(Number));
            document.querySelectorAll('.adm-p-day-cb').forEach(cb => {
                cb.checked = daysSet.has(Number(cb.value));
            });
            const exFacSet = new Set((p.excludedFacilityIds || []).map(Number));
            document.querySelectorAll('.adm-p-ex-fac-cb').forEach(cb => {
                cb.checked = exFacSet.has(Number(cb.value));
            });
            document.getElementById('promo-form-title').textContent = `✏️ تعديل الكود: ${p.code}`;
            document.getElementById('adm-p-submit-btn').textContent = '💾 حفظ التعديلات';
            document.getElementById('adm-p-cancel-btn').style.display = 'block';
            document.getElementById('add-promo-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function cancelPromoEdit() {
            document.getElementById('adm-p-editing-id').value = '';
            document.getElementById('add-promo-form').reset();
            document.querySelectorAll('.adm-p-day-cb').forEach(cb => { cb.checked = true; });
            document.querySelectorAll('.adm-p-ex-fac-cb').forEach(cb => { cb.checked = false; });
            document.getElementById('promo-form-title').textContent = '➕ إضافة كود خصم أو عرض يومي جديد';
            document.getElementById('adm-p-submit-btn').textContent = '💾 حفظ وتفعيل العرض / الكود';
            document.getElementById('adm-p-cancel-btn').style.display = 'none';
        }

        async function togglePromoActive(id) {
            const p = promoCodes.find(x => x.id === Number(id));
            if (!p) return;
            p.active = !p.active;
            if (db) {
                await db.from('promo_codes').update({ active: p.active }).eq('id', p.id);
            }
            safeSetStorage('wknd_promos_fallback', JSON.stringify(promoCodes));
            renderAdminPromosSection();
            renderAdminOwnersTab();
            
            showToast(p.active ? `▶️ تم تفعيل الكود (${p.code})` : `⏸️ تم إيقاف الكود (${p.code}) مؤقتاً`);
        }

        async function deletePromoCode(id) {
            const numId = Number(id);
            const p = promoCodes.find(x => x.id === numId);
            if (!confirm(`هل أنت متأكد من حذف كود الخصم (${p ? p.code : numId})؟`)) return;
            if (db) {
                await db.from('promo_codes').delete().eq('id', numId);
            }
            promoCodes = promoCodes.filter(x => x.id !== numId);
            safeSetStorage('wknd_promos_fallback', JSON.stringify(promoCodes));
            renderAdminPromosSection();
            renderAdminOwnersTab();
            
            showToast('🗑️ تم حذف كود الخصم');
        }


        // =====================================================
        //  FEATURE 6: ADMIN QUICK DATE BLOCK (EXTERNAL BOOKING / MAINTENANCE LOCK)
        // =====================================================
        const ADMIN_BLOCK_RECEIPT_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAABE0lEQVR4AQEIAff+AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/kqWDYZCsew8AAAAASUVORK5CYII=';

        function populateQuickBlockFacilitiesDropdown() {
            const sel = document.getElementById('quick-block-facility');
            if (!sel) return;
            const prevVal = sel.value;
            const dateInp = document.getElementById('quick-block-date');
            if (dateInp && !dateInp.min) {
                const { dateStr: today } = getAmmanNow();
                dateInp.min = today;
                if (!dateInp.value) dateInp.value = today;
            }
            sel.innerHTML = items.map(it => {
                const icon = it.category === 'transport' ? '🚌' : (it.category === 'field' ? '⚽' : '🏡');
                return `<option value="${it.id}">${icon} ${escapeHtml(it.nameAr)}</option>`;
            }).join('') || '<option value="">لا توجد منشآت مضافة</option>';
            if (prevVal && items.some(i => String(i.id) === String(prevVal))) {
                sel.value = prevVal;
            }
            syncQuickBlockFormUI();
        }

        function syncQuickBlockFormUI() {
            const sel = document.getElementById('quick-block-facility');
            const shiftWrap = document.getElementById('quick-block-shift-wrap');
            const pitchWrap = document.getElementById('quick-block-pitch-wrap');
            const pitchStart = document.getElementById('quick-block-pitch-start');
            const pitchHours = document.getElementById('quick-block-pitch-hours');
            if (!sel || !shiftWrap || !pitchWrap) return;

            const fac = items.find(i => i.id === Number(sel.value));
            if (!fac || fac.category === 'farm') {
                shiftWrap.style.display = 'block';
                pitchWrap.style.display = 'none';
            } else if (fac.category === 'field') {
                shiftWrap.style.display = 'none';
                pitchWrap.style.display = 'block';
                if (pitchStart && pitchHours) {
                    pitchHours.style.display = pitchStart.value === 'all' ? 'none' : 'block';
                }
            } else {
                shiftWrap.style.display = 'none';
                pitchWrap.style.display = 'none';
            }
        }

        function gotoQuickBlockForFacility(facId) {
            const sidebarBookingsItem = document.querySelector('.sidebar-item[data-tab="dash-bookings"]');
            switchAdminTab('dash-bookings', sidebarBookingsItem);
            populateQuickBlockFacilitiesDropdown();
            const sel = document.getElementById('quick-block-facility');
            if (sel) {
                sel.value = String(facId);
                syncQuickBlockFormUI();
            }
            const box = document.getElementById('quick-block-box');
            if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const dateInp = document.getElementById('quick-block-date');
            if (dateInp) setTimeout(() => dateInp.focus(), 200);
        }

        async function submitQuickBlockForm(e) {
            e.preventDefault();
            if (!db || !isAdminLoggedIn) return;
            const facId = Number(document.getElementById('quick-block-facility')?.value);
            const dateVal = document.getElementById('quick-block-date')?.value;
            const noteVal = (document.getElementById('quick-block-note')?.value || '').trim();
            const fac = items.find(i => i.id === facId);
            if (!fac || !dateVal) {
                showToast('⚠️ يرجى اختيار المنشأة والتاريخ المراد قفله');
                return;
            }

            let shiftType = null;
            let startHour = null;
            let hoursCount = null;
            let hFrom = 0;
            let hTo = 24;
            let detailsText = '';

            if (fac.category === 'farm') {
                shiftType = document.getElementById('quick-block-shift')?.value || 'fullday';
                hFrom = shiftType === 'evening' ? 12 : 0;
                hTo   = shiftType === 'morning' ? 12 : 24;
                detailsText = `${dateVal} (${shiftType}) [قفل إداري${noteVal ? ': ' + noteVal : ''}]`;
            } else if (fac.category === 'field') {
                const pStartVal = document.getElementById('quick-block-pitch-start')?.value || 'all';
                if (pStartVal === 'all') {
                    startHour = 6;
                    hoursCount = 18;
                    hFrom = 6;
                    hTo = 24;
                    detailsText = `${dateVal} — اليوم بالكامل [قفل إداري${noteVal ? ': ' + noteVal : ''}]`;
                } else {
                    startHour = parseInt(pStartVal, 10) || 18;
                    hoursCount = Math.min(24 - startHour, Math.max(2, parseInt(document.getElementById('quick-block-pitch-hours')?.value, 10) || 2));
                    hFrom = startHour;
                    hTo = startHour + hoursCount;
                    detailsText = `${dateVal} — قفل ساعات (${hFrom}:00 إلى ${hTo}:00) [قفل إداري${noteVal ? ': ' + noteVal : ''}]`;
                }
            } else {
                hFrom = 0;
                hTo = 24;
                detailsText = `${dateVal} — طوال اليوم [قفل إداري${noteVal ? ': ' + noteVal : ''}]`;
            }

            const submitBtn = document.getElementById('btn-quick-block-submit');
            if (submitBtn) submitBtn.disabled = true;

            try {
                await refreshBookingsForItem(fac.id);
                if (getIntervalBusyStatus(fac.id, dateVal, hFrom, hTo)) {
                    showToast('⛔ هذا الموعد محجوز أو مقفول مسبقاً في هذا التاريخ');
                    return;
                }

                const clientLabel = '🔒 قفل إداري' + (noteVal ? ` (${noteVal})` : ' (حجز خارجي)');
                let lockedOk = false;

                // المحاولة 1: عبر دالة admin_block_slot المباشرة
                const rpcRes = await db.rpc('admin_block_slot', {
                    p_facility_id: fac.id,
                    p_booking_date: dateVal,
                    p_shift_type: shiftType || 'fullday',
                    p_start_hour: startHour,
                    p_hours: hoursCount,
                    p_note: noteVal || null
                });

                if (!rpcRes.error) {
                    lockedOk = true;
                } else {
                    // المحاولة 2 (توافق تلقائي فوري بدون الحاجة لتشغيل SQL جديد): عبر create_booking ثم الترقية الفورية إلى confirmed
                    const tempPhone = '0780' + String(Math.floor(100000 + Math.random() * 899999));
                    const fallbackParams = {
                        p_facility_id: fac.id,
                        p_client_name: clientLabel,
                        p_phone: tempPhone,
                        p_booking_date: dateVal,
                        p_receipt_data: ADMIN_BLOCK_RECEIPT_PLACEHOLDER,
                        p_shift_type: fac.category === 'farm' ? shiftType : null,
                        p_start_hour: fac.category === 'field' ? startHour : null,
                        p_hours: fac.category === 'field' ? hoursCount : null,
                        p_passengers: fac.category === 'transport' ? 1 : null,
                        p_distance_km: fac.category === 'transport' ? 10 : null,
                        p_is_round_trip: false,
                        p_pickup_location: fac.category === 'transport' ? 'قفل إداري' : null,
                        p_dropoff_location: fac.category === 'transport' ? 'قفل إداري' : null
                    };
                    const fbRes = await db.rpc('create_booking', fallbackParams);
                    if (fbRes.error) {
                        showToast('❌ تعذر قفل الموعد: ' + (fbRes.error.message || ''));
                        return;
                    }
                    const newBookingId = fbRes.data?.id;
                    if (newBookingId) {
                        await db.from('bookings').update({
                            status: 'confirmed',
                            client_name: clientLabel,
                            details: detailsText
                        }).eq('id', newBookingId);
                    }
                    lockedOk = true;
                }

                if (lockedOk) {
                    const noteInp = document.getElementById('quick-block-note');
                    if (noteInp) noteInp.value = '';
                    await loadFromDatabase();
                    renderAdminPanel();
                    showToast(`🔒 تم قفل الموعد لـ (${fac.nameAr}) بتاريخ ${dateVal} بنجاح!`);
                }
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        }


        // =====================================================
        //  FEATURE 7: INSTANT TELEGRAM BOT NOTIFICATIONS FOR ADMIN
        // =====================================================
        function cleanTelegramToken(rawToken) {
            let t = String(rawToken || '').trim();
            // إزالة أي مسافات أو رابط كامل أو كلمة bot مكررة في البداية
            t = t.replace(/^https?:\/\/api\.telegram\.org\/bot/i, '');
            t = t.replace(/\/getUpdates.*$/i, '').replace(/\/sendMessage.*$/i, '');
            if (/^bot[0-9]+:/i.test(t)) t = t.slice(3);
            t = t.replace(/\s+/g, '');
            return t;
        }

        function extractChatIdFromInput(rawVal) {
            const s = String(rawVal || '').trim();
            if (/^-?[0-9]{5,20}$/.test(s)) return s;
            // إذا لصق المستخدم نص JSON القادم من صفحة getUpdates، نستخرج رقم chat.id منه تلقائياً
            const chatMatch = s.match(/"chat"\s*:\s*\{[^}]*?"id"\s*:\s*(-?[0-9]{5,20})/);
            if (chatMatch && chatMatch[1]) return chatMatch[1];
            const idMatch = s.match(/"id"\s*:\s*(-?[0-9]{5,20})/);
            if (idMatch && idMatch[1]) return idMatch[1];
            const numMatch = s.match(/(-?[0-9]{6,20})/);
            if (numMatch && numMatch[1]) return numMatch[1];
            return s;
        }


        // =====================================================
        //  FEATURE 8: INTERACTIVE ADMIN MAP PICKER & GOOGLE MAPS LINK PARSER
        // =====================================================
        let adminPickerMap = null;
        let adminPickerMarker = null;

        function initOrUpdateAdminMapPicker() {
            const mapEl = document.getElementById('adm-v-map-picker');
            if (!mapEl || !window.L) return;

            const latInp = document.getElementById('adm-v-lat');
            const lngInp = document.getElementById('adm-v-lng');
            const urlInp = document.getElementById('adm-v-map-url');
            const statusEl = document.getElementById('adm-v-map-status');

            let curLat = parseFloat(latInp?.value);
            let curLng = parseFloat(lngInp?.value);
            const hasCoords = Number.isFinite(curLat) && Number.isFinite(curLng);
            if (!hasCoords) {
                const reg = inferRegionCoords(document.getElementById('adm-v-location')?.value || '');
                curLat = reg.lat;
                curLng = reg.lng;
            }

            if (!adminPickerMap) {
                adminPickerMap = L.map('adm-v-map-picker').setView([curLat, curLng], hasCoords ? 14 : 11);
                L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    subdomains: 'abcd',
                    maxZoom: 19,
                    attribution: '© OpenStreetMap'
                }).addTo(adminPickerMap);

                adminPickerMap.on('click', function(ev) {
                    const clickedLat = Number(ev.latlng.lat.toFixed(6));
                    const clickedLng = Number(ev.latlng.lng.toFixed(6));
                    if (latInp) latInp.value = String(clickedLat);
                    if (lngInp) lngInp.value = String(clickedLng);
                    if (urlInp && (!urlInp.value || !urlInp.value.includes('maps.app.goo.gl'))) {
                        urlInp.value = `https://www.google.com/maps?q=${clickedLat},${clickedLng}`;
                    }
                    if (adminPickerMarker) {
                        adminPickerMarker.setLatLng([clickedLat, clickedLng]);
                    } else {
                        adminPickerMarker = L.marker([clickedLat, clickedLng]).addTo(adminPickerMap);
                    }
                    if (statusEl) {
                        statusEl.style.color = 'var(--success)';
                        statusEl.textContent = `✅ تم تحديد موقع الدبوس على الخريطة التفاعلية (${clickedLat}, ${clickedLng})`;
                    }
                });
            } else {
                setTimeout(() => {
                    adminPickerMap.invalidateSize();
                    adminPickerMap.setView([curLat, curLng], hasCoords ? 15 : 11);
                }, 80);
            }

            if (hasCoords) {
                if (adminPickerMarker) {
                    adminPickerMarker.setLatLng([curLat, curLng]);
                } else {
                    adminPickerMarker = L.marker([curLat, curLng]).addTo(adminPickerMap);
                }
            } else if (adminPickerMarker) {
                adminPickerMap.removeLayer(adminPickerMarker);
                adminPickerMarker = null;
            }
        }

        function handleAdminMapUrlInput(formType) {
            const isVenue = formType === 'venue';
            const urlInp = document.getElementById(isVenue ? 'adm-v-map-url' : 'adm-t-map-url');
            const latInp = document.getElementById(isVenue ? 'adm-v-lat' : 'adm-t-lat');
            const lngInp = document.getElementById(isVenue ? 'adm-v-lng' : 'adm-t-lng');
            const statusEl = document.getElementById(isVenue ? 'adm-v-map-status' : 'adm-t-map-status');
            if (!urlInp) return;

            const val = urlInp.value.trim();
            if (!val) {
                if (statusEl) statusEl.textContent = '';
                return;
            }
            const parsed = parseCoordsFromGoogleMapsInput(val);
            if (parsed) {
                if (latInp) latInp.value = String(parsed.lat);
                if (lngInp) lngInp.value = String(parsed.lng);
                if (!/^https:\/\//i.test(val)) {
                    urlInp.value = `https://www.google.com/maps?q=${parsed.lat},${parsed.lng}`;
                }
                if (statusEl) {
                    statusEl.style.color = 'var(--success)';
                    statusEl.textContent = `✅ تم استخراج اللوكيشن وتفعيل الخريطة التفاعلية والتذكرة تلقائياً (${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)})`;
                }
                if (isVenue) initOrUpdateAdminMapPicker();
            } else if (/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)/i.test(val)) {
                if (statusEl) {
                    statusEl.style.color = '#1565C0';
                    statusEl.textContent = '✅ تم حفظ رابط Google Maps للتذكرة والخريطة! (يمكنك أيضاً الضغط على الخريطة بالأسفل لتحديد مكان الدبوس بدقة)';
                }
                if (isVenue) initOrUpdateAdminMapPicker();
            } else {
                if (statusEl) {
                    statusEl.style.color = 'var(--danger)';
                    statusEl.textContent = '⚠️ يرجى لصق رابط صحيح من خرائط Google (يبدأ بـ https://) أو إحداثيات الموقع';
                }
            }
        }

        function renderTelegramSettingsUI() {
            const tokenInp = document.getElementById('tg-bot-token');
            const chatInp  = document.getElementById('tg-chat-id');
            const badge    = document.getElementById('tg-status-badge');
            if (!tokenInp || !chatInp || !badge) return;
            // التوكن المحفوظ لا يُعرض أبداً؛ نُظهر صيغته المخفية كتلميح فقط
            tokenInp.placeholder = telegramStatus && telegramStatus.token_masked
                ? `محفوظ: ${telegramStatus.token_masked} (اتركه فارغاً للإبقاء عليه)`
                : 'مثال: 7123456789:AAH_xyz123456...';
            if (telegramStatus && telegramStatus.chat_id && !chatInp.value) {
                chatInp.value = telegramStatus.chat_id;
            }
            const isReady = Boolean(telegramStatus && telegramStatus.enabled && telegramStatus.configured);
            badge.className = 'badge-status ' + (isReady ? 'active' : 'inactive');
            badge.textContent = isReady ? '🟢 متّصل وفعّال' : '⚪ غير مفعّل';
        }

        async function persistTelegramConfigToDb(token, chatId, enabled) {
            if (!db || !isAdminLoggedIn) return false;
            const { data, error } = await db.rpc('admin_save_telegram_config', {
                p_token: token || '', p_chat_id: chatId || '', p_enabled: Boolean(enabled)
            });
            if (error) {
                showToast('❌ ' + (error.message || 'تعذر حفظ إعدادات تيليجرام'));
                return false;
            }
            if (data) telegramStatus = data;
            const tokenInp = document.getElementById('tg-bot-token');
            if (tokenInp) tokenInp.value = '';
            renderTelegramSettingsUI();
            return true;
        }

        async function detectTelegramChatIdAutomatically() {
            const tokenInp = document.getElementById('tg-bot-token');
            const chatInp  = document.getElementById('tg-chat-id');
            const btn      = document.getElementById('btn-tg-detect-chat');
            const token    = cleanTelegramToken(tokenInp?.value || '');
            if (tokenInp && token) tokenInp.value = token;
            if (token && !/^[0-9]{6,15}:[A-Za-z0-9_-]{20,}$/.test(token)) {
                showToast('⚠️ يرجى التأكد من لصق كود البوت (Bot Token) الصحيح من @BotFather بدون مسافات');
                if (tokenInp) tokenInp.focus();
                return;
            }
            if (!token && !(telegramStatus && telegramStatus.token_masked)) {
                showToast('⚠️ يرجى لصق كود البوت (Bot Token) أولاً');
                if (tokenInp) tokenInp.focus();
                return;
            }
            if (btn) btn.disabled = true;
            try {
                // الاكتشاف يتم من السيرفر (التوكن المكتوب أو المحفوظ) دون اتصال المتصفح بتيليجرام
                const { data, error } = await db.rpc('admin_telegram_detect_chat', { p_token: token || null });
                if (error || !data || !data.ok) {
                    showToast('❌ ' + (error?.message || data?.error || 'تعذر اكتشاف رقم المحادثة'));
                    return;
                }
                if (chatInp) chatInp.value = String(data.chat_id);
                showToast(`✅ تم اكتشاف محادثتك تلقائياً (${data.chat_name || data.chat_id})! اضغط حفظ وتفعيل.`);
            } catch (err) {
                showToast('❌ تعذر الاتصال بالخادم، حاول مجدداً');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function saveTelegramConfig(e) {
            e.preventDefault();
            if (!isAdminLoggedIn) return;
            const tokenInp = document.getElementById('tg-bot-token');
            const chatInp  = document.getElementById('tg-chat-id');
            const token  = cleanTelegramToken(tokenInp?.value || '');
            const chatId = extractChatIdFromInput(chatInp?.value || '');
            if (chatInp) chatInp.value = chatId;

            if (token && !token.includes(':')) {
                showToast('⚠️ يرجى إدخال كود البوت (Bot Token) بشكل صحيح');
                return;
            }
            if (!token && !(telegramStatus && telegramStatus.token_masked)) {
                showToast('⚠️ يرجى إدخال كود البوت (Bot Token)');
                return;
            }
            if (!chatId || !/^-?[0-9]{5,20}$/.test(chatId)) {
                showToast('⚠️ يرجى إدخال رقم المحادثة (Chat ID) بالأرقام (يمكنك معرفته بمراسلة @userinfobot في تيليجرام)');
                return;
            }
            const btn = document.getElementById('btn-tg-save');
            if (btn) btn.disabled = true;
            try {
                if (await persistTelegramConfigToDb(token, chatId, true)) {
                    showToast('✅ تم حفظ وتفعيل إشعارات تيليجرام الفورية بنجاح!');
                }
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function disableTelegramNotifications() {
            if (!isAdminLoggedIn) return;
            const chatId = extractChatIdFromInput(document.getElementById('tg-chat-id')?.value || '');
            if (await persistTelegramConfigToDb('', chatId, false)) {
                showToast('⏸️ تم إيقاف إشعارات تيليجرام مؤقتاً');
            }
        }

        async function sendTestTelegramNotification() {
            if (!isAdminLoggedIn) return;
            const tokenInp = document.getElementById('tg-bot-token');
            const chatInp  = document.getElementById('tg-chat-id');
            const token  = cleanTelegramToken(tokenInp?.value || '');
            const chatId = extractChatIdFromInput(chatInp?.value || '');
            if (!token && !(telegramStatus && telegramStatus.token_masked)) {
                showToast('⚠️ أدخل كود البوت (Bot Token) في الخانة الأولى أولاً');
                return;
            }
            if (!chatId || !/^-?[0-9]{5,20}$/.test(chatId)) {
                showToast('⚠️ أدخل رقم المحادثة (Chat ID) أولاً (أرسل Start لـ @userinfobot في تيليجرام ليعطيك الرقم فوراً)');
                return;
            }
            const btn = document.getElementById('btn-tg-test');
            if (btn) btn.disabled = true;
            try {
                // حفظ أي قيم جديدة مكتوبة ثم الإرسال التجريبي من السيرفر مع تأكيد النتيجة الفعلية
                if (token || chatId !== (telegramStatus?.chat_id || '')) {
                    if (!(await persistTelegramConfigToDb(token, chatId, true))) return;
                }
                const { data, error } = await db.rpc('admin_telegram_test');
                if (!error && data && data.ok) {
                    showToast('🔔 تم إرسال الإشعار التجريبي! تفقد محادثة بوتك على تيليجرام الآن.');
                } else {
                    showToast('❌ ' + (error?.message || data?.error || 'تعذر الإرسال'));
                }
            } catch (err) {
                showToast('❌ تعذر الاتصال بالخادم، حاول مجدداً');
            } finally {
                if (btn) btn.disabled = false;
            }
        }


        function sanitizeExcelCell(val) {
            const s = String(val ?? '');
            return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
        }

        async function exportFullBackup() {
            if (!isAdminLoggedIn) return;
            // [البند 18] الأرشيف يُحمَّل على صفحات: نجلب كل الصفحات المتبقية قبل التصدير حتى تبقى النسخة الاحتياطية كاملة
            let guard = 0;
            while (archivedHasMore && guard++ < 100) {
                const before = archivedBookings.length;
                await loadMoreArchivedBookings(null);
                if (archivedBookings.length === before) break;
            }
            const backupPayload = {
                platform: 'Weekend Jordan',
                exportedAt: new Date().toISOString(),
                facilities: items,
                confirmedBookings: confirmedBookings,
                pendingBookings: pendingBookings,
                archivedBookings: archivedBookings,
                reviews: allReviews
            };
            const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().split('T')[0];
            a.href = url;
            a.download = `weekend_backup_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('💾 تم تحميل النسخة الاحتياطية الكاملة بنجاح');
        }

        async function handleRestoreBackupFile(input) {
            if (!isAdminLoggedIn || !db || !input.files || !input.files[0]) return;
            const file = input.files[0];
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (!parsed || !Array.isArray(parsed.facilities)) {
                    showToast('⚠️ ملف النسخة الاحتياطية غير صالح');
                    input.value = '';
                    return;
                }
                let restoredCount = 0;
                for (const fac of parsed.facilities) {
                    const row = itemToRow(fac);
                    if (fac.id) row.id = Number(fac.id);
                    const { error } = await db.from('facilities').upsert(row);
                    if (!error) restoredCount++;
                }
                await loadFromDatabase();
                renderAdminPanel();
                
                showToast(`✅ تمت استعادة وتحديث ${restoredCount} منشأة من النسخة الاحتياطية`);
            } catch (err) {
                showToast('❌ تعذر قراءة ملف النسخة الاحتياطية');
            } finally {
                input.value = '';
            }
        }

        // =====================================================
        //  [البند 20] كاتب XLSX صغير بدون أي مكتبة خارجية (بديل xlsx@0.18.5)
        //  ينتج ملف Office Open XML حقيقياً: ZIP (تخزين بدون ضغط) + CRC32 + XML مُهرَّب
        // =====================================================
        const XLSX_CRC_TABLE = (() => {
            const t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                t[n] = c >>> 0;
            }
            return t;
        })();

        function xlsxCrc32(bytes) {
            let c = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) c = XLSX_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        }

        // تهريب رموز XML الخمسة + حذف محارف التحكم غير المسموحة في XML 1.0
        function xlsxEscape(value) {
            return String(value ?? '')
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        }

        function xlsxColName(index) {
            let n = index + 1, s = '';
            while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
            return s;
        }

        function xlsxZip(files) { // files: [{ name, data: Uint8Array }]
            const enc = new TextEncoder();
            const now = new Date();
            const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
            const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
            const chunks = [], central = [];
            let offset = 0;
            for (const f of files) {
                const nameBytes = enc.encode(f.name);
                const crc = xlsxCrc32(f.data);
                const local = new DataView(new ArrayBuffer(30));
                local.setUint32(0, 0x04034B50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
                local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
                local.setUint32(14, crc, true); local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true);
                local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
                chunks.push(new Uint8Array(local.buffer), nameBytes, f.data);
                const cen = new DataView(new ArrayBuffer(46));
                cen.setUint32(0, 0x02014B50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
                cen.setUint16(10, 0, true); cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true);
                cen.setUint32(16, crc, true); cen.setUint32(20, f.data.length, true); cen.setUint32(24, f.data.length, true);
                cen.setUint16(28, nameBytes.length, true); cen.setUint16(30, 0, true); cen.setUint16(32, 0, true);
                cen.setUint16(34, 0, true); cen.setUint16(36, 0, true); cen.setUint32(38, 0, true); cen.setUint32(42, offset, true);
                central.push(new Uint8Array(cen.buffer), nameBytes);
                offset += 30 + nameBytes.length + f.data.length;
            }
            const centralSize = central.reduce((s, c) => s + c.length, 0);
            const end = new DataView(new ArrayBuffer(22));
            end.setUint32(0, 0x06054B50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
            end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
            end.setUint32(12, centralSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
            return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }

        // rows: مصفوفة كائنات (مفاتيحها عناوين الأعمدة بترتيب أول ظهور)؛ colWidths: عروض الأعمدة بالحروف
        function buildXlsxBlob(rows, sheetName, colWidths) {
            const enc = new TextEncoder();
            const headers = [];
            rows.forEach(r => Object.keys(r).forEach(k => { if (!headers.includes(k)) headers.push(k); }));
            const cell = (ref, v) => (typeof v === 'number' && Number.isFinite(v))
                ? `<c r="${ref}"><v>${v}</v></c>`
                : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscape(v)}</t></is></c>`;
            const sheetRows = [headers.map((h, i) => cell(xlsxColName(i) + '1', h)).join('')]
                .concat(rows.map((r, ri) => headers.map((h, i) => (r[h] === undefined || r[h] === null || r[h] === '') ? '' : cell(xlsxColName(i) + (ri + 2), r[h])).join('')))
                .map((cells, i) => `<row r="${i + 1}">${cells}</row>`).join('');
            const cols = (colWidths || []).slice(0, Math.max(headers.length, 1)).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(w) || 12}" customWidth="1"/>`).join('');
            const safeSheet = xlsxEscape(String(sheetName || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31));
            const lastRef = xlsxColName(Math.max(headers.length, 1) - 1) + (rows.length + 1);
            const files = {
                '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
                '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
                'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Weekend</Application></Properties>',
                'docProps/core.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Weekend</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') + '</dcterms:created></cp:coreProperties>',
                'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="' + safeSheet + '" sheetId="1" r:id="rId1"/></sheets></workbook>',
                'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
                'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
                'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:' + lastRef + '"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>' + (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + sheetRows + '</sheetData></worksheet>'
            };
            return xlsxZip(Object.entries(files).map(([name, xml]) => ({ name, data: enc.encode(xml) })));
        }

        function downloadBlob(blob, fileName) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.style.display = 'none';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
        }

        async function exportBookingsToExcel() {
            const realBookings = (confirmedBookings || []).filter(b => !isAdminBlockedBooking(b));
            if (!realBookings.length) {
                showToast('⚠️ لا توجد حجوزات مؤكدة لتصديرها');
                return;
            }
            const data = realBookings.map(function(b) {
                const row = {
                    'اسم العميل': sanitizeExcelCell(b.clientName || ''),
                    'رقم الهاتف': sanitizeExcelCell(String(b.phone || '')),
                    'المنشأة / الخدمة': sanitizeExcelCell((currentLang === 'ar' ? b.itemNameAr : b.itemNameEn) || ''),
                    'تفاصيل الحجز': sanitizeExcelCell(b.details || ''),
                    'مبلغ العربون (د.أ)': Number(b.deposit || 0),
                    'المبلغ الإجمالي (د.أ)': Number(b.total || 0),
                    'حالة الحجز': 'مؤكد ✓'
                };
                if (b.pickupLocation) row['موقع الانطلاق'] = sanitizeExcelCell(b.pickupLocation);
                if (b.dropoffLocation) row['موقع الوصول'] = sanitizeExcelCell(b.dropoffLocation);
                return row;
            });
            const xlsxBlob = buildXlsxBlob(data, 'الحجوزات المؤكدة', [28, 18, 26, 32, 20, 22, 16, 40, 40]);
            downloadBlob(xlsxBlob, 'تقرير_حجوزات_Weekend.xlsx');
            showToast('✅ تم تصدير ملف Excel بنجاح');
        }

        async function exportBookingsToPDF() {
            const realBookings = (confirmedBookings || []).filter(b => !isAdminBlockedBooking(b));
            if (!realBookings.length) {
                showToast('⚠️ لا توجد حجوزات مؤكدة لتصديرها');
                return;
            }
            try { await ensureHtml2PdfLibrary(); } catch (e) { showToast('❌ تعذر تحميل مكتبة PDF'); return; }
            const now = new Date().toLocaleDateString('ar-JO', { year: 'numeric', month: 'long', day: 'numeric' });
            const totalDeposit = realBookings.reduce((s, b) => s + (Number(b.deposit) || 0), 0);
            const totalRevenue = realBookings.reduce((s, b) => s + (Number(b.total) || 0), 0);

            const rows = realBookings.map(function(b, i) {
                const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAF9';
                const locRow = (b.pickupLocation || b.dropoffLocation)
                    ? `<tr style="background:${bg};"><td colspan="8" style="padding:4px 10px;font-size:10px;color:#555;border-bottom:1px solid #F0F2F1;">📌 ${escapeHtml(b.pickupLocation || '')} → 🏁 ${escapeHtml(b.dropoffLocation || '')}</td></tr>`
                    : '';
                return `<tr style="background:${bg};">
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;">${i + 1}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;font-weight:600;">${escapeHtml(b.clientName || '')}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;direction:ltr;text-align:right;">${escapeHtml(b.phone || '')}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;">${escapeHtml((currentLang === 'ar' ? b.itemNameAr : b.itemNameEn) || '')}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;">${escapeHtml(b.details || '')}</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;color:#B27517;font-weight:700;">${Number(b.deposit || 0).toFixed(2)} JOD</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;font-weight:600;">${Number(b.total || 0).toFixed(2)} JOD</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #F0F2F1;color:#2E7D32;font-weight:700;">مؤكد ✓</td>
                </tr>${locRow}`;
            }).join('');

            const reportHtml = `
                <div style="font-family:'Readex Pro',Arial,sans-serif;direction:rtl;padding:24px;background:#fff;color:#1A241E;width:700px;">
                    <div style="background:linear-gradient(135deg,#0D2818,#163E26);color:white;padding:20px 24px;border-radius:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:22px;font-weight:700;color:#D4A359;">🌴 منصة Weekend</div>
                            <div style="font-size:13px;color:#C0CDC5;margin-top:4px;">تقرير الحجوزات المؤكدة</div>
                        </div>
                        <div style="text-align:left;font-size:12px;color:#D4A359;">📅 ${escapeHtml(now)}<br><span style="color:#fff;">إجمالي: ${realBookings.length}</span></div>
                    </div>
                    <div style="display:flex;gap:12px;margin-bottom:20px;">
                        <div style="flex:1;background:#F8FAF9;border:1px solid #EAEAEA;border-radius:10px;padding:14px;text-align:center;"><div style="font-size:26px;font-weight:700;color:#0D2818;">${realBookings.length}</div><div style="font-size:11px;color:#5A6960;margin-top:4px;">إجمالي الحجوزات</div></div>
                        <div style="flex:1;background:#FFF9EF;border:1px solid #F0D5A8;border-radius:10px;padding:14px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#B27517;">${totalDeposit.toFixed(2)} JOD</div><div style="font-size:11px;color:#5A6960;margin-top:4px;">مجموع العربونات</div></div>
                        <div style="flex:1;background:#E8F5E9;border:1px solid #C8E6C9;border-radius:10px;padding:14px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#2E7D32;">${totalRevenue.toFixed(2)} JOD</div><div style="font-size:11px;color:#5A6960;margin-top:4px;">إجمالي القيمة</div></div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead><tr style="background:#0D2818;color:#D4A359;">
                            <th style="padding:10px 8px;text-align:right;">#</th>
                            <th style="padding:10px 8px;text-align:right;">اسم العميل</th>
                            <th style="padding:10px 8px;text-align:right;">رقم الهاتف</th>
                            <th style="padding:10px 8px;text-align:right;">المنشأة / الخدمة</th>
                            <th style="padding:10px 8px;text-align:right;">التفاصيل</th>
                            <th style="padding:10px 8px;text-align:right;">العربون</th>
                            <th style="padding:10px 8px;text-align:right;">الإجمالي</th>
                            <th style="padding:10px 8px;text-align:right;">الحالة</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;

            const container = document.createElement('div');
            container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
            container.innerHTML = reportHtml;
            document.body.appendChild(container);
            const reportEl = container.firstElementChild;
            const options = {
                margin: [6, 6, 6, 6],
                filename: 'تقرير_حجوزات_Weekend.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().set(options).from(reportEl).save().then(() => {
                document.body.removeChild(container);
                showToast('✅ تم تصدير تقرير PDF بنجاح');
            }).catch(() => { document.body.removeChild(container); });
        }

        // =====================================================
        //  CENTRAL EVENT DELEGATION & INITIALIZATION (CSP SAFE)
        // =====================================================
        // معالجة تلقائية لأي صورة معطلة (Broken Image Fallback) لضمان عدم ظهور أيقونة صورة مكسورة أبداً
        
        document.addEventListener('DOMContentLoaded', async () => {
            // Setup direct listeners
            document.getElementById('logout-admin-btn')?.addEventListener('click', logoutAdmin);
            let searchDebounceTimer = null;
            initPwaManifestAndPrompt();
            document.getElementById('adm-v-type')?.addEventListener('change', toggleVenueTypePricing);
            document.getElementById('adm-v-img-file')?.addEventListener('change', function() { handleAdminImageUpload(this, 'venue'); });
            document.getElementById('adm-v-extra-files')?.addEventListener('change', function() { handleAdminExtraImagesUpload(this, 'venue'); });
            document.getElementById('adm-v-video-file')?.addEventListener('change', function() { handleAdminVideoUpload(this, 'venue'); });
            document.getElementById('adm-t-img-file')?.addEventListener('change', function() { handleAdminImageUpload(this, 'transport'); });
            document.getElementById('adm-t-extra-files')?.addEventListener('change', function() { handleAdminExtraImagesUpload(this, 'transport'); });
            document.getElementById('adm-t-video-file')?.addEventListener('change', function() { handleAdminVideoUpload(this, 'transport'); });
            document.getElementById('add-venue-form')?.addEventListener('submit', e => addListing(e, 'venue'));
            document.getElementById('add-transport-form')?.addEventListener('submit', e => addListing(e, 'transport'));
            document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLoginSubmit);
            document.getElementById('chat-toggle-btn')?.addEventListener('click', toggleChat);
            document.getElementById('chat-close-btn')?.addEventListener('click', toggleChat);
            document.getElementById('btn-export-excel')?.addEventListener('click', exportBookingsToExcel);
            document.getElementById('btn-export-pdf')?.addEventListener('click', exportBookingsToPDF);
            document.getElementById('btn-export-backup')?.addEventListener('click', exportFullBackup);
            document.getElementById('inp-restore-backup')?.addEventListener('change', function() { handleRestoreBackupFile(this); });
            document.getElementById('btn-clean-orphans')?.addEventListener('click', function() { cleanOrphanReceipts(this); });
            document.getElementById('btn-goto-add-pitch')?.addEventListener('click', () => {
                switchAdminTab('dash-listings', document.querySelectorAll('.sidebar-item')[1]);
                switchAdminForm('venue');
                document.getElementById('adm-v-type').value = 'field';
                toggleVenueTypePricing();
            });
            document.getElementById('add-promo-form')?.addEventListener('submit', savePromoCode);
            document.getElementById('quick-block-form')?.addEventListener('submit', submitQuickBlockForm);
            document.getElementById('edit-booking-form')?.addEventListener('submit', saveAdminBookingEdit);
            document.getElementById('admin-create-owner-form')?.addEventListener('submit', handleAdminCreateOwnerSubmit);
            document.getElementById('btn-ao-gen-pin')?.addEventListener('click', () => { document.getElementById('ao-pin').value = String(Math.floor(100000 + Math.random() * 900000)); });
            document.getElementById('btn-ao-copy-creds')?.addEventListener('click', () => { const t = document.getElementById('ao-share-text')?.textContent || ''; if (t && navigator.clipboard) navigator.clipboard.writeText(t).then(() => showToast('📋 تم نسخ بيانات الدخول!')); });
            document.getElementById('ao-facility')?.addEventListener('change', function() { const f = items.find(i => String(i.id) === this.value); if (f && f.ownerPhone && document.getElementById('ao-phone')) document.getElementById('ao-phone').value = f.ownerPhone; });
            document.getElementById('edit-b-date')?.addEventListener('change', syncEditBookingDetailsPreview);
            document.getElementById('edit-b-shift')?.addEventListener('change', syncEditBookingDetailsPreview);
            document.getElementById('edit-b-hour-from')?.addEventListener('input', syncEditBookingDetailsPreview);
            document.getElementById('edit-b-hour-to')?.addEventListener('input', syncEditBookingDetailsPreview);
            document.getElementById('telegram-config-form')?.addEventListener('submit', saveTelegramConfig);
            document.getElementById('adm-v-map-url')?.addEventListener('input', () => handleAdminMapUrlInput('venue'));
            document.getElementById('adm-t-map-url')?.addEventListener('input', () => handleAdminMapUrlInput('transport'));
            document.getElementById('adm-v-lat')?.addEventListener('change', initOrUpdateAdminMapPicker);
            document.getElementById('adm-v-lng')?.addEventListener('change', initOrUpdateAdminMapPicker);
            document.getElementById('btn-tg-detect-chat')?.addEventListener('click', detectTelegramChatIdAutomatically);
            document.getElementById('tg-chat-id')?.addEventListener('input', function() {
                const extracted = extractChatIdFromInput(this.value);
                if (extracted && extracted !== this.value && /^-?[0-9]{5,20}$/.test(extracted)) {
                    this.value = extracted;
                    showToast('✅ تم استخراج رقم المحادثة بنجاح: ' + extracted);
                }
            });
            document.getElementById('btn-tg-test')?.addEventListener('click', sendTestTelegramNotification);
            document.getElementById('btn-tg-disable')?.addEventListener('click', disableTelegramNotifications);
            document.getElementById('quick-block-facility')?.addEventListener('change', syncQuickBlockFormUI);
            document.getElementById('quick-block-pitch-start')?.addEventListener('change', syncQuickBlockFormUI);
            document.getElementById('btn-add-ex-date')?.addEventListener('click', addExcludedDateToInput);
            document.getElementById('btn-download-ticket-pdf')?.addEventListener('click', downloadTicketPDF);
            document.getElementById('btn-copy-ticket-id')?.addEventListener('click', () => {
                if (currentTicketBooking && navigator.clipboard) {
                    const code = 'WKND-' + currentTicketBooking.id;
                    navigator.clipboard.writeText(code).then(() => showToast('✅ تم نسخ رقم التذكرة: ' + code)).catch(() => {});
                }
            });

            // Global click delegation for dynamic elements
            document.addEventListener('click', (e) => {
                // Close modal when clicking backdrop
                if (e.target.classList && e.target.classList.contains('modal') && e.target.classList.contains('active')) {
                    closeModal(e.target.id);
                    return;
                }
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const action = el.dataset.action;
                if (action === 'close-modal') {
                    closeModal(el.dataset.modal);
                } else if (action === 'chat-faq') {
                    sendChatMsg(el.dataset.q, el.dataset.a);
                } else if (action === 'admin-tab') {
                    switchAdminTab(el.dataset.tab, el);
                } else if (action === 'switch-admin-form') {
                    switchAdminForm(el.dataset.form);
                } else if (action === 'cancel-edit') {
                    cancelEditMode(el.dataset.form);
                } else if (action === 'approve-booking') {
                    approveBooking(Number(el.dataset.id));
                } else if (action === 'reject-booking') {
                    rejectBooking(Number(el.dataset.id));
                } else if (action === 'load-more-archived') {
                    loadMoreArchivedBookings(el);
                } else if (action === 'delete-booking') {
                    deleteBooking(Number(el.dataset.id));
                } else if (action === 'quick-block-goto') {
                    gotoQuickBlockForFacility(Number(el.dataset.id));
                } else if (action === 'edit-listing') {
                    editListing(Number(el.dataset.id));
                } else if (action === 'toggle-featured') {
                    toggleItemFeatured(Number(el.dataset.id));
                } else if (action === 'toggle-active') {
                    toggleItemActive(Number(el.dataset.id));
                } else if (action === 'delete-listing') {
                    deleteListing(Number(el.dataset.id));
                } else if (action === 'approve-review') {
                    approveReview(Number(el.dataset.id));
                } else if (action === 'delete-review') {
                    deleteReview(Number(el.dataset.id));
                } else if (action === 'preview-receipt') {
                    openPrivateReceiptModal(el.dataset.receipt);
                } else if (action === 'resolve-owner-req') {
                    resolveAdminOwnerRequest(Number(el.dataset.id), el.dataset.decision);
                } else if (action === 'toggle-owner-acc') {
                    toggleAdminOwnerAccount(Number(el.dataset.id));
                } else if (action === 'delete-owner-acc') {
                    deleteAdminOwnerAccount(Number(el.dataset.id));
                } else if (action === 'edit-booking') {
                    openEditBookingModal(Number(el.dataset.id));
                } else if (action === 'resolve-change-req') {
                    resolveChangeRequest(Number(el.dataset.id), el.dataset.decision);
                } else if (action === 'remove-main-img') {
                    removeAdminMainImage(el.dataset.form);
                } else if (action === 'remove-extra-img') {
                    removeAdminExtraImage(el.dataset.form, Number(el.dataset.idx));
                } else if (action === 'remove-admin-video') {
                    removeAdminVideo(el.dataset.form);
                } else if (action === 'open-admin-ticket') {
                    const b = [...pendingBookings, ...confirmedBookings, ...archivedBookings].find(x => x.id === Number(el.dataset.id));
                    if (b) openBookingTicketModal(b);
                } else if (action === 'promo-days-preset') {
                    setPromoDaysPreset(el.dataset.preset);
                } else if (action === 'edit-promo') {
                    editPromoCode(Number(el.dataset.id));
                } else if (action === 'toggle-promo') {
                    togglePromoActive(Number(el.dataset.id));
                } else if (action === 'delete-promo') {
                    deletePromoCode(Number(el.dataset.id));
                } else if (action === 'cancel-promo-edit') {
                    cancelPromoEdit();
                } else if (action === 'book-upsell-bus') {
                    bookUpsellBusFromTicket(Number(el.dataset.busId));
                } else if (action === 'rotate-upsell-bus') {
                    if (currentTicketBooking) {
                        const fac = items.find(i => i.id === Number(currentTicketBooking.facilityId || currentTicketBooking.itemId));
                        const vName = currentTicketBooking.itemNameAr || (fac ? fac.nameAr : 'المنشأة');
                        const vLoc = currentTicketBooking.locationAr || (fac ? fac.locationAr : 'الأردن');
                        renderRandomBusUpsellInTicket(currentTicketBooking, fac, vName, vLoc, true);
                    }
                } else if (action === 'dismiss-parent') {
                    if (el.parentElement) el.parentElement.remove();
                }
            });

            // Keyboard accessibility (Esc closes modals, Enter/Space activates card-img-holder)
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
                } else if (e.ctrlKey && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
                    e.preventDefault();
                    promptAdminLogin();
                }
            });

            // بوابة الإدارة المستقلة: التحقق من الجلسة أو فتح نافذة تسجيل الدخول مباشرة
            const hasAdminSession = await checkAdminSession();
            if (hasAdminSession) {
                await loadFromDatabase();
                switchView('admin-view');
            } else {
                openModalSafely('admin-login-modal');
                setTimeout(() => document.getElementById('admin-email-input')?.focus(), 100);
            }

            // Initialize dates and load public data from Supabase (admin must log in explicitly with email & password)
            const { dateStr: today } = getAmmanNow();
            const bd = document.getElementById('booking-date');
            if (bd) bd.min = today;
            const bdt = document.getElementById('booking-date-transport');
            if (bdt) bdt.min = today;

            // عرض فوري من الكاش المحلي في 0.1 ثانية ريثما تصل أحدث البيانات من السيرفر
            try {
                const cachedFacs = safeGetJSON('wknd_facilities_cache', '[]');
                if (Array.isArray(cachedFacs) && cachedFacs.length > 0 && items.length === 0) {
                    items = cachedFacs;
                    
                    updateFavBadge();
                }
            } catch (e) {}

            await loadFromDatabase();
            
            updateFavBadge();
            syncLocalBookingsWithDatabase('', null);

        });
    