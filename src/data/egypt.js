// Egyptian governorates and cities dataset (Arabic + English)
// Compiled from standard Egyptian administrative divisions (CAPMAS). Includes
// common cities/markaz and allows manual entry where not listed.

export const EGYPT_GOVERNORATES = [
  { id: 'alex', name_ar: 'الإسكندرية', name_en: 'Alexandria' },
  { id: 'aswan', name_ar: 'أسوان', name_en: 'Aswan' },
  { id: 'asyut', name_ar: 'أسيوط', name_en: 'Asyut' },
  { id: 'beheira', name_ar: 'البحيرة', name_en: 'Beheira' },
  { id: 'beni_suef', name_ar: 'بني سويف', name_en: 'Beni Suef' },
  { id: 'cairo', name_ar: 'القاهرة', name_en: 'Cairo' },
  { id: 'dakahlia', name_ar: 'الدقهلية', name_en: 'Dakahlia' },
  { id: 'damietta', name_ar: 'دمياط', name_en: 'Damietta' },
  { id: 'faiyum', name_ar: 'الفيوم', name_en: 'Faiyum' },
  { id: 'gharbia', name_ar: 'الغربية', name_en: 'Gharbia' },
  { id: 'giza', name_ar: 'الجيزة', name_en: 'Giza' },
  { id: 'ismailia', name_ar: 'الإسماعيلية', name_en: 'Ismailia' },
  { id: 'kafr_el_sheikh', name_ar: 'كفر الشيخ', name_en: 'Kafr El Sheikh' },
  { id: 'luxor', name_ar: 'الأقصر', name_en: 'Luxor' },
  { id: 'matrouh', name_ar: 'مطروح', name_en: 'Matrouh' },
  { id: 'minya', name_ar: 'المنيا', name_en: 'Minya' },
  { id: 'monufia', name_ar: 'المنوفية', name_en: 'Monufia' },
  { id: 'new_valley', name_ar: 'الوادي الجديد', name_en: 'New Valley' },
  { id: 'north_sinai', name_ar: 'شمال سيناء', name_en: 'North Sinai' },
  { id: 'port_said', name_ar: 'بورسعيد', name_en: 'Port Said' },
  { id: 'qalyubia', name_ar: 'القليوبية', name_en: 'Qalyubia' },
  { id: 'qena', name_ar: 'قنا', name_en: 'Qena' },
  { id: 'red_sea', name_ar: 'البحر الأحمر', name_en: 'Red Sea' },
  { id: 'sharqia', name_ar: 'الشرقية', name_en: 'Sharqia' },
  { id: 'sohag', name_ar: 'سوهاج', name_en: 'Sohag' },
  { id: 'south_sinai', name_ar: 'جنوب سيناء', name_en: 'South Sinai' },
  { id: 'suez', name_ar: 'السويس', name_en: 'Suez' },
]

export const EGYPT_CITIES = {
  'القاهرة': ['القاهرة', 'مدينة نصر', 'المعادي', 'حلوان', 'شبرا', 'مصر الجديدة', 'التجمع الخامس', 'التجمع الأول'],
  'Cairo': ['Cairo', 'Nasr City', 'Maadi', 'Helwan', 'Shubra', 'Heliopolis', 'New Cairo'],
  'الجيزة': ['الجيزة', '6 أكتوبر', 'الشيخ زايد', 'الدقي', 'المهندسين', 'العجوزة'],
  'Giza': ['Giza', '6th of October', 'Sheikh Zayed', 'Dokki', 'Mohandessin', 'Agouza'],
  'الإسكندرية': ['الإسكندرية', 'سموحة', 'المنتزه', 'العجمي', 'برج العرب'],
  'Alexandria': ['Alexandria', 'Smouha', 'Montaza', 'Agami', 'Borg El Arab'],
  'الإسماعيلية': ['الإسماعيلية', 'فايد', 'القنطرة شرق', 'القنطرة غرب'],
  'Ismailia': ['Ismailia', 'Fayed', 'Qantara East', 'Qantara West'],
  'بورسعيد': ['بورسعيد', 'بورفؤاد'],
  'Port Said': ['Port Said', 'Port Fouad'],
  'السويس': ['السويس', 'الأدبية', 'عتاقة'],
  'Suez': ['Suez', 'Adabeya', 'Ataqa'],
  'القليوبية': ['بنها', 'شبرا الخيمة', 'القناطر الخيرية', 'طوخ', 'قليوب'],
  'Qalyubia': ['Banha', 'Shubra El Kheima', 'Qanater', 'Toukh', 'Qalyub'],
  'الدقهلية': ['المنصورة', 'طلخا', 'المطرية', 'دكرنس', 'ميت غمر'],
  'Dakahlia': ['Mansoura', 'Talkha', 'Mit Ghamr', 'Dekernes'],
  'الشرقية': ['الزقازيق', 'بلبيس', 'العاشر من رمضان', 'مركز أبو كبير', 'فاقوس'],
  'Sharqia': ['Zagazig', 'Belbeis', '10th of Ramadan', 'Faqous'],
  'الغربية': ['طنطا', 'المحلة الكبرى', 'كفر الزيات', 'زفتى'],
  'Gharbia': ['Tanta', 'El Mahalla El Kubra', 'Kafr El Zayat', 'Zefta'],
  'المنوفية': ['شبين الكوم', 'منوف', 'اشمون', 'الباجور'],
  'Monufia': ['Shebin El Kom', 'Menouf', 'Ashmoun', 'Bagour'],
  'كفر الشيخ': ['كفر الشيخ', 'دسوق', 'فوه', 'مطوبس'],
  'Kafr El Sheikh': ['Kafr El Sheikh', 'Desouk', 'Fuwwah', 'Metoubes'],
  'البحيرة': ['دمنهور', 'كفر الدوار', 'رشيد', 'إدكو'],
  'Beheira': ['Damanhour', 'Kafr El Dawar', 'Rosetta', 'Edko'],
  'بني سويف': ['بني سويف', 'الواسطى', 'ناصر', 'إهناسيا'],
  'Beni Suef': ['Beni Suef', 'El Wasta', 'Nasser'],
  'الفيوم': ['الفيوم', 'سنورس', 'طامية', 'إطسا'],
  'Faiyum': ['Faiyum', 'Senoras', 'Tamiya', 'Itsa'],
  'المنيا': ['المنيا', 'ملوي', 'بني مزار', 'سمالوط'],
  'Minya': ['Minya', 'Mallawi', 'Beni Mazar', 'Samalut'],
  'أسيوط': ['أسيوط', 'أبو تيج', 'ديروط', 'منفلوط'],
  'Asyut': ['Asyut', 'Abu Tig', 'Dairut', 'Manfalut'],
  'سوهاج': ['سوهاج', 'أخميم', 'جرجا', 'طهطا'],
  'Sohag': ['Sohag', 'Akhmim', 'Girga', 'Tahta'],
  'قنا': ['قنا', 'نجع حمادي', 'قوص', 'دشنا'],
  'Qena': ['Qena', 'Nag Hammadi', 'Qus', 'Deshna'],
  'الأقصر': ['الأقصر', 'أرمنت', 'إسنا'],
  'Luxor': ['Luxor', 'Armant', 'Esna'],
  'أسوان': ['أسوان', 'كوم أمبو', 'إدفو'],
  'Aswan': ['Aswan', 'Kom Ombo', 'Edfu'],
  'دمياط': ['دمياط', 'رأس البر', 'فارسكور'],
  'Damietta': ['Damietta', 'Ras El Bar', 'Farskor'],
  'مطروح': ['مرسى مطروح', 'الحمام', 'الضبعة', 'سيوة'],
  'Matrouh': ['Marsa Matrouh', 'El Hammam', 'El Dabaa', 'Siwa'],
  'الوادي الجديد': ['الخارج', 'الداخلة', 'الفرافرة', 'باريس'],
  'New Valley': ['Kharga', 'Dakhla', 'Farafra', 'Baris'],
  'شمال سيناء': ['العريش', 'الشيخ زويد', 'رفح', 'بئر العبد'],
  'North Sinai': ['Arish', 'Sheikh Zuweid', 'Rafah', 'Bir El Abd'],
  'جنوب سيناء': ['شرم الشيخ', 'دهب', 'نويبع', 'طابا'],
  'South Sinai': ['Sharm El Sheikh', 'Dahab', 'Nuweiba', 'Taba'],
  'البحر الأحمر': ['الغردقة', 'Hurghada', 'سفاجا', 'القصير', 'مرسى علم'],
  'Red Sea': ['Hurghada', 'Safaga', 'El Quseir', 'Marsa Alam'],
}

export function getGovernorates() {
  return EGYPT_GOVERNORATES
}

export function getCitiesForGovernorate(name) {
  if (!name) return []
  const n = String(name).trim()
  if (EGYPT_CITIES[n]) return EGYPT_CITIES[n]
  // try to find by Arabic or English
  for (const g of EGYPT_GOVERNORATES) {
    if (g.name_ar === n || g.name_en === n) {
      return EGYPT_CITIES[g.name_ar] || EGYPT_CITIES[g.name_en] || []
    }
  }
  return []
}
