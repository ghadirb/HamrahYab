# استقرار آزمایشی Worker

این مرحله کد Worker و اتصال D1 را آماده می‌کند؛ هنوز هیچ منبع Cloudflare ساخته یا مستقر نشده است.

## پیش‌نیازها
- حساب Cloudflare
- Node.js LTS و npm
- Wrangler
- یک D1 staging مجزا

## مراحل پس از تأیید دسترسی
1. ساخت D1 با نام hamrahyab-staging
2. جایگزینی database_id در wrangler.toml
3. اجرای migration روی staging
4. نصب وابستگی‌ها و اجرای typecheck
5. اجرای Wrangler dev و تست endpointهای بدون نشست
6. Deploy به staging و بررسی HTTPS/health
7. سپس اتصال اپ و providerهای ورود و Push

## دسترسی توکن Cloudflare که بعداً لازم می‌شود
برای استقرار Worker و ساخت D1 staging، توکن محدود با این scopeها کافی است:
- Account > Workers Scripts: Edit
- Account > D1: Edit
- Account > Account Settings: Read (فقط اگر Wrangler برای شناسایی حساب لازم داشت)
- Zone > Workers Routes: Edit فقط اگر بخواهیم دامنه اختصاصی متصل کنیم؛ برای workers.dev لازم نیست.

Resource scope را فقط روی همان Account مربوط به پروژه HamrahYab قرار بده. اگر امکان انتخاب resource محدودتر وجود داشت، فقط Worker با نام hamrahyab-api و D1 با نام hamrahyab-staging را مجاز کن. توکن DNS، Billing، User، Zone Read/Write عمومی یا دسترسی کامل حساب لازم نیست.

بهتر است فعلاً توکن نسازی. وقتی به مرحله Deploy رسیدیم، توکن را فقط در GitHub Actions Secret با نام CLOUDFLARE_API_TOKEN و شناسه حساب را در CLOUDFLARE_ACCOUNT_ID قرار می‌دهیم. توکن را در گفتگو، کد، issue، فایل یا commit قرار نده. پس از استقرار اولیه، توکن را revoke کن یا به یک secret محدودتر برای CI تبدیل کن.

## محدودیت عملیاتی
Worker تا زمانی که provider احراز هویت و فرآیند ایجاد حساب/نشست پیاده نشده، API کاربردی برای کاربران نهایی نیست. Endpointهای /v1 به نشست معتبر نیاز دارند. مسیر ورود عمداً fake یا ناامن پیاده نشده است.
