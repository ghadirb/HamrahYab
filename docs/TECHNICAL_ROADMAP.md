# نقشه راه فنی و بک‌لاگ همراه‌یاب

این سند اجرای فنی تصمیم‌های محصول را مرحله‌بندی می‌کند. هیچ مرحله‌ای به معنی پیاده‌سازی یا تست‌شدن قابلیت نیست مگر اینکه کد، آزمون و نتیجه آن در مخزن ثبت شده باشد.

## معماری هدف

### Android
- Kotlin
- Jetpack Compose و Material 3
- MVVM با مرزبندی لایه‌های domain، data و presentation
- Kotlin Coroutines و Flow
- Room برای داده محلی و صف رویدادهای موقت
- WorkManager برای کارهای قابل تعویق
- Fused Location Provider در صورت وجود Google Play Services، پشت یک abstraction
- Geofencing در دستگاه‌های سازگار
- Foreground Service فقط برای سناریوهای مجاز و با اعلان قابل مشاهده
- DataStore برای تنظیمات محلی

### Backend فعلی و مسیر تکامل
- Cloudflare Workers با JavaScript و D1 (SQLite) برای MVP آزمایشی؛ وابستگی به این ارائه‌دهنده در لایه repository و API محدود می‌ماند تا مهاجرت ممکن باشد.
- REST API نسخه‌بندی‌شده زیر `/v1`؛ قرارداد در `docs/BACKEND_API_CONTRACT.md`.
- نشست Bearer با ذخیره hash توکن در D1؛ صدور نشست، OTP و ثبت دستگاه هنوز باید با ارائه‌دهنده واقعی و چرخه امن نشست پیاده‌سازی شوند.
- کنترل دسترسی در سمت سرور برای اتصال، رضایت، درخواست موقعیت و دستگاه.
- صف/الگوی ارسال اعلان با قابلیت تعویض ارائه‌دهنده؛ انتخاب Push برای ایران هنوز نیازمند آزمون عملی است.
- ثبت audit برای رخدادهای امنیتی مهم.
- هیچ Worker یا D1 در Cloudflare مستقر نشده؛ محیط فعلی صرفاً کد و تست CI است.

### نقشه و سرویس‌های بیرونی
- لایه MapProvider قابل تعویض؛ گزینه اولیه MapLibre با منبع کاشی دارای مجوز و شرایط روشن.
- لایه PushProvider؛ FCM در دستگاه‌های سازگار و بررسی مسیر جایگزین برای سایر دستگاه‌ها.
- لایه BillingProvider برای پرداخت ریالی و انطباق با API/قوانین جاری مارکت‌ها.
- هیچ کلید محرمانه‌ای در APK قرار نگیرد.

## ماژول‌های پیشنهادی Android

- app: راه‌اندازی و navigation
- core: مدل‌های مشترک، خطاها، زمان و ابزارها
- core:designsystem: رنگ، تایپوگرافی، کامپوننت‌های RTL
- core:network: کلاینت API و مدیریت خطا
- core:database: Room و migration
- core:location: abstraction مکان‌یابی و مجوزها
- core:notifications: دریافت و نمایش اعلان
- feature:auth
- feature:devices
- feature:connections
- feature:map
- feature:family
- feature:eldercare
- feature:lostdevice
- feature:settings
- feature:subscription

تقسیم ماژول‌ها می‌تواند در شروع به پکیج‌های درون یک ماژول Android تقلیل یابد؛ چندماژوله‌کردن زودهنگام نباید سرعت MVP را کم کند.

## مدل دامنه پیشنهادی

- User: شناسه، شماره/شناسه ورود، وضعیت حساب، زمان ایجاد.
- Device: شناسه، userId، نام نمایشی، platform، آخرین حضور، وضعیت مجوزها.
- Connection: شناسه، requesterId، recipientId، status، acceptedAt، revokedAt.
- LocationSample: deviceId، latitude، longitude، accuracyMeters، capturedAt، receivedAt، provider، isMock اگر قابل تشخیص باشد.
- LocationRequest: requesterId، targetDeviceId، requestedAt، expiresAt، status.
- SafePlace: ownerId/groupId، name، center، radiusMeters، enabled.
- GeofenceEvent: deviceId، safePlaceId، eventType، occurredAt، deliveredAt.
- EmergencyAlert: senderId، deviceId، createdAt، locationSampleId اختیاری، status.
- DeviceStatus: batteryPercent اختیاری، lastSeenAt، networkStatus اختیاری.
- Subscription: ownerId، provider، productId، state، expiryAt، verifiedAt.

مقادیر مکانی و وضعیت دستگاه باید nullable و همراه timestamp باشند؛ نبود داده نباید با مقدار ساختگی پر شود.

## قراردادهای API اولیه

پیشوند: /api/v1

- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /devices/register
- GET /devices
- POST /connections/invitations
- POST /connections/invitations/{id}/accept
- POST /connections/invitations/{id}/decline
- DELETE /connections/{id}
- GET /connections
- POST /location-requests
- GET /location-requests/inbox
- POST /location-requests/{id}/respond
- POST /locations
- GET /devices/{id}/last-location
- POST /safe-places
- GET /safe-places
- PATCH /safe-places/{id}
- POST /emergency-alerts
- GET /devices/{id}/status
- POST /subscriptions/verify

همه endpointها نیازمند احراز هویت و authorization صریح هستند. شناسه قابل حدس به معنی مجوز دسترسی نیست. برای دعوت و درخواست موقعیت باید محدودیت نرخ و انقضا وجود داشته باشد.

## سیاست مکان‌یابی

- در حالت عادی از درخواست‌های کم‌تکرار و geofence استفاده شود.
- در حرکت، نرخ نمونه‌برداری با توجه به سرعت/تغییر مکان و تنظیمات کاربر افزایش یابد.
- حالت اضطراری موقت، محدود به زمان و با اعلان قابل مشاهده باشد.
- با باتری ضعیف، فعالیت غیرضروری کاهش یابد.
- هر نمونه دارای capturedAt و receivedAt باشد.
- اگر داده از آستانه تازگی تعریف‌شده عبور کرد، UI آن را stale نشان دهد.
- مجوزهای foreground و background جداگانه توضیح داده شوند و فقط در زمان نیاز درخواست شوند.

## فازهای اجرایی و معیار خروج

### Phase 0 — مخزن و تصمیم‌ها
- [x] ثبت استراتژی محصول و دامنه MVP
- [x] ثبت نقشه راه فنی
- [ ] تعیین وضعیت واقعی کد و ابزار build
- [ ] افزودن قالب گزارش تغییرات و راهنمای مشارکت

### Phase 1 — اسکلت Android
- [x] ایجاد پروژه Gradle/Kotlin قابل build
- [x] تنظیم package: ir.maliarpro.hamrahyab
- [x] Compose، Material 3 و RTL
- [ ] تکمیل Navigation و صفحات کاربردی سه بخش
- [x] بیلد debug در CI؛ توسعه UI و تست‌های ViewModel همچنان ادامه دارد

معیار خروج: build موفق در CI و اجرای صفحه اصلی روی emulator.

### Phase 2 — حساب و دستگاه
- [x] تعریف اولیه قرارداد نشست و دستگاه در API contract و D1 schema
- [ ] انتخاب و آزمون ارائه‌دهنده OTP/SMS ایرانی
- [ ] پیاده‌سازی چالش OTP، تأیید کد و صدور نشست کوتاه‌عمر/refresh امن
- [ ] ثبت/حذف دستگاه و لغو نشست با کنترل مالکیت
- [ ] ذخیره امن توکن‌ها در Android Keystore-backed storage
- [ ] تست خطاهای شبکه، rate limit و انقضای نشست

### Phase 3 — ارتباط رضایت‌مندانه
- [x] دعوت امن و یک‌بارمصرف در Worker (۲۵۶ بیت، hash، انقضای ۳۰ دقیقه و سقف روزانه)
- [x] پذیرش/رد دعوت و ساخت اتصال canonical
- [x] لغو ارتباط و توقف دسترسی از سمت API
- [x] فهرست اتصال‌های فعال برای حساب احراز‌شده
- [ ] تکمیل احراز هویت و اتصال end-to-end دو گوشی
- [ ] آزمون امنیتی عدم دسترسی شخص ثالث روی D1/Worker واقعی

### Phase 4 — مکان‌یابی
- [ ] درخواست مجوز در زمان نیاز
- [ ] دریافت موقعیت و ثبت دقت/زمان
- [ ] ارسال نمونه به Backend
- [ ] نمایش last known با برچسب تازگی
- [ ] تست قطع GPS، اینترنت و مجوز

### Phase 5 — اعلان و پس‌زمینه
- [ ] abstraction ارائه‌دهنده Push
- [ ] اعلان درخواست موقعیت و پاسخ
- [ ] رسیدگی به اعلان تکراری/دیررس
- [ ] تست Doze، battery optimization و Force Stop

### Phase 6 — مکان امن و سالمند
- [ ] Geofence و مدیریت شعاع
- [ ] SOS و تحویل اعلان به اعضای تأییدشده
- [ ] وضعیت آخرین ارتباط و باتری
- [ ] متن‌های روشن درباره عدم تضمین تحویل

### Phase 7 — گوشی گم‌شده
- [ ] اتصال دستگاه‌های متعلق به کاربر
- [ ] درخواست موقعیت تازه با انقضا
- [ ] نمایش آخرین موقعیت معتبر
- [ ] راهنمای امنیت حساب و اقدام پس از گم‌شدن

### Phase 8 — اشتراک و انتشار
- [ ] تعریف feature entitlement سمت سرور
- [ ] اعتبارسنجی خرید با سرویس پرداخت/مارکت
- [ ] تست restore و لغو اشتراک
- [ ] سیاست حریم خصوصی و شرایط استفاده
- [ ] تست امنیت، باتری، شبکه و سازگاری دستگاه
- [ ] انتشار آزمایشی در کافه‌بازار و مایکت

## تعریف Done

هر قابلیت زمانی Done است که:
1. کد قابل build و قابل بازبینی داشته باشد.
2. مسیر موفق و خطا تست شده باشد.
3. مجوز و رفتار پس‌زمینه مستند باشد.
4. داده حساس در log یا analytics افشا نشود.
5. رفتار در حالت آفلاین/قدیمی شفاف باشد.
6. معیار پذیرش و محدودیت‌ها در README یا مستند مربوطه ثبت شده باشد.
