// Atlas strings. The page language follows the browser (vi or en); ?lang=vi or ?lang=en overrides it.
const atlasLang = new URLSearchParams(location.search).get('lang') || navigator.language || 'en';
window.ATLAS_LANG = atlasLang.toLowerCase().startsWith('vi') ? 'vi' : 'en';

window.ATLAS_STRINGS = {
  en: {
    'nav.dashboard': 'Dashboard', 'nav.invoices': 'Invoices', 'nav.pricing': 'Pricing', 'nav.account': 'Account',
    'nav.menu': 'Open menu',
    'hero.title': 'Get paid on time, every time.',
    'hero.lead': 'Atlas sends invoices, chases late payments and reconciles your bank feed, so you can stop doing it at 11 pm.',
    'hero.cta': 'Create an invoice',
    'filters.all': 'All', 'filters.paid': 'Paid', 'filters.overdue': 'Overdue', 'filters.drafts': 'Drafts',
    'cards.sent.title': 'Sent this month', 'cards.sent.body': '128 invoices, 96% opened.',
    'cards.late.title': 'Late payments', 'cards.late.body': '7 invoices are more than 14 days late.',
    'cards.promo.title': 'Switch to annual billing', 'cards.promo.body': 'Pay yearly and get two months free.', 'cards.promo.cta': 'See plans',
    'caption.updated': 'Updated 2 minutes ago · Figures in USD',
    'invoices.title': 'Invoices', 'pricing.note': 'Prices in USD, billed monthly. Taxes may apply.',
    'profile.title': 'Profile', 'profile.name': 'Name', 'profile.email': 'Email', 'profile.company': 'Company',
    'pricing.title': 'Simple pricing that grows with you', 'pricing.lead': 'Every plan includes unlimited clients and bank sync.',
    'plan.starter': 'Starter', 'plan.growth': 'Growth', 'plan.business': 'Unlimited Business',
    'plan.month': '/month', 'plan.choose': 'Choose plan',
    'plan.starter.desc': 'For freelancers sending a few invoices a month.',
    'plan.growth.desc': 'For small teams with recurring billing.',
    'plan.business.desc': 'For companies with many entities and approvals.',
    'account.title': 'Your invoices', 'account.lead': 'Everything you have billed this quarter.',
    'table.number': 'Number', 'table.customer': 'Customer', 'table.due': 'Due', 'table.amount': 'Amount', 'table.status': 'Status',
    'status.paid': 'Paid', 'status.overdue': 'Overdue',
    'cookie.text': 'We use cookies to keep you signed in.', 'cookie.accept': 'Accept',
    'chat.label': 'Chat with support',
    'footer.copy': '© 2026 Atlas Billing, Inc.',
  },
  vi: {
    'nav.dashboard': 'Bảng điều khiển', 'nav.invoices': 'Hóa đơn', 'nav.pricing': 'Bảng giá', 'nav.account': 'Tài khoản',
    'nav.menu': 'Mở menu',
    'hero.title': 'Nhận tiền đúng hạn, mọi lúc.',
    'hero.lead': 'Atlas gửi hóa đơn, nhắc khách trả chậm và đối soát sao kê ngân hàng, để bạn không phải làm việc đó lúc 11 giờ đêm.',
    'hero.cta': 'Tạo hóa đơn',
    'filters.all': 'Tất cả hóa đơn', 'filters.paid': 'Đã thanh toán', 'filters.overdue': 'Quá hạn thanh toán', 'filters.drafts': 'Bản nháp',
    'cards.sent.title': 'Đã gửi tháng này', 'cards.sent.body': '128 hóa đơn, 96% đã được mở.',
    'cards.late.title': 'Thanh toán trễ', 'cards.late.body': '7 hóa đơn đã trễ hơn 14 ngày.',
    'cards.promo.title': 'Chuyển sang thanh toán theo năm', 'cards.promo.body': 'Trả theo năm và được tặng hai tháng.', 'cards.promo.cta': 'Xem các gói',
    'caption.updated': 'Cập nhật 2 phút trước · Số liệu tính bằng USD',
    'invoices.title': 'Hóa đơn', 'pricing.note': 'Giá tính bằng USD, thanh toán hằng tháng. Có thể cộng thêm thuế.',
    'profile.title': 'Hồ sơ', 'profile.name': 'Họ tên', 'profile.email': 'Email', 'profile.company': 'Công ty',
    'pricing.title': 'Bảng giá đơn giản, lớn lên cùng bạn', 'pricing.lead': 'Gói nào cũng có khách hàng không giới hạn và đồng bộ ngân hàng.',
    'plan.starter': 'Khởi đầu', 'plan.growth': 'Tăng trưởng', 'plan.business': 'Gói Doanh nghiệp không giới hạn',
    'plan.month': '/tháng', 'plan.choose': 'Chọn gói',
    'plan.starter.desc': 'Cho người làm tự do gửi vài hóa đơn mỗi tháng.',
    'plan.growth.desc': 'Cho nhóm nhỏ có hóa đơn định kỳ.',
    'plan.business.desc': 'Cho công ty có nhiều pháp nhân và quy trình duyệt.',
    'account.title': 'Hóa đơn của bạn', 'account.lead': 'Mọi khoản bạn đã xuất trong quý này.',
    'table.number': 'Số', 'table.customer': 'Khách hàng', 'table.due': 'Hạn', 'table.amount': 'Số tiền', 'table.status': 'Trạng thái',
    'status.paid': 'Đã trả', 'status.overdue': 'Quá hạn',
    'cookie.text': 'Chúng tôi dùng cookie để giữ bạn đăng nhập.', 'cookie.accept': 'Đồng ý',
    'chat.label': 'Trò chuyện với hỗ trợ',
    'footer.copy': '© 2026 Atlas Billing, Inc.',
  },
};

window.t = (key) => (window.ATLAS_STRINGS[window.ATLAS_LANG] || {})[key] || window.ATLAS_STRINGS.en[key] || key;

document.documentElement.lang = window.ATLAS_LANG;
document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = window.t(el.dataset.i18n); });
document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', window.t(el.dataset.i18nAria)); });
