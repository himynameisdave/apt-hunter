import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import puppeteer from 'puppeteer';
import notifier from 'node-notifier';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const SEARCH_URL = 'https://vancouver.craigslist.org/search/apa?sort=date&availabilityMode=0&max_price=3500&min_bedrooms=2&min_price=1900&postal=V5T2C2&postedToday=1&search_distance=2';

const RESULTS_SELECTOR = 'li.result-row';

const SAVED_APTS_FILE = path.resolve(process.cwd(), 'apartments.json');

const TIMEOUT = 1000 * 60 * 5; // 5 Mins

//  Helper to write new/updated apartments list
const writeApartments = (updatedApartments = {}) => {
  return writeFile(SAVED_APTS_FILE, JSON.stringify(updatedApartments, null, 2), 'utf8');
}

const timestamp = () => {
  const d = new Date();
  const h = d.getHours();
  const isPM = h > 12;
  const hour = isPM ? (h - 12) : h;
  const mins = d.getMinutes().toString();
  return `${hour}:${mins.length === 1 ? `0${mins}` : mins}:${d.getSeconds()}${isPM ? 'PM' : 'AM'}`;
}

(async function() {
  const browser = await puppeteer.launch({
    headless: true,
    // headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage();

  console.log('\n🏘 Starting to look...');

  //  Main
  async function main() {
    //  Read previous apartments
    const previousApartments = JSON.parse(await readFile(SAVED_APTS_FILE, 'utf8'));

    console.log(`\n🏠 Looking for new apartments at ${timestamp()}...`);
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded' });
    const results = await page.$$eval(RESULTS_SELECTOR, resultRows => {
      const rows = Array.from(resultRows);
      return rows.map(resultRow => {
        const titleLink = resultRow.querySelector('.result-title');
        const price = resultRow.querySelector('.result-price').textContent;
        const date = resultRow.querySelector('.result-date').dateTime;
        return {
          id: resultRow.dataset.pid,
          url: titleLink.href,
          title: titleLink.textContent,
          price,
          date,
        }
      });
    });

    //  Compare prev results with new results
    const previousApartmentsIds = previousApartments.map(apt => apt.id);
    const newApartments = results.filter(apt => !previousApartmentsIds.includes(apt.id));

    if (newApartments.length === 0) {
      console.log(`😞 No new apartments at this time, I'll check again in 5 mins!`);
      return;
    }

    console.log(`✨ Found ${newApartments.length} new apartments!`);

    //  Notify for each new apartment!
    newApartments.forEach(apt => {
      console.log(`🏡  - "${apt.title}" for ${apt.price}\n    - ${apt.url}\n`);
      notifier.notify({
        title: '🏡 New apartment listed!',
        subtitle: apt.price,
        message: apt.title,
        open: apt.url,
        sound: 'Apartment',
      });
    });

    //  Write the new apartments to the saved file:
    const updatedApartments = newApartments.concat(previousApartments);
    await writeApartments(updatedApartments);
  }

  //  Initial run
  main();

  //  Start polling
  setInterval(main, TIMEOUT);
})();
