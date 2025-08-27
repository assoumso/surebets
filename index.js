const fs = require('fs');
const playwright = require('playwright');
const inputDateStr = process.argv[2] || new Date().toISOString().split('T')[0];
const inputDate = new Date(inputDateStr);
const today = new Date();
today.setHours(0, 0, 0, 0);
inputDate.setHours(0, 0, 0, 0);
const diffDays = Math.floor((inputDate - today) / (1000 * 60 * 60 * 24));
let dateParam;
switch (diffDays) {
  case -1: dateParam = 'yesterday'; break;
  case 0: dateParam = 'today'; break;
  case 1: dateParam = 'tomorrow'; break;
  case 2: dateParam = 'after-tomorrow'; break;
  default: dateParam = null;
}
if (!dateParam) {
  console.log('Date non supportée');
  fs.writeFileSync('results.json', JSON.stringify([], null, 2));
  process.exit(0);
}
const urlMap = {
  'yesterday': 'https://www.mybets.today/soccer-predictions/yesterday/',
  'today': 'https://www.mybets.today/soccer-predictions/',
  'tomorrow': 'https://www.mybets.today/soccer-predictions/tomorrow/',
  'after-tomorrow': 'https://www.mybets.today/soccer-predictions/after-tomorrow/'
};
const url = urlMap[dateParam];

async function gotoWithRetry(page, url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, options);
      return;
    } catch (error) {
      console.error(`Tentative ${i + 1} échouée pour ${url}: ${error.message}`);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Attendre 5 secondes avant retry
      }
    }
  }
  throw new Error(`Échec après ${retries} tentatives pour ${url}`);
}

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  await gotoWithRetry(page, url, { waitUntil: 'domcontentloaded', timeout: 300000 });

  const matches = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.event-fixtures a')).map(a => {
      return { link: a.href };
    });
  });

  const resultsPromises = matches.map(async (match) => {
  try {
    const link = match.link;
    const detailPage = await browser.newPage();
    await gotoWithRetry(detailPage, link, { waitUntil: 'domcontentloaded', timeout: 300000 });
    const kickoffText = await detailPage.evaluate(() => {
      const paragraphs = document.querySelectorAll('p');
      for (let p of paragraphs) {
        const text = p.innerText;
        if (text.includes('kicks off at')) {
          const match = text.match(/kicks off at (\d{2}:\d{2})/);
          return match ? match[1] : 'N/A';
        }
      }
      return 'N/A';
    });
    const time = kickoffText;
    const pageContent = await detailPage.innerText('body');
    const scoreProbMatch = pageContent.match(/says (\d+:\d+) to be the exact final score with (\d+)%/);
    const correctScore = scoreProbMatch ? scoreProbMatch[1] : 'N/A';
    const correctScoreProb = scoreProbMatch ? parseFloat(scoreProbMatch[2]) : 0;
    console.log('Extracted correctScore from phrase:', correctScore);
    console.log('Extracted correctScoreProb:', correctScoreProb);
    const layProbMatch = pageContent.match(/the exact final score with (\d+)%/);
    const layProb = layProbMatch ? parseFloat(layProbMatch[1]) : 0;
    console.log('Extracted layProb from phrase:', layProb);
    // Extract BTTS percentages for both teams from analysis paragraphs
    const bttsRegex = /have a Yes in both teams have scored in (\d+)% of the games in their last 10 games\./g;
    const bttsMatches = [...pageContent.matchAll(bttsRegex)];
    let team1Btts = bttsMatches[0] ? parseFloat(bttsMatches[0][1]) : 0;
    let team2Btts = bttsMatches[1] ? parseFloat(bttsMatches[1][1]) : 0;
    const bttsProb = (team1Btts + team2Btts) / 2;
    console.log('Extracted team1 BTTS:', team1Btts, 'team2 BTTS:', team2Btts, 'Average BTTS Prob:', bttsProb);
    console.log('Page content for BTTS extraction:', pageContent.substring(0, 500)); // Log first 500 chars

    // Extract last 5 form for both teams
    const formRegex = /PRE GAME FORM\s+([WLWD]{5})\s+([WLWD]{5})/;
    const formMatch = pageContent.match(formRegex);
    const team1Form = formMatch ? formMatch[1] : 'N/A';
    const team2Form = formMatch ? formMatch[2] : 'N/A';

    // Extract over 2.5 percentages for both teams
    const overRegex = /have Over 2\.5 goals scored in (\d+)% of the games in their last 10 games\./g;
    const overMatches = [...pageContent.matchAll(overRegex)];
    const team1Over = overMatches[0] ? parseFloat(overMatches[0][1]) : 0;
    const team2Over = overMatches[1] ? parseFloat(overMatches[1][1]) : 0;

    // Extract clean sheet percentages for both teams
    const cleanRegex = /kept a clean sheet in (\d+)% of the games in their last 10 games\./g;
    const cleanMatches = [...pageContent.matchAll(cleanRegex)];
    const team1Clean = cleanMatches[0] ? parseFloat(cleanMatches[0][1]) : 0;
    const team2Clean = cleanMatches[1] ? parseFloat(cleanMatches[1][1]) : 0;

    // Calculate goal probability
    const MatchsA = 10;
    const MatchsB = 10;
    const CleanSheetsA = (team1Clean / 100) * MatchsA;
    const CleanSheetsB = (team2Clean / 100) * MatchsB;
    const basicGoalProb = 1 - ((CleanSheetsA + CleanSheetsB) / (MatchsA + MatchsB));

    // Advanced AI-like calculation using Poisson distribution
    // Estimate lambda (expected goals) based on over 2.5 percentages and form
    const formToScore = (form) => form.split('').reduce((acc, res) => acc + (res === 'W' ? 1.5 : res === 'D' ? 1 : 0.5), 0) / 5;
    const lambdaTeam1 = (team1Over / 100 * 3) + formToScore(team1Form) * 0.5; // Rough estimate: over% * avg goals + form adjustment
    const lambdaTeam2 = (team2Over / 100 * 3) + formToScore(team2Form) * 0.5;
    // Poisson prob for 0 goals: e^(-lambda)
    const probNoGoalTeam1 = Math.exp(-lambdaTeam1);
    const probNoGoalTeam2 = Math.exp(-lambdaTeam2);
    // Prob at least one goal in match: 1 - (both teams score 0)
    // But actually for any goals: 1 - P(0-0)
    const probAnyGoals = 1 - (probNoGoalTeam1 * probNoGoalTeam2);
    const goalProb = (basicGoalProb + probAnyGoals) / 2; // Average with basic for 'AI' enhancement

    const otherElement = await detailPage.$('.predictionlabel:has-text("Other")');
    const otherProb = otherElement ? await otherElement.evaluate(el => el.nextElementSibling ? el.nextElementSibling.innerText.replace('%', '') : '0') : '0';
    await detailPage.close();
    return { match: link, time, correctScore, correctScoreProb, layProb, bttsProb, otherProb: parseFloat(otherProb), date: inputDateStr, team1Form, team2Form, team1Over, team2Over, goalProb };
  } catch (error) {
    console.error(`Error processing match ${match.link}: ${error.message}`);
    return null;
  }
});
const results = (await Promise.all(resultsPromises)).filter(result => result !== null);

  // Remove the misplaced require inside the async function
  // const fs = require('fs');
  fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
console.log('Résultats écrits dans results.json');
  await browser.close();
})();