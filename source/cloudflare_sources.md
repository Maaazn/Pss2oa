# Cloudflare Pages source notes

المصدر الرسمي: https://developers.cloudflare.com/pages/framework-guides/deploy-a-nuxt-site/ . توضح وثائق Cloudflare Pages أن المسار المعتاد هو Workers & Pages ثم Create application ثم Pages ثم Import an existing Git repository، واختيار مستودع GitHub، وتحديد فرع الإنتاج `main` وأمر البناء `npm run build` ومجلد الخرج `dist`، ثم Save and Deploy. كما تنص الوثائق على أن الربط يعيد البناء والنشر تلقائياً عند كل push لاحق إلى المستودع.

تحقق النشر: نجح أول بناء إنتاجي للمشروع `pss2oa` عبر Cloudflare Pages من الفرع `main` بتاريخ 2026-08-19. الرابط الثابت للمشروع هو `https://pss2oa.pages.dev/`. أظهر فحص المتصفح أن `window.crossOriginIsolated` يساوي `true` وأن `SharedArrayBuffer` متاح، مع وجود عنصر canvas الخاص بالنواة، ما يؤكد أن ترويسات COOP/COEP من `_headers` وصلت إلى النسخة المنشورة.

تحقق إصدار الهوية: بعد دفع تحديث الهوية، أظهر الموقع المنشور العنوان `Pss2oa · Play! Web Core` والنص التعريفي المستقل. أكد فحص المتصفح مرة أخرى أن `crossOriginIsolated=true` و`SharedArrayBuffer=true` مع وجود canvas للنواة.
