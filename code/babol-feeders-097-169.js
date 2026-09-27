// n8n Code node — extract today's Babol outage data for feeders 097 and 169.
// Input: HTML returned by the preceding HTTP Request node.

const input = $input.first().json;

const html =
  input.data ??
  input.body ??
  input.html ??
  input.response ??
  '';

if (typeof html !== 'string' || html.length < 100) {
  throw new Error('محتوای HTML سایت بابل دریافت نشد.');
}

function toPersianDigits(value) {
  return String(value ?? '').replace(
    /\d/g,
    digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]
  );
}

function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getAttribute(openingTag, attribute) {
  const regex = new RegExp(`${attribute}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = openingTag.match(regex);
  return match ? match[1].trim() : '';
}

const cardRegex =
  /(<li\b[^>]*class=["'][^"']*outage-card[^"']*["'][^>]*>)([\s\S]*?)<\/li>/gi;

const allCards = [];
let cardMatch;

while ((cardMatch = cardRegex.exec(html)) !== null) {
  const openingTag = cardMatch[1];
  const cardBody = cardMatch[2];

  const date = getAttribute(openingTag, 'data-date');
  const start = getAttribute(openingTag, 'data-start');
  const end = getAttribute(openingTag, 'data-end');

  const addressMatch = cardBody.match(
    /<div\b[^>]*class=["'][^"']*(?:card-address|address-box)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );

  const streetAddressMatch = cardBody.match(
    /<meta\b[^>]*itemprop=["']streetAddress["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );

  const address = cleanText(addressMatch?.[1] ?? streetAddressMatch?.[1] ?? '');
  if (!address) continue;

  const normalizedAddress = normalizeDigits(address);
  const feederMatch = normalizedAddress.match(/^\s*(\d{2,4})\s*[-–—]/);
  const feeder = feederMatch ? feederMatch[1].padStart(3, '0') : '';
  const isToday = /📅\s*امروز|>\s*امروز\s*</i.test(cardBody);

  allCards.push({
    feeder,
    date,
    start,
    end,
    address,
    normalizedAddress,
    isToday
  });
}

const cardsWithTodayLabel = allCards.filter(card => card.isToday);
const cardsToCheck = cardsWithTodayLabel.length > 0 ? cardsWithTodayLabel : allCards;

const targets = [
  { feeder: '097', label: 'شهرک صالحین ـ گلستان ۱۵' },
  { feeder: '169', label: 'فولادکلای بابل‌کنار' }
];

const results = [];

for (const target of targets) {
  const matchingCards = cardsToCheck.filter(card => card.feeder === target.feeder);

  if (matchingCards.length === 0) {
    results.push({
      feeder: target.feeder,
      title: target.label,
      found: false,
      date: '',
      address: '',
      times: []
    });
    continue;
  }

  const uniqueCards = [];
  const seen = new Set();

  for (const card of matchingCards) {
    const uniqueKey = `${card.feeder}|${card.date}|${card.start}|${card.end}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    uniqueCards.push(card);
  }

  const times = uniqueCards
    .filter(card => card.start && card.end)
    .map(card => `${card.start} تا ${card.end}`);

  results.push({
    feeder: target.feeder,
    title: target.label,
    found: true,
    date: uniqueCards[0]?.date ?? '',
    address: uniqueCards[0]?.address ?? '',
    times
  });
}

const foundResults = results.filter(result => result.found);
const today =
  foundResults.find(result => result.date)?.date ??
  cardsToCheck.find(card => card.date)?.date ??
  'نامشخص';

let message = `⚡ برنامه احتمالی خاموشی بابل\n\n`;
message += `📅 تاریخ: ${toPersianDigits(today)}\n\n`;

for (const result of results) {
  message += `📍 ${result.title}\n`;
  message += `🔢 کد فیدر: ${toPersianDigits(result.feeder)}\n`;

  if (!result.found) {
    message += `🟢 برای امروز برنامه خاموشی این فیدر پیدا نشد.\n\n`;
    continue;
  }

  if (result.address) {
    const addressWithoutFeeder = result.address.replace(
      /^\s*[0-9۰-۹٠-٩]{2,4}\s*[-–—]\s*/,
      ''
    );
    message += `🗺 محدوده: ${toPersianDigits(addressWithoutFeeder)}\n`;
  }

  if (result.times.length > 0) {
    for (const time of result.times) {
      message += `⏰ ${toPersianDigits(time)}\n`;
    }
  } else {
    message += `🟠 فیدر پیدا شد؛ اما ساعت قابل‌تشخیص نبود.\n`;
  }

  message += '\n';
}

message += `⚠️ برنامه ممکن است به دلایل فنی تغییر کند.`;

return [
  {
    json: {
      found: foundResults.length > 0,
      status: foundResults.length > 0 ? 'found' : 'not_found',
      source: 'بابل',
      date: today,
      feeders: results.map(result => ({
        feeder: result.feeder,
        title: result.title,
        found: result.found,
        date: result.date,
        address: result.address,
        times: result.times
      })),
      message
    }
  }
];

