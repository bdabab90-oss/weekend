// =====================================================================
//  منصة Weekend — الكود المشترك بين الواجهة العامة ولوحة الأدمن (common.js)
// =====================================================================
        const SUPABASE_URL = 'https://yeysruiowtjpwyicsukf.supabase.co';

        const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_--ZBMiy0SK8D-IQ4_Ab0hw_XneXxcCJ';

        const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

        function loadExternalScript(src, integrity) {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) return resolve();
                const s = document.createElement('script');
                s.src = src;
                if (integrity) s.integrity = integrity; // [البند 20] بصمة SRI للمكتبات المستضافة ذاتياً
                s.crossOrigin = 'anonymous';
                s.onload = resolve;
                s.onerror = () => reject(new Error('تعذر تحميل المكتبة: ' + src));
                document.head.appendChild(s);
            });
        }

        async function ensureHtml2PdfLibrary() {
            if (window.html2pdf) return;
            showToast('⏳ جاري تجهيز مكتبة PDF...');
            await loadExternalScript('/vendor/html2pdf-0.10.1.bundle.min.85e6ee9ce2.js', 'sha384-Yv5O+t3uE3hunW8uyrbpPW3iw6/5/Y7HitWJBLgqfMoA36NogMmy+8wWZMpn3HWc');
        }

        function safeGetStorage(key, fallback) {
            try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
        }

        function safeSetStorage(key, val) {
            try { localStorage.setItem(key, val); } catch (e) {}
        }

        function safeGetJSON(key, fallbackJson) {
            const fallback = JSON.parse(fallbackJson);
            try {
                const val = JSON.parse(safeGetStorage(key, fallbackJson));
                if (val === null || val === undefined) return fallback;
                if (Array.isArray(fallback) && !Array.isArray(val)) return fallback;
                return val;
            } catch (e) {
                try { localStorage.removeItem(key); } catch (e2) {}
                return fallback;
            }
        }

        function getDeviceId() {
            let id = safeGetStorage('wknd_device_id', '');
            if (!id || id.length < 5) {
                id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
                safeSetStorage('wknd_device_id', id);
            }
            return id;
        }

        const DEVICE_ID = getDeviceId();

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        function sanitizeImageUrl(url) {
            const s = String(url || '').trim();
            if (/^https:\/\/[^\s<>"']+$/i.test(s)) return s;
            if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
            return 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80';
        }

        function sanitizeVideoUrl(url) {
            const s = String(url || '').trim();
            if (!s) return '';
            const ytWatch = s.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{6,20})/i);
            if (ytWatch) return 'https://www.youtube.com/embed/' + ytWatch[1];
            const ytShort = s.match(/^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{6,20})/i);
            if (ytShort) return 'https://www.youtube.com/embed/' + ytShort[1];
            const ytShorts = s.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,20})/i);
            if (ytShorts) return 'https://www.youtube.com/embed/' + ytShorts[1];
            if (/^https:\/\/[^\s<>"']+$/i.test(s)) return s;
            return '';
        }

        function dataUrlToBlob(dataUrl) {
            const parts = dataUrl.split(',');
            const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) u8arr[n] = bstr.charCodeAt(n);
            return new Blob([u8arr], { type: mime });
        }

        function normalizePhone(phone) {
            return String(phone || '').trim().replace(/[\s\-()]/g, '');
        }

        function isValidPhone(phone) {
            return /^\+?[0-9]{7,15}$/.test(normalizePhone(phone));
        }

        function toWhatsAppPhone(phone) {
            let clean = normalizePhone(phone).replace(/^\+/, '');
            if (/^00/.test(clean)) clean = clean.slice(2);
            if (/^07[789][0-9]{7}$/.test(clean)) return '962' + clean.slice(1);
            if (/^7[789][0-9]{7}$/.test(clean)) return '962' + clean;
            return clean.replace(/[^0-9]/g, '');
        }

        function parseCoordsFromGoogleMapsInput(raw) {
            const s = String(raw || '').trim();
            if (!s) return null;
            let decoded = s;
            try { decoded = decodeURIComponent(s); } catch (e) {}

            // 1) !3dLAT!4dLNG (إحداثيات الدبوس الدقيقة داخل روابط Google Maps)
            let m = decoded.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
            if (m) {
                const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
            }
            // 2) @LAT,LNG
            m = decoded.match(/@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
            if (m) {
                const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
            }
            // 3) ?q=LAT,LNG or &ll=LAT,LNG or query=LAT,LNG or center=LAT,LNG
            m = decoded.match(/[?&](?:q|ll|query|center|daddr|saddr)=(?:loc:)?(-?\d{1,2}\.\d+)\s*[,+]\s*\+?(-?\d{1,3}\.\d+)/i);
            if (m) {
                const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
            }
            // 4) /search/LAT,LNG or /place/LAT,LNG
            m = decoded.match(/\/(?:search|place|dir)\/(-?\d{1,2}\.\d+)\s*[,+]\s*\+?(-?\d{1,3}\.\d+)/i);
            if (m) {
                const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
            }
            // 5) إحداثيات مباشرة مثل: 31.8542, 35.8123
            m = decoded.match(/(?:^|[^0-9.-])(-?\d{1,2}\.\d{3,})\s*,\s*\+?(-?\d{1,3}\.\d{3,})(?:$|[^0-9.])/);
            if (m) {
                const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
            }
            return null;
        }

        function buildSafeMapsHref(loc) {
            const s = String(loc || '').trim();
            if (/^https:\/\/(www\.google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s<>"]*$/i.test(s)) {
                return s;
            }
            return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s);
        }

        function compressImageFileToJpeg(file, maxDim = 1200, quality = 0.78) {
            return new Promise((resolve, reject) => {
                if (!file || !file.type || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
                    reject(new Error('يرجى اختيار ملف صورة صالح (JPEG أو PNG أو WebP).'));
                    return;
                }
                if (file.size > 15 * 1024 * 1024) {
                    reject(new Error('حجم الصورة كبير جداً (الحد الأقصى 15MB قبل الضغط).'));
                    return;
                }
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onerror = () => reject(new Error('الملف المرفق ليس صورة صالحة.'));
                    img.onload = () => {
                        try {
                            let w = img.naturalWidth || img.width;
                            let h = img.naturalHeight || img.height;
                            if (!w || !h) {
                                reject(new Error('أبعاد الصورة غير صالحة.'));
                                return;
                            }
                            if (w > maxDim || h > maxDim) {
                                if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                                else { w = Math.round((w * maxDim) / h); h = maxDim; }
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, w, h);
                            ctx.drawImage(img, 0, 0, w, h);
                            let dataUrl = canvas.toDataURL('image/jpeg', quality);
                            if (dataUrl.length > 750000) {
                                dataUrl = canvas.toDataURL('image/jpeg', 0.55);
                            }
                            if (dataUrl.length > 800000) {
                                reject(new Error('الصورة لا تزال كبيرة بعد الضغط، يرجى اختيار صورة أصغر.'));
                                return;
                            }
                            resolve(dataUrl);
                        } catch (err) {
                            reject(new Error('تعذر معالجة الصورة في المتصفح.'));
                        }
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        function getAmmanNow() {
            try {
                const parts = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Amman',
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', hour12: false
                }).formatToParts(new Date());
                const map = {};
                parts.forEach(p => { map[p.type] = p.value; });
                const dateStr = `${map.year}-${map.month}-${map.day}`;
                const hour = parseInt(map.hour, 10) % 24;
                return { dateStr, hour };
            } catch (e) {
                const now = new Date();
                return { dateStr: now.toISOString().split('T')[0], hour: now.getHours() };
            }
        }

        function rowToItem(r) {
            const safeImgs = Array.isArray(r.images) ? r.images.map(sanitizeImageUrl).filter(Boolean) : [];
            const rawAm = Array.isArray(r.amenities) ? r.amenities : [];
            const mapAmEntry = rawAm.find(a => typeof a === 'string' && a.startsWith('mapurl:'));
            const cleanAm = rawAm.filter(a => typeof a === 'string' && !a.startsWith('mapurl:'));
            const savedMapUrl = (r.map_url ? String(r.map_url).trim() : '') || (mapAmEntry ? mapAmEntry.slice(7).trim() : '');
            let latVal = r.lat !== null && r.lat !== undefined ? Number(r.lat) : null;
            let lngVal = r.lng !== null && r.lng !== undefined ? Number(r.lng) : null;
            if ((latVal === null || lngVal === null) && savedMapUrl) {
                const parsed = parseCoordsFromGoogleMapsInput(savedMapUrl);
                if (parsed) { latVal = parsed.lat; lngVal = parsed.lng; }
            }
            return {
                id: Number(r.id),
                category: r.category || 'farm',
                nameAr: r.name_ar || 'منشأة',
                nameEn: r.name_en || '',
                locationAr: r.location_ar || '',
                locationEn: r.location_en || '',
                priceDay: Number(r.price_day) || 0,
                priceNight: Number(r.price_night) || 0,
                priceFull: Number(r.price_full) || 0,
                hourlyRate: Number(r.hourly_rate) || 0,
                pricePerKm: Number(r.price_per_km) || 0,
                pricePerPerson: Number(r.price_per_person) || 0,
                capacity: Number(r.capacity) || (r.category === 'transport' ? 23 : null),
                securityDeposit: Number(r.security_deposit) || 0,
                isVerified: r.is_verified !== false,
                specsAr: r.specs_ar || '',
                specsEn: r.specs_en || '',
                images: safeImgs.length ? safeImgs : ['https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80'],
                videoUrl: sanitizeVideoUrl(r.video_url),
                lat: latVal,
                lng: lngVal,
                mapUrl: savedMapUrl,
                cancelPolicyAr: r.cancel_policy_ar || '',
                cancelPolicyEn: r.cancel_policy_en || '',
                amenities: cleanAm,
                seasons: Array.isArray(r.seasons) && r.seasons.length ? r.seasons : ['summer', 'winter'],
                rating: Number(r.rating) || 5.0,
                active: r.active !== false,
                reviews: []
            };
        }

        function rowToPromo(r) {
            return {
                id: Number(r.id),
                code: String(r.code || '').toUpperCase().trim(),
                titleAr: String(r.title_ar || 'عرض خصم'),
                discountType: r.discount_type === 'fixed' ? 'fixed' : 'percent',
                discountValue: Number(r.discount_value) || 0,
                allowedDays: Array.isArray(r.allowed_days) ? r.allowed_days.map(Number) : [0,1,2,3,4,5,6],
                validFrom: r.valid_from || null,
                validUntil: r.valid_until || null,
                excludedDates: Array.isArray(r.excluded_dates) ? r.excluded_dates.map(String) : [],
                excludedFacilityIds: Array.isArray(r.excluded_facility_ids) ? r.excluded_facility_ids.map(Number) : [],
                autoApply: Boolean(r.auto_apply),
                active: r.active !== false
            };
        }

        let currentLang = 'ar';

        let isAdminLoggedIn = false;

        let items = [];

        let pendingBookings = [];

        let confirmedBookings = [];

        let archivedBookings = [];

        let allReviews = [];

        let promoCodes = safeGetJSON('wknd_promos_fallback', '[]').filter(p => p && p.code !== '__TG_CFG__');

        try { localStorage.removeItem('wknd_tg_config'); } catch (e) {}

        let currentTicketBooking = null;

        let pageShuffleSeed = Math.floor(Math.random() * 1000000) + 1;

        let busyIntervals = [];

        let busyIntervalsLoaded = false;

        function parseLegacySlotFromDetails(facilityId, details, status) {
            const dStr = String(details || '');
            const dateMatch = dStr.match(/(\d{4}-\d{2}-\d{2})/);
            if (!dateMatch) return null;
            const date = dateMatch[1];
            const shiftMatch = dStr.match(/\((morning|evening|fullday)\)/);
            if (shiftMatch) {
                const st = shiftMatch[1];
                return {
                    facilityId: Number(facilityId),
                    date,
                    hourFrom: st === 'evening' ? 12 : 0,
                    hourTo: st === 'morning' ? 12 : 24,
                    shiftType: st,
                    status: status || 'confirmed'
                };
            }
            const pitchMatch = dStr.match(/(\d{4}-\d{2}-\d{2}) — (\d+) ساعة بدءاً من (\d+):00(ص|ظ|م)/);
            if (pitchMatch) {
                const hours = parseInt(pitchMatch[2], 10);
                const num = parseInt(pitchMatch[3], 10);
                const suf = pitchMatch[4];
                const startHour = suf === 'ص' ? num : (suf === 'ظ' ? 12 : num + 12);
                return {
                    facilityId: Number(facilityId),
                    date,
                    hourFrom: startHour,
                    hourTo: Math.min(24, startHour + hours),
                    shiftType: null,
                    status: status || 'confirmed'
                };
            }
            return {
                facilityId: Number(facilityId),
                date,
                hourFrom: 0,
                hourTo: 24,
                shiftType: 'fullday',
                status: status || 'confirmed'
            };
        }

        function getIntervalBusyStatus(itemId, date, hFrom, hTo) {
            if (!itemId || !date) return null;
            const matches = busyIntervals.filter(s =>
                s.facilityId === Number(itemId) &&
                s.date === date &&
                s.hourFrom < hTo &&
                hFrom < s.hourTo
            );
            if (matches.some(m => m.status === 'confirmed')) return 'confirmed';
            if (matches.some(m => m.status === 'pending')) return 'pending';
            return null;
        }

        async function loadPublicConfirmedSlots(itemId) {
            if (!db) return;
            try {
                const { dateStr: today } = getAmmanNow();
                let query = db.from('public_confirmed_slots').select('facility_id,booking_date,hour_from,hour_to,shift_type,status').gte('booking_date', today);
                if (itemId) query = query.eq('facility_id', itemId);
                const { data, error } = await query;
                if (error || !data) return;
                if (itemId) {
                    busyIntervals = busyIntervals.filter(s => s.facilityId !== Number(itemId));
                } else {
                    busyIntervals = [];
                }
                busyIntervalsLoaded = true;
                data.forEach(row => {
                    if (!row.facility_id) return;
                    if (row.booking_date && row.hour_from !== null && row.hour_from !== undefined && row.hour_to !== null && row.hour_to !== undefined) {
                        busyIntervals.push({
                            facilityId: Number(row.facility_id),
                            date: String(row.booking_date),
                            hourFrom: Number(row.hour_from),
                            hourTo: Number(row.hour_to),
                            shiftType: row.shift_type || null,
                            status: row.status || 'confirmed'
                        });
                    } else if (row.details) {
                        const parsed = parseLegacySlotFromDetails(row.facility_id, row.details, row.status || 'confirmed');
                        if (parsed) busyIntervals.push(parsed);
                    }
                });
            } catch (err) {
                console.error('تعذر تحميل المواعيد المحجوزة العامة:', err?.message || '');
            }
        }

        function localizedItemText(item, field) {
            if (!item) return '';
            const arVal = String(item[field + 'Ar'] || '').trim();
            const enVal = String(item[field + 'En'] || '').trim();
            if (currentLang === 'ar') return arVal || enVal;
            return enVal || arVal;
        }

        const selectedSeasons = new Set();

        let favorites = new Set(safeGetJSON('wknd_favs', '[]'));

        function saveFavorites() { safeSetStorage('wknd_favs', JSON.stringify([...favorites])); }

        function updateFavBadge() {
            const badge = document.getElementById('fav-nav-badge');
            if (!badge) return;
            const validCount = items.filter(i => favorites.has(i.id) && i.active).length;
            badge.textContent = validCount;
            badge.style.display = validCount > 0 ? 'inline-flex' : 'none';
        }

        function renderStars(rating) {
            const r = Number(rating) || 5.0;
            let html = '<span class="stars-row">';
            for (let i = 1; i <= 5; i++) {
                if (r >= i) html += '<span class="star-icon on">★</span>';
                else if (r >= i - 0.49) html += '<span class="star-icon half">★</span>';
                else html += '<span class="star-icon">★</span>';
            }
            html += '</span>';
            return html;
        }

        function openModalSafely(modalId) {
            const m = document.getElementById(modalId);
            if (m) {
                m.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        }

        function removeLocalMyBooking(bookingId) {
            try {
                const list = safeGetJSON('wknd_my_bookings', '[]');
                const filtered = list.filter(item => Number(item.id) !== Number(bookingId));
                if (filtered.length !== list.length) {
                    safeSetStorage('wknd_my_bookings', JSON.stringify(filtered));
                }
            } catch (e) {}
        }

        function openImageModal(imgSrc, titleText = 'صورة وصل تحويل CliQ', opts) {
            const titleEl = document.getElementById('image-modal-title');
            if (titleEl) titleEl.textContent = titleText;
            const img = document.getElementById('enlarged-receipt-img');
            // [المرحلة 4 — إصلاح زر عرض الوصل] إعادة تهيئة الصورة في كل فتح
            delete img.dataset.fallbackApplied;
            img.style.display = '';
            const oldErr = document.getElementById('receipt-load-error');
            if (oldErr) oldErr.remove();
            if (opts && opts.receipt) {
                // الوصل لا يُستبدل أبداً بصورة افتراضية: إما الوصل الحقيقي أو رسالة خطأ واضحة
                img.dataset.receipt = '1';
                const raw = String(imgSrc || '').trim();
                const safe = sanitizeImageUrl(raw);
                if (safe !== raw) { img.removeAttribute('src'); showReceiptLoadError(img); }
                else img.src = safe;
            } else {
                delete img.dataset.receipt;
                img.src = sanitizeImageUrl(imgSrc);
            }
            openModalSafely('image-modal');
        }

        function showReceiptLoadError(img) {
            if (!img) return;
            img.style.display = 'none';
            if (document.getElementById('receipt-load-error')) return;
            const p = document.createElement('p');
            p.id = 'receipt-load-error';
            p.setAttribute('role', 'alert');
            p.textContent = '⚠️ تعذر تحميل صورة الوصل — أغلق النافذة وأعد المحاولة';
            p.style.color = 'var(--danger)';
            p.style.fontWeight = '700';
            p.style.padding = '1.5rem 0.5rem';
            p.style.margin = '0';
            img.insertAdjacentElement('afterend', p);
        }

        function toggleChat() { document.getElementById('chat-box').classList.toggle('active'); }

        function sendChatMsg(question, reply) {
            const body = document.getElementById('chat-body');
            const userDiv = document.createElement('div');
            userDiv.className = 'chat-msg';
            userDiv.innerHTML = `<strong>أنت:</strong> ${escapeHtml(question)}`;
            const botDiv = document.createElement('div');
            botDiv.className = 'chat-msg bot';
            botDiv.innerHTML = `<strong>الدعم:</strong> ${escapeHtml(reply)}`;
            body.appendChild(userDiv);
            body.appendChild(botDiv);
            body.scrollTop = body.scrollHeight;
        }

        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 4500);
        }

        let calCurrentDate = new Date();

        function buildQrSvg(seedText) {
            const str = String(seedText || 'WKND');
            let hash = 2166136261;
            for (let i = 0; i < str.length; i++) {
                hash ^= str.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            const size = 13;
            const cell = 6;
            let rects = '';
            const isFinder = (r, c) =>
                (r < 3 && c < 3) || (r < 3 && c >= size - 3) || (r >= size - 3 && c < 3);
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    let on = false;
                    if (isFinder(r, c)) {
                        on = true;
                    } else {
                        const bitIdx = (r * size + c) % 31;
                        const mixed = (hash ^ Math.imul(r + 1, 374761393) ^ Math.imul(c + 1, 668265263)) >>> 0;
                        on = ((mixed >> (bitIdx % 16)) & 1) === 1;
                    }
                    if (on) {
                        rects += `<rect x="${c * cell + 4}" y="${r * cell + 4}" width="${cell - 0.6}" height="${cell - 0.6}" rx="1" fill="#0D2818"/>`;
                    }
                }
            }
            const totalDim = size * cell + 8;
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="92" height="92" aria-label="QR Code">${rects}</svg>`;
        }

        function isTicketExpiredByTime(b) {
            if (!b) return true;
            const { dateStr: today, hour: nowHour } = getAmmanNow();
            const bDate = String(b.bookingDate || b.booking_date || '').trim() ||
                          ((String(b.details || '').match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '');
            if (!bDate) return false;
            if (bDate < today) return true;
            if (bDate === today) {
                let hTo = (b.hourTo !== null && b.hourTo !== undefined) ? Number(b.hourTo) :
                          ((b.hour_to !== null && b.hour_to !== undefined) ? Number(b.hour_to) : null);
                if (hTo === null || !Number.isFinite(hTo)) {
                    const det = String(b.details || '');
                    if (det.includes('(morning)')) hTo = 12;
                    else {
                        const pitchMatch = det.match(/(\d+) ساعة بدءاً من (\d+):00(ص|ظ|م)/);
                        if (pitchMatch) {
                            const hrs = parseInt(pitchMatch[1], 10);
                            const stNum = parseInt(pitchMatch[2], 10);
                            const suf = pitchMatch[3];
                            const stH = suf === 'ص' ? stNum : (suf === 'ظ' ? 12 : stNum + 12);
                            hTo = Math.min(24, stH + hrs);
                        } else {
                            hTo = 24;
                        }
                    }
                }
                if (nowHour >= hTo) return true;
            }
            return false;
        }

        let lastUpsellBusId = null;

        function pickRandomAvailableBus(excludeBusId = null) {
            const buses = items.filter(i => i.category === 'transport' && i.active);
            if (buses.length === 0) return null;
            if (buses.length === 1) return buses[0];
            const pool = excludeBusId ? buses.filter(b => b.id !== Number(excludeBusId)) : buses;
            const candidates = pool.length > 0 ? pool : buses;
            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            lastUpsellBusId = chosen.id;
            return chosen;
        }

        function renderRandomBusUpsellInTicket(b, fac, venueName, venueLoc, forceDifferent = false) {
            const area = document.getElementById('ticket-printable-area');
            if (!area) return;
            const existingUpsell = document.getElementById('ticket-transport-upsell');
            if (existingUpsell) existingUpsell.remove();

            // يظهر اقتراح الباص فقط عند حجز مزرعة أو ملعب (وليس عند حجز باص)
            if (fac && fac.category === 'transport') return;
            const allBuses = items.filter(i => i.category === 'transport' && i.active);
            if (allBuses.length === 0) return;

            const bus = pickRandomAvailableBus(forceDifferent ? lastUpsellBusId : null);
            if (!bus) return;

            const cap = Number(bus.capacity) || 23;
            const busName = localizedItemText(bus, 'name');
            const upsellDiv = document.createElement('div');
            upsellDiv.id = 'ticket-transport-upsell';
            upsellDiv.style.cssText = 'background:linear-gradient(135deg,#F0F8F4,#E8F5E9);border:1.5px solid #81C784;border-radius:14px;padding:0.9rem 1.1rem;margin-top:0.75rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;';
            upsellDiv.innerHTML = `
                <div style="flex:1;min-width:210px;">
                    <div style="font-size:0.88rem;font-weight:700;color:#1B5E20;margin-bottom:3px;">🚌 هل تحتاج باص لتوصيل مجموعتكم إلى (${escapeHtml(venueName)})؟</div>
                    <div style="font-size:0.82rem;color:#2E7D32;font-weight:600;">ترشيح متاح: <strong>${escapeHtml(busName)}</strong> (سعة ${cap} راكب | ${Number(bus.pricePerKm || 0)} JOD/كم)</div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <button type="button" class="btn-action" data-action="book-upsell-bus" data-bus-id="${bus.id}" style="background:#1B5E20;font-size:0.8rem;padding:0.45rem 0.9rem;min-height:36px;">🚌 احجز الباص الآن</button>
                    ${allBuses.length > 1 ? `<button type="button" class="copy-chip-btn" data-action="rotate-upsell-bus" style="padding:0.4rem 0.65rem;margin:0;" title="اقتراح باص آخر">🔄 باص آخر</button>` : ''}
                </div>`;
            area.appendChild(upsellDiv);
        }

        function initPwaManifestAndPrompt() {
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                window.__deferredPwaPrompt = e;
            });
        }

        async function downloadTicketPDF() {
            const node = document.getElementById('ticket-card-node');
            if (!node) return;
            try {
                await ensureHtml2PdfLibrary();
            } catch (e) {
                window.print();
                return;
            }
            if (!window.html2pdf) {
                window.print();
                return;
            }
            const code = currentTicketBooking ? `WKND-${currentTicketBooking.id}` : 'WKND-Ticket';
            const opt = {
                margin: [8, 8, 8, 8],
                filename: `تذكرة_حجز_${code}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
            };
            html2pdf().set(opt).from(node).save().then(() => {
                showToast('📄 تم تحميل تذكرة الحجز PDF بنجاح');
            });
        }

        document.addEventListener('error', (e) => {
            if (e.target && e.target.tagName === 'IMG' && e.target.dataset.receipt === '1') {
                showReceiptLoadError(e.target);
                return;
            }
            if (e.target && e.target.tagName === 'IMG' && !e.target.dataset.fallbackApplied) {
                e.target.dataset.fallbackApplied = '1';
                e.target.src = 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80';
            }
        }, true);
