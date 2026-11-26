// =====================================================================
//  منصة Weekend — كود الواجهة العامة فقط (public.js)
// =====================================================================

        // =====================================================
        //  SUPABASE CONNECTION
        // =====================================================
                        
        // [البند 7] Cloudflare Turnstile — ضع الـ Site Key (العلني) هنا. إذا تُرك فارغاً لا يظهر التحقق
        //   ⚠️ فعّل الـ Site Key هنا والـ Secret Key في قاعدة البيانات معاً في نفس الوقت
        const TURNSTILE_SITE_KEY = '';
        // [البند 27] SEO لصفحات المنشآت (/?venue=ID): عنوان ووصف ورابط canonical خاص بكل منشأة
        const SITE_ORIGIN = 'https://weekend-three-xi.vercel.app';
        function setCanonicalUrl(href) {
            let link = document.querySelector('link[rel="canonical"]');
            if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
            link.href = href;
        }
        function applyVenueSeo(item) {
            if (!item) return;
            const name = localizedItemText(item, 'name');
            const loc = localizedItemText(item, 'location');
            if (!name) return;
            document.title = `${name}${loc ? ' — ' + loc : ''} | منصة ويكند Weekend`;
            const desc = `احجز ${name}${loc ? ' في ' + loc : ''} عبر منصة ويكند Weekend — حجز آمن ومؤكد للمزارع والشاليهات والملاعب ووسائل النقل في الأردن.`;
            const meta = document.querySelector('meta[name="description"]');
            if (meta) meta.setAttribute('content', desc.slice(0, 300));
            setCanonicalUrl(SITE_ORIGIN + '/?venue=' + Number(item.id));
        }

        let turnstileWidgetId = null;
        let turnstileToken = '';
        let turnstileLoading = null;

        function loadTurnstileScript() {
            if (window.turnstile) return Promise.resolve();
            if (turnstileLoading) return turnstileLoading;
            turnstileLoading = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
                s.async = true;
                s.onload = resolve;
                s.onerror = () => { turnstileLoading = null; reject(new Error('تعذر تحميل خطوة التحقق الأمني')); };
                document.head.appendChild(s);
            });
            return turnstileLoading;
        }

        async function resetTurnstileWidget() {
            turnstileToken = '';
            if (!TURNSTILE_SITE_KEY) return;
            try {
                await loadTurnstileScript();
                if (turnstileWidgetId !== null) {
                    window.turnstile.reset(turnstileWidgetId);
                } else {
                    turnstileWidgetId = window.turnstile.render('#turnstile-box', {
                        sitekey: TURNSTILE_SITE_KEY,
                        language: 'ar',
                        callback: (t) => { turnstileToken = t || ''; },
                        'expired-callback': () => { turnstileToken = ''; },
                        'error-callback': () => { turnstileToken = ''; }
                    });
                }
            } catch (e) {
                console.warn('Turnstile unavailable');
            }
        }

        // التحميل الذكي للمكتبات الثقيلة عند الطلب فقط (توفير 1.4 ميجابايت على باقة الموبايل)
                
                        // [البند 13] قراءة JSON آمنة من localStorage: أي قيمة تالفة تُحذف ويُستخدم الافتراضي بدل انهيار الصفحة
        
                
        // ─── تنظيف شامل لأي نص قبل عرضه في HTML لمنع ثغرات DOM XSS ───
        

        // فحص روابط الصور لتسمح فقط بـ https:// أو data:image/ الآمنة
        
        // فحص وتطبيع رابط الفيديو (يدعم ملفات الفيديو المرفوعة في weekend-media وروابط يوتيوب)
        
        
        // تنظيف رقم الهاتف ليقبل المسافات والشرطات والأقواس من المستخدم ثم يوحّده
                
        // تحويل رقم الهاتف الأردني المحلي (079... / 078... / 077...) إلى صيغة دولية لروابط واتساب (9627...)
        
        // التحقق من حقل الموقع (يمنع الروابط الخبيثة ويسمح فقط بنص عادي أو رابط خرائط Google رسمي)
        function isSafeLocationInput(loc) {
            const s = String(loc || '').trim();
            if (!s) return false;
            if (s.length < 2 || s.length > 300) return false;
            if (/(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|me|ly|gl)\/)/i.test(s)) {
                return /^https:\/\/(www\.google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s<>"]*$/i.test(s);
            }
            return true;
        }

        

        
        // ─── ضغط وتحويل الصور بالمتصفح إلى JPEG (أقل من 300KB) مع التحقق أنها صورة حقيقية ───
        
        // ─── رفع الصور إلى مجلد التخزين المستقل (weekend-media) لتخفيف ملف الموقع وقاعدة البيانات ───
        
        // رفع وصل تحويل CliQ إلى المجلد الخاص المحمي (Private Bucket: cliq-receipts)
        async function uploadReceiptToPrivateBucket(file) {
            const compressedDataUrl = await compressImageFileToJpeg(file, 1200, 0.78);
            const sizeKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);
            if (!db || !db.storage) {
                throw new Error('تعذر الاتصال بخدمة رفع الوصولات حالياً، يرجى المحاولة بعد قليل.');
            }
            const blob = dataUrlToBlob(compressedDataUrl);
            if (blob.size > 2 * 1024 * 1024) {
                throw new Error('حجم صورة الوصل يتجاوز الحد المسموح (2MB).');
            }
            // [البند 6] طلب تصريح رفع من السيرفر (مسار عشوائي لمرة واحدة) ثم الرفع إليه فقط
            const { data: grant, error: gErr } = await db.rpc('request_receipt_upload');
            if (gErr || !grant || !grant.ok) {
                throw new Error((grant && grant.error) || 'تعذر تجهيز رفع صورة الوصل، يرجى المحاولة مجدداً.');
            }
            const { error: upErr } = await db.storage.from('cliq-receipts').upload(grant.path, blob, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: false
            });
            if (upErr) {
                throw new Error('تعذر رفع صورة الوصل، يرجى التحقق من الاتصال والمحاولة مجدداً.');
            }
            return { url: grant.receipt_ref, sizeKb, storedSeparately: true };
        }


        // الحصول على التاريخ والساعة الحالية بتوقيت الأردن (Asia/Amman)
        
        // ─── تحويل بين صفوف قاعدة البيانات والأوبجكت في المتصفح مع حماية كاملة من القيم الفارغة (null) ───
        

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
                receiptData: sanitizeImageUrl(r.receipt_data),
                pickupLocation: r.pickup_location || null,
                dropoffLocation: r.dropoff_location || null,
                promoCode: r.promo_code || null,
                discountAmount: Number.isFinite(Number(r.discount_amount)) ? Number(r.discount_amount) : 0,
                status: r.status || 'pending',
                createdAt: r.created_at || null
            };
        }

        

        // =====================================================
        //  STATE & STRUCTURED SLOT AVAILABILITY (Farms, Pitches, Transport)
        // =====================================================
        const AMENITIES_MAP = {
            private_screened: { icon: '🔒', labelAr: 'مسبح مستور (خصوصية تامة)', labelEn: '100% Private Screened Pool', highlight: true },
            families_only:    { icon: '👨‍👩‍👧‍👦', labelAr: 'عائلات فقط',               labelEn: 'Families Only',              highlight: true },
            youth_allowed:    { icon: '👥', labelAr: 'عائلات وشباب',              labelEn: 'Families & Youth' },
            events_allowed:   { icon: '🎉', labelAr: 'مناسبات وحفلات',            labelEn: 'Events & Parties' },
            pool:             { icon: '🏊', labelAr: 'مسبح خاص',                  labelEn: 'Private Pool' },
            bbq:              { icon: '🔥', labelAr: 'باربيكيو',                   labelEn: 'BBQ' },
            wifi:             { icon: '📶', labelAr: 'واي فاي',                    labelEn: 'Wi-Fi' },
            heating:          { icon: '🌡️', labelAr: 'تدفئة',                      labelEn: 'Heating' },
            outdoor:          { icon: '🌿', labelAr: 'جلسة خارجية',                labelEn: 'Outdoor Seating' }
        };

                        let selectedItem = null;
        let selectedShiftType = 'morning';
        let currentUploadedReceiptBase64 = '';
        let isReceiptProcessing = false;

                                                        // [البند 11] توكن تيليجرام لا يُحفظ في المتصفح نهائياً (مع حذف أي نسخة قديمة محفوظة)
        let telegramConfig = { botToken: '', chatId: '', enabled: false };
                let appliedPromoCode = '';
                        let currentSortOrder = 'fair';
        const compareIds = new Set();
        let lastCalculatedBookingTotal = 0;
        let lastCalculatedBookingDeposit = 0;

        function getFairShuffleScore(itemId) {
            let h = (Number(itemId) * 2654435761) ^ pageShuffleSeed;
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            return (h ^ (h >>> 16)) >>> 0;
        }

        function getItemSortPrice(item) {
            if (!item) return 0;
            if (item.category === 'transport') return Number(item.pricePerPerson || item.pricePerKm || 0);
            if (item.category === 'field') return Number(item.hourlyRate || 0);
            return Number(item.priceDay || item.priceNight || item.priceFull || 0);
        }

        // جميع الفترات المحجوزة أو قيد المراجعة من الـ View العام:
        // [{ facilityId, date, hourFrom, hourTo, shiftType, status }]
                
        
        // فحص ما إذا كان مدى ساعات [hFrom, hTo) متقاطعاً مع أي حجز مؤكد أو معلق
        
        function shiftToHours(shift) {
            if (shift === 'morning') return [0, 12];
            if (shift === 'evening') return [12, 24];
            return [0, 24];
        }


        function isSlotConfirmed(itemId, date, shift) {
            const [hFrom, hTo] = shiftToHours(shift);
            return getIntervalBusyStatus(itemId, date, hFrom, hTo) === 'confirmed';
        }

        function isSlotTempHeld(itemId, date, shift) {
            const [hFrom, hTo] = shiftToHours(shift);
            // [البند 10] لا يوجد قفل مؤقت وهمي: الموعد "قيد المراجعة" فقط إذا كان عليه طلب معلق فعلي في السيرفر
            return getIntervalBusyStatus(itemId, date, hFrom, hTo) === 'pending';
        }

        function isSlotUnavailable(itemId, date, shift) {
            if (!date) return false;
            return isSlotConfirmed(itemId, date, shift) || isSlotTempHeld(itemId, date, shift);
        }


        
        async function refreshBookingsForItem(itemId) {
            await loadPublicConfirmedSlots(itemId);
        }


        async function loadFromDatabase() {
            if (!db) return;
            try {
                // جلب جميع البيانات الأساسية بالتوازي (Parallel Fetch) مع إخفاء إعدادات الأدمن السرية عن الزوار
                const [facRes, revRes, , favRpcRes, admBookRes, promoRes] = await Promise.all([
                    db.from('public_facilities').select('id,category,name_ar,name_en,location_ar,location_en,price_day,price_night,price_full,hourly_rate,price_per_km,price_per_person,capacity,security_deposit,is_verified,specs_ar,specs_en,images,video_url,cancel_policy_ar,cancel_policy_en,amenities,seasons,rating,active,created_at').order('id'),
                    db.from('reviews').select('id,facility_id,user_name,rating,comment,status,verified_booking,created_at').order('id', { ascending: false }).limit(1000),
                    loadPublicConfirmedSlots(),
                    db.rpc('get_my_favorites', { p_device_id: DEVICE_ID }),
                    (Promise.resolve({ data: null, error: null })),
                    db.from('public_auto_promos').select('id,code,title_ar,discount_type,discount_value,allowed_days,valid_from,valid_until,excluded_dates,excluded_facility_ids,auto_apply,active,created_at').order('id', { ascending: false })
                ]);

                if (!promoRes.error && Array.isArray(promoRes.data)) {
                    promoCodes = promoRes.data
                        .filter(r => String(r.code || '').toUpperCase() !== '__TG_CFG__')
                        .map(rowToPromo);
                    safeSetStorage('wknd_promos_fallback', JSON.stringify(promoCodes));
                }

                // لا يتم جلب إعدادات بوت التيليجرام السرية إلا إذا كان الأدمن مسجلاً للدخول
                {
                    telegramConfig = { botToken: '', chatId: '', enabled: false };
                }

                if (facRes.error) throw facRes.error;
                const facilityRows = facRes.data;
                allReviews = Array.isArray(revRes.data) ? revRes.data : [];

                if (Array.isArray(facilityRows)) {
                    items = facilityRows.map(r => {
                        const it = rowToItem(r);
                        it.reviews = allReviews
                            .filter(rv => Number(rv.facility_id) === it.id && (rv.status === 'approved' || !rv.status))
                            .map(rv => ({ id: rv.id, user: rv.user_name, rating: Number(rv.rating) || 5, comment: rv.comment, verified: Boolean(rv.verified_booking) }));
                        return it;
                    });
                    safeSetStorage('wknd_facilities_cache', JSON.stringify(items.filter(i => i.active)));
                }

                if (false && Array.isArray(admBookRes.data)) {
                    pendingBookings = admBookRes.data.filter(b => b.status === 'pending').map(rowToBooking);
                    confirmedBookings = admBookRes.data.filter(b => b.status === 'confirmed').map(rowToBooking);
                    archivedBookings = admBookRes.data.filter(b => b.status === 'rejected' || b.status === 'expired').map(rowToBooking);
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

        // =====================================================
        //  TRANSLATIONS & LOCALIZATION
        // =====================================================
        const translations = {
            ar: {
                navHome:'الواجهة الرئيسية', navFav:'المفضلة', navTrack:'تتبّع حجزي', navAdmin:'👑 لوحة الأدمن',
                heroTitle:'احجز مكانك أو وسيلة النقل بسهولة وأمان', heroSubtitle:'حساب أوتوماتيكي للعربون - تأكيد فوري عبر CliQ - تجربة حجز سلسة',
                favTitle:'قائمة المفضلة', sbTitle:'لوحة التحكم', sbOverview:'الرئيسية (الإحصائيات)', sbListings:'إدارة المنشآت', sbPitches:'إدارة الملاعب', sbBookings:'الحجوزات والطلبات', sbPromos:'الخصومات والكوبونات', sbReviews:'مراجعة التقييمات',
                dashTitle:'📊 نظرة عامة والإحصائيات', statPending:'طلبات بانتظار التأكيد', statConfirmed:'إجمالي الحجوزات المؤكدة', statRevenue:'مجموع أرباح العربون',
                manageListingsTitle:'قائمة المنشآت الحالية (المزارع والشاليهات ووسائل النقل)', logoutBtn:'تسجيل الخروج',
                filterAll:'الكل', filterFarms:'مزارع وشاليهات 🌴', filterFields:'ملاعب ⚽', filterTransport:'وسائل نقل وباصات 🚌', seasonFilterLabel:'الموسم والخصوصية:', seasonWinter:'❄️ شتوية', seasonSummer:'☀️ صيفية',
                filterPrivatePool:'🔒 مسبح مستور (خصوصية تامة)', filterFamiliesOnly:'👨‍👩‍👧‍👦 عائلات فقط',
                sortFair:'🔀 ترتيب متنوع وعادل', sortPriceAsc:'💰 الأقل سعراً أولاً', sortPriceDesc:'💎 الأعلى سعراً أولاً', sortRatingDesc:'⭐ الأعلى تقييماً',
                btnDetails:'التفاصيل', btnBookNow:'ابدأ الحجز', badgeFarm:'مزرعة', badgeField:'ملعب', badgeTransport:'حافلة / باص'
            },
            en: {
                navHome:'Home', navFav:'Favorites', navTrack:'Track Booking', navAdmin:'👑 Admin Panel',
                heroTitle:'Book your place or transportation easily and safely', heroSubtitle:'Automatic deposit calculation - Instant CliQ confirmation - A smooth booking experience',
                favTitle:'Favorites', sbTitle:'Dashboard', sbOverview:'Overview & Statistics', sbListings:'Manage Listings', sbPitches:'Manage Fields', sbBookings:'Bookings & Requests', sbPromos:'Promos & Discounts', sbReviews:'Reviews Moderation',
                dashTitle:'📊 Overview & Statistics', statPending:'Pending Confirmation', statConfirmed:'Total Confirmed Bookings', statRevenue:'Total Deposit Revenue',
                manageListingsTitle:'Current Listings (Farms, Chalets & Transportation)', logoutBtn:'Log Out',
                filterAll:'All', filterFarms:'Farms & Chalets 🌴', filterFields:'Sports Fields ⚽', filterTransport:'Transportation & Buses 🚌', seasonFilterLabel:'Season & Privacy:', seasonWinter:'❄️ Winter', seasonSummer:'☀️ Summer',
                filterPrivatePool:'🔒 Private Screened Pool', filterFamiliesOnly:'👨‍👩‍👧‍👦 Families Only',
                sortFair:'🔀 Fair Rotation', sortPriceAsc:'💰 Price: Low to High', sortPriceDesc:'💎 Price: High to Low', sortRatingDesc:'⭐ Highest Rated',
                btnDetails:'Details', btnBookNow:'Book Now', badgeFarm:'Farm', badgeField:'Field', badgeTransport:'Bus'
            }
        };

        
        function localizedPolicyText(item) {
            if (!item) return '';
            const arVal = String(item.cancelPolicyAr || '').trim();
            const enVal = String(item.cancelPolicyEn || '').trim();
            if (currentLang === 'ar') return arVal || enVal;
            return enVal || arVal || 'Free cancellation before 48 hours. The deposit is non-refundable after booking confirmation.';
        }

        function applyLanguage() {
            const lang = translations[currentLang];
            document.querySelectorAll('[data-key]').forEach(el => {
                if (lang[el.dataset.key] !== undefined) el.textContent = lang[el.dataset.key];
            });
            const search = document.getElementById('search-location');
            if (search) search.placeholder = currentLang === 'ar' ? 'ابحث بالاسم أو الموقع أو الكلمة المفتاحية...' : 'Search by name, location or keyword...';
            const categoryOptions = document.querySelectorAll('#search-category option');
            const arOptions = ['جميع الأنواع','مزارع وشاليهات 🌴','ملاعب ⚽','حافلات 🚌'];
            const enOptions = ['All Types','Farms & Chalets 🌴','Sports Fields ⚽','Buses 🚌'];
            categoryOptions.forEach((option, i) => { option.textContent = (currentLang === 'ar' ? arOptions : enOptions)[i] || option.textContent; });
            document.documentElement.lang = currentLang;
            document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
        }

        // =====================================================
        //  NAV & VIEWS
        // =====================================================
        function toggleMobileMenu() { document.getElementById('nav-menu-container').classList.toggle('mobile-active'); }
        function closeMobileMenu() { document.getElementById('nav-menu-container').classList.remove('mobile-active'); }

        function toggleLanguage() {
            currentLang = currentLang === 'ar' ? 'en' : 'ar';
            document.getElementById('lang-toggle-btn').innerText = currentLang === 'ar' ? 'English' : 'العربية';
            applyLanguage();
            liveSearch();
            
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
            if (viewId === 'favorites-view') {
                chatWidget.style.display = 'block';
                mainFooter.style.display = 'block';
                document.getElementById('btn-favorites').classList.add('active');
                renderFavorites();
            } else {
                chatWidget.style.display = 'block';
                mainFooter.style.display = 'block';
                if (viewId === 'customer-view') document.getElementById('btn-customer').classList.add('active');
            }
        }

        function openTermsPage() {
            closeModal('booking-modal');
            switchView('terms-view');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        async function promptAdminLogin() {
            // إجبار طلب البريد وكلمة المرور دائماً وعدم الدخول التلقائي أبداً
            
            document.getElementById('admin-email-input').value = '';
            document.getElementById('admin-pass-input').value = '';
            openModalSafely('admin-login-modal');
            setTimeout(() => document.getElementById('admin-email-input').focus(), 100);
        }


        // =====================================================
        //  SEARCH, FILTERS & RENDER ITEMS
        // =====================================================
        
        function syncSeasonFilterVisibility(category) {
            const seasonFilters = document.getElementById('season-filters');
            if (!seasonFilters) return;
            const visible = category !== 'transport';
            seasonFilters.style.display = 'flex';
            const labelEl = seasonFilters.querySelector('.season-filters-label');
            if (labelEl) labelEl.style.display = visible ? 'inline' : 'none';
            seasonFilters.querySelectorAll('.season-chip').forEach(b => {
                b.style.display = visible ? 'inline-block' : 'none';
            });
            if (!visible && selectedSeasons.size) {
                selectedSeasons.clear();
                document.querySelectorAll('.season-chip').forEach(b => b.classList.remove('active'));
            }
        }


        function toggleSeasonFilter(season, button) {
            if (selectedSeasons.has(season)) {
                selectedSeasons.delete(season);
                button.classList.remove('active');
            } else {
                selectedSeasons.add(season);
                button.classList.add('active');
            }
            liveSearch();
        }

        function matchesSelectedRegion(searchableText, regionVal) {
            if (!regionVal) return true;
            const map = {
                'طريق المطار': ['طريق المطار', 'مطار', 'airport'],
                'البحر الميت': ['البحر الميت', 'الميت', 'dead sea'],
                'جرش': ['جرش', 'عجلون', 'jerash', 'ajloun'],
                'الأغوار': ['الأغوار', 'الاغوار', 'غور', 'الشونة', 'شونة', 'valley'],
                'السلط': ['السلط', 'سلط', 'salt'],
                'مادبا': ['مادبا', 'مأدبا', 'madaba'],
                'عمان': ['عمان', 'عمّان', 'amman']
            };
            const keywords = map[regionVal] || [regionVal.toLowerCase()];
            return keywords.some(k => searchableText.includes(k));
        }

        function renderItems(category, searchQuery = '') {
            const container = document.getElementById('items-container');
            syncSeasonFilterVisibility(category);
            container.innerHTML = '';
            const q = searchQuery.toLowerCase().trim();
            const regionVal = (document.getElementById('search-region')?.value || '').trim();

            const filtered = items.filter(item => {
                if (!item.active) return false;
                const matchesCat = category === 'all' || item.category === category;
                const searchableText = [
                    item.nameAr, item.nameEn,
                    item.locationAr, item.locationEn,
                    item.specsAr, item.specsEn
                ].filter(Boolean).join(' ').toLowerCase();
                const matchesQuery = (q === '' || searchableText.includes(q)) && matchesSelectedRegion(searchableText, regionVal);
                const itemSeasons = Array.isArray(item.seasons) && item.seasons.length ? item.seasons : ['summer', 'winter'];
                const itemAmenities = Array.isArray(item.amenities) ? item.amenities : [];
                const activeSeasonFilters = [...selectedSeasons].filter(s => s === 'winter' || s === 'summer');
                const activePrivacyFilters = [...selectedSeasons].filter(s => s === 'private_screened' || s === 'families_only');
                const matchesSeason = activeSeasonFilters.length === 0 || item.category === 'transport' || activeSeasonFilters.some(s => itemSeasons.includes(s));
                const matchesPrivacy = activePrivacyFilters.length === 0 || activePrivacyFilters.every(p => itemAmenities.includes(p));
                return matchesCat && matchesQuery && matchesSeason && matchesPrivacy;
            });

            if (filtered.length === 0) {
                container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);">${currentLang === 'ar' ? 'لا توجد منشآت مطابقة حالياً.' : 'No matching listings found.'}</div>`;
                return;
            }

            const sorted = [...filtered].sort((a, b) => {
                if (currentSortOrder === 'price_asc') {
                    return getItemSortPrice(a) - getItemSortPrice(b);
                }
                if (currentSortOrder === 'price_desc') {
                    return getItemSortPrice(b) - getItemSortPrice(a);
                }
                if (currentSortOrder === 'rating_desc') {
                    const rDiff = (Number(b.rating) || 5) - (Number(a.rating) || 5);
                    if (rDiff !== 0) return rDiff;
                    return getFairShuffleScore(a.id) - getFairShuffleScore(b.id);
                }
                // الوضع الافتراضي (fair): المنشآت المميزة أولاً (وتدور فيما بينها بعدالة)، ثم بقية المنشآت تدور بعدالة لكل زائر
                const aFeat = Array.isArray(a.amenities) && a.amenities.includes('featured') ? 1 : 0;
                const bFeat = Array.isArray(b.amenities) && b.amenities.includes('featured') ? 1 : 0;
                if (aFeat !== bFeat) return bFeat - aFeat;
                return getFairShuffleScore(a.id) - getFairShuffleScore(b.id);
            });

            const frag = document.createDocumentFragment();
            sorted.forEach(item => buildCard(item, frag));
            container.appendChild(frag);
        }

        function syncFilterChips() {
            const catQuery = document.getElementById('search-category').value;
            document.querySelectorAll('.filter-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.category === catQuery);
            });
        }

        function liveSearch() {
            const locQuery = document.getElementById('search-location').value.trim();
            const catQuery = document.getElementById('search-category').value;
            syncFilterChips();
            renderItems(catQuery, locQuery);
            const countEl = document.getElementById('search-count');
            if (locQuery) {
                const total = document.getElementById('items-container').querySelectorAll('.venue-card').length;
                countEl.textContent = total + (currentLang === 'ar' ? ' نتيجة' : ' result(s)');
                countEl.style.display = 'inline-block';
            } else {
                countEl.style.display = 'none';
            }
        }

        function filterCategory(category) {
            document.getElementById('search-category').value = category;
            liveSearch();
        }

        // =====================================================
        //  FAVORITES
        // =====================================================
                
        async function toggleFavorite(id, btnEl, ev) {
            if (ev) ev.stopPropagation();
            const numId = Number(id);
            if (favorites.has(numId)) {
                favorites.delete(numId);
                btnEl.classList.remove('active');
                btnEl.textContent = '🤍';
                btnEl.setAttribute('aria-pressed', 'false');
                btnEl.setAttribute('aria-label', 'إضافة للمفضلة');
                saveFavorites();
                updateFavBadge();
                if (db) {
                    const { error } = await db.rpc('toggle_my_favorite', { p_device_id: DEVICE_ID, p_facility_id: numId, p_add: false });
                    if (error) {
                        try { await db.from('favorites').delete().eq('device_id', DEVICE_ID).eq('facility_id', numId); } catch (e) {}
                    }
                }
            } else {
                favorites.add(numId);
                btnEl.classList.add('active');
                btnEl.textContent = '❤️';
                btnEl.setAttribute('aria-pressed', 'true');
                btnEl.setAttribute('aria-label', 'إزالة من المفضلة');
                saveFavorites();
                updateFavBadge();
                if (db) {
                    const { error } = await db.rpc('toggle_my_favorite', { p_device_id: DEVICE_ID, p_facility_id: numId, p_add: true });
                    if (error) {
                        try { await db.from('favorites').upsert({ device_id: DEVICE_ID, facility_id: numId }); } catch (e) {}
                    }
                }
            }
        }

        
        function renderFavorites() {
            const container = document.getElementById('favorites-container');
            if (!container) return;
            container.innerHTML = '';
            const favItems = items.filter(i => favorites.has(i.id) && i.active);
            if (favItems.length === 0) {
                container.innerHTML = `<div class="empty-fav" style="grid-column:1/-1;"><div class="big-icon">🤍</div><p style="font-size:1.1rem;font-weight:600;">${currentLang==='ar'?'قائمة المفضلة فارغة':'Your wishlist is empty'}</p></div>`;
                return;
            }
            const frag = document.createDocumentFragment();
            favItems.forEach(item => buildCard(item, frag));
            container.appendChild(frag);
        }

        // =====================================================
        //  STAR RATINGS & CARD BUILDER (100% XSS SAFE)
        // =====================================================
        
        function buildCard(item, container) {
            let badgeText = currentLang === 'ar' ? 'مزرعة' : 'Farm';
            if (item.category === 'field') badgeText = currentLang === 'ar' ? 'ملعب' : 'Field';
            if (item.category === 'transport') badgeText = currentLang === 'ar' ? 'حافلة' : 'Bus';
            const name = escapeHtml(localizedItemText(item, 'name'));
            const location = escapeHtml(localizedItemText(item, 'location'));
            const specs = escapeHtml(localizedItemText(item, 'specs'));
            const imgSrc = escapeHtml(sanitizeImageUrl(item.images[0]));
            const isFav = favorites.has(item.id);
            const ratingVal = (Number(item.rating) || 5.0).toFixed(1);

            let priceTagHtml;
            if (item.category === 'transport') {
                const cap = Number(item.capacity) || 23;
                priceTagHtml = currentLang === 'ar'
                    ? `🚗 ${Number(item.pricePerKm || 0)} JOD/كم | 👤 ${Number(item.pricePerPerson || 0)} JOD/شخص (سعة ${cap})`
                    : `🚗 ${Number(item.pricePerKm || 0)} JOD/km | 👤 ${Number(item.pricePerPerson || 0)} JOD/person (${cap} seats)`;
            } else if (item.category === 'field') {
                priceTagHtml = currentLang === 'ar'
                    ? `⏰ ${Number(item.hourlyRate || 0)} JOD/ساعة | 🔒 عربون 5 JOD`
                    : `⏰ ${Number(item.hourlyRate || 0)} JOD/hour | 🔒 5 JOD deposit`;
            } else {
                priceTagHtml = `☀️ ${Number(item.priceDay || 0)} | 🌙 ${Number(item.priceNight || 0)} JOD`;
            }

            const amList = Array.isArray(item.amenities) ? item.amenities : [];
            let privacyRibbonHtml = '';
            if (amList.includes('private_screened')) {
                privacyRibbonHtml = `<span class="card-privacy-ribbon">${currentLang==='ar'?'🔒 مسبح مستور (خصوصية تامة)':'🔒 100% Private Pool'}</span>`;
            } else if (amList.includes('families_only')) {
                privacyRibbonHtml = `<span class="card-privacy-ribbon">${currentLang==='ar'?'👨‍👩‍👧‍👦 عائلات فقط':'👨‍👩‍👧‍👦 Families Only'}</span>`;
            }

            const activeAutoPromo = (promoCodes || []).find(p => p.active && p.autoApply && !(p.excludedFacilityIds || []).includes(item.id));
            const promoRibbonHtml = activeAutoPromo
                ? `<span class="card-promo-ribbon">🔥 ${escapeHtml(activeAutoPromo.discountType === 'percent' ? `خصم ${activeAutoPromo.discountValue}%` : `خصم ${activeAutoPromo.discountValue} د.أ`)}</span>`
                : '';

            const isFeatured = amList.includes('featured');
            if (isFeatured) {
                badgeText = currentLang === 'ar' ? `⭐ ${badgeText} مميزة` : `⭐ Featured ${badgeText}`;
            }

            const card = document.createElement('div');
            card.className = 'venue-card' + (isFeatured ? ' featured-card' : '');
            card.innerHTML = `
                <div>
                    <div class="card-img-holder" tabindex="0" role="button" data-action="open-details" data-id="${item.id}">
                        <img src="${imgSrc}" alt="${name}" loading="lazy">
                        <span class="card-badge">${escapeHtml(badgeText)}</span>
                        ${privacyRibbonHtml}
                        ${promoRibbonHtml}
                        <span class="card-rating-badge">${renderStars(item.rating)} ${ratingVal}</span>
                        <button type="button" class="fav-btn ${isFav?'active':''}" data-action="toggle-fav" data-id="${item.id}" title="إضافة للمفضلة" aria-label="${isFav?'إزالة من المفضلة':'إضافة للمفضلة'}" aria-pressed="${isFav?'true':'false'}">${isFav?'❤️':'🤍'}</button>
                    </div>
                    <div class="card-body">
                        <h3 class="card-title">${name}</h3>
                        <div class="card-location">📍 ${location}</div>
                        <div class="card-specs">${specs}</div>
                    </div>
                </div>
                ${amList.length ? `<div class="card-amenities">${amList.map(a=>{ const m=AMENITIES_MAP[a]; return m?`<span class="card-amenity ${m.highlight?'privacy-highlight-badge':''}">${m.icon} ${escapeHtml(currentLang==='ar'?m.labelAr:m.labelEn)}</span>`:''; }).join('')}</div>` : ''}
                <div class="card-footer">
                    <div class="price-tag">${priceTagHtml}</div>
                    <div>
                        <button type="button" class="btn-compare-card ${compareIds.has(item.id)?'selected':''}" data-action="toggle-compare" data-id="${item.id}" title="قارن بين المنشآت" aria-label="قارن بين المنشآت" aria-pressed="${compareIds.has(item.id)?'true':'false'}">⚖️</button>
                        <button type="button" class="btn-details" data-action="open-details" data-id="${item.id}">${currentLang==='ar'?'التفاصيل':'Details'}</button>
                        <button type="button" class="btn-action" data-action="open-booking" data-id="${item.id}">${currentLang==='ar'?'ابدأ الحجز':'Book Now'}</button>
                    </div>
                </div>`;
            container.appendChild(card);
        }

        async function openDetailsModal(id) {
            selectedItem = items.find(i => i.id === Number(id));
            if (!selectedItem) return;
            await loadPublicConfirmedSlots(selectedItem.id);

            const name = localizedItemText(selectedItem, 'name');
            document.getElementById('det-title').textContent = name;
            document.getElementById('det-location').textContent = '📍 ' + localizedItemText(selectedItem, 'location');
            document.getElementById('det-specs').textContent = localizedItemText(selectedItem, 'specs');
            document.getElementById('det-book-btn').dataset.id = selectedItem.id;
            document.getElementById('det-wa-share-btn').dataset.id = selectedItem.id;
            const copyLinkBtn = document.getElementById('det-copy-link-btn');
            if (copyLinkBtn) copyLinkBtn.dataset.id = selectedItem.id;

            // Gallery
            const mainImg = document.getElementById('det-main-img');
            const thumbsEl = document.getElementById('det-gallery-thumbs');
            const safeImages = (selectedItem.images || []).map(sanitizeImageUrl);
            mainImg.src = safeImages[0] || '';
            thumbsEl.innerHTML = '';
            if (safeImages.length > 1) {
                safeImages.forEach((src, idx) => {
                    const t = document.createElement('img');
                    t.src = src;
                    t.className = 'gallery-thumb' + (idx === 0 ? ' active' : '');
                    t.addEventListener('click', () => {
                        mainImg.src = src;
                        thumbsEl.querySelectorAll('.gallery-thumb').forEach(x => x.classList.remove('active'));
                        t.classList.add('active');
                    });
                    thumbsEl.appendChild(t);
                });
            }

            // Video Player Section (Supports uploaded video files from weekend-media or YouTube embed)
            const videoSec = document.getElementById('det-video-section');
            const videoPlayer = document.getElementById('det-video-player');
            const iframeWrap = document.getElementById('det-video-iframe-wrap');
            const videoIframe = document.getElementById('det-video-iframe');
            const safeVid = sanitizeVideoUrl(selectedItem.videoUrl);
            if (videoPlayer) { videoPlayer.pause(); videoPlayer.removeAttribute('src'); videoPlayer.load(); videoPlayer.style.display = 'none'; }
            if (videoIframe) { videoIframe.src = ''; }
            if (iframeWrap) { iframeWrap.style.display = 'none'; }

            if (safeVid) {
                videoSec.style.display = 'block';
                if (safeVid.includes('youtube.com/embed/')) {
                    iframeWrap.style.display = 'block';
                    videoIframe.src = safeVid;
                } else {
                    videoPlayer.style.display = 'block';
                    videoPlayer.src = safeVid;
                }
            } else {
                videoSec.style.display = 'none';
            }

            // Cancel Policy
            const policyBox = document.getElementById('det-cancel-policy');
            const policyText = localizedPolicyText(selectedItem);
            if (policyText) {
                document.getElementById('det-cancel-text').textContent = policyText;
                policyBox.style.display = 'block';
            } else {
                policyBox.style.display = 'none';
            }

            // Verified Badge & Security Deposit
            const verEl = document.getElementById('det-verified-badge');
            if (verEl) verEl.style.display = selectedItem.isVerified !== false ? 'inline-flex' : 'none';
            const depEl = document.getElementById('det-security-deposit');
            if (depEl) {
                if (Number(selectedItem.securityDeposit || 0) > 0) {
                    depEl.style.display = 'block';
                    depEl.textContent = `🛡️ التأمين المسترد عند الوصول: ${Number(selectedItem.securityDeposit).toFixed(0)} JOD (يُعاد بالكامل عند المغادرة)`;
                } else {
                    depEl.style.display = 'none';
                }
            }

            // Smart Weekend Bundle Banner (Farm/Pitch + Available Bus)
            const bundleBox = document.getElementById('det-bundle-box');
            const bundleBtn = document.getElementById('det-bundle-bus-btn');
            const activeBuses = items.filter(i => i.category === 'transport' && i.active);
            if (bundleBox && bundleBtn && selectedItem.category !== 'transport' && activeBuses.length > 0) {
                bundleBox.style.display = 'flex';
                bundleBtn.dataset.busId = activeBuses[0].id;
                bundleBtn.dataset.dest = `${selectedItem.nameAr} — ${selectedItem.locationAr}`;
            } else if (bundleBox) {
                bundleBox.style.display = 'none';
            }

            // Sticky Mobile CTA Price & Action
            const stickyPrice = document.getElementById('det-sticky-price');
            const stickyBtn = document.getElementById('det-sticky-book-btn');
            if (stickyPrice) {
                if (selectedItem.category === 'transport') stickyPrice.textContent = `${Number(selectedItem.pricePerKm || 0)} JOD/كم`;
                else if (selectedItem.category === 'field') stickyPrice.textContent = `${Number(selectedItem.hourlyRate || 0)} JOD/ساعة`;
                else stickyPrice.textContent = `${Number(selectedItem.priceDay || selectedItem.priceNight || 0)} JOD`;
            }
            if (stickyBtn) stickyBtn.dataset.id = selectedItem.id;

            // Approximate Location Notice (Exact Google Maps link revealed only on confirmed ticket)
            const mapSec = document.getElementById('det-map-section');
            const approxLabel = document.getElementById('det-approx-loc-label');
            if (mapSec && approxLabel) {
                mapSec.style.display = 'block';
                approxLabel.textContent = '📍 المنطقة: ' + localizedItemText(selectedItem, 'location');
            }

            // Amenities
            const amenitiesSection = document.getElementById('det-amenities-section');
            const amenitiesStrip = document.getElementById('det-amenities-strip');
            if ((selectedItem.amenities || []).length > 0) {
                amenitiesStrip.innerHTML = selectedItem.amenities.map(a => {
                    const m = AMENITIES_MAP[a];
                    return m ? `<span class="amenity-badge ${m.highlight?'privacy-highlight-badge':''}"><span class="am-icon">${m.icon}</span>${escapeHtml(currentLang === 'ar' ? m.labelAr : m.labelEn)}</span>` : '';
                }).join('');
                amenitiesSection.style.display = 'block';
            } else {
                amenitiesSection.style.display = 'none';
            }

            calCurrentDate = new Date();
            calItemId = selectedItem.id;
            renderAvailCalendar(selectedItem.id);
            renderReviewsList();
            openModalSafely('details-modal');
        }

        function renderReviewsList() {
            const container = document.getElementById('reviews-list');
            container.innerHTML = '';
            const heading = document.getElementById('det-reviews-heading');
            if (!selectedItem || !selectedItem.reviews || selectedItem.reviews.length === 0) {
                if (heading) heading.textContent = currentLang === 'ar' ? '⭐ تقييمات وآراء العملاء' : '⭐ Customer Reviews';
                container.innerHTML = `<p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:1rem;">${currentLang === 'ar' ? 'لا توجد تقييمات معتمدة حالياً.' : 'No approved reviews yet.'}</p>`;
                return;
            }
            const avg = selectedItem.reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / selectedItem.reviews.length;
            if (heading) heading.innerHTML = `${renderStars(avg)} <span style="font-size:0.85rem;font-weight:600;color:#666;margin-right:6px;">${avg.toFixed(1)} / 5</span><span style="font-size:0.82rem;color:var(--text-muted);">(${selectedItem.reviews.length} ${currentLang === 'ar' ? 'تقييم' : 'reviews'})</span>`;
            selectedItem.reviews.forEach(r => {
                const div = document.createElement('div');
                div.className = 'review-card';
                div.innerHTML = `<div class="review-card-stars" style="display:flex;align-items:center;justify-content:space-between;gap:6px;">${renderStars(r.rating)}${r.verified ? '<span style="background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;padding:1px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">✅ حاجز فعلي موثّق</span>' : ''}</div><div class="review-header"><span>👤 ${escapeHtml(r.user)}</span><span style="font-size:0.8rem;color:#999;">${Number(r.rating).toFixed(1)} / 5</span></div><div class="review-comment">${escapeHtml(r.comment)}</div>`;
                container.appendChild(div);
            });
        }

        async function submitReview(e) {
            e.preventDefault();
            if (!selectedItem || !db) return;
            const name = document.getElementById('rev-user-name').value.trim();
            const phone = normalizePhone(document.getElementById('rev-phone')?.value || '');
            const ticketCode = (document.getElementById('rev-ticket-code')?.value || '').trim().replace(/^#/, '').toUpperCase();
            const rating = parseFloat(document.getElementById('rev-rating-val').value);
            const comment = document.getElementById('rev-comment').value.trim();
            const btn = document.getElementById('rev-submit-btn');
            if (name.length < 2 || comment.length < 2 || !isValidPhone(phone) || !ticketCode) {
                showToast('⚠️ يرجى إدخال رقم الهاتف ورمز التذكرة المؤكدة والاسم والتعليق بشكل صحيح');
                return;
            }
            btn.disabled = true;
            try {
                const { data: revRes, error } = await db.rpc('submit_review', {
                    p_facility_id: selectedItem.id,
                    p_user_name: name,
                    p_rating: rating,
                    p_comment: comment,
                    p_phone: phone,
                    p_ticket_code: ticketCode
                });
                if (error || (revRes && revRes.ok === false)) {
                    showToast('⚠️ ' + (error?.message || revRes?.error || 'تعذر إرسال التقييم حالياً'));
                    return;
                }
                document.getElementById('rev-comment').value = '';
                showToast('✅ تم نشر تقييمك الموثّق بنجاح! شكراً لمشاركتك.');
                await loadFromDatabase();
                selectedItem = items.find(i => i.id === selectedItem.id) || selectedItem;
                renderReviewsList();
                liveSearch();
                // إشعار التقييم يُرسل تلقائياً من السيرفر داخل submit_review RPC
                
            } finally {
                btn.disabled = false;
            }
        }


        function applyBookingPromoCode() {
            const inp = document.getElementById('booking-promo-input');
            const code = inp ? inp.value.toUpperCase().trim() : '';
            if (!code) {
                showToast('⚠️ يرجى كتابة كود الخصم أولاً');
                return;
            }
            appliedPromoCode = code;
            const clearBtn = document.getElementById('btn-clear-promo');
            if (clearBtn) clearBtn.style.display = 'inline-block';
            updateBookingCalculation();
        }

        function clearBookingPromoCode() {
            appliedPromoCode = '';
            const inp = document.getElementById('booking-promo-input');
            if (inp) inp.value = '';
            const clearBtn = document.getElementById('btn-clear-promo');
            if (clearBtn) clearBtn.style.display = 'none';
            const msgEl = document.getElementById('promo-status-msg');
            if (msgEl) msgEl.textContent = '';
            updateBookingCalculation();
        }

        function isWeekendDate(dateVal) {
            if (!dateVal) return false;
            const dow = new Date(dateVal + 'T00:00:00').getDay();
            return dow === 4 || dow === 5 || dow === 6;
        }

        function isFarmShiftPastToday(dateVal, shift) {
            if (!dateVal) return false;
            const { dateStr, hour } = getAmmanNow();
            if (dateVal !== dateStr) return false;
            if ((shift === 'morning' || shift === 'fullday') && hour >= 11) return true;
            if (shift === 'evening' && hour >= 22) return true;
            return false;
        }

        function updatePitchHoursAvailability() {
            if (!selectedItem || selectedItem.category !== 'field') return;
            const date = document.getElementById('booking-date').value;
            const startHourSel = document.getElementById('pitch-start-hour');
            if (!startHourSel) return;
            const { dateStr: todayStr, hour: nowHour } = getAmmanNow();
            const isToday = date === todayStr;

            let firstFree = null;
            Array.from(startHourSel.options).forEach(opt => {
                const h = parseInt(opt.value, 10);
                const isPast = isToday && h <= nowHour;
                // فحص ما إذا كانت الساعتان التاليتان محجوزتين
                const isBusy = date ? Boolean(getIntervalBusyStatus(selectedItem.id, date, h, h + 2)) : false;
                const baseText = `${h < 12 ? (h < 10 ? '0' + h : h) + ':00 صباحاً' : (h === 12 ? '12:00 ظهراً' : (h - 12 < 10 ? '0' + (h - 12) : (h - 12)) + ':00 مساءً')}`;

                if (isPast) {
                    opt.disabled = true;
                    opt.textContent = `${baseText} (⌛ مضت)`;
                } else if (isBusy) {
                    opt.disabled = true;
                    opt.textContent = `${baseText} (🔒 محجوز)`;
                } else {
                    opt.disabled = false;
                    opt.textContent = baseText;
                    if (firstFree === null) firstFree = opt.value;
                }
            });

            const curVal = startHourSel.value;
            const curOpt = startHourSel.querySelector(`option[value="${curVal}"]`);
            if (curOpt && curOpt.disabled && firstFree !== null) {
                startHourSel.value = firstFree;
            }
        }

        function updateShiftAvailability() {
            if (!selectedItem || selectedItem.category !== 'farm') return;
            const date = document.getElementById('booking-date').value;
            const shiftMap = {
                morning: { btn: 'shift-day-btn', status: 'shift-day-status' },
                evening: { btn: 'shift-night-btn', status: 'shift-night-status' },
                fullday: { btn: 'shift-full-btn', status: 'shift-full-status' }
            };
            let currentShiftAvailable = true;
            Object.entries(shiftMap).forEach(([shift, els]) => {
                const btn = document.getElementById(els.btn);
                const statusEl = document.getElementById(els.status);
                const confirmed = date && isSlotConfirmed(selectedItem.id, date, shift);
                const held = date && isSlotTempHeld(selectedItem.id, date, shift);
                const pastToday = date && isFarmShiftPastToday(date, shift);
                const unavailable = Boolean(confirmed || held || pastToday);
                btn.classList.toggle('shift-booked', Boolean(confirmed || pastToday));
                btn.classList.toggle('shift-held', Boolean(!confirmed && !pastToday && held));
                statusEl.style.display = unavailable ? 'block' : 'none';
                statusEl.className = (confirmed || pastToday) ? 'shift-booked-label' : 'shift-held-label';
                if (confirmed) statusEl.textContent = '🔒 محجوز';
                else if (pastToday) statusEl.textContent = '⌛ انتهى وقته اليوم';
                else if (held) statusEl.textContent = '⏳ قيد المراجعة';
                if (shift === selectedShiftType && unavailable) currentShiftAvailable = false;
            });
            if (!currentShiftAvailable && date) {
                const freeShift = ['morning', 'evening', 'fullday'].find(s => !isSlotUnavailable(selectedItem.id, date, s) && !isFarmShiftPastToday(date, s));
                if (freeShift) {
                    document.querySelectorAll('.shift-card').forEach(el => el.classList.remove('selected'));
                    document.getElementById(shiftMap[freeShift].btn).classList.add('selected');
                    selectedShiftType = freeShift;
                }
            }
            updateBookingCalculation();
        }

        function onBookingDateChange() {
            const dateVal = document.getElementById('booking-date').value;
            const badge = document.getElementById('dynamic-pricing-badge');
            if (badge) {
                if (!dateVal) {
                    badge.textContent = 'اختر التاريخ لعرض التسعير';
                    badge.classList.remove('weekend');
                } else if (isWeekendDate(dateVal)) {
                    badge.textContent = '✨ تسعير نهاية الأسبوع (الخميس/الجمعة/السبت +15%)';
                    badge.classList.add('weekend');
                } else {
                    badge.textContent = '📅 أيام عادية (السعر الأساسي)';
                    badge.classList.remove('weekend');
                }
            }
            if (selectedItem && selectedItem.category === 'field') {
                updatePitchHoursAvailability();
                updateBookingCalculation();
            } else {
                updateShiftAvailability();
            }
        }

        async function openBookingModal(id) {
            selectedItem = items.find(i => i.id === Number(id));
            if (!selectedItem) return;
            await loadPublicConfirmedSlots(selectedItem.id);

            document.getElementById('modal-venue-name').textContent = localizedItemText(selectedItem, 'name');
            document.getElementById('accept-terms-checkbox').checked = false;
            document.getElementById('cliq-receipt').value = '';
            document.getElementById('receipt-status-msg').textContent = '';
            currentUploadedReceiptBase64 = '';
            isReceiptProcessing = false;
            appliedPromoCode = '';
            const promoInp = document.getElementById('booking-promo-input');
            if (promoInp) promoInp.value = '';
            const promoClearBtn = document.getElementById('btn-clear-promo');
            if (promoClearBtn) promoClearBtn.style.display = 'none';
            const promoMsg = document.getElementById('promo-status-msg');
            if (promoMsg) promoMsg.textContent = '';

            const isTransport = selectedItem.category === 'transport';
            const isPitch     = selectedItem.category === 'field';
            const { dateStr: today } = getAmmanNow();

            document.getElementById('standard-booking-section').style.display = isTransport ? 'none' : 'block';
            document.getElementById('transport-booking-section').style.display = isTransport ? 'block' : 'none';

            const bd = document.getElementById('booking-date');
            const bdt = document.getElementById('booking-date-transport');
            if (bd) bd.min = today;
            if (bdt) bdt.min = today;

            if (isTransport) {
                const cap = Number(selectedItem.capacity) || 23;
                const passInput = document.getElementById('trans-passengers');
                passInput.value = '';
                passInput.max = String(cap);
                passInput.placeholder = `1 إلى ${cap}`;
                document.getElementById('transport-capacity-hint').textContent = `👥 السعة القصوى لهذه المركبة: ${cap} راكب`;
                document.getElementById('trans-distance').value = '';
                document.getElementById('trans-round-trip').checked = false;
                document.getElementById('booking-date-transport').value = '';
                document.getElementById('trans-pickup-location').value = '';
                document.getElementById('trans-dropoff-location').value = '';
            } else if (isPitch) {
                document.getElementById('farm-shift-section').style.display = 'none';
                document.getElementById('pitch-hourly-section').style.display = 'block';
                document.getElementById('weekend-pricing-group').style.display = 'none';
                document.getElementById('booking-date').value = '';
                document.getElementById('pitch-start-hour').value = '18';
                document.getElementById('pitch-hours').value = '2';
                document.getElementById('pitch-hours').max = '6';
                updatePitchHoursAvailability();
            } else {
                document.getElementById('farm-shift-section').style.display = 'block';
                document.getElementById('pitch-hourly-section').style.display = 'none';
                document.getElementById('weekend-pricing-group').style.display = 'block';
                document.getElementById('booking-date').value = '';
                onBookingDateChange();
                document.querySelectorAll('.shift-card').forEach(el => el.classList.remove('shift-booked', 'shift-held', 'selected'));
                document.getElementById('shift-day-btn').classList.add('selected');
                selectedShiftType = 'morning';
                ['shift-day-status','shift-night-status','shift-full-status'].forEach(sid => {
                    const el = document.getElementById(sid);
                    el.style.display = 'none';
                    el.textContent = '';
                });
            }

            openModalSafely('booking-modal');
            resetTurnstileWidget();
            updateBookingCalculation();
        }

        
        function closeModal(modalId) {
            const modalEl = document.getElementById(modalId);
            if (modalEl) modalEl.classList.remove('active');
            if (modalId === 'details-modal') {
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

        function selectShift(type, element) {
            const date = document.getElementById('booking-date').value;
            if (date && selectedItem) {
                if (isFarmShiftPastToday(date, type)) {
                    showToast('⌛ انتهى وقت هذا الشفت لليوم الحالي');
                    return;
                }
                if (isSlotUnavailable(selectedItem.id, date, type)) {
                    showToast('⛔ هذا الشفت غير متاح لهذا التاريخ');
                    return;
                }
            }
            document.querySelectorAll('.shift-card').forEach(el => el.classList.remove('selected'));
            if (element) element.classList.add('selected');
            selectedShiftType = type;
            updateBookingCalculation();
        }

        // [البند 9] الخصم والإجمالي والعربون تأتي من السيرفر فقط (quote_booking) — نفس حساب create_booking حرفياً
        let quoteTimer = null;
        let quoteSeq = 0;
        let lastServerQuote = null;

        function quoteRowsPlaceholder(dateVal) {
            return `<div id="bill-quote-rows"><p style="font-size:0.85rem;color:var(--text-muted);padding:0.5rem;">${dateVal ? '⏳ جاري حساب السعر النهائي...' : '📅 اختر التاريخ لعرض السعر النهائي والعربون'}</p></div>`;
        }

        function requestServerQuote(dateVal, extraParams, labels) {
            clearTimeout(quoteTimer);
            lastServerQuote = null;
            const seq = ++quoteSeq;
            if (!dateVal || !selectedItem || !db) {
                const promoMsgEl = document.getElementById('promo-status-msg');
                if (promoMsgEl && appliedPromoCode) promoMsgEl.textContent = '📅 يرجى اختيار تاريخ الحجز أولاً لتطبيق كود الخصم';
                try { updateBookingSplitDisplay(0, 0); } catch (e) {}
                return;
            }
            const params = Object.assign({
                p_facility_id: selectedItem.id, p_booking_date: dateVal,
                p_shift_type: null, p_start_hour: null, p_hours: null,
                p_passengers: null, p_distance_km: null, p_is_round_trip: false,
                p_promo_code: appliedPromoCode || null
            }, extraParams || {});
            quoteTimer = setTimeout(() => fetchServerQuote(seq, params, labels), 300);
        }

        async function fetchServerQuote(seq, params, labels) {
            let data = null, error = null;
            try {
                ({ data, error } = await db.rpc('quote_booking', params));
            } catch (e) {
                error = e;
            }
            if (seq !== quoteSeq) return; // تجاهل الردود القديمة إذا تغيّرت المدخلات
            const box = document.getElementById('bill-quote-rows');
            const promoMsgEl = document.getElementById('promo-status-msg');
            if (!box) return;
            if (error || !data || data.ok === false) {
                const msg = error ? 'تعذر حساب السعر حالياً، يرجى التحقق من الاتصال بالإنترنت.' : (data && data.error ? data.error : 'تعذر حساب السعر');
                box.innerHTML = `<p style="font-size:0.85rem;color:var(--danger);padding:0.5rem;font-weight:600;">⚠️ ${escapeHtml(msg)}</p>`;
                if (promoMsgEl) promoMsgEl.textContent = '';
                try { updateBookingSplitDisplay(0, 0); } catch (e) {}
                return;
            }
            lastServerQuote = data;
            const subtotal  = Number(data.subtotal) || 0;
            const discount  = Number(data.discount_amount) || 0;
            const total     = Number(data.total) || 0;
            const deposit   = Number(data.deposit) || 0;
            const remaining = Math.max(0, Number((total - deposit).toFixed(2)));
            const promoTitle = data.promo_title_ar || data.promo_code || '';

            if (promoMsgEl) {
                const manual = String(appliedPromoCode || '').toUpperCase();
                if (manual && data.promo_error) {
                    promoMsgEl.textContent = '❌ ' + data.promo_error;
                    promoMsgEl.style.color = 'var(--danger)';
                } else if (data.promo_code && manual && String(data.promo_code).toUpperCase() === manual) {
                    promoMsgEl.textContent = `✅ تم تطبيق "${promoTitle}" (خصم ${discount.toFixed(2)} JOD)`;
                    promoMsgEl.style.color = 'var(--success)';
                } else if (data.promo_code) {
                    promoMsgEl.textContent = `✨ تم تطبيق عرض اليوم تلقائياً: "${promoTitle}" (-${discount.toFixed(2)} JOD)`;
                    promoMsgEl.style.color = 'var(--success)';
                } else {
                    promoMsgEl.textContent = '';
                }
            }

            const discountHtml = discount > 0
                ? `<div class="bill-row" style="color:var(--success);font-weight:700;"><span>🎁 الخصم (${escapeHtml(promoTitle)}):</span><span>-${discount.toFixed(2)} JOD</span></div>`
                : '';
            const totalLabelHtml = discount > 0
                ? `<span style="text-decoration:line-through;color:#999;font-size:0.82rem;margin-left:6px;">${subtotal.toFixed(2)} JOD</span><strong>${total.toFixed(2)} JOD</strong>`
                : `<strong>${total.toFixed(2)} JOD</strong>`;
            box.innerHTML = `
                    ${discountHtml}
                    <div class="bill-row"><span>${escapeHtml(labels.total)}</span><span>${totalLabelHtml}</span></div>
                    <div class="bill-row highlight"><span>${escapeHtml(labels.deposit)}</span><span><strong>${deposit.toFixed(2)} JOD</strong></span></div>
                    <div class="bill-row total"><span>${escapeHtml(labels.remaining)}</span><span>${remaining.toFixed(2)} JOD</span></div>`;
            try { updateBookingSplitDisplay(total, deposit); } catch (e) {}
        }

        function updateBookingCalculation() {
            if (!selectedItem) return;
            const billEl = document.getElementById('bill-details');

            // ── TRANSPORT ──
            if (selectedItem.category === 'transport') {
                const cap = Number(selectedItem.capacity) || 23;
                const passengers = parseInt(document.getElementById('trans-passengers').value, 10) || 0;
                const distance   = parseFloat(document.getElementById('trans-distance').value) || 0;
                const isRoundTrip = document.getElementById('trans-round-trip').checked;
                const tripDate   = document.getElementById('booking-date-transport').value;

                if (passengers <= 0 || distance <= 0) {
                    billEl.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);padding:0.5rem;">أدخل عدد الركاب (بحد أقصى ${cap}) والمسافة لحساب المبلغ تلقائياً.</p>`;
                    return;
                }
                if (passengers > cap) {
                    billEl.innerHTML = `<p style="font-size:0.85rem;color:var(--danger);padding:0.5rem;font-weight:600;">⚠️ عدد الركاب (${passengers}) يتجاوز السعة القصوى للحافلة (${cap} راكب).</p>`;
                    return;
                }
                if (distance > 2000) {
                    billEl.innerHTML = `<p style="font-size:0.85rem;color:var(--danger);padding:0.5rem;font-weight:600;">⚠️ المسافة المدخلة تتجاوز الحد المسموح (2000 كم).</p>`;
                    return;
                }

                const tripTypeLabel = isRoundTrip ? 'ذهاب وإياب' : 'ذهاب فقط';

                billEl.innerHTML = `
                    <div class="bill-row"><span>عدد الركاب:</span><span>${passengers} / ${cap} راكب</span></div>
                    <div class="bill-row"><span>المسافة:</span><span>${distance} كم × ${isRoundTrip ? '2 (ذهاب وإياب)' : '1'}</span></div>
                    <div class="bill-row"><span>سعر الكيلو:</span><span>${Number(selectedItem.pricePerKm || 0).toFixed(2)} JOD</span></div>
                    <div class="bill-row"><span>سعر الشخص:</span><span>${Number(selectedItem.pricePerPerson || 0).toFixed(2)} JOD</span></div>
                    <div class="bill-row"><span>نوع الرحلة:</span><span>${tripTypeLabel}</span></div>
                    ${quoteRowsPlaceholder(tripDate)}`;
                requestServerQuote(tripDate, { p_passengers: passengers, p_distance_km: distance, p_is_round_trip: isRoundTrip },
                    { total: 'المبلغ الإجمالي:', deposit: 'العربون المطلوب (15%):', remaining: 'المتبقي عند الرحلة:' });
                return;
            }

            // ── PITCH (FIELD) — Hourly pricing ──
            if (selectedItem.category === 'field') {
                const startHour = parseInt(document.getElementById('pitch-start-hour').value, 10) || 6;
                const maxAllowedHours = Math.max(2, 24 - startHour);
                const hoursInput = document.getElementById('pitch-hours');
                hoursInput.max = String(maxAllowedHours);
                let hours = parseInt(hoursInput.value, 10) || 0;

                if (hours < 2) {
                    billEl.innerHTML = `<p style="font-size:0.85rem;color:var(--danger);padding:0.5rem;font-weight:600;">⚠️ الحد الأدنى للحجز ساعتان.</p>`;
                    return;
                }
                if (startHour + hours > 24) {
                    billEl.innerHTML = `<p style="font-size:0.85rem;color:var(--danger);padding:0.5rem;font-weight:600;">⚠️ وقت الحجز لا يمكن أن يتجاوز منتصف الليل (12:00 ص). أقصى عدد ساعات بدءاً من هذه الساعة هو ${maxAllowedHours} ساعات.</p>`;
                    return;
                }

                const dateVal    = document.getElementById('booking-date').value;
                const endHour    = startHour + hours;
                const hourlyRate = Number(selectedItem.hourlyRate) || 0;
                const startLabel = startHour < 12 ? `${startHour}:00 ص` : (startHour === 12 ? '12:00 ظ' : `${startHour-12}:00 م`);
                const endLabel   = endHour < 12 ? `${endHour}:00 ص` : (endHour === 12 ? '12:00 ظ' : endHour === 24 ? '12:00 ص (منتصف الليل)' : `${endHour-12}:00 م`);

                const busyState = dateVal ? getIntervalBusyStatus(selectedItem.id, dateVal, startHour, endHour) : null;
                const conflictWarning = busyState
                    ? `<div style="margin-top:6px;color:var(--danger);font-weight:700;font-size:0.84rem;">⛔ هذه الساعات متعارضة مع حجز ${busyState === 'confirmed' ? 'مؤكد' : 'قيد المراجعة'} في هذا اليوم.</div>`
                    : '';

                billEl.innerHTML = `
                    <div class="bill-row"><span>سعر الساعة:</span><span>${hourlyRate.toFixed(1)} JOD/ساعة</span></div>
                    <div class="bill-row"><span>عدد الساعات:</span><span>${hours} ساعة</span></div>
                    <div class="bill-row"><span>وقت الحجز:</span><span>${startLabel} → ${endLabel}</span></div>
                    ${quoteRowsPlaceholder(dateVal)}
                    ${conflictWarning}`;
                requestServerQuote(dateVal, { p_start_hour: startHour, p_hours: hours },
                    { total: `المبلغ الإجمالي (${hours} × ${hourlyRate}):`, deposit: 'العربون المطلوب:', remaining: 'المتبقي عند الملعب:' });
                return;
            }

            // ── FARM / CHALET — Shift-based pricing (Automatic +15% on Thu/Fri/Sat) ──
            const dateVal = document.getElementById('booking-date').value;
            const multiplier = isWeekendDate(dateVal) ? 1.15 : 1.0;

            document.getElementById('price-day-label').textContent   = `${(Number(selectedItem.priceDay || 0) * multiplier).toFixed(1)} JOD`;
            document.getElementById('price-night-label').textContent = `${(Number(selectedItem.priceNight || 0) * multiplier).toFixed(1)} JOD`;
            document.getElementById('price-full-label').textContent  = `${(Number(selectedItem.priceFull || 0) * multiplier).toFixed(1)} JOD`;

            billEl.innerHTML = `
                <div class="bill-row"><span>التسعير المطبق:</span><span>${multiplier > 1 ? 'نهاية الأسبوع (+15%)' : 'أيام عادية'}</span></div>
                ${quoteRowsPlaceholder(dateVal)}`;
            requestServerQuote(dateVal, { p_shift_type: selectedShiftType },
                { total: 'المبلغ الإجمالي:', deposit: 'العربون المطلوب (15%):', remaining: 'المتبقي عند الوصول:' });
        }

        async function handleReceiptFileChange(input) {
            const msgEl = document.getElementById('receipt-status-msg');
            currentUploadedReceiptBase64 = '';
            if (!input.files || !input.files[0]) {
                if (msgEl) msgEl.textContent = '';
                return;
            }
            isReceiptProcessing = true;
            if (msgEl) {
                msgEl.style.color = 'var(--text-muted)';
                msgEl.textContent = '⏳ جاري ضغط وحفظ صورة الوصل في ملف الوصولات المستقل...';
            }
            try {
                const uploaded = await uploadReceiptToPrivateBucket(input.files[0]);
                currentUploadedReceiptBase64 = uploaded.url;
                if (msgEl) {
                    msgEl.style.color = 'var(--success)';
                    msgEl.textContent = uploaded.storedSeparately
                        ? `✅ تم حفظ صورة الوصل في ملف الوصولات المستقل بنجاح (${uploaded.sizeKb} KB)`
                        : `✅ تم تجهيز وضغط صورة الوصل بنجاح (${uploaded.sizeKb} KB)`;
                }
            } catch (err) {
                input.value = '';
                currentUploadedReceiptBase64 = '';
                if (msgEl) {
                    msgEl.style.color = 'var(--danger)';
                    msgEl.textContent = '❌ ' + (err.message || 'صورة غير صالحة');
                }
                showToast('⚠️ ' + (err.message || 'يرجى اختيار صورة وصل صحيحة'));
            } finally {
                isReceiptProcessing = false;
            }
        }

        async function processBooking(e) {
            e.preventDefault();
            if (!selectedItem || !db) return;
            if (!document.getElementById('accept-terms-checkbox').checked) {
                showToast('⚠️ يجب الموافقة على الشروط والأحكام للمتابعة');
                return;
            }
            if (isReceiptProcessing) {
                showToast('⏳ يرجى الانتظار ريثما يكتمل تجهيز صورة الوصل');
                return;
            }
            if (!currentUploadedReceiptBase64) {
                showToast('⚠️ يرجى إرفاق صورة إيصال تحويل العربون');
                return;
            }

            const rawPhone = document.getElementById('cust-phone').value;
            const phone = normalizePhone(rawPhone);
            const clientName = `${document.getElementById('cust-first-name').value.trim()} ${document.getElementById('cust-last-name').value.trim()}`.trim();
            if (!clientName || clientName.length < 2 || clientName.length > 100) {
                showToast('⚠️ يرجى إدخال الاسم الكامل بشكل صحيح');
                return;
            }
            if (!isValidPhone(phone)) {
                showToast('⚠️ يرجى إدخال رقم هاتف صحيح (مثال: 0790000000)');
                return;
            }

            const isTransport = selectedItem.category === 'transport';
            const isPitch     = selectedItem.category === 'field';
            const { dateStr: today, hour: nowHour } = getAmmanNow();

            let bookingDate = null;
            let rpcParams = {
                p_facility_id: selectedItem.id,
                p_client_name: clientName,
                p_phone: phone,
                p_booking_date: null,
                p_receipt_data: currentUploadedReceiptBase64,
                p_shift_type: null,
                p_start_hour: null,
                p_hours: null,
                p_passengers: null,
                p_distance_km: null,
                p_is_round_trip: false,
                p_pickup_location: null,
                p_dropoff_location: null,
                p_turnstile_token: turnstileToken || null
            };

            if (TURNSTILE_SITE_KEY && !turnstileToken) {
                showToast('⚠️ يرجى إكمال خطوة التحقق الأمني (أنا لست روبوتاً) قبل إرسال الحجز');
                return;
            }

            if (isTransport) {
                const cap = Number(selectedItem.capacity) || 23;
                const passengers = parseInt(document.getElementById('trans-passengers').value, 10) || 0;
                const distance   = parseFloat(document.getElementById('trans-distance').value) || 0;
                const isRoundTrip = document.getElementById('trans-round-trip').checked;
                const tripDate   = document.getElementById('booking-date-transport').value;
                const pickupLocation  = document.getElementById('trans-pickup-location').value.trim();
                const dropoffLocation = document.getElementById('trans-dropoff-location').value.trim();

                if (!tripDate) {
                    showToast('⚠️ يرجى اختيار تاريخ الرحلة');
                    return;
                }
                if (tripDate < today) {
                    showToast('⚠️ لا يمكن الحجز في تاريخ ماضٍ');
                    return;
                }
                if (tripDate === today && nowHour >= 21) {
                    showToast('⚠️ انتهى وقت حجز النقل لهذا اليوم، يرجى اختيار تاريخ الغد');
                    return;
                }
                if (passengers < 1 || passengers > cap) {
                    showToast(`⚠️ عدد الركاب يجب أن يكون بين 1 و ${cap} راكب`);
                    return;
                }
                if (!Number.isFinite(distance) || distance <= 0 || distance > 2000) {
                    showToast('⚠️ يرجى إدخال مسافة صحيحة (1 إلى 2000 كم)');
                    return;
                }
                if (!isSafeLocationInput(pickupLocation)) {
                    showToast('⚠️ موقع الانطلاق يجب أن يكون نصاً عادياً أو رابط خرائط Google فقط');
                    return;
                }
                if (!isSafeLocationInput(dropoffLocation)) {
                    showToast('⚠️ موقع الوصول يجب أن يكون نصاً عادياً أو رابط خرائط Google فقط');
                    return;
                }
                bookingDate = tripDate;
                rpcParams.p_booking_date = tripDate;
                rpcParams.p_passengers = passengers;
                rpcParams.p_distance_km = distance;
                rpcParams.p_is_round_trip = isRoundTrip;
                rpcParams.p_pickup_location = pickupLocation;
                rpcParams.p_dropoff_location = dropoffLocation;

            } else if (isPitch) {
                const date  = document.getElementById('booking-date').value;
                const hours = parseInt(document.getElementById('pitch-hours').value, 10) || 0;
                const startHour = parseInt(document.getElementById('pitch-start-hour').value, 10) || 6;

                if (!date) { showToast('⚠️ يرجى اختيار تاريخ الحجز'); return; }
                if (date < today) { showToast('⚠️ لا يمكن الحجز في تاريخ ماضٍ'); return; }
                if (hours < 2 || hours > 18) { showToast('⚠️ الحد الأدنى لحجز الملعب ساعتان'); return; }
                if (startHour + hours > 24) { showToast('⚠️ وقت الحجز لا يمكن أن يتجاوز منتصف الليل (12:00 ص)'); return; }
                if (date === today && startHour <= nowHour) {
                    showToast('⚠️ لا يمكن حجز ساعة مضت أو بدأت من اليوم الحالي');
                    return;
                }
                bookingDate = date;
                rpcParams.p_booking_date = date;
                rpcParams.p_start_hour = startHour;
                rpcParams.p_hours = hours;

            } else {
                const date = document.getElementById('booking-date').value;
                if (!date) { showToast('⚠️ يرجى اختيار تاريخ الحجز'); return; }
                if (date < today) { showToast('⚠️ لا يمكن الحجز في تاريخ ماضٍ'); return; }
                if (isFarmShiftPastToday(date, selectedShiftType)) {
                    showToast('⚠️ انتهى وقت هذا الشفت لليوم الحالي، يرجى اختيار موعد آخر');
                    return;
                }
                bookingDate = date;
                rpcParams.p_booking_date = date;
                rpcParams.p_shift_type = selectedShiftType;
            }

            const submitBtn = document.getElementById('booking-submit-btn');
            if (submitBtn) {
                if (submitBtn.disabled) return;
                submitBtn.disabled = true;
                submitBtn._origText = submitBtn.textContent;
                submitBtn.textContent = '⏳ جاري إرسال وتأكيد الحجز...';
            }

            try {
                await refreshBookingsForItem(selectedItem.id);

                // فحص التعارض المبدئي بالمتصفح قبل إرسال الطلب للسيرفر
                const checkHFrom = isTransport ? 0 : (isPitch ? rpcParams.p_start_hour : shiftToHours(selectedShiftType)[0]);
                const checkHTo   = isTransport ? 24 : (isPitch ? (rpcParams.p_start_hour + rpcParams.p_hours) : shiftToHours(selectedShiftType)[1]);
                if (getIntervalBusyStatus(selectedItem.id, bookingDate, checkHFrom, checkHTo)) {
                    showToast('⛔ هذا الموعد محجوز أو قيد المراجعة حالياً، يرجى اختيار موعد آخر');
                    return;
                }

                // التحقق من الخصم قبل الإرسال
                // يُرسل الكود اليدوي فقط إذا قبله السيرفر في آخر معاينة للسعر (حتى لا يُرفض الحجز بسبب كود خاطئ)
                const manualCode = String(appliedPromoCode || '').toUpperCase();
                const promoAccepted = manualCode && lastServerQuote && String(lastServerQuote.promo_code || '').toUpperCase() === manualCode;
                const rpcWithPromo = { ...rpcParams, p_promo_code: promoAccepted ? manualCode : null };
                let { data: result, error } = await db.rpc('create_booking', rpcWithPromo);
                if (error && String(error.message || '').includes('create_booking')) {
                    // توافق تلقائي في حال لم يتم تحديث دالة SQL بعد
                    const fallbackRes = await db.rpc('create_booking', rpcParams);
                    result = fallbackRes.data;
                    error = fallbackRes.error;
                }
                if (error) {
                    if (error.code === '23P01') {
                        showToast('⛔ سبقك شخص آخر لحجز هذا الموعد للتو، جرب موعداً آخر');
                    } else {
                        showToast('❌ ' + (error.message || 'تعذر حفظ الحجز، تحقق من البيانات وحاول مجدداً'));
                    }
                    await refreshBookingsForItem(selectedItem.id);
                    return;
                }

                await refreshBookingsForItem(selectedItem.id);
                const bookedItem = selectedItem;
                closeModal('booking-modal');
                showToast('✅ تم إرسال طلب الحجز بنجاح! تذكرتك الإلكترونية جاهزة.');

                const ticketObj = {
                    id: Number(result?.id || Date.now().toString().slice(-5)),
                    ticketCode: String(result?.ticket_code || ('WKND-' + (result?.id || ''))),
                    facilityId: bookedItem.id,
                    itemNameAr: bookedItem.nameAr,
                    itemNameEn: bookedItem.nameEn || bookedItem.nameAr,
                    locationAr: bookedItem.locationAr,
                    lat: bookedItem.lat,
                    lng: bookedItem.lng,
                    mapUrl: bookedItem.mapUrl || '',
                    clientName,
                    phone,
                    bookingDate,
                    hourFrom: Number(result?.hour_from ?? checkHFrom ?? 0),
                    hourTo: Number(result?.hour_to ?? checkHTo ?? 24),
                    shiftType: result?.shift_type || (selectedItem.category === 'farm' ? selectedShiftType : null),
                    details: String(result?.details || ''),
                    promoCode: result?.promo_code || appliedPromoCode || null,
                    discountAmount: Number(result?.discount_amount || 0),
                    total: Number(result?.total || 0),
                    deposit: Number(result?.deposit || 0),
                    status: 'pending',
                    createdAt: new Date().toISOString()
                };

                // حفظ التذكرة محلياً على جهاز الزبون لسهولة الرجوع إليها من نافذة تتبّع حجزي
                const myLocalBookings = safeGetJSON('wknd_my_bookings', '[]');
                myLocalBookings.unshift(ticketObj);
                safeSetStorage('wknd_my_bookings', JSON.stringify(myLocalBookings.slice(0, 20)));

                // إرسال إشعار فوري لهاتف الأدمن عبر Telegram Bot (Feature 7)
                // الإشعار يُرسل تلقائياً من داخل السيرفر (create_booking RPC) لحماية التوكن ومنع الإغراق

                // فتح تذكرة الحجز الإلكترونية فوراً (Feature 3)
                setTimeout(() => openBookingTicketModal(ticketObj), 250);

                
            } catch (err) {
                // [البند 14] انقطاع الشبكة أثناء الإرسال: رسالة واضحة مع الإبقاء على بيانات النموذج كما هي
                console.error('Booking submit failed:', err?.message || '');
                showToast('📡 تعذر الاتصال بالخادم أثناء إرسال الحجز. بياناتك محفوظة في النموذج، تحقق من الإنترنت ثم اضغط إرسال مجدداً.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    if (submitBtn._origText) submitBtn.textContent = submitBtn._origText;
                }
                // رمز Turnstile صالح لمرة واحدة: تجديده بعد كل محاولة إرسال
                if (TURNSTILE_SITE_KEY && document.getElementById('booking-modal')?.classList.contains('active')) resetTurnstileWidget();
            }
        }


        


        
        // =====================================================
        //  CHAT / FAQ & TOAST (XSS SAFE)
        // =====================================================
                
        
        // =====================================================
        //  AVAILABILITY CALENDAR (Supports Farms, Pitches & Transport!)
        // =====================================================
                let calItemId = null;

        function getDayAvailabilityState(item, dateStr) {
            if (!item) return 'available';
            const daySlots = busyIntervals.filter(s => s.facilityId === item.id && s.date === dateStr);
            if (daySlots.length === 0) return 'available';

            if (item.category === 'transport') {
                return daySlots.some(s => s.status === 'confirmed') ? 'booked' : 'partial';
            }

            if (item.category === 'field') {
                // ساعات عمل الملعب من 6 صباحاً حتى 24 (18 ساعة)
                let busyHoursCount = 0;
                for (let h = 6; h < 24; h++) {
                    if (daySlots.some(s => s.hourFrom <= h && h < s.hourTo)) busyHoursCount++;
                }
                // إذا لم يتبقَ ساعتان متتاليتان على الأقل في اليوم، فاليوم محجوز بالكامل
                let hasTwoConsecutiveFree = false;
                for (let h = 6; h <= 22; h++) {
                    const free1 = !daySlots.some(s => s.hourFrom <= h && h < s.hourTo);
                    const free2 = !daySlots.some(s => s.hourFrom <= (h + 1) && (h + 1) < s.hourTo);
                    if (free1 && free2) { hasTwoConsecutiveFree = true; break; }
                }
                if (!hasTwoConsecutiveFree) return 'booked';
                if (busyHoursCount > 0) return 'partial';
                return 'available';
            }

            // المزارع والشاليهات (صباحي 0-12، مسائي 12-24)
            const morningBusy = daySlots.some(s => s.hourFrom < 12 && 0 < s.hourTo);
            const eveningBusy = daySlots.some(s => s.hourFrom < 24 && 12 < s.hourTo);
            if (morningBusy && eveningBusy) return 'booked';
            if (morningBusy || eveningBusy) return 'partial';
            return 'available';
        }

        function renderAvailCalendar(itemId) {
            calItemId = Number(itemId);
            const item  = items.find(i => i.id === calItemId);
            const year  = calCurrentDate.getFullYear();
            const month = calCurrentDate.getMonth();
            const firstDay = new Date(year, month, 1);
            const lastDay  = new Date(year, month + 1, 0);
            const { dateStr: todayStr } = getAmmanNow();

            const monthNamesAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            const monthName = currentLang === 'ar' ? monthNamesAr[month] : new Date(year, month, 1).toLocaleString('en', {month:'long'});

            let html = `<div class="avail-cal-header">
                <button type="button" data-action="cal-nav" data-dir="-1">&#8249;</button>
                <span>${escapeHtml(monthName)} ${year}</span>
                <button type="button" data-action="cal-nav" data-dir="1">&#8250;</button>
            </div>
            <div class="avail-cal-days-header">
                <span>${currentLang==='ar'?'أحد':'Sun'}</span><span>${currentLang==='ar'?'اثن':'Mon'}</span><span>${currentLang==='ar'?'ثلا':'Tue'}</span><span>${currentLang==='ar'?'أرب':'Wed'}</span><span>${currentLang==='ar'?'خمي':'Thu'}</span><span>${currentLang==='ar'?'جمع':'Fri'}</span><span>${currentLang==='ar'?'سبت':'Sat'}</span>
            </div>
            <div class="avail-cal-grid">`;

            const startDow = firstDay.getDay();
            for (let i = 0; i < startDow; i++) html += '<div class="avail-cal-day empty"></div>';

            for (let d = 1; d <= lastDay.getDate(); d++) {
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isPast  = dateStr < todayStr;
                const dow     = new Date(year, month, d).getDay();
                const isWeekend = (dow === 4 || dow === 5 || dow === 6) && (!item || item.category === 'farm');
                let cls = 'avail-cal-day', actionAttr = '', title = '';

                if (isPast) {
                    cls += ' past';
                } else {
                    const state = getDayAvailabilityState(item, dateStr);
                    if (state === 'booked') {
                        cls += ' booked';
                        title = currentLang === 'ar' ? 'محجوز بالكامل' : 'Fully booked';
                    } else if (state === 'partial') {
                        cls += ' partial';
                        title = currentLang === 'ar' ? 'محجوز جزئياً / قيد المراجعة (اضغط لاختيار الأوقات المتاحة)' : 'Partially booked (click to book free hours/shift)';
                        actionAttr = `data-action="cal-select-day" data-date="${dateStr}"`;
                    } else if (isWeekend) {
                        cls += ' weekend-av';
                        title = currentLang === 'ar' ? 'متاح (+15% نهاية الأسبوع)' : 'Available (+15% weekend)';
                        actionAttr = `data-action="cal-select-day" data-date="${dateStr}"`;
                    } else {
                        cls += ' available';
                        title = currentLang === 'ar' ? 'متاح - اضغط للحجز' : 'Available - click to book';
                        actionAttr = `data-action="cal-select-day" data-date="${dateStr}"`;
                    }
                }
                html += `<button type="button" class="${cls}" ${actionAttr} title="${escapeHtml(title)}">${d}</button>`;
            }

            html += `</div>
            <div class="avail-cal-legend">
                <span><span class="legend-dot green"></span>${currentLang === 'ar' ? 'متاح' : 'Available'}</span>
                <span><span class="legend-dot blue"></span>${currentLang === 'ar' ? 'متاح (نهاية أسبوع)' : 'Available (weekend)'}</span>
                <span><span class="legend-dot orange"></span>${currentLang === 'ar' ? 'جزئي / قيد المراجعة' : 'Partial / Pending'}</span>
                <span><span class="legend-dot red"></span>${currentLang === 'ar' ? 'محجوز بالكامل' : 'Fully Booked'}</span>
            </div>`;

            document.getElementById('avail-calendar').innerHTML = html;
        }

        function calNavMonth(dir) {
            calCurrentDate = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() + Number(dir), 1);
            renderAvailCalendar(calItemId);
        }

        async function calSelectDay(dateStr) {
            const targetId = calItemId;
            const item = items.find(i => i.id === targetId);
            closeModal('details-modal');
            await openBookingModal(targetId);
            if (item && item.category !== 'transport') {
                const dateInput = document.getElementById('booking-date');
                if (dateInput) {
                    dateInput.value = dateStr;
                    onBookingDateChange();
                }
            } else {
                const dateInput = document.getElementById('booking-date-transport');
                if (dateInput) {
                    dateInput.value = dateStr;
                    updateBookingCalculation();
                }
            }
        }


        function getPropertyDeepLink(id) {
            return `${window.location.origin}${window.location.pathname}?venue=${Number(id)}`;
        }

        function copyPropertyDeepLink(id) {
            const item = items.find(i => i.id === Number(id));
            if (!item) return;
            const link = getPropertyDeepLink(item.id);
            if (navigator.clipboard) {
                navigator.clipboard.writeText(link).then(() => {
                    showToast('🔗 تم نسخ الرابط المباشر للمنشأة بنجاح!');
                }).catch(() => {});
            } else {
                showToast('🔗 رابط المنشأة: ' + link);
            }
        }

        function sharePropertyWhatsApp(id) {
            const item = items.find(i => i.id === Number(id));
            if (!item) return;
            const name     = localizedItemText(item, 'name');
            const location = localizedItemText(item, 'location');
            let priceInfo;
            if (item.category === 'transport') {
                priceInfo = `سعر الكيلو: ${item.pricePerKm} JOD | سعر الشخص: ${item.pricePerPerson} JOD`;
            } else if (item.category === 'field') {
                priceInfo = `⏰ ${item.hourlyRate} JOD/ساعة | عربون 5 JOD`;
            } else {
                priceInfo = `☀️ ${item.priceDay} | 🌙 ${item.priceNight} | 🗓️ ${item.priceFull} JOD`;
            }
            const deepLink = getPropertyDeepLink(item.id);
            const text = encodeURIComponent(
                `🌴 *${name}*\n📍 ${location}\n\n💰 الأسعار: ${priceInfo}\n\n⭐ التقييم: ${Number(item.rating || 5).toFixed(1)}/5\n\n📅 لمشاهدة الصور والتفاصيل والحجز المباشر عبر منصة Weekend:\n${deepLink}`
            );
            window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
        }

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
            const ticketCode = String(b.ticketCode || b.ticket_code || `WKND-${b.id}`);
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
                            <div class="ticket-info-item" style="grid-column:1/-1;background:#FFF9EF;padding:9px 11px;border-radius:10px;border:1.5px solid #E5C384;">
                                <strong style="color:var(--primary-dark);margin-bottom:4px;">📞 أرقام التواصل المباشر (صاحب المنشأة والحارس / السائق)</strong>
                                ${status === 'confirmed'
                                    ? ( (b.ownerPhone || b.guardPhone)
                                        ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
                                            ${b.ownerPhone ? `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>👤 صاحب المنشأة: <strong style="direction:ltr;display:inline-block;">${escapeHtml(b.ownerPhone)}</strong></span><span style="display:inline-flex;gap:6px;"><a href="tel:${escapeHtml(normalizePhone(b.ownerPhone))}" class="copy-chip-btn" style="text-decoration:none;">📞 اتصال</a><a href="https://wa.me/${escapeHtml(toWhatsAppPhone(b.ownerPhone))}" target="_blank" rel="noopener noreferrer" class="copy-chip-btn" style="text-decoration:none;background:#E8F5E9;border-color:#2E7D32;color:#1B5E20;">💬 واتساب</a></span></div>` : ''}
                                            ${b.guardPhone ? `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><span>🛡️ الحارس / السائق: <strong style="direction:ltr;display:inline-block;">${escapeHtml(b.guardPhone)}</strong></span><span style="display:inline-flex;gap:6px;"><a href="tel:${escapeHtml(normalizePhone(b.guardPhone))}" class="copy-chip-btn" style="text-decoration:none;">📞 اتصال</a><a href="https://wa.me/${escapeHtml(toWhatsAppPhone(b.guardPhone))}" target="_blank" rel="noopener noreferrer" class="copy-chip-btn" style="text-decoration:none;background:#E8F5E9;border-color:#2E7D32;color:#1B5E20;">💬 واتساب</a></span></div>` : ''}
                                           </div>`
                                        : `<span style="color:var(--text-muted);font-size:0.82rem;">للتواصل المباشر: 0781929509</span>`
                                      )
                                    : `<span style="color:#5A6960;font-size:0.82rem;font-weight:500;">🔒 سيظهر رقم صاحب المنشأة ورقم الحارس / السائق هنا تلقائياً فور تأكيد الحجز من الإدارة.</span>`
                                }
                            </div>
                            <div class="ticket-info-item" style="grid-column:1/-1;background:#EFF8FF;padding:8px 10px;border-radius:10px;border:1px solid #90CAF9;">
                                <strong style="color:#0D47A1;">🗺️ موقع المنشأة على الخريطة (Google Maps)</strong>
                                ${status === 'confirmed'
                                    ? `<a href="${escapeHtml(mapsHref)}" target="_blank" rel="noopener noreferrer" style="color:#1565C0;font-weight:700;text-decoration:underline;word-break:break-all;font-size:0.84rem;display:inline-block;margin-top:2px;">📍 اضغط هنا لفتح الموقع الدقيق على Google Maps</a>`
                                    : `<span style="color:#5A6960;font-size:0.82rem;font-weight:500;">🔒 سيظهر رابط اللوكيشن الدقيق هنا تلقائياً فور تأكيد الحجز من الإدارة.</span>`
                                }
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
                (status === "confirmed" && b.ownerPhone ? `📞 رقم صاحب المنشأة: ${b.ownerPhone}\n` : "") +
                (status === "confirmed" && b.guardPhone ? `🛡️ رقم الحارس / السائق: ${b.guardPhone}\n` : "") +
                (status === "confirmed" ? `📍 رابط اللوكيشن على الخريطة:\n${mapsHref}` : "⏳ بانتظار تأكيد الإدارة لإظهار الموقع وأرقام التواصل")
            );
            const waBtn = document.getElementById('btn-share-ticket-wa');
            if (waBtn) waBtn.href = `https://wa.me/?text=${waText}`;

            renderRandomBusUpsellInTicket(b, fac, venueName, venueLoc);
            updateTicketSplitShareUI(b, venueName, ticketCode);
            renderTicketChangeRequestUI(b);
            openModalSafely('ticket-modal');
        }

        
        
        
        async function bookUpsellBusFromTicket(busId) {
            const ticket = currentTicketBooking;
            closeModal('ticket-modal');
            await openBookingModal(Number(busId));
            if (ticket) {
                const nameParts = String(ticket.clientName || '').trim().split(/\s+/);
                const firstInp = document.getElementById('cust-first-name');
                const lastInp  = document.getElementById('cust-last-name');
                const phoneInp = document.getElementById('cust-phone');
                const dateInp  = document.getElementById('booking-date-transport');
                const dropInp  = document.getElementById('trans-dropoff-location');

                if (firstInp && nameParts[0]) firstInp.value = nameParts[0];
                if (lastInp && nameParts.length > 1) lastInp.value = nameParts.slice(1).join(' ');
                if (phoneInp && ticket.phone) phoneInp.value = ticket.phone;
                const bDate = ticket.bookingDate || ((String(ticket.details || '').match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '');
                if (dateInp && bDate) dateInp.value = bDate;
                if (dropInp) {
                    const dest = [ticket.itemNameAr, ticket.locationAr].filter(Boolean).join(' — ');
                    if (dest) dropInp.value = dest;
                }
                updateBookingCalculation();
            }
        }

        
        async function triggerInstallPwa() {
            // 1) إذا كان المتصفح يدعم نافذة التثبيت التلقائية المباشرة (Chrome على أندرويد/كمبيوتر)، نفتحها فوراً
            if (window.__deferredPwaPrompt) {
                const promptEvent = window.__deferredPwaPrompt;
                promptEvent.prompt();
                try {
                    const choice = await promptEvent.userChoice;
                    if (choice && choice.outcome === 'accepted') {
                        showToast('✅ جاري تثبيت تطبيق Weekend على جهازك!');
                    }
                } catch (e) {}
                window.__deferredPwaPrompt = null;
                return;
            }

            // 2) إذا كان التطبيق مثبتاً ومفتوحاً أصلاً بوضع Standalone
            if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
                showToast('✅ تطبيق Weekend مثبّت ومفتوح بالفعل على هاتفك!');
                return;
            }

            // 3) عرض نافذة مرئية واضحة ومخصصة حسب نوع هاتف الزائر (آيفون / أندرويد / متصفح واتساب وانستغرام)
            const ua = navigator.userAgent || '';
            const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
            const isInApp = /FBAN|FBAV|Instagram|WhatsApp|Snapchat|TikTok/i.test(ua);
            const stepsBox = document.getElementById('pwa-install-steps-body');

            if (stepsBox) {
                if (isInApp) {
                    stepsBox.innerHTML = `
                        <div style="color:#B27517;font-weight:700;margin-bottom:6px;">⚠️ أنت تفتح الموقع الآن من داخل تطبيق محادثة:</div>
                        <div><strong>1️⃣</strong> اضغط على النقاط الثلاث <strong>(⋮)</strong> أو سهم المشاركة في أعلى الشاشة واختر <strong>«الفتح في المتصفح / Open in Browser»</strong> (Chrome أو Safari).</div>
                        <div style="margin-top:6px;"><strong>2️⃣</strong> بعد فتحه في المتصفح، اختر <strong>«إضافة إلى الشاشة الرئيسية / Install App»</strong> لينزل التطبيق على هاتفك فوراً.</div>`;
                } else if (isIOS) {
                    stepsBox.innerHTML = `
                        <div style="color:var(--primary-dark);font-weight:700;margin-bottom:6px;">🍎 خطوات التثبيت السريع على آيفون (Safari):</div>
                        <div><strong>1️⃣</strong> اضغط على أيقونة <strong>المشاركة (Share ⬆️)</strong> في الشريط السفلي لمتصفح Safari.</div>
                        <div style="margin-top:6px;"><strong>2️⃣</strong> مرّر للأسفل واضغط على <strong>«➕ إضافة إلى الشاشة الرئيسية / Add to Home Screen»</strong> ثم اضغط <strong>إضافة (Add)</strong>.</div>`;
                } else {
                    stepsBox.innerHTML = `
                        <div style="color:var(--primary-dark);font-weight:700;margin-bottom:6px;">🤖 خطوات التثبيت السريع على هاتفك (Android / Chrome):</div>
                        <div><strong>1️⃣</strong> اضغط على زر قائمة المتصفح <strong>(⋮ ثلاث نقاط)</strong> في أعلى يمين أو يسار الشاشة.</div>
                        <div style="margin-top:6px;"><strong>2️⃣</strong> اختر <strong>«📲 تثبيت التطبيق / Install app»</strong> أو <strong>«الإضافة إلى الشاشة الرئيسية»</strong> ثم اضغط تثبيت.</div>`;
                }
            }
            openModalSafely('pwa-install-modal');
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

            // 2) إذا جاءت التذكرة الآن مباشرة من قاعدة البيانات (track_my_bookings)، نعتمد حالتها الحقيقية مباشرة دون تضارب مع الكاش
            if (b._fromServer) {
                return b.status || 'pending';
            }

            const numId = Number(b.id);
            const facId = Number(b.facilityId || b.itemId || b.facility_id);
            const bDate = String(b.bookingDate || b.booking_date || '').trim() ||
                          ((String(b.details || '').match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '');
            const bDetails = String(b.details || '').trim();

            

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
                if (slotMatches.some(s => s.status === 'confirmed')) return 'confirmed';
                if (slotMatches.some(s => s.status === 'pending')) return 'pending';
                const createdMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (slotMatches.length === 0 && (!createdMs || (Date.now() - createdMs > 10000))) {
                    return 'deleted';
                }
            }

            return b.status || 'pending';
        }

        async function syncLocalBookingsWithDatabase(phoneFilter = '', codeFilter = null) {
            const savedList = safeGetJSON('wknd_my_bookings', '[]');
            const targetPhone = normalizePhone(phoneFilter || (savedList[0] ? savedList[0].phone : ''));
            const targetCode = (codeFilter !== null && codeFilter !== undefined && String(codeFilter).trim() !== '')
                ? String(codeFilter).trim().replace(/^#/, '').toUpperCase()
                : (savedList[0] ? String(savedList[0].ticketCode || ('WKND-' + savedList[0].id)).toUpperCase() : '');

            let serverResults = null;
            if (db && targetPhone && isValidPhone(targetPhone) && targetCode) {
                try {
                    // استدعاء قاعدة البيانات دائماً برقم الهاتف ورمز التذكرة العشوائي
                    const { data, error } = await db.rpc('track_my_bookings', {
                        p_phone: targetPhone,
                        p_ticket_code: targetCode
                    });
                    if (error && /إيقاف المحاولات/.test(String(error.message || ''))) {
                        showToast('⛔ ' + error.message);
                    }
                    if (!error && Array.isArray(data)) {
                        serverResults = data.map(r => ({
                            id: Number(r.id),
                            ticketCode: String(r.ticket_code || ('WKND-' + r.id)),
                            changeRequestType: r.change_request_type || null,
                            changeRequestStatus: r.change_request_status || null,
                            ownerPhone: r.owner_phone || null,
                            guardPhone: r.guard_phone || null,
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
                            status: r.status || 'pending',
                            _fromServer: true
                        })).filter(item => !isTicketExpiredByTime(item) && (item.status === 'pending' || item.status === 'confirmed'));
                    }
                } catch (e) {}
            }

            // تحديث ودمج نتائج السيرفر مع الذاكرة المحلية دون مسح بقية التذاكر الموجودة على نفس الرقم
            const updatedLocal = [...savedList];
            if (Array.isArray(serverResults)) {
                serverResults.forEach(srv => {
                    const cleanSrv = { ...srv };
                    delete cleanSrv._fromServer;
                    const idx = updatedLocal.findIndex(x => Number(x.id) === Number(srv.id));
                    if (idx !== -1) {
                        updatedLocal[idx] = { ...updatedLocal[idx], ...cleanSrv };
                    } else {
                        updatedLocal.unshift(cleanSrv);
                    }
                });
                // إذا أرجع السيرفر نتيجة فارغة للرمز المبحوث عنه تحديداً، نحذف فقط ذلك الرمز من الكاش المحلي إن كان موجوداً
                if (serverResults.length === 0 && targetCode) {
                    const cleanNum = targetCode.replace(/^WKND-/i, '');
                    for (let i = updatedLocal.length - 1; i >= 0; i--) {
                        const x = updatedLocal[i];
                        const samePhone = normalizePhone(x.phone).slice(-9) === targetPhone.slice(-9);
                        const sameCode = String(x.ticketCode || ('WKND-' + x.id)).toUpperCase() === targetCode || String(x.id) === cleanNum;
                        if (samePhone && sameCode) {
                            updatedLocal.splice(i, 1);
                        }
                    }
                }
            }
            const prunedLocal = updatedLocal.filter(x => !isTicketExpiredByTime(x)).slice(0, 20);
            safeSetStorage('wknd_my_bookings', JSON.stringify(prunedLocal));

            // عند البحث الصريح من السيرفر، نعيد نتائج السيرفر الحية مباشرة (تشمل أي تعديلات أجراها الأدمن على الموعد أو الاسم أو السعر)
            if (serverResults !== null) {
                return serverResults;
            }

            // وضع احتياطي فقط في حال تعذر الاتصال بالسيرفر
            return prunedLocal.filter(b => {
                const pMatch = !targetPhone || normalizePhone(b.phone).slice(-9) === targetPhone.slice(-9);
                const cleanNum = targetCode.replace(/^WKND-/i, '');
                const cMatch = !targetCode || String(b.ticketCode || ('WKND-' + b.id)).toUpperCase() === targetCode || String(b.id) === cleanNum;
                return pMatch && cMatch;
            });
        }

        async function openTrackBookingModal() {
            openModalSafely('track-booking-modal');
            const savedList = safeGetJSON('wknd_my_bookings', '[]');
            const phoneInp = document.getElementById('track-phone-input');
            const idInp = document.getElementById('track-id-input');
            if (savedList.length > 0) {
                if (phoneInp && !phoneInp.value) phoneInp.value = savedList[0].phone || '';
                if (idInp && !idInp.value) idInp.value = savedList[0].ticketCode || ('WKND-' + savedList[0].id);
            }
            const currentPhone = phoneInp ? phoneInp.value.trim() : '';
            const currentCode = idInp ? idInp.value.trim().replace(/^#/, '').toUpperCase() : '';
            if (currentPhone && currentCode) {
                const synced = await syncLocalBookingsWithDatabase(currentPhone, currentCode);
                renderTrackBookingResults(synced);
            } else {
                renderTrackBookingResults([]);
            }
        }

        function renderTrackBookingResults(list) {
            const container = document.getElementById('track-results-container');
            if (!container) return;
            const validList = (Array.isArray(list) ? list : []).filter(b => {
                const st = resolveLiveBookingStatus(b);
                b.status = st;
                return st === 'confirmed' || st === 'pending';
            });
            if (validList.length === 0) {
                container.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-muted);background:#FAFBFB;border-radius:12px;">لا توجد تذكرة حجز نشطة مطابقة لرقم الهاتف ورمز التذكرة المدخل.<br><small style="color:#888;">(تأكد من كتابة رمز التذكرة الصحيح مثل WKND-7F3A9C، وتنتهي التذكرة تلقائياً بعد انتهاء موعد الحجز أو إلغائه)</small></div>`;
                container._lastResults = [];
                return;
            }
            container.innerHTML = validList.map((b, idx) => {
                const badge = b.status === 'confirmed'
                    ? '<span class="badge-status active">✅ مؤكد رسمياً</span>'
                    : '<span class="badge-status editing">⏳ قيد المراجعة</span>';
                const vName = (currentLang === 'ar' ? b.itemNameAr : b.itemNameEn) || b.item_name_ar || 'منشأة';
                const displayCode = b.ticketCode || ('WKND-' + b.id);
                return `
                    <div class="track-result-card">
                        <div style="flex:1;min-width:200px;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                <strong style="color:var(--primary-dark);font-size:0.95rem;">#${escapeHtml(displayCode)} — ${escapeHtml(vName)}</strong>
                                ${badge}
                            </div>
                            <div style="font-size:0.83rem;color:#555;margin-bottom:3px;">📅 ${escapeHtml(b.details || b.bookingDate || b.booking_date || '')}</div>
                            <div style="font-size:0.82rem;color:var(--primary-dark);font-weight:700;">الإجمالي: ${Number(b.total || 0).toFixed(2)} JOD | العربون: ${Number(b.deposit || 0).toFixed(2)} JOD</div>
                        </div>
                        <button type="button" class="btn-action" data-action="open-tracked-ticket" data-idx="${idx}" style="font-size:0.82rem;padding:0.45rem 0.9rem;">🎫 عرض التذكرة</button>
                    </div>`;
            }).join('');
            container._lastResults = validList;
        }

        async function handleTrackBookingSubmit(e) {
            e.preventDefault();
            const rawPhone = document.getElementById('track-phone-input').value;
            const rawCodeInput = document.getElementById('track-id-input').value.trim().replace(/^#/, '').toUpperCase();
            const cleanPhone = normalizePhone(rawPhone);
            if (!isValidPhone(cleanPhone)) {
                showToast('⚠️ يرجى إدخال رقم هاتف صحيح');
                return;
            }
            if (!rawCodeInput || rawCodeInput.length < 1) {
                showToast('⚠️ يرجى إدخال رمز التذكرة (مثال: WKND-7F3A9C) مع رقم الهاتف للتحقق الآمن');
                return;
            }
            const btn = document.getElementById('track-submit-btn');
            if (btn) btn.disabled = true;

            try {
                const results = await syncLocalBookingsWithDatabase(cleanPhone, rawCodeInput);
                renderTrackBookingResults(results);
            } finally {
                if (btn) btn.disabled = false;
            }
        }


        // =====================================================
        //  CENTRAL EVENT DELEGATION & INITIALIZATION (CSP SAFE)
        // =====================================================
        // معالجة تلقائية لأي صورة معطلة (Broken Image Fallback) لضمان عدم ظهور أيقونة صورة مكسورة أبداً
        
            
        // =====================================================
        //  V2 CUSTOMER FEATURES: SPLIT COST, COMPARE, SELF-SERVICE CANCEL/RESCHEDULE, BUNDLE
        // =====================================================
        function updateBookingSplitDisplay(total, deposit) {
            lastCalculatedBookingTotal = Number(total) || 0;
            lastCalculatedBookingDeposit = Number(deposit) || 0;
            const cnt = Math.max(1, parseInt(document.getElementById('split-people-count')?.value, 10) || 1);
            const resEl = document.getElementById('split-cost-result');
            if (!resEl) return;
            if (lastCalculatedBookingTotal <= 0) {
                resEl.textContent = '';
                return;
            }
            const perTotal = (lastCalculatedBookingTotal / cnt).toFixed(2);
            const perDep = (lastCalculatedBookingDeposit / cnt).toFixed(2);
            resEl.textContent = cnt > 1
                ? `حصة كل شخص (${cnt} أشخاص): ${perTotal} JOD إجمالي (منها ${perDep} JOD عربون)`
                : `أدخل عدد الأشخاص (مثلاً 8 أو 10) لحساب نصيب كل شخص فوراً.`;
        }

        function updateTicketSplitShareUI(b, venueName, ticketCode) {
            const cnt = Math.max(2, parseInt(document.getElementById('ticket-split-count')?.value, 10) || 6);
            const total = Number(b.total || 0);
            const dep = Number(b.deposit || 0);
            const perTotal = (total / cnt).toFixed(2);
            const perDep = (dep / cnt).toFixed(2);
            const sumEl = document.getElementById('ticket-split-summary');
            const waBtn = document.getElementById('btn-share-split-wa');
            if (sumEl) {
                sumEl.textContent = `لكل شخص (${cnt} أشخاص): ${perTotal} JOD إجمالي | العربون للفرد: ${perDep} JOD`;
            }
            if (waBtn) {
                const msg = encodeURIComponent(
                    `🌴 حجزنا في *${venueName}* عبر منصة Weekend!\n` +
                    `🎫 رقم التذكرة: #${ticketCode}\n` +
                    `📅 ${b.details || b.bookingDate || ''}\n` +
                    `💰 الإجمالي: ${total.toFixed(2)} JOD (مقسّم على ${cnt} أشخاص)\n` +
                    `👤 حصة كل شخص: *${perTotal} JOD* (العربون للفرد: ${perDep} JOD)`
                );
                waBtn.href = `https://wa.me/?text=${msg}`;
            }
        }

        function renderTicketChangeRequestUI(b) {
            const stEl = document.getElementById('ticket-change-req-status');
            const ctrlEl = document.getElementById('ticket-change-req-controls');
            const noteEl = document.getElementById('ticket-change-note');
            if (!stEl || !ctrlEl) return;
            if (noteEl) noteEl.value = '';
            if (b.changeRequestStatus === 'pending') {
                const lbl = b.changeRequestType === 'cancel' ? 'طلب إلغاء الحجز' : 'طلب تغيير الموعد';
                stEl.style.display = 'block';
                stEl.textContent = `⏳ لديك (${lbl}) قيد المراجعة من الإدارة حالياً — سيتم التواصل معك قريباً.`;
                ctrlEl.style.display = 'none';
            } else {
                stEl.style.display = 'none';
                ctrlEl.style.display = 'block';
            }
        }

        async function submitBookingChangeRequest(reqType) {
            if (!currentTicketBooking || !db) return;
            const note = (document.getElementById('ticket-change-note')?.value || '').trim();
            const label = reqType === 'cancel' ? 'إلغاء الحجز' : 'تغيير الموعد';
            if (!confirm(`هل تريد إرسال طلب (${label}) للإدارة الآن؟`)) return;
            const code = String(currentTicketBooking.ticketCode || currentTicketBooking.ticket_code || `WKND-${currentTicketBooking.id}`);
            const { data, error } = await db.rpc('request_booking_change', {
                p_phone: currentTicketBooking.phone,
                p_ticket_code: code,
                p_request_type: reqType,
                p_note: note
            });
            if (error || (data && data.ok === false)) {
                showToast('⚠️ ' + (error?.message || data?.error || 'تعذر إرسال الطلب حالياً'));
                return;
            }
            currentTicketBooking.changeRequestType = reqType;
            currentTicketBooking.changeRequestStatus = 'pending';
            renderTicketChangeRequestUI(currentTicketBooking);
            showToast('✅ تم إرسال طلبك للإدارة بنجاح وسيصلك الرد قريباً!');
        }

        function toggleCompareItem(id, btnEl) {
            const numId = Number(id);
            if (compareIds.has(numId)) {
                compareIds.delete(numId);
                if (btnEl) { btnEl.classList.remove('selected'); btnEl.setAttribute('aria-pressed', 'false'); }
            } else {
                if (compareIds.size >= 3) {
                    showToast('⚖️ يمكنك مقارنة 3 منشآت كحد أقصى في نفس الوقت');
                    return;
                }
                compareIds.add(numId);
                if (btnEl) { btnEl.classList.add('selected'); btnEl.setAttribute('aria-pressed', 'true'); }
            }
            updateCompareFloatBar();
        }

        function updateCompareFloatBar() {
            const bar = document.getElementById('compare-float-bar');
            const lbl = document.getElementById('compare-float-label');
            if (!bar || !lbl) return;
            if (compareIds.size > 0) {
                bar.classList.add('active');
                lbl.textContent = `تم اختيار ${compareIds.size} للمقارنة (من 3)`;
            } else {
                bar.classList.remove('active');
            }
        }

        function openCompareModal() {
            const selected = items.filter(i => compareIds.has(i.id));
            if (selected.length < 2) {
                showToast('⚖️ اختر منشأتين على الأقل للمقارنة بينهما');
                return;
            }
            const container = document.getElementById('compare-table-container');
            if (!container) return;
            const headerCells = selected.map(i => `<th style="background:var(--primary-dark);color:var(--accent-gold);">${escapeHtml(localizedItemText(i, 'name'))}</th>`).join('');
            const priceCells = selected.map(i => {
                if (i.category === 'transport') return `<td>${i.pricePerKm} JOD/كم | ${i.pricePerPerson} JOD/شخص</td>`;
                if (i.category === 'field') return `<td>${i.hourlyRate} JOD/ساعة (عربون 5 JOD)</td>`;
                return `<td>صباحي: ${i.priceDay} | مسائي: ${i.priceNight} | كامل: ${i.priceFull} JOD</td>`;
            }).join('');
            const locCells = selected.map(i => `<td>📍 ${escapeHtml(localizedItemText(i, 'location'))}</td>`).join('');
            const ratingCells = selected.map(i => `<td>⭐ ${Number(i.rating || 5).toFixed(1)} / 5</td>`).join('');
            const depCells = selected.map(i => `<td>${Number(i.securityDeposit || 0) > 0 ? Number(i.securityDeposit) + ' JOD مسترد' : 'لا يوجد تأمين'}</td>`).join('');
            const amCells = selected.map(i => {
                const list = (i.amenities || []).map(a => AMENITIES_MAP[a] ? `${AMENITIES_MAP[a].icon} ${AMENITIES_MAP[a].labelAr}` : '').filter(Boolean);
                return `<td>${list.length ? escapeHtml(list.join(' • ')) : '—'}</td>`;
            }).join('');
            const policyCells = selected.map(i => `<td><small>${escapeHtml(localizedPolicyText(i) || 'حسب سياسة المنصة')}</small></td>`).join('');
            const actionCells = selected.map(i => `<td><button type="button" class="btn-action" style="width:100%;" data-action="book-from-compare" data-id="${i.id}">ابدأ الحجز</button></td>`).join('');

            container.innerHTML = `<table class="compare-table">
                <thead><tr><th>المعيار</th>${headerCells}</tr></thead>
                <tbody>
                    <tr><th>الموقع</th>${locCells}</tr>
                    <tr><th>الأسعار</th>${priceCells}</tr>
                    <tr><th>التقييم</th>${ratingCells}</tr>
                    <tr><th>التأمين المسترد</th>${depCells}</tr>
                    <tr><th>الخصوصية والمرافق</th>${amCells}</tr>
                    <tr><th>سياسة الإلغاء</th>${policyCells}</tr>
                    <tr><th>الإجراء</th>${actionCells}</tr>
                </tbody>
            </table>`;
            openModalSafely('compare-modal');
        }

        document.addEventListener('DOMContentLoaded', async () => {
            // Setup direct listeners
            document.getElementById('hamburger-btn')?.addEventListener('click', toggleMobileMenu);
            document.getElementById('lang-toggle-btn')?.addEventListener('click', toggleLanguage);
            let searchDebounceTimer = null;
            document.getElementById('search-location')?.addEventListener('input', () => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(liveSearch, 100);
            });
            document.getElementById('search-category')?.addEventListener('change', liveSearch);
            document.getElementById('search-region')?.addEventListener('change', liveSearch);
            initPwaManifestAndPrompt();
            document.getElementById('sort-order-select')?.addEventListener('change', function() {
                currentSortOrder = this.value || 'fair';
                liveSearch();
            });
            document.getElementById('review-form')?.addEventListener('submit', submitReview);
            document.getElementById('booking-form')?.addEventListener('submit', processBooking);
            document.getElementById('booking-date')?.addEventListener('change', onBookingDateChange);
            document.getElementById('pitch-start-hour')?.addEventListener('change', updateBookingCalculation);
            document.getElementById('pitch-hours')?.addEventListener('input', updateBookingCalculation);
            document.getElementById('trans-passengers')?.addEventListener('input', updateBookingCalculation);
            document.getElementById('trans-distance')?.addEventListener('input', updateBookingCalculation);
            document.getElementById('trans-round-trip')?.addEventListener('change', updateBookingCalculation);
            document.getElementById('cliq-receipt')?.addEventListener('change', function() { handleReceiptFileChange(this); });
            document.getElementById('chat-toggle-btn')?.addEventListener('click', toggleChat);
            document.getElementById('chat-close-btn')?.addEventListener('click', toggleChat);
            document.getElementById('det-book-btn')?.addEventListener('click', function() {
                const id = this.dataset.id;
                closeModal('details-modal');
                if (id) openBookingModal(Number(id));
            });
            document.getElementById('det-wa-share-btn')?.addEventListener('click', function() {
                const id = this.dataset.id;
                if (id) sharePropertyWhatsApp(Number(id));
            });
            document.getElementById('det-copy-link-btn')?.addEventListener('click', function() {
                const id = this.dataset.id;
                if (id) copyPropertyDeepLink(Number(id));
            });
            document.getElementById('booking-date-transport')?.addEventListener('change', updateBookingCalculation);
            document.getElementById('btn-apply-promo')?.addEventListener('click', applyBookingPromoCode);
            document.getElementById('btn-clear-promo')?.addEventListener('click', clearBookingPromoCode);
            document.getElementById('track-booking-form')?.addEventListener('submit', handleTrackBookingSubmit);
            document.getElementById('btn-download-ticket-pdf')?.addEventListener('click', downloadTicketPDF);
            document.getElementById('btn-copy-ticket-id')?.addEventListener('click', () => {
                if (currentTicketBooking && navigator.clipboard) {
                    const code = currentTicketBooking.ticketCode || ('WKND-' + currentTicketBooking.id);
                    navigator.clipboard.writeText(code).then(() => showToast('✅ تم نسخ رقم التذكرة: ' + code)).catch(() => {});
                }
            });
            document.getElementById('det-main-img')?.addEventListener('click', function() {
                if (this.src) openImageModal(this.src, selectedItem ? localizedItemText(selectedItem, 'name') : 'معاينة الصورة');
            });

            // Direct listeners for V2 customer features
            document.getElementById('split-people-count')?.addEventListener('input', () => updateBookingSplitDisplay(lastCalculatedBookingTotal, lastCalculatedBookingDeposit));
            document.getElementById('ticket-split-count')?.addEventListener('input', () => { if (currentTicketBooking) updateTicketSplitShareUI(currentTicketBooking, currentTicketBooking.itemNameAr || 'المنشأة', currentTicketBooking.ticketCode || ('WKND-' + currentTicketBooking.id)); });
            document.getElementById('btn-req-reschedule')?.addEventListener('click', () => submitBookingChangeRequest('reschedule'));
            document.getElementById('btn-req-cancel')?.addEventListener('click', () => submitBookingChangeRequest('cancel'));
            document.getElementById('btn-open-compare')?.addEventListener('click', openCompareModal);
            document.getElementById('btn-clear-compare')?.addEventListener('click', () => { compareIds.clear(); updateCompareFloatBar(); liveSearch(); });
            document.getElementById('det-sticky-book-btn')?.addEventListener('click', function() { const id = this.dataset.id; closeModal('details-modal'); if (id) openBookingModal(Number(id)); });
            document.getElementById('det-bundle-bus-btn')?.addEventListener('click', async function() { const busId = this.dataset.busId; const dest = this.dataset.dest; closeModal('details-modal'); if (busId) { await openBookingModal(Number(busId)); const drop = document.getElementById('trans-dropoff-location'); if (drop && dest) drop.value = dest; } });

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
                if (action === 'switch-view') {
                    switchView(el.dataset.view);
                    closeMobileMenu();
                } else if (action === 'filter-category') {
                    filterCategory(el.dataset.category);
                } else if (action === 'toggle-season') {
                    toggleSeasonFilter(el.dataset.season, el);
                } else if (action === 'open-details') {
                    openDetailsModal(Number(el.dataset.id));
                } else if (action === 'open-booking') {
                    openBookingModal(Number(el.dataset.id));
                } else if (action === 'toggle-fav') {
                    toggleFavorite(Number(el.dataset.id), el, e);
                } else if (action === 'toggle-compare') {
                    toggleCompareItem(Number(el.dataset.id), el);
                } else if (action === 'book-from-compare') {
                    closeModal('compare-modal');
                    openBookingModal(Number(el.dataset.id));
                } else if (action === 'close-modal') {
                    closeModal(el.dataset.modal);
                } else if (action === 'select-shift') {
                    selectShift(el.dataset.shift, el);
                } else if (action === 'open-terms') {
                    openTermsPage();
                } else if (action === 'chat-faq') {
                    sendChatMsg(el.dataset.q, el.dataset.a);
                } else if (action === 'cal-nav') {
                    calNavMonth(Number(el.dataset.dir));
                } else if (action === 'cal-select-day') {
                    calSelectDay(el.dataset.date);
                } else if (action === 'open-track-modal') {
                    openTrackBookingModal();
                    closeMobileMenu();
                } else if (action === 'open-tracked-ticket') {
                    const container = document.getElementById('track-results-container');
                    const list = container && container._lastResults ? container._lastResults : [];
                    const b = list[Number(el.dataset.idx)];
                    if (b) openBookingTicketModal(b);
                } else if (action === 'book-upsell-bus') {
                    bookUpsellBusFromTicket(Number(el.dataset.busId));
                } else if (action === 'rotate-upsell-bus') {
                    if (currentTicketBooking) {
                        const fac = items.find(i => i.id === Number(currentTicketBooking.facilityId || currentTicketBooking.itemId));
                        const vName = currentTicketBooking.itemNameAr || (fac ? fac.nameAr : 'المنشأة');
                        const vLoc = currentTicketBooking.locationAr || (fac ? fac.locationAr : 'الأردن');
                        renderRandomBusUpsellInTicket(currentTicketBooking, fac, vName, vLoc, true);
                    }
                } else if (action === 'install-pwa') {
                    triggerInstallPwa();
                } else if (action === 'set-trans-route') {
                    const kmInp = document.getElementById('trans-distance');
                    if (kmInp && el.dataset.km) {
                        kmInp.value = el.dataset.km;
                        const dropInp = document.getElementById('trans-dropoff-location');
                        const pickInp = document.getElementById('trans-pickup-location');
                        if (pickInp && !pickInp.value && el.dataset.from) pickInp.value = el.dataset.from;
                        if (dropInp && !dropInp.value && el.dataset.to) dropInp.value = el.dataset.to;
                        updateBookingCalculation();
                        showToast(`📍 تم تحديد المسار: ${el.dataset.to}`);
                    }
                } else if (action === 'copy-text') {
                    const txt = el.dataset.copy || '';
                    if (txt && navigator.clipboard) {
                        navigator.clipboard.writeText(txt).then(() => showToast('✅ تم نسخ: ' + txt)).catch(() => {});
                    }
                }
            });

            // Keyboard accessibility (Esc closes modals, Enter/Space activates card-img-holder)
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
                
                } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action="open-details"]')) {
                    e.preventDefault();
                    openDetailsModal(Number(e.target.dataset.id));
                }
            });

            const params = new URLSearchParams(window.location.search);

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
                    liveSearch();
                    updateFavBadge();
                }
            } catch (e) {}

            await loadFromDatabase();
            liveSearch();
            updateFavBadge();
            syncLocalBookingsWithDatabase('', null);

            // Feature 2: فتح نافذة المنشأة تلقائياً عند الدخول من رابط مشاركة مباشر (?venue=ID)
            const venueParam = params.get('venue');
            if (venueParam && !isNaN(Number(venueParam))) {
                const targetVenue = items.find(i => i.id === Number(venueParam) && i.active);
                if (targetVenue) {
                    applyVenueSeo(targetVenue);
                    openDetailsModal(targetVenue.id);
                } else {
                    setCanonicalUrl(SITE_ORIGIN + '/');
                }
            }
        });
    